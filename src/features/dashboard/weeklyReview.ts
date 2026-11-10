import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { buildOpenItems } from '../objetivos/openItems';
import { computeAdherenceStreak, computeWeekCount } from '../../engine/adherence';
import { goalTargetStatus } from '../../engine/goalTarget';
import { computeAcwr, type AcwrZone } from '../../engine/loadMetrics';
import { buildWeeklyMacroReview, REVIEWED_MACRO_WEEKS_LIMIT, type MacroReviewSuggestion } from '../../engine/macroReview';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { currentWeekInRange, expectedStrengthSessionsPerWeek, getActiveMacrocycle, getWeekdayIndex, resolveMacrocyclePhase, toLocalIsoDate, totalMacrocycleWeeks } from '../../engine/periodization';
import { PAIN_AREA_LABEL, getActivePainFlags } from '../../engine/painFlags';
import { sessionProgressionView } from '../../engine/progression';
import { PR_KEY_LABEL } from '../../engine/responseProfile';
import { getActiveStrengthProgram } from '../../engine/strengthPrograms';
import { withCompanionLoad } from '../../engine/companionLoad';
import { isCompanionProgram, weekdayOf } from '../../engine/strengthCompanion';

/**
 * La revisión semanal de Rex: un repaso de la semana de calendario que acaba de cerrarse (lunes a domingo) con lo que la app ya
 * mide (sesiones, esfuerzo, carga, progresión por resultados, PRs, objetivos, molestias), y la propuesta del coach si la hay
 * (alargar la fase o subir el énfasis de un objetivo, la misma de siempre). Es una lectura pura: no guarda nada. Sale de lunes a
 * miércoles y desaparece al darla por vista (`weekKey` entra en `reviewedMacroWeeks`).
 */

/** Hasta qué día de la semana (0 = lunes) se ofrece repasar la semana anterior. */
export const REVIEW_LAST_WEEKDAY = 2;

export type ReviewTone = 'good' | 'warn' | 'muted';

export interface ReviewMetric {
  label: string;
  value: string;
  tone: ReviewTone;
}

export interface WeeklyReview {
  /** Marca de esta revisión en `reviewedMacroWeeks`. */
  weekKey: string;
  from: string;
  to: string;
  /** Dónde estaba el plan esa semana ("semana 7 de 12 · Intensificación"), o null sin macrociclo. */
  planLine: string | null;
  metrics: ReviewMetric[];
  best: string[];
  watch: string[];
  /** La semana tuvo muy pocas sesiones para sacar conclusiones. */
  short: boolean;
  suggestion: MacroReviewSuggestion | null;
  /** Hay una revisión de 4 semanas del énfasis sin ver. */
  emphasisReviewPending: boolean;
  /** Cómo sigue el plan esta semana. */
  nextLine: string;
  sessions: { done: number; planned: number };
}

const LOAD_LABEL: Record<AcwrZone, { text: string; tone: ReviewTone }> = {
  optima: { text: 'Óptima', tone: 'good' },
  moderada: { text: 'Moderada', tone: 'warn' },
  alta: { text: 'Alta', tone: 'warn' },
  baja: { text: 'Baja', tone: 'muted' },
};

/** RPE medio a partir del cual se destaca como esfuerzo alto. */
const HIGH_RPE = 8.5;

function noon(d: Date): Date {
  const n = new Date(d);
  n.setHours(12, 0, 0, 0);
  return n;
}

function shiftDays(d: Date, days: number): Date {
  const n = noon(d);
  n.setDate(n.getDate() + days);
  return n;
}

const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;
const rpeText = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export interface CompanionWeek {
  /** Cuántas sesiones del programa tocaban esa semana (los días del programa que caen dentro de sus fechas). */
  expected: number;
  done: number;
  skipped: number;
  /** Las marcas de 5 repeticiones del viernes: nombre y peso, con si salieron. */
  attempts: { movementId: string; kg: number; achieved: boolean }[];
}

