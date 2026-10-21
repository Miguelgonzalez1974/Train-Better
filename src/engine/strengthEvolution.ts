import type { PersonalRecords, PrLogEntry, SetFeedbackEntry, WorkSetEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';
import { buildPrSeries, type PrPoint } from './progressSeries';

/**
 * Evolución de un levantamiento para el gráfico: la línea de tus PRs (escalones: el máximo vigente en cada momento) y los
 * puntos de tu 1RM estimado con las series de trabajo (lo que de verdad moviste, no solo el test). El PR dice lo que
 * probaste; el 1RM estimado dice cómo vas entre test y test.
 */

export type EvolutionRange = '8s' | '6m' | 'todo';
export const RANGE_DAYS: Record<EvolutionRange, number | null> = { '8s': 56, '6m': 182, todo: null };
export const RANGE_LABEL: Record<EvolutionRange, string> = { '8s': '8 sem', '6m': '6 meses', todo: 'Todo' };

/** Series del modo entreno que valen para estimar: hasta 10 reps (Epley deja de ser fiable) y al menos el 55 % del PR (no calentamiento). */
const WORK_MAX_REPS = 10;
const WORK_MIN_INTENSITY = 0.55;
const DAY_MS = 86_400_000;

export interface E1rmPoint {
  date: string;
  kg: number;
  /** `rpe`: de "hice X kg × Y @ RPE Z" (la más precisa); `series`: la mejor serie del día por Epley, sin RPE. */
  source: 'rpe' | 'series';
}

export interface StrengthEvolution {
  key: string;
  /** Primer y último día del eje horizontal (ISO). */
  from: string;
  to: string;
  /** Escalones del PR dentro del rango (con un punto al inicio con el valor vigente y otro al final, para dibujar la línea entera). */
  pr: PrPoint[];
  /** Cambios reales de PR dentro del rango (los puntos que se marcan). */
  prChanges: PrPoint[];
  e1rm: E1rmPoint[];
  currentPr: number;
  /** Tu 1RM estimado hoy: media de las últimas 3 estimaciones (null si no hay). */
  latestE1rm: number | null;
  /** Cuánto cambió el PR dentro del rango. */
  prDeltaKg: number;
  /** Cuánto cambió el 1RM estimado entre el primer y el último punto del rango (null con menos de 2 puntos). */
  e1rmDeltaKg: number | null;
  /** Mínimo y máximo de todo lo que se pinta, para el eje vertical. */
  minKg: number;
  maxKg: number;
  hasData: boolean;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function epley(kg: number, reps: number): number {
  return reps <= 1 ? kg : kg * (1 + reps / 30);
}

function prKeyOfMovement(movementId: string): string | null {
  const m = getMovementById(movementId);
  if (!m) return null;
  return resolveStrengthPRKey(m) ?? resolveOlyPRKey(m) ?? null;
}

/** Todas las estimaciones de 1RM de un levantamiento (con RPE y, si ese día no hay, la mejor serie por Epley). */
export function collectE1rmPoints(key: string, currentPr: number, setFeedbackLog: SetFeedbackEntry[] = [], workLog: WorkSetEntry[] = []): E1rmPoint[] {
  const byDate = new Map<string, E1rmPoint>();
  for (const e of workLog) {
    if (!(e.kg > 0) || !(e.reps >= 1) || e.reps > WORK_MAX_REPS) continue;
    if (currentPr > 0 && e.kg < currentPr * WORK_MIN_INTENSITY) continue;
    if (prKeyOfMovement(e.movementId) !== key) continue;
    const kg = Math.round(epley(e.kg, e.reps) * 10) / 10;
    const prev = byDate.get(e.date);
    if (!prev || kg > prev.kg) byDate.set(e.date, { date: e.date, kg, source: 'series' });
  }
  // La estimación con RPE manda sobre la de Epley del mismo día.
  for (const e of setFeedbackLog) {
    if (e.prKey !== key || !(e.estimated1rm && e.estimated1rm > 0)) continue;
    byDate.set(e.date, { date: e.date, kg: e.estimated1rm, source: 'rpe' });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildStrengthEvolution(
  key: keyof PersonalRecords,
  prs: PersonalRecords,
  prLog: PrLogEntry[],
  setFeedbackLog: SetFeedbackEntry[],
  workLog: WorkSetEntry[],
  todayIso: string,
  range: EvolutionRange,
): StrengthEvolution {
  const currentPr = prs[key];
  const series = buildPrSeries(prLog, key);
  const allE1rm = collectE1rmPoints(key, currentPr, setFeedbackLog, workLog);
  const days = RANGE_DAYS[range];
  const firstDate = [series[0]?.date, allE1rm[0]?.date].filter((d): d is string => Boolean(d)).sort()[0] ?? todayIso;
  const from = days === null ? firstDate : addDaysIso(todayIso, -days);

  // El PR vigente al empezar el rango es el último escalón anterior (o el primero que haya).
  const before = [...series].reverse().find((p) => p.date <= from);
  const startKg = before?.kg ?? series[0]?.kg ?? currentPr;
  const inRange = series.filter((p) => p.date > from && p.date <= todayIso);
  const pr: PrPoint[] = [{ date: from, kg: startKg }, ...inRange, { date: todayIso, kg: inRange.length ? inRange[inRange.length - 1].kg : startKg }];
  // Si el último punto no coincide con el PR actual del perfil (se cambió a mano), manda el del perfil.
  if (currentPr > 0) pr[pr.length - 1] = { date: todayIso, kg: currentPr };

  const e1rm = allE1rm.filter((p) => p.date >= from && p.date <= todayIso);
  const last3 = e1rm.slice(-3);
  const latestE1rm = last3.length ? Math.round((last3.reduce((s, p) => s + p.kg, 0) / last3.length) * 10) / 10 : null;
  const all = [...pr.map((p) => p.kg), ...e1rm.map((p) => p.kg)].filter((v) => v > 0);
  return {
    key,
    from,
    to: todayIso,
    pr,
    prChanges: inRange,
    e1rm,
    currentPr,
    latestE1rm,
    prDeltaKg: Math.round((pr[pr.length - 1].kg - pr[0].kg) * 10) / 10,
    e1rmDeltaKg: e1rm.length >= 2 ? Math.round((e1rm[e1rm.length - 1].kg - e1rm[0].kg) * 10) / 10 : null,
    minKg: all.length ? Math.min(...all) : 0,
    maxKg: all.length ? Math.max(...all) : 0,
    hasData: series.length >= 2 || e1rm.length > 0,
  };
}

/** Eje vertical con 3 líneas: límites redondeados a 5 kg que dejan algo de aire por arriba y por abajo. */
export function niceAxis(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  if (!(max > 0)) return { lo: 0, hi: 100, ticks: [0, 50, 100] };
  const pad = Math.max(5, (max - min) * 0.15);
  const lo = Math.max(0, Math.floor((min - pad) / 5) * 5);
  const hi = Math.ceil((max + pad) / 5) * 5;
  return { lo, hi, ticks: [lo, Math.round((lo + hi) / 2 / 2.5) * 2.5, hi] };
}

export function daysBetweenIso(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY_MS);
}
