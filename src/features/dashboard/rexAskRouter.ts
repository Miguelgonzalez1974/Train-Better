import { athleteRepository } from '../../data/athlete/athleteRepository';
import { appNav } from '../../lib/appNav';
import { handoff } from '../../lib/handoff';
import { MEAL_DRAFT_KEY } from '../../lib/mealDraft';
import { resetUpcomingSessions } from '../../lib/sessionCacheReset';
import { recordMiss } from '../../lib/rexMisses';
import { followUpText, forgetTopic, rememberTopic } from './rexContext';
import { rexBus } from '../../lib/rexBus';
import type { RexTarget } from './rexDashboard';
import { dataAnswer, whyAnswer } from './rexData';
import { changeDayActionsAnswer, changeDayPickAnswer } from './rexChangeDay';
import { confirmMoveText, confirmWeekText, moveChoiceAnswer, moveDoneAnswer, moveProposalAnswer, moveRefusalAnswer, shortSessionLabel, weekDoneAnswer, weekProposalAnswer, weekRowsText, weekUndoNoneAnswer, weekUndoneAnswer } from './rexMove';
import { planWeekChange, weekPlanFromMove, type WeekPlan } from '../../lib/weekShift';
import { buildUndo, clearUndo, peekUndo, saveUndo } from '../../lib/weekUndo';
import { planMove } from '../../lib/sessionMove';
import { addDaysIso } from '../../engine/periodization';
import { applyMark, currentMark, markAskKgAnswer, type MarkKey, markEstimateAnswer, markPickAnswer, markProposalAnswer, markSavedAnswer, markViewAnswer } from './rexMarks';
import { elsewhereAnswer, helpAnswer, missingAnswer, parseAsk, splitAsk, weightAnswer, type AskAnswer, type AskIntent } from './rexAsk';

export type RexScreen = 'dashboard' | 'planificacion' | 'nutricion' | 'objetivos';

export interface RouterApi {
  todayIso: string;
  /** Lo que esta pantalla hace por su cuenta, por tipo de petición. Lo que no esté aquí lo resuelve el reparto común. */
  local?: { [K in AskIntent['kind']]?: (intent: Extract<AskIntent, { kind: K }>) => AskAnswer | 'close' };
  /** Lo que falta del día en comida (null si no se puede calcular: sin peso), para «¿qué me falta?» y «¿qué ceno?». */
  missing?: () => { protein: number; carbs: number } | null;
  /** Se acaba de apuntar un peso: la pantalla refresca el suyo. */
  onWeightLogged?: () => void;
  /** Se acaba de apuntar una marca (PR): la pantalla relee el perfil y recalcula lo que dependa de él. */
  onMarkSaved?: () => void;
  /** Se acaba de mover o intercambiar sesiones de la semana: la pantalla relee el perfil y la sesión de hoy. */
  onWeekChanged?: () => void;
  /** Abre la pantalla «Mis marcas» (solo el Dashboard la tiene a mano; el resto va al Dashboard). */
  openMarks?: (key: MarkKey | null) => void;
}