/** Lo del programa de fuerza que convive con el macro en la semana `from`–`to`; null si no había programa esa semana. */
export function companionWeek(profile: AthleteProfile, from: string, to: string): CompanionWeek | null {
  const program = (profile.strengthPrograms ?? []).filter(isCompanionProgram).find((p) => from <= p.endDate && to >= p.startDate);
  if (!program) return null;
  let expected = 0;
  for (let d = new Date(`${from}T12:00:00`); toLocalIsoDate(d) <= to; d.setDate(d.getDate() + 1)) {
    const iso = toLocalIsoDate(d);
    if (iso >= program.startDate && iso <= program.endDate && program.companion.weekdays.includes(weekdayOf(iso))) expected++;
  }
  const log = (profile.companionLog ?? []).filter((c) => c.programId === program.id && c.date >= from && c.date <= to);
  const attempts = log.filter((c) => c.outcome === 'hecha').flatMap((c) => (c.lifts ?? []).filter((l) => l.attempt).map((l) => ({ movementId: l.movementId, kg: l.achieved ?? l.loadKg, achieved: l.achieved !== undefined })));
  return { expected, done: log.filter((c) => c.outcome === 'hecha').length, skipped: log.filter((c) => c.outcome === 'saltada').length, attempts };
}

/** El lunes de la semana de `today`, y las fechas de la semana anterior. */
export function previousWeek(today: Date): { monday: Date; from: string; to: string } {
  const thisMonday = shiftDays(today, -getWeekdayIndex(today));
  const monday = shiftDays(thisMonday, -7);
  return { monday, from: toLocalIsoDate(monday), to: toLocalIsoDate(shiftDays(monday, 6)) };
}

