import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { generateSessionForDate, hasActiveTrainingStructure, isCachedSessionOrphaned, isCachedSessionStale } from '../../engine/generateSession';
import { computeWeekCount } from '../../engine/adherence';
import { companionTrainedDates } from '../../engine/companionLoad';
import { formatSleep } from '../../engine/habits';
import { computeAcwr } from '../../engine/loadMetrics';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { getActivePainFlags, PAIN_AREA_LABEL } from '../../engine/painFlags';
import { addDaysIso, currentWeekInRange, getActiveMacrocycle, getDayPlan, getWeekdayIndex, resolveMacrocyclePhase, totalMacrocycleWeeks } from '../../engine/periodization';
import { loadHistoryFor } from '../../engine/readinessAt';
import { isRestMarked } from '../../engine/restDays';
import { getActiveStrengthProgram } from '../../engine/strengthPrograms';
import { resolveWeekLocks } from '../../engine/weekLocks';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { loadPercent } from './loadWords';
import { weekRangeText } from './rexDashboard';
import { weekRecords } from './weeklyReview';

/**
 * «Mi semana → Esta semana»: cómo vas con la semana a medias (los días, las sesiones, la carga y el esfuerzo hasta hoy, lo mejor, lo que
 * vigilar y lo que queda). Solo informa: no propone cambios ni da nada por revisado, eso es de la semana pasada. No guarda nada. Puro.
 */

export type WeekDayStatus = 'hecho' | 'hoy' | 'previsto' | 'descanso' | 'sin-apuntar';

export interface CurrentWeek {
  /** «23 nov al 29 nov». */
  range: string;
  /** Dónde está el plan hoy («Base 1 · semana 3 de 16»), o null sin plan. */
  planLine: string | null;
  days: { iso: string; letter: string; status: WeekDayStatus; isToday: boolean }[];
  sessions: { done: number; planned: number };
  /** Es lunes y aún no has entrenado: no hay nada que contar todavía. */
  fresh: boolean;
  load: { value: string; word: string | null };
  /** Esfuerzo medio (RPE) de lo que llevas; null sin sesiones. */
  rpe: string | null;
  best: string[];
  watch: string[];
  /** Los días con sesión que quedan, hoy incluido. */
  upcoming: { iso: string; label: string; title: string; minutes: number | null }[];
}

const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const SHORT_DAY = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** RPE medio a partir del cual se avisa (el mismo de la revisión de la semana). */
const HIGH_RPE = 8.5;
/** Horas de media por debajo de las cuales se avisa del sueño. */
const SHORT_SLEEP = 7;

const comma = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** La sesión de un día que aún no ha llegado, la misma que enseñaría Planificación (sin guardar nada). */
function plannedSession(profile: AthleteProfile, history: SessionHistoryEntry[], iso: string): DailySession | null {
  const structured = hasActiveTrainingStructure(profile, iso);
  const locked = structured ? resolveWeekLocks(profile, history, profile.goals, iso) : profile;
  const cached = profile.sessionCache?.[iso];
  if (cached && !isCachedSessionOrphaned(cached, profile, iso) && !isCachedSessionStale(cached, locked.weeklyLocks?.[iso], history, locked.painFlags, locked.regenVariants?.[iso] ?? 0)) return cached;
  if (!structured) return null;
  return generateSessionForDate(locked, history, new Date(`${iso}T00:00:00`), locked.goals);
}

/** «Push Press + WOD», «Doble WOD», el nombre de tu sesión propia… */
function sessionTitle(session: DailySession): string {
  if (session.competition?.eventDay) return 'Competición';
  if (session.source === 'custom') return session.customTitle || 'Sesión propia';
  if (session.doubleWod) return 'Doble WOD';
  const lift = session.blocks.find((b) => b.block === 'strength' && !b.subgroup) ?? [...session.blocks].reverse().find((b) => b.block === 'oly' && !b.subgroup);
  // Sin aclaraciones entre paréntesis («Romanian Deadlift (RDL)» → «Romanian Deadlift»).
  const name = lift ? (lift.complex?.name ?? getMovementById(lift.movementId)?.name)?.replace(/\s*\([^)]*\)/g, '') : null;
  const wod = session.blocks.some((b) => b.block === 'wod');
  if (name) return `${name}${wod ? ' + WOD' : ''}`;
  return wod ? 'WOD' : 'Sesión';
}