/** Apunta el peso de hoy y dice cómo cambia frente al último. */
export function logWeight(kg: number, todayIso: string): AskAnswer {
  const last = [...athleteRepository.getBodyweightLog()].sort((a, b) => a.date.localeCompare(b.date)).pop();
  const daysAgo = last ? Math.max(0, Math.round((new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${last.date}T00:00:00`).getTime()) / 86_400_000)) : 0;
  athleteRepository.appendBodyweightEntry({ date: todayIso, kg });
  return weightAnswer(kg, last ? { kg: last.kg, daysAgo } : null);
}

/** Lleva una frase de comida a Nutrición: si ya estás ahí la escribe en la caja; si no, la deja pendiente y cambia de pestaña. */
export function sendMealToNutrition(text: string, onNutrition: boolean): void {
  if (onNutrition) {
    rexBus.emit('meal-text', text);
    return;
  }
  try {
    window.sessionStorage.setItem(MEAL_DRAFT_KEY, text);
  } catch {
    /* sin almacenamiento: se abre Nutrición y se escribe allí */
  }
  appNav.goTo('nutricion');
}

/** Junta varias respuestas en una: la primera da el arranque y el tono, el resto va detrás (con su arranque), y los botones se suman sin repetir. */
export function mergeAnswers(answers: AskAnswer[]): AskAnswer {
  const [first, ...rest] = answers;
  const text = [first.text, ...rest.map((a) => `${a.lead} ${a.text}`)].join(' · ');
  const seen = new Set<string>();
  const actions = answers
    .flatMap((a) => a.actions)
    .filter((a) => {
      if (seen.has(a.label)) return false;
      seen.add(a.label);
      return true;
    })
    .slice(0, 4);
  return { lead: first.lead, tone: first.tone, text, actions };
}

const SUPPORT_NODE: Partial<Record<AskIntent['kind'], string>> = { dolor: 'p_zone', 'no-plan': 't_what', faltar: 'a_why' };

/**
 * Lee lo escrito en la caja de RexLab de cualquier pantalla y lo reparte: lo que la pantalla hace por su cuenta (`api.local`) va primero;
 * el resto se resuelve igual en todas (apuntar el peso, una comida, lo que falta) o lleva a la pantalla donde se hace, con lo pedido ya
 * preparado (la conversación de la molestia en Planificación, el asistente en Objetivos). 'close' = ya se ha hecho algo y RexLab se va.
 */
export function routeAsk(text: string, screen: RexScreen, api: RouterApi): AskAnswer | 'close' {
  const weekday = new Date().getDay();
  // «¿Y el viernes?» tras «¿qué toca mañana?»: una frase corta se completa con el tema de la última respuesta.
  const resolved = followUpText(text, weekday) ?? text;
  // «Apunta 82,4 kg y dime qué toca mañana»: varias peticiones que se contestan seguidas, en una sola respuesta.
  const clauses = splitAsk(resolved, weekday);
  if (clauses) {
    forgetTopic();
    const results = clauses.map((c) => routeSingle(c, screen, api));
    if (results.includes('close')) return 'close';
    return mergeAnswers(results as AskAnswer[]);
  }
  rememberTopic(parseAsk(resolved, weekday));
  return routeSingle(resolved, screen, api);
}

/** Guarda cómo estaba la semana (para deshacer) y aplica un cambio de sesiones: perfil con los descansos y las sesiones nuevas en la caché. */
function applyWeekPlan(plan: WeekPlan, label: string, api: Pick<RouterApi, 'onWeekChanged'>): void {
  saveUndo(buildUndo(plan, label));
  athleteRepository.saveProfile(plan.profile);
  for (const c of plan.changes) athleteRepository.saveCachedSession(c.after);
  api.onWeekChanged?.();
}

/** Deshace el último cambio de la semana hecho con Rex: cada día vuelve a como estaba y los descansos elegidos también. */
export function undoWeekChange(api: Pick<RouterApi, 'onWeekChanged'>): AskAnswer {
  const undo = peekUndo();
  if (!undo) return weekUndoNoneAnswer();
  for (const s of undo.sessions) {
    if (s.session) athleteRepository.saveCachedSession(s.session);
    else athleteRepository.deleteCachedSession(s.date);
  }
  athleteRepository.saveProfile({ ...athleteRepository.getProfile(), restDates: undo.restDates });
  clearUndo();
  api.onWeekChanged?.();
  return weekUndoneAnswer(undo.label);
}
/**
 * «Cambiar día», el menú guiado: sin día elige cuál (de los próximos siete con sesión que se pueden mover); con un día, qué hacer con él (a qué día pasarlo, que elija
 * Rex el hueco, o desplazar la semana desde ahí). Cada botón es una frase que vuelve a pasar por `parseAsk`, así que el resto (enseñar el resultado, el «Sí», «Deshacer»)
 * es el de siempre.
 */
function changeDayFlow(fromOffset: number | null, todayIso: string): AskAnswer {
  const profile = athleteRepository.getProfile();
  const history = athleteRepository.getHistory();
  const label = shortSessionLabel;
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(todayIso, i));
  // Un día vale si tiene una sesión que se pueda mover: «sin hueco» también (se puede intercambiar o desplazar).
  const movable = (iso: string) => {
    const r = planMove(profile, history, { from: iso, to: null }, todayIso);
    return typeof r === 'object' || r === 'sin-hueco';
  };
  if (fromOffset === null) return changeDayPickAnswer(days.filter(movable).map((iso) => ({ iso })), todayIso);

  const from = addDaysIso(todayIso, fromOffset);
  if (!movable(from)) return moveRefusalAnswer(planMove(profile, history, { from, to: null }, todayIso) as Exclude<ReturnType<typeof planMove>, object>);
  const targets = days
    .filter((iso) => iso !== from)
    .flatMap((iso) => {
      const r = planMove(profile, history, { from, to: iso }, todayIso);
      return typeof r === 'object' ? [{ iso, swap: r.swap }] : [];
    })
    .slice(0, 5);
  const canAuto = typeof planMove(profile, history, { from, to: null }, todayIso) === 'object';
  const canShift = typeof planWeekChange(profile, history, { kind: 'desplazar', from }, todayIso, label) === 'object';
  return changeDayActionsAnswer(from, targets, canShift, canAuto, todayIso);
}
function routeSingle(text: string, screen: RexScreen, api: RouterApi): AskAnswer | 'close' {
  const intent = parseAsk(text, new Date().getDay());
  // Los botones de las respuestas de marcas llevan al Análisis: en el Dashboard lo abre; desde otra pantalla va al Dashboard y lo abre allí.
  const analysis: RexTarget = screen === 'dashboard' ? 'marcas' : 'ir-marcas';
  const local = api.local?.[intent.kind] as ((i: AskIntent) => AskAnswer | 'close') | undefined;
  if (local) return local(intent);

  switch (intent.kind) {
    case 'peso': {
      const answer = logWeight(intent.kg, api.todayIso);
      api.onWeightLogged?.();
      return answer;
    }
    case 'comida':
      sendMealToNutrition(intent.text, screen === 'nutricion');
      return 'close';
    case 'marca-ver': {
      // «Mis marcas» (o «ver la gráfica de…»): una pantalla propia, no una frase apiñada. En el Dashboard se abre ahí mismo; desde otra pantalla se va al Dashboard y se abre.
      if (intent.open) {
        if (api.openMarks) api.openMarks(intent.lift?.key ?? null);
        else {
          handoff.put('analisis-tab', intent.lift ? `marcas:${intent.lift.key}` : 'marcas');
          appNav.goTo('dashboard');
        }
        return 'close';
      }
      return markViewAnswer(athleteRepository.getProfile(), intent.lift?.key ?? null, analysis);
    }
    case 'marca-estimar':
      return markEstimateAnswer(athleteRepository.getProfile(), intent.lift, intent.loadKg, intent.reps, analysis);
    case 'marca-apuntar': {
      const profile = athleteRepository.getProfile();
      if (!intent.lift) return markPickAnswer(analysis);
      if (intent.kg === null) return markAskKgAnswer(profile, intent.lift);
      if (!intent.confirmed) return markProposalAnswer(profile, intent.lift, intent.kg, analysis);
      const previous = currentMark(profile, intent.lift.key);
      if (previous === intent.kg) return markProposalAnswer(profile, intent.lift, intent.kg, analysis);
      athleteRepository.saveProfile(applyMark(profile, intent.lift, intent.kg));
      resetUpcomingSessions(api.todayIso);
      api.onMarkSaved?.();
      return markSavedAnswer(previous, intent.lift, intent.kg, analysis);
    }
    case 'falta': {
      const missing = api.missing?.() ?? null;
      if (!missing) return elsewhereAnswer('Para calcular lo que te falta necesito tu peso y tu diario: míralo en Nutrición.', 'ir-nutricion');
      return missingAnswer(missing);
    }
    case 'dolor':
    case 'no-plan':
    case 'faltar':
    case 'otro-wod':
      if (screen === 'planificacion') return helpAnswer();
      if (intent.kind === 'otro-wod') handoff.put('plan-act', 'otro-wod');
      else handoff.put('support-start', SUPPORT_NODE[intent.kind] ?? 'start');
      appNav.goTo('planificacion');
      return 'close';
    case 'mover': {
      // Mover sesiones de la semana: se enseña el plan y solo se aplica con el «Sí». El origen queda de descanso elegido; las sesiones movidas se marcan como editadas.
      const todayIso = api.todayIso;
      const profile = athleteRepository.getProfile();
      const history = athleteRepository.getHistory();
      const from = addDaysIso(todayIso, intent.from);
      const to = intent.to === null ? null : addDaysIso(todayIso, intent.to);
      // «Inserta el martes en el viernes»: las de entre medias se corren un día.
      if (intent.mode === 'insertar' && to) {
        const wp = planWeekChange(profile, history, { kind: 'insertar', from, to }, todayIso, shortSessionLabel);
        if (typeof wp === 'string') return moveRefusalAnswer(wp);
        if (!intent.confirmed) return weekProposalAnswer(wp, confirmWeekText(wp, todayIso));
        applyWeekPlan(wp, 'reordenar la semana', api);
        return weekDoneAnswer(wp.rows);
      }
      const plan = planMove(profile, history, { from, to }, todayIso);
      if (typeof plan === 'string') return moveRefusalAnswer(plan);
      if (!intent.confirmed) {
        // El destino ya tiene sesión y no es el día de al lado: hay dos formas de hacerlo, intercambiar o insertar, y se elige.
        if (plan.swap && to && Math.abs(intent.to! - intent.from) > 1) {
          const ins = planWeekChange(profile, history, { kind: 'insertar', from, to }, todayIso, shortSessionLabel);
          if (typeof ins === 'object') {
            return moveChoiceAnswer(weekRowsText(weekPlanFromMove(plan, profile, shortSessionLabel).rows), weekRowsText(ins.rows), confirmMoveText(plan, todayIso), confirmWeekText(ins, todayIso));
          }
        }
        return moveProposalAnswer(plan, todayIso);
      }
      applyWeekPlan(weekPlanFromMove(plan, profile, shortSessionLabel), plan.swap ? 'intercambiar dos sesiones' : 'mover una sesión', api);
      return moveDoneAnswer(plan, todayIso);
    }
    case 'desplazar': {
      // «Desplaza la semana desde mañana»: cada sesión pasa al día siguiente hasta que un descanso lo absorba.
      const todayIso = api.todayIso;
      const wp = planWeekChange(athleteRepository.getProfile(), athleteRepository.getHistory(), { kind: 'desplazar', from: addDaysIso(todayIso, intent.from) }, todayIso, shortSessionLabel);
      if (typeof wp === 'string') return moveRefusalAnswer(wp);
      if (!intent.confirmed) return weekProposalAnswer(wp, confirmWeekText(wp, todayIso));
      applyWeekPlan(wp, 'desplazar la semana', api);
      return weekDoneAnswer(wp.rows);
    }
    case 'mover-deshacer':
      return undoWeekChange(api);
    case 'mover-ayuda':
      return changeDayFlow(null, api.todayIso);
    case 'cambiar-dia':
      return changeDayFlow(intent.from, api.todayIso);
    case 'dato':
    case 'por-que': {
      const todayIso = api.todayIso;
      const ctx = {
        profile: athleteRepository.getProfile(),
        history: athleteRepository.getHistory(),
        session: athleteRepository.getCachedSession(todayIso),
        todayIso,
        marksTarget: analysis,
        planTarget: (screen === 'dashboard' ? 'planificacion' : 'ir-planificacion') as RexTarget,
      };
      return intent.kind === 'dato' ? dataAnswer(intent.question, ctx) : whyAnswer(intent.about, ctx);
    }
    case 'adaptar-deshacer':
      // «Deshaz el cambio» sin sesión acortada en esta pantalla: si lo último fue un cambio de la semana, se deshace ese.
      if (peekUndo()) return undoWeekChange(api);
      return elsewhereAnswer('La sesión de hoy se cambia desde Planificación: allí te enseño qué quitaría y lo aplico si me dices que sí.', 'ir-planificacion');
    case 'adaptar':
    case 'adaptar-ayuda':
      return elsewhereAnswer('La sesión de hoy se cambia desde Planificación: allí te enseño qué quitaría y lo aplico si me dices que sí.', 'ir-planificacion');
    case 'programa':
      return elsewhereAnswer('El programa de fuerza se ve y se decide debajo de tu sesión, en Planificación.', 'ir-planificacion');
    case 'crear':
      handoff.put('objetivos-asistente', intent.what);
      appNav.goTo('objetivos');
      return 'close';
    case 'dia':
    case 'estado':
      return elsewhereAnswer('Eso te lo cuento en el Dashboard, donde está tu estado de hoy.', 'ir-dashboard');
    case 'modulo':
      return elsewhereAnswer('Ese módulo está en el Dashboard.', 'ir-dashboard');
    case 'ayuda':
      // Lo que no se entiende se recuerda (solo en este móvil) para ver dónde falla; se lee desde «Cuenta y datos».
      recordMiss(text, screen);
      return helpAnswer();
  }
}
