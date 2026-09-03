import type { PersonalRecords, WorkSetEntry } from '../data/athlete/types';
import type { Movement } from '../data/movements/types';
import { resolveStrengthPRKey, resolveOlyPRKey } from './prResolution';

/**
 * Clave de PR raíz (fuerza u oly) de un movimiento, o null si no tiene — el popup de progresión del
 * movimiento solo aplica a levantamientos con 1RM propio, así que este null es la señal de "no
 * mostrar". No mezcla PRs de variante a propósito: la serie del gráfico se compara siempre contra el
 * 1RM del lift raíz.
 */
export function resolveLiftPrKey(movement: Movement): keyof PersonalRecords | null {
  return resolveStrengthPRKey(movement) ?? resolveOlyPRKey(movement) ?? null;
}

export interface MovementSessionPoint {
  /** Fecha ISO (yyyy-mm-dd) de la sesión. */
  date: string;
  /** Serie más pesada registrada ese día para este movimiento. */
  topKg: number;
  /** Reps de esa serie — 0 si la prescripción no daba un número limpio. */
  reps: number;
  /** % del 1RM al que se trabajó ese día — null si no hay un 1RM registrado (>0). */
  pct: number | null;
}

/**
 * Serie "peso máximo por sesión" de un movimiento CONCRETO (id exacto, sin mezclar variantes) a
 * partir del registro serie a serie (`workLog`). Un punto por día: la serie más pesada de ese día y
 * sus reps. Ordenada por fecha ascendente y recortada a las últimas `limit` sesiones — lo justo para
 * leer la tendencia sin saturar el gráfico.
 */
export function buildMovementSessionSeries(
  workLog: WorkSetEntry[],
  movementId: string,
  oneRepMaxKg: number,
  limit = 10,
): MovementSessionPoint[] {
  const byDate = new Map<string, { topKg: number; reps: number }>();
  for (const entry of workLog) {
    if (entry.movementId !== movementId || !(entry.kg > 0)) continue;
    const current = byDate.get(entry.date);
    if (!current || entry.kg > current.topKg) byDate.set(entry.date, { topKg: entry.kg, reps: entry.reps });
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      topKg: value.topKg,
      reps: value.reps,
      pct: oneRepMaxKg > 0 ? Math.round((value.topKg / oneRepMaxKg) * 100) : null,
    }))
    .slice(-limit);
}

export interface MovementWorkSummary {
  sessions: number;
  lastPct: number | null;
  avgPct: number | null;
  maxPct: number | null;
  maxPctDate: string | null;
  /** Las 2+ últimas sesiones con carga se trabajaron ≥ 88% del 1RM — señal de que puede tocar re-test. */
  nearMax: boolean;
}

const NEAR_MAX_PCT = 88;

/** Resumen del bloque para la frase de contexto ("trabajando al X% de media, máximo Y%…"). */
export function summariseMovementWork(series: MovementSessionPoint[]): MovementWorkSummary {
  const withPct = series.filter((p): p is MovementSessionPoint & { pct: number } => p.pct != null);
  if (withPct.length === 0) {
    return { sessions: series.length, lastPct: null, avgPct: null, maxPct: null, maxPctDate: null, nearMax: false };
  }
  const avgPct = Math.round(withPct.reduce((sum, p) => sum + p.pct, 0) / withPct.length);
  let max = withPct[0];
  for (const p of withPct) if (p.pct > max.pct) max = p;
  const lastTwo = withPct.slice(-2);
  const nearMax = lastTwo.length >= 2 && lastTwo.every((p) => p.pct >= NEAR_MAX_PCT);
  return {
    sessions: series.length,
    lastPct: withPct[withPct.length - 1].pct,
    avgPct,
    maxPct: max.pct,
    maxPctDate: max.date,
    nearMax,
  };
}