export function buildCurrentWeek({ profile, history, todayIso, todaySession }: { profile: AthleteProfile; history: SessionHistoryEntry[]; todayIso: string; todaySession: DailySession | null }): CurrentWeek {
  const today = new Date(`${todayIso}T12:00:00`);
  const weekday = getWeekdayIndex(today);
  const from = addDaysIso(todayIso, -weekday);
  const to = addDaysIso(from, 6);
  const trained = new Set<string>([...history.map((h) => h.date), ...(profile.trainingDatesLog ?? []), ...companionTrainedDates(profile)]);

  const upcoming: CurrentWeek['upcoming'] = [];
  const days: CurrentWeek['days'] = LETTERS.map((letter, i) => {
    const iso = addDaysIso(from, i);
    const isToday = iso === todayIso;
    const day = (status: WeekDayStatus) => ({ iso, letter, status, isToday });
    if (trained.has(iso)) return day('hecho');
    const training = getDayPlan(i, profile.trainingDaysPerWeek).isTrainingDay;
    if (isRestMarked(profile.restDates, iso)) return day('descanso');
    if (iso < todayIso) return day(training ? 'sin-apuntar' : 'descanso');
    const session = isToday ? todaySession : training ? plannedSession(profile, history, iso) : null;
    if (!session || session.isRestDay) return day('descanso');
    const minutes = estimateSessionMinutes(session);
    upcoming.push({ iso, label: isToday ? 'Hoy' : SHORT_DAY[i], title: sessionTitle(session), minutes: minutes > 0 ? minutes : null });
    return day(isToday ? 'hoy' : 'previsto');
  });

  const sessions = computeWeekCount(profile, history, today);
  const loadHistory = loadHistoryFor(profile, history);
  const acwr = computeAcwr(loadHistory, today);
  const week = loadHistory.filter((h) => h.date >= from && h.date <= todayIso);
  const rpeValue = week.length > 0 ? week.reduce((s, h) => s + h.rpe, 0) / week.length : null;

  const best = weekRecords(profile, from, todayIso);
  const watch: string[] = [];
  if (acwr.zone === 'alta' && !acwr.coldStart) watch.push('Tu carga está en zona alta.');
  if (rpeValue !== null && rpeValue >= HIGH_RPE) watch.push(`El esfuerzo medio va alto (RPE ${comma(rpeValue)}).`);
  const nights = (profile.readinessLog ?? []).filter((c) => c.date >= from && c.date <= todayIso && c.sleepHours !== undefined).map((c) => c.sleepHours as number);
  const sleep = nights.length >= 2 ? nights.reduce((a, b) => a + b, 0) / nights.length : null;
  if (sleep !== null && sleep < SHORT_SLEEP) watch.push(`Duermes poco: ${formatSleep(sleep)} de media esta semana.`);
  for (const f of getActivePainFlags(profile.painFlags, todayIso)) watch.push(`${PAIN_AREA_LABEL[f.area]}: aviso de molestia activo.`);

  const program = getActiveStrengthProgram((profile.strengthPrograms ?? []).filter((p) => !p.companion), todayIso);
  const macro = getActiveMacrocycle(profile.macrocycles, todayIso);
  const planLine = program
    ? `Programa de fuerza · semana ${currentWeekInRange(program, today)} de ${totalMacrocycleWeeks(program)}`
    : macro
      ? `${MESOCYCLE_PHASE[resolveMacrocyclePhase(macro, today).phaseIndex]} · semana ${currentWeekInRange(macro, today)} de ${totalMacrocycleWeeks(macro)}`
      : null;

  return {
    range: weekRangeText(from, to),
    planLine,
    days,
    sessions,
    fresh: weekday === 0 && sessions.done === 0,
    load: loadPercent(acwr),
    rpe: rpeValue === null ? null : comma(rpeValue),
    best,
    watch,
    upcoming,
  };
}
