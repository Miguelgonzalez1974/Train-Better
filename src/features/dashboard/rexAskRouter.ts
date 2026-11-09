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
import { moveDoneAnswer, moveProposalAnswer, moveRefusalAnswer, moveWhereAnswer } from './rexMove';
import { dayLabel, planMove } from '../../lib/sessionMove';
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
      const plan = planMove(athleteRepository.getProfile(), athleteRepository.getHistory(), { from: addDaysIso(todayIso, intent.from), to: intent.to === null ? null : addDaysIso(todayIso, intent.to) }, todayIso);
      if (typeof plan === 'string') return moveRefusalAnswer(plan);
      if (!intent.confirmed) return moveProposalAnswer(plan, todayIso);
      athleteRepository.saveProfile(plan.profile);
      for (const s of plan.writes) athleteRepository.saveCachedSession(s);
      api.onWeekChanged?.();
      return moveDoneAnswer(plan, todayIso);
    }
    case 'mover-ayuda': {
      // Los próximos días a los que se puede pasar la sesión de hoy (como botón cada uno), máximo cuatro.
      const todayIso = api.todayIso;
      const profile = athleteRepository.getProfile();
      const history = athleteRepository.getHistory();
      const options: { label: string; ask: string }[] = [];
      for (let i = 1; i <= 6 && options.length < 4; i++) {
        const iso = addDaysIso(todayIso, i);
        const plan = planMove(profile, history, { from: todayIso, to: iso }, todayIso);
        if (typeof plan === 'string') continue;
        const label = dayLabel(iso, todayIso);
        options.push({ label: `${label.charAt(0).toUpperCase()}${label.slice(1)}${plan.swap ? ' (intercambio)' : ''}`, ask: `pasa la sesion de hoy ${label === 'mañana' ? 'a mañana' : `al ${label.replace(/^el /, '')}`}` });
      }
      return moveWhereAnswer(options);
    }
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
    case 'adaptar':
    case 'adaptar-ayuda':
    case 'adaptar-deshacer':
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
