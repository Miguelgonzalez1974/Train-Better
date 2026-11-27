import type { SessionHistoryEntry, WodScalingEntry } from '../data/athlete/types';

/**
 * Cuánto vale un WOD escalado frente a hacerlo en Rx, de 0 a 1. Es una estimación, no una medición:
 *  - peso: los kilos usados entre los del Rx;
 *  - movimiento cambiado: un 80 %;
 *  - el WOD entero: la media de sus movimientos (el que hiciste como estaba cuenta entero).
 * Sin saber qué se cambió (o sin los kilos), no hay cifra: ese resultado no cuenta.
 */
export const SUBSTITUTE_FACTOR = 0.8;
/** Por poco peso que uses, un movimiento no vale menos que esto. */
export const MIN_LOAD_FACTOR = 0.3;
/** Un escalado queda siempre por debajo de un Rx. */
export const MAX_SCALED_FACTOR = 0.99;

export type PartScaling = { kind: 'rx' } | { kind: 'scaled'; factor: number } | { kind: 'sin-detalle' };

/** El valor de un movimiento escalado; null si falta el dato. */
function entryFactor(e: WodScalingEntry): number | null {
  if (e.kind === 'movimiento') return SUBSTITUTE_FACTOR;
  if (!e.loadKg || !e.rxKg || e.loadKg <= 0 || e.rxKg <= 0) return null;
  return Math.max(MIN_LOAD_FACTOR, Math.min(1, e.loadKg / e.rxKg));
}

/** El valor de una parte de un WOD con sus movimientos y lo que se escaló en ella; null si a algún escalado le falta el dato. */
export function partFactor(movementIds: string[], entries: WodScalingEntry[]): number | null {
  if (entries.length === 0) return null;
  const byId = new Map(entries.map((e) => [e.movementId, e]));
  const ids = [...new Set([...movementIds, ...byId.keys()])];
  let total = 0;
  for (const id of ids) {
    const e = byId.get(id);
    const f = e ? entryFactor(e) : 1;
    if (f === null) return null;
    total += f;
  }
  return Math.min(MAX_SCALED_FACTOR, Math.round((total / ids.length) * 100) / 100);
}

/**
 * Cómo se hizo una parte del WOD de una entrada del historial. En una sesión escalada, una parte sin nada anotado cuenta como Rx solo si en otra
 * parte sí se dijo qué se escaló (en un doble WOD); si no se dijo nada en ninguna, no se sabe.
 */
export function partScaling(entry: Pick<SessionHistoryEntry, 'rxOrScaled' | 'wodScaling'>, part: 1 | 2, movementIds: string[]): PartScaling {
  if (entry.rxOrScaled === 'rx') return { kind: 'rx' };
  const all = entry.wodScaling ?? [];
  if (all.length === 0) return { kind: 'sin-detalle' };
  const mine = all.filter((e) => (e.part ?? 1) === part);
  if (mine.length === 0) return { kind: 'rx' };
  const factor = partFactor(movementIds, mine);
  return factor === null ? { kind: 'sin-detalle' } : { kind: 'scaled', factor };
}