export function buildWeeklyReview(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  today: Date = new Date(),
  /** `anytime`: repasar la última semana completa cuando quieras (desde «Más»), aunque ya no sea lunes a miércoles o ya la hayas dado por vista. */
  opts: { anytime?: boolean } = {},
): WeeklyReview | null {
  if (!opts.anytime && getWeekdayIndex(today) > REVIEW_LAST_WEEKDAY) return null;
  const { monday, from, to } = previousWeek(today);
  const weekKey = `semana:${from}`;
  if (!opts.anytime && (profile.reviewedMacroWeeks ?? []).includes(weekKey)) return null;
  // Sin nada anterior a esa semana no hay qué repasar (alta reciente).
  if (!history.some((h) => h.date <= to)) return null;

  const sunday = shiftDays(monday, 6);
  const todayIso = toLocalIsoDate(today);
  const week = history.filter((h) => h.date >= from && h.date <= to);
  const count = computeWeekCount(profile, history, sunday);
  const minSessions = Math.max(2, Math.ceil(expectedStrengthSessionsPerWeek(profile.trainingDaysPerWeek) / 2));
  const short = week.length < minSessions;

  // El esfuerzo, el tiempo y la carga cuentan también el programa de fuerza que convive con el macro (Texas); las sesiones se cuentan aparte.
  const loadHistory = withCompanionLoad(history, profile.companionLog, { orphans: true });
  const loadWeek = loadHistory.filter((h) => h.date >= from && h.date <= to);
  // Sin programa esa semana, el RPE medio es el de siempre (media simple); con él, se pondera por minutos para que la sesión del programa pese lo que dura.
  const withProgramLoad = loadWeek.some((h) => h.companionLoadMin !== undefined);
  const rpe = loadWeek.length === 0 ? null : withProgramLoad ? loadWeek.reduce((s, h) => s + h.rpe * h.durationMin, 0) / loadWeek.reduce((s, h) => s + h.durationMin, 0) : loadWeek.reduce((s, h) => s + h.rpe, 0) / loadWeek.length;
  const minutes = loadWeek.reduce((s, h) => s + h.durationMin, 0);
  const acwr = computeAcwr(loadHistory, sunday);
  const load = acwr.coldStart ? null : LOAD_LABEL[acwr.zone];
  const program = companionWeek(profile, from, to);

  const metrics: ReviewMetric[] = [
    { label: 'Sesiones', value: `${count.done} de ${count.planned}`, tone: count.done >= count.planned ? 'good' : short ? 'warn' : 'muted' },
    ...(program && program.expected > 0
      ? [{ label: 'Programa de fuerza', value: `${program.done} de ${program.expected}`, tone: (program.done >= program.expected ? 'good' : program.done === 0 && program.skipped > 0 ? 'warn' : 'muted') as ReviewTone }]
      : []),
    { label: 'RPE medio', value: rpe === null ? '—' : rpeText(rpe), tone: rpe !== null && rpe >= HIGH_RPE ? 'warn' : rpe === null ? 'muted' : 'good' },
    { label: 'Carga', value: load ? load.text : 'Sin datos', tone: load ? load.tone : 'muted' },
    { label: 'Tiempo entrenando', value: minutes > 0 ? duration(minutes) : '—', tone: 'muted' },
  ];

  const best: string[] = [];
  const watch: string[] = [];

  if (!short) {
    for (const record of (profile.progressionLog ?? []).filter((r) => r.date >= from && r.date <= to)) {
      const view = sessionProgressionView(profile.progressionLog, profile.prLog, profile.progressionSettings, record.date, record.movementId);
      if (view?.change === 'subio' && view.nextKg) {
        const name = getMovementById(record.movementId)?.name ?? record.movementId;
        best.push(`${name} sube a ${kg(view.nextKg)}: ${view.needed} sesiones limpias seguidas.`);
      }
    }
    // PRs nuevos: un punto del registro que supera al mejor anterior de ese levantamiento (el primero no cuenta: es la siembra).
    const log = profile.prLog ?? [];
    for (const e of log.filter((x) => x.date >= from && x.date <= to)) {
      const before = log.filter((x) => x.key === e.key && x.date < from);
      if (before.length > 0 && e.kg > Math.max(...before.map((x) => x.kg))) best.push(`Nuevo PR en ${PR_KEY_LABEL[e.key] ?? e.key}: ${kg(e.kg)}.`);
    }
    if (program) {
      for (const a of program.attempts) {
        const name = getMovementById(a.movementId)?.name ?? a.movementId;
        if (a.achieved) best.push(`Programa de fuerza: marca de 5 en ${name} con ${kg(a.kg)}.`);
        else watch.push(`Programa de fuerza: no salió la marca de 5 en ${name} a ${kg(a.kg)}.`);
      }
      if (program.skipped > 0) watch.push(`Saltaste ${program.skipped === 1 ? '1 sesión' : `${program.skipped} sesiones`} del programa de fuerza.`);
      if (program.expected > 0 && program.done === program.expected && program.expected >= 2) best.push(`Hiciste las ${program.expected} sesiones del programa de fuerza.`);
    }
    if (count.planned >= 3 && count.done >= count.planned) {
      const streak = computeAdherenceStreak(profile, history, to);
      best.push(streak > count.planned ? `Cumpliste las ${count.planned} sesiones programadas: llevas ${streak} días de entreno seguidos sin fallar uno.` : `Cumpliste las ${count.planned} sesiones programadas.`);
    }
    if (count.done < count.planned) watch.push(`Te ${count.planned - count.done === 1 ? 'faltó 1 sesión' : `faltaron ${count.planned - count.done} sesiones`} de las programadas.`);
    if (acwr.zone === 'alta' && !acwr.coldStart) watch.push('Tu carga ha estado en zona alta.');
    if (rpe !== null && rpe >= HIGH_RPE) watch.push(`El esfuerzo medio fue alto (RPE ${rpeText(rpe)}).`);
    // Los objetivos con meta en kilos se cuentan con sus números; el resto, con el aviso de siempre.
    const kgGoalIds = new Set<string>();
    for (const goal of profile.goals) {
      const s = goalTargetStatus(goal, profile.prs, profile.prLog, today);
      if (!s) continue;
      kgGoalIds.add(goal.id);
      const name = PR_KEY_LABEL[s.key] ?? s.key;
      if (s.kind === 'conseguida') best.push(`Meta conseguida: ${name} ${kg(s.currentKg)}.`);
      else if (s.kind !== 'va-al-dia') {
        const below = s.expectedTodayKg !== null && s.expectedTodayKg > s.currentKg ? `va ${kg(s.expectedTodayKg - s.currentKg)} por debajo de lo previsto para la meta de ${kg(s.targetKg)}` : `no llega a la meta de ${kg(s.targetKg)}`;
        watch.push(`${name} ${below}. A este ritmo llegarías a unos ${kg(s.projectedKg)}.${s.kind === 'ambiciosa' ? ' La meta es ambiciosa para esa fecha: puedes bajarla o mover la fecha en Objetivos.' : ''}`);
      }
    }
    for (const item of buildOpenItems(profile, history, todayIso).objetivos) {
      if (item.refId && kgGoalIds.has(item.refId)) continue;
      if (item.chip.text === 'Va por detrás') watch.push(`${item.title} va por detrás de lo esperado.`);
      if (item.chip.text === 'Falta un test') watch.push(`${item.title}: falta un test para saber cómo vas.`);
    }
    for (const f of getActivePainFlags(profile.painFlags, todayIso)) watch.push(`${PAIN_AREA_LABEL[f.area]}: aviso de molestia activo.`);
  }

  const macroThen = getActiveMacrocycle(profile.macrocycles, to);
  const programThen = getActiveStrengthProgram(profile.strengthPrograms ?? [], to);
  const planLine = programThen
    ? `programa de fuerza (semana ${currentWeekInRange(programThen, sunday)} de ${totalMacrocycleWeeks(programThen)})`
    : macroThen
      ? `semana ${currentWeekInRange(macroThen, sunday)} de ${totalMacrocycleWeeks(macroThen)} · ${MESOCYCLE_PHASE[resolveMacrocyclePhase(macroThen, sunday).phaseIndex]}`
      : null;

  const macroNow = getActiveMacrocycle(profile.macrocycles, todayIso);
  const programNow = getActiveStrengthProgram(profile.strengthPrograms ?? [], todayIso);
  const sessionsNext = `${profile.trainingDaysPerWeek} sesiones`;
  const nextLine = programNow
    ? `Esta semana sigue tu programa de fuerza (semana ${currentWeekInRange(programNow, today)} de ${totalMacrocycleWeeks(programNow)}) con ${sessionsNext}.`
    : macroNow
      ? `Esta semana sigue en ${MESOCYCLE_PHASE[resolveMacrocyclePhase(macroNow, today).phaseIndex]} (semana ${currentWeekInRange(macroNow, today)} de ${totalMacrocycleWeeks(macroNow)}) con ${sessionsNext}.`
      : `Esta semana entrenas en modo mantenimiento, con ${sessionsNext}.`;

  const review = profile.emphasisPlan?.review;
  return {
    weekKey,
    from,
    to,
    planLine,
    metrics,
    best,
    watch,
    short,
    suggestion: short ? null : buildWeeklyMacroReview(profile, history, macroNow, today),
    emphasisReviewPending: Boolean(review && !review.seen && review.entries.some((e) => e.decision !== 'esperar')),
    nextLine,
    sessions: count,
  };
}

/** El perfil con la semana dada por revisada: no vuelve a salir. */
export function withWeekReviewed(profile: AthleteProfile, weekKey: string): AthleteProfile {
  if ((profile.reviewedMacroWeeks ?? []).includes(weekKey)) return profile;
  return { ...profile, reviewedMacroWeeks: [...(profile.reviewedMacroWeeks ?? []), weekKey].slice(-REVIEWED_MACRO_WEEKS_LIMIT) };
}
