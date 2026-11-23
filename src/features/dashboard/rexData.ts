/**
 * Rex contesta sobre tus propios datos («¿cuál fue mi último snatch?», «mi racha», «¿cuántas sesiones llevo?», «¿cuánto dura hoy?», «¿cuánto peso?») y explica
 * la sesión («¿por qué este peso?», «¿por qué hoy así?»). Solo lee lo que la app ya guarda y calcula; no inventa nada. Puro: los datos entran por parámetro.
 */
import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { computeAdherenceStreak, computeWeekCount } from '../../engine/adherence';
import { resolveLiftPrTarget } from '../../engine/movementProgress';
import { sessionParts } from '../../engine/sessionParts';
import { computeLevel, wodCategoryNeed } from '../../engine/levelCategories';
import { WOD_CATEGORY_LABEL } from '../../engine/wodCategory';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import type { AskAnswer } from './rexAsk';
import type { RexTarget } from './rexDashboard';
import { currentMark, markLiftByKey, type MarkKey, type MarkLift } from './rexMarks';

export type DataQuestion =
  | { what: 'ultimo-levantamiento'; lift: MarkLift }
  | { what: 'ultimo-test'; lift: MarkLift }
  | { what: 'racha' }
  | { what: 'sesiones' }
  | { what: 'duracion' }
  | { what: 'peso-actual' }
  /** «¿Cómo va mi nivel?», «¿qué categorías me faltan?»: las 8 categorías de Tu nivel y cuáles faltan por completar. */
  | { what: 'nivel' };

export interface DataCtx {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  /** La sesión de hoy si hay una generada (null = descanso o sin sesión). */
  session: DailySession | null;
  todayIso: string;
  /** A dónde lleva «Ver la gráfica» (la pantalla Mis marcas) y «Ver Planificación». */
  marksTarget: RexTarget;
  planTarget: RexTarget;
}

