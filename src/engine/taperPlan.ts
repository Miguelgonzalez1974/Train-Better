import type { AthleteProfile, Goal, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { computeCompetitionDay, simulacroDateFor, type CompetitionDay, type TaperDecision } from './competition';
import { computeHrvStatus, hrvVsNow, restingHrBaseline } from './hrv';
import { computeReadinessScore } from './readinessScore';

/**
 * El taper según cómo llegas. En la competición, un entrenador no recorta igual a todos: si llegas con fatiga baja más el
 * volumen y te da un día extra de descanso, y si llegas con margen recorta menos para que no pierdas la chispa. La decisión se
 * toma UNA vez, con lo que se sabía el día antes de empezar el taper (así no cambia de un día a otro), a partir de:
 *   1. El simulacro: si te costó de verdad (HRV por debajo de tu media o pulso alto a la mañana siguiente), taper reforzado.
 *   2. La HRV de la semana frente a tu rango (también el provisional): por debajo = reforzado, por encima con buena
 *      preparación = afinado.
 *   3. La preparación media de los últimos 7 días: por debajo de 50 = reforzado; por encima de 65 (con HRV alta) = afinado.
 * Sin datos suficientes, taper estándar.
 */

/** Días antes de la competición en que empieza el taper, y desde cuándo se miran los datos (el día anterior). */
const TAPER_START_DAYS = 7;
export const TAPER_SNAPSHOT_DAYS = TAPER_START_DAYS + 1;

const PREP_LOW = 50;
const PREP_HIGH = 65;
/** Mediciones de preparación (de los últimos 7 días) que hacen falta para hablar de su media. */
const PREP_MIN_DAYS = 3;
const PREP_WINDOW = 7;

/** El simulacro "costó" si a la mañana siguiente la HRV cae un 15 % o más bajo tu media de la semana, o el pulso sube 8 ppm o más. */
const SIMULACRO_HRV_DROP = 0.85;
const SIMULACRO_HR_RISE = 8;

function isoAdd(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface SimulacroResult {
  /** Hay una medición a la mañana siguiente del simulacro con la que comparar. */
  measured: boolean;
  /** Te costó (null si no se pudo medir). */
  cost: boolean | null;
  /** Cuánto cayó la HRV frente a tu media de la semana (en %, positivo = cayó) y cuánto subió el pulso. */
  hrvDropPct: number | null;
  hrRise: number | null;
  /** HRV de la mañana siguiente y su media previa, para contarlo. */
  nextHrv: number | null;
  priorAvg: number | null;
}

/** Cómo respondiste al simulacro, mirando la mañana siguiente (HRV y pulso) frente a tu media de los 7 días anteriores. */
export function assessSimulacro(log: ReadinessCheck[] | undefined, simulacroIso: string): SimulacroResult {
  const entries = log ?? [];
  const nextIso = isoAdd(simulacroIso, 1);
  const next = entries.find((c) => c.date === nextIso);
  const none: SimulacroResult = { measured: false, cost: null, hrvDropPct: null, hrRise: null, nextHrv: null, priorAvg: null };
  if (!next) return none;

  const fromIso = isoAdd(simulacroIso, -7);
  const prior = entries.filter((c) => c.hrv !== undefined && c.date >= fromIso && c.date <= simulacroIso).map((c) => Math.log(c.hrv as number));
  let hrvDropPct: number | null = null;
  let priorAvg: number | null = null;
  if (next.hrv !== undefined && prior.length >= 3) {
    priorAvg = Math.round(Math.exp(prior.reduce((s, v) => s + v, 0) / prior.length));
    hrvDropPct = Math.round((1 - next.hrv / priorAvg) * 100);
  }
  const base = restingHrBaseline(entries, simulacroIso);
  const hrRise = next.restingHr !== undefined && base !== null ? next.restingHr - base : null;
  if (hrvDropPct === null && hrRise === null) return none;

  const cost = (hrvDropPct !== null && next.hrv! / priorAvg! <= SIMULACRO_HRV_DROP) || (hrRise !== null && hrRise >= SIMULACRO_HR_RISE);
  return { measured: true, cost, hrvDropPct, hrRise, nextHrv: next.hrv ?? null, priorAvg };
}

/** Preparación media de los últimos 7 días hasta `iso` (cada día con lo que se sabía ese día); null con menos de 3 días con nota. */
function preparationAverage(profile: AthleteProfile, history: SessionHistoryEntry[], iso: string): number | null {
  const totals: number[] = [];
  for (let back = 0; back < PREP_WINDOW; back++) {
    const dayIso = isoAdd(iso, -back);
    const total = computeReadinessScore({
      readinessLog: profile.readinessLog,
      history: history.filter((h) => h.date < dayIso),
      setFeedbackLog: profile.setFeedbackLog,
      painFlags: profile.painFlags,
      today: new Date(`${dayIso}T12:00:00`),
    }).total;
    if (total !== null) totals.push(total);
  }
  return totals.length >= PREP_MIN_DAYS ? Math.round(totals.reduce((s, v) => s + v, 0) / totals.length) : null;
}

/** El taper de una competición que empieza en `eventStart`, decidido con los datos del día antes de que empiece. */
export function decideTaper(profile: AthleteProfile, history: SessionHistoryEntry[], eventStart: string): TaperDecision {
  const snapshot = isoAdd(eventStart, -TAPER_SNAPSHOT_DAYS);
  const log = (profile.readinessLog ?? []).filter((c) => c.date <= snapshot);
  const prior = history.filter((h) => h.date <= snapshot);

  const simulacroIso = simulacroDateFor(eventStart, profile.trainingDaysPerWeek);
  const simulacro = simulacroIso ? assessSimulacro(log, simulacroIso) : null;
  const hrvVs = hrvVsNow(computeHrvStatus(log, snapshot));
  const prep = preparationAverage({ ...profile, readinessLog: log }, prior, snapshot);

  if (simulacro?.cost) {
    const parts: string[] = [];
    if (simulacro.hrvDropPct !== null && simulacro.hrvDropPct > 0) parts.push(`tu HRV cayó un ${simulacro.hrvDropPct} % bajo tu media`);
    if (simulacro.hrRise !== null && simulacro.hrRise > 0) parts.push(`tu pulso subió ${simulacro.hrRise} ppm`);
    return { kind: 'reforzado', reasons: [`Tras el simulacro ${parts.join(' y ')}: el esfuerzo te costó, así que el taper se refuerza.`] };
  }
  if (hrvVs === 'bajo') return { kind: 'reforzado', reasons: ['Tu HRV de la semana está por debajo de tu rango: llegas con fatiga.'] };
  if (prep !== null && prep < PREP_LOW) return { kind: 'reforzado', reasons: [`Tu preparación media de la semana es ${prep} %: llegas justo.`] };
  if (hrvVs === 'alto' && prep !== null && prep > PREP_HIGH) {
    return { kind: 'afinado', reasons: [`Tu HRV está por encima de tu rango y tu preparación media es ${prep} %: llegas con margen.`] };
  }
  if (hrvVs === null && prep === null) return { kind: 'estandar', reasons: ['Aún sin datos suficientes de HRV ni de preparación: taper estándar.'] };
  return { kind: 'estandar', reasons: [] };
}

/**
 * La cuenta atrás de la competición de hoy con el taper decidido según cómo llegas. Es `computeCompetitionDay` con un paso
 * más: si hoy es taper, se decide qué taper toca y se vuelve a calcular el día con él.
 */
export function resolveCompetitionDay(profile: AthleteProfile, history: SessionHistoryEntry[], date: Date, goals: Goal[] | undefined = profile.goals): CompetitionDay | null {
  const base = computeCompetitionDay(goals, date, profile.trainingDaysPerWeek);
  if (!base || base.phase !== 'taper') return base;
  return computeCompetitionDay(goals, date, profile.trainingDaysPerWeek, decideTaper(profile, history, base.eventStart));
}
