import type { SetFeel, WorkSetEntry } from '../data/athlete/types';

export const SET_FEEL_LABEL: Record<SetFeel, string> = {
  sobro: 'Me sobró',
  justo: 'Justo',
  duro: 'Duro',
  'muy-duro': 'Muy duro',
};

/** Cuanto pesa cada sensacion cuando se agrega el historial: negativo = la carga sobra, positivo = se queda corta de margen. */
export const SET_FEEL_SCORE: Record<SetFeel, number> = {
  sobro: -1,
  justo: 0,
  duro: 1,
  'muy-duro': 2,
};

/** RPE de una serie de trabajo -> sensación equivalente — para agregar el feedback cuantitativo bajo el mismo vocabulario que ya usa `responseProfile`. */
export function feelFromRpe(rpe: number): SetFeel {
  if (rpe <= 7) return 'sobro';
  if (rpe < 8.5) return 'justo';
  if (rpe < 9.5) return 'duro';
  return 'muy-duro';
}

/** Opciones del selector de RPE tras la serie más pesada — rango en el que Epley (`estimateE1RMFromRpe`) da una estimación fiable. */
export const RPE_CHECKIN_OPTIONS = [6, 7, 8, 9, 10];

/**
 * Extrae las reps de una serie principal de trabajo solo si son un número limpio (1-12) — descarta
 * escaleras de carga ("5-3-1"), el rango del primer técnico de oly ("2-3") y formatos sin número
 * de serie ("técnica / tiempo").
 */
export function parseWorkingReps(reps: string): number | null {
  const match = reps.trim().match(/^(\d+)(?:\s|$)/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 12 ? value : null;
}

/**
 * Serie más pesada ya registrada para un movimiento en una lista de series ya filtrada por día (p.ej.
 * `todayWorkLog`) — la fuente para autorellenar el check-in de RPE en vez de volver a teclear el peso.
 */
export function findTopWorkSet(entries: WorkSetEntry[], movementId: string): { kg: number; reps: number } | null {
  let best: WorkSetEntry | null = null;
  for (const entry of entries) {
    if (entry.movementId !== movementId || !(entry.kg > 0)) continue;
    if (!best || entry.kg > best.kg) best = entry;
  }
  return best ? { kg: best.kg, reps: best.reps } : null;
}