/** El movimiento exacto de cada marca (el id con el que se apuntan las series). */
const LIFT_MOVEMENT: Record<string, string> = {
  backSquat: 'back-squat',
  frontSquat: 'front-squat',
  benchPress: 'bench-press',
  deadlift: 'deadlift',
  strictPress: 'strict-press',
  clean: 'clean',
  snatch: 'snatch',
  cleanAndJerk: 'clean-and-jerk',
  sumoDeadlift: 'sumo-deadlift',
  pushPress: 'push-press',
  splitJerk: 'split-jerk',
  overheadSquat: 'overhead-squat',
  powerSnatch: 'power-snatch',
  powerClean: 'power-clean',
};

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const daysBetween = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / 86_400_000);
const ago = (iso: string, todayIso: string) => {
  const d = daysBetween(iso, todayIso);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function viewAction(ctx: DataCtx, label: string, variant: boolean) {
  return variant ? [] : [{ label: 'Ver la gráfica', target: ctx.marksTarget, ask: `ver la grafica de ${label}` }];
}

const joinList = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** La respuesta a «¿cómo va mi nivel?»: el número, cuántas categorías están rellenas, cuáles faltan y qué hará el coach. */
export function levelAnswer(ctx: Pick<DataCtx, 'profile' | 'history' | 'todayIso'>): AskAnswer {
  const { profile, history, todayIso } = ctx;
  const snap = computeLevel({ profile, history, today: new Date(`${todayIso}T12:00:00`) });
  const see = [{ label: 'Ver mi nivel', target: 'perfil' as const }];
  if (snap.filled === 0) {
    return { lead: 'Tu nivel aún está vacío.', tone: 'info', text: 'Se rellena con tus marcas de barra y con tus WODs hechos en Rx. Cada WOD lleva una pastilla con la categoría a la que cuenta.', actions: see };
  }
  const total = snap.categories.length;
  const none = snap.categories.filter((c) => c.confidence === 'sin-datos').map((c) => c.label.toLowerCase());
  const provisional = snap.categories.filter((c) => c.confidence === 'provisional').map((c) => c.label.toLowerCase());
  const head = snap.overall !== null ? `Tu nivel es ${snap.overall}${snap.delta ? ` (${snap.delta > 0 ? '+' : '−'}${Math.abs(snap.delta)} en 3 meses)` : ''}.` : `Tienes ${snap.filled} de ${total} categorías con datos.`;
  const parts = [`${snap.filled} de ${total} categorías con datos.`];
  if (provisional.length > 0) parts.push(`Provisionales (falta un segundo resultado): ${joinList(provisional)}.`);
  if (none.length > 0) parts.push(`Sin datos: ${joinList(none)}.`);
  const need = wodCategoryNeed(profile, history, todayIso);
  if (need) parts.push(`El coach intentará ponerte un WOD de ${WOD_CATEGORY_LABEL[need.category].toLowerCase()} en cuanto encaje con tu semana.`);
  else if (none.length === 0 && provisional.length === 0) parts.push('Todas tienen datos fiables: sigue así y las mantendrás al día.');
  return { lead: head, tone: snap.delta !== null && snap.delta < 0 ? 'mid' : 'info', text: parts.join(' '), actions: see };
}

export function dataAnswer(q: DataQuestion, ctx: DataCtx): AskAnswer {
  const { profile, history, todayIso } = ctx;
  switch (q.what) {
    case 'nivel':
      return levelAnswer(ctx);
    case 'ultimo-levantamiento': {
      const id = LIFT_MOVEMENT[q.lift.key];
      const sets = (profile.workLog ?? []).filter((e) => e.movementId === id && e.kg > 0 && e.quality !== 'fallada');
      const actions = viewAction(ctx, q.lift.label, q.lift.variant);
      if (sets.length === 0) {
        const last = [...history].filter((h) => h.movementIds.includes(id)).sort((a, b) => b.date.localeCompare(a.date))[0];
        return last
          ? { lead: `${q.lift.label}.`, tone: 'info', text: `Lo hiciste el ${shortDate(last.date)} (${ago(last.date, todayIso)}), pero no hay pesos apuntados serie a serie.`, actions }
          : { lead: `${q.lift.label}.`, tone: 'mid', text: 'Aún no tengo ninguna sesión con ese levantamiento. Si lo has hecho, anótalo al acabar la sesión y lo recordaré.', actions: [] };
      }
      const date = sets.reduce((d, s) => (s.date > d ? s.date : d), '');
      const day = sets.filter((s) => s.date === date);
      const top = day.reduce((b, s) => (s.kg > b.kg ? s : b), day[0]);
      const reps = top.reps > 0 ? ` × ${top.reps}` : '';
      return { lead: `${q.lift.label}.`, tone: 'info', text: `La última vez fue el ${shortDate(date)} (${ago(date, todayIso)}): ${day.length} ${day.length === 1 ? 'serie' : 'series'}, la más pesada ${fmt(top.kg)} kg${reps}.`, actions };
    }
    case 'ultimo-test': {
      const mark = currentMark(profile, q.lift.key);
      const log = (profile.prLog ?? []).filter((e) => e.key === q.lift.key).sort((a, b) => a.date.localeCompare(b.date));
      const last = log[log.length - 1];
      if (!last || mark <= 0) return { lead: `${q.lift.label}.`, tone: 'mid', text: 'No tengo ninguna marca apuntada de este levantamiento.', actions: [] };
      return { lead: `${q.lift.label}.`, tone: 'info', text: `Tu marca actual (${fmt(mark)} kg) se apuntó el ${shortDate(last.date)} (${ago(last.date, todayIso)}).`, actions: viewAction(ctx, q.lift.label, q.lift.variant) };
    }
    case 'racha': {
      const doneToday = history.some((h) => h.date === todayIso);
      // Hoy aún no entrenado no cuenta como fallo: la racha se mira desde ayer.
      const from = doneToday ? todayIso : isoOf(new Date(new Date(`${todayIso}T00:00:00`).getTime() - 86_400_000));
      const streak = computeAdherenceStreak(profile, history, from);
      const week = computeWeekCount(profile, history, new Date(`${todayIso}T00:00:00`));
      const text =
        streak === 0
          ? `Ahora mismo tu racha está a 0: el último día previsto sin registro la cortó. Esta semana: ${week.done} de ${week.planned}.`
          : `Llevas ${streak} ${streak === 1 ? 'entreno previsto cumplido' : 'entrenos previstos cumplidos'} sin fallar ninguno. Esta semana: ${week.done} de ${week.planned}.`;
      return { lead: 'Tu racha.', tone: streak >= 3 ? 'good' : 'info', text, actions: [{ label: 'Ver mi constancia', target: 'constancia' }] };
    }
    case 'sesiones': {
      const week = computeWeekCount(profile, history, new Date(`${todayIso}T00:00:00`));
      const month = history.filter((h) => h.date.slice(0, 7) === todayIso.slice(0, 7)).length;
      return { lead: 'Tus sesiones.', tone: 'info', text: `Esta semana ${week.done} de ${week.planned} previstas; este mes ${month} ${month === 1 ? 'sesión registrada' : 'sesiones registradas'}.`, actions: [{ label: 'Ver mi constancia', target: 'constancia' }] };
    }
    case 'duracion': {
      const s = ctx.session;
      const entry = history.find((h) => h.date === todayIso);
      if (entry) return { lead: 'Hoy ya entrenaste.', tone: 'good', text: `Tardaste ${entry.durationMin} min.`, actions: [] };
      if (!s || s.isRestDay) return { lead: 'Hoy no hay sesión.', tone: 'info', text: 'Es un día de descanso o no tienes nada programado.', actions: [] };
      const minutes = estimateSessionMinutes(s);
      const parts = sessionParts(s).map((p) => p.label.split(' · ')[0].toLowerCase());
      return {
        lead: `Unos ${minutes} min.`,
        tone: 'info',
        text: `Es lo que calculo para la sesión de hoy${parts.length > 0 ? ` (${parts.join(', ')})` : ''}, con calentamiento y vuelta a la calma. Si vas justo, dime «tengo 40 minutos».`,
        actions: [{ label: 'Ver Planificación', target: ctx.planTarget }],
      };
    }
    case 'peso-actual': {
      const log = [...(profile.bodyweightLog ?? [])].sort((a, b) => a.date.localeCompare(b.date));
      const last = log[log.length - 1];
      if (!last) return { lead: 'Sin peso apuntado.', tone: 'mid', text: 'Todavía no has apuntado tu peso. Dime «apunta 82,4 kg».', actions: [] };
      const before = log.length > 1 ? log[log.length - 2] : null;
      const diff = before ? Math.round((last.kg - before.kg) * 10) / 10 : null;
      const change = diff !== null && diff !== 0 ? ` (${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} kg frente al registro anterior)` : '';
      return { lead: `${fmt(last.kg)} kg.`, tone: 'info', text: `Es lo último que apuntaste, ${ago(last.date, todayIso)}${change}.`, actions: [{ label: 'Ver el peso', target: 'peso' }] };
    }
  }
}

// ---------- ¿Por qué…? ----------

export type WhyAbout = 'sesion' | 'peso' | 'wod';

const ENERGY_LABEL: Record<NonNullable<SessionHistoryEntry['energySystem']>, string> = {
  'base-aerobica': 'base aeróbica',
  umbral: 'umbral',
  potencia: 'potencia',
  recuperacion: 'recuperación',
};

/** Primera frase de un texto de coach, recortada para que quepa en el globo. */
function firstSentence(text: string | undefined, max = 170): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '') return null;
  const cut = clean.split(/(?<=[.!?])\s/)[0];
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

/** «¿Por qué…?»: lo que el coach dejó anotado en la sesión de hoy y, para el peso, cuánto es de tu marca. */
export function whyAnswer(about: WhyAbout, ctx: DataCtx): AskAnswer {
  const s = ctx.session;
  const plan = [{ label: 'Ver Planificación', target: ctx.planTarget }];
  if (ctx.history.some((h) => h.date === ctx.todayIso)) return { lead: 'Hoy ya entrenaste.', tone: 'good', text: 'La sesión está hecha; lo que cuenta ahora es cómo recuperas.', actions: [] };
  if (!s || s.isRestDay) {
    return {
      lead: 'Hoy no hay sesión.',
      tone: 'info',
      text: 'Es un día de descanso según tu plan (o lo marcaste tú). Recuperar también es entrenar.',
      actions: [{ label: 'Hacer recovery', target: 'movilidad' }],
    };
  }

  if (about === 'peso') {
    const main = s.blocks.find((b) => b.block === 'strength' && !b.subgroup && (b.loadKg ?? 0) > 0) ?? s.blocks.find((b) => b.block === 'oly' && !b.subgroup && (b.loadKg ?? 0) > 0);
    if (!main?.loadKg) return { lead: 'No hay peso que explicar.', tone: 'info', text: 'La sesión de hoy no lleva ningún levantamiento con carga.', actions: plan };
    const movement = getMovementById(main.movementId);
    const name = movement?.name ?? main.movementId;
    const target = movement ? resolveLiftPrTarget(movement, ctx.profile.variantPrs) : null;
    const pr = target ? currentMark(ctx.profile, target.key as MarkKey) : 0;
    const mark = target ? markLiftByKey(target.key) : null;
    const pct = pr > 0 ? Math.round((main.loadKg / pr) * 100) : null;
    const base = pct !== null ? `${name}: ${fmt(main.loadKg)} kg es el ${pct} % de tu marca${mark ? ` de ${mark.label}` : ''} (${fmt(pr)} kg).` : `${name}: ${fmt(main.loadKg)} kg.`;
    const why = firstSentence(main.notes) ?? firstSentence(s.coachReasons?.[0]);
    return { lead: 'Por qué ese peso:', tone: 'info', text: `${base}${why ? ` ${why}` : ''}`, actions: plan };
  }

  if (about === 'wod') {
    const wod = s.blocks.find((b) => b.block === 'wod');
    if (!wod) return { lead: 'Hoy no hay WOD.', tone: 'info', text: 'La sesión de hoy no lleva WOD.', actions: plan };
    // El motivo lo dejó el coach entre los de la sesión («Hoy: umbral — duración media…»); el texto del WOD ya está en la tarjeta y no se repite.
    const reason = (s.coachReasons ?? []).find((r) => /\b(WOD|umbral|potencia|aer[oó]bic|dominio|formato)\b/i.test(r));
    const why = firstSentence(reason, 220);
    const energy = s.energySystem ? `Trabaja ${ENERGY_LABEL[s.energySystem]}.` : 'Es el WOD que encaja con el día.';
    return { lead: 'Por qué ese WOD:', tone: 'info', text: `${wod.title ? `«${wod.title}». ` : ''}${why ?? energy}`, actions: plan };
  }

  const reasons = (s.coachReasons ?? []).map((r) => firstSentence(r)).filter((r): r is string => Boolean(r)).slice(0, 3);
  if (reasons.length === 0) return { lead: 'Es lo que toca.', tone: 'info', text: `Es la sesión de tu macro para hoy (semana ${s.mesocycleWeek}). No hay nada fuera de lo normal que apuntar.`, actions: plan };
  return { lead: 'Por qué hoy así:', tone: 'info', text: reasons.join(' '), actions: plan };
}
