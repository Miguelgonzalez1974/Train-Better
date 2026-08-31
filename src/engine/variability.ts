import type { Movement } from '../data/movements/types';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { rng } from './rng';

export function getRecentMovementIds(history: SessionHistoryEntry[], lookbackSessions = 5): Set<string> {
  const recent = history.slice(-lookbackSessions);
  return new Set(recent.flatMap((entry) => entry.movementIds));
}

/** Elige un movimiento evitando los usados recientemente; si el filtro deja el pool vacio, cae al pool completo. */
export function pickVaried(candidates: Movement[], excludeIds: Set<string>): Movement | undefined {
  if (candidates.length === 0) return undefined;
  const fresh = candidates.filter((m) => !excludeIds.has(m.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(rng() * pool.length)];
}

/** Elige varios movimientos distintos entre si, evitando ademas los recientes cuando sea posible. */
export function pickManyVaried(candidates: Movement[], count: number, excludeIds: Set<string>): Movement[] {
  const chosen: Movement[] = [];
  const usedIds = new Set(excludeIds);

  for (let i = 0; i < count; i++) {
    const remaining = candidates.filter((m) => !chosen.some((c) => c.id === m.id));
    const pick = pickVaried(remaining, usedIds);
    if (!pick) break;
    chosen.push(pick);
    usedIds.add(pick.id);
  }
  return chosen;
}

/**
 * Como pickVaried, pero si preferredId esta entre los candidatos, lo devuelve con
 * probabilidad preferChance (0-1). Se usa para sesgar la seleccion hacia el
 * movimiento de un objetivo activo sin eliminar la variabilidad por completo.
 */
export function pickVariedWithPreference(
  candidates: Movement[],
  excludeIds: Set<string>,
  preferredId: string | undefined,
  preferChance: number,
): Movement | undefined {
  if (preferredId) {
    const preferred = candidates.find((m) => m.id === preferredId);
    if (preferred && rng() < preferChance) return preferred;
  }
  return pickVaried(candidates, excludeIds);
}

/** Devuelve el candidato menos usado recientemente (round-robin por historial). */
export function pickLeastRecentlyUsed(candidates: Movement[], history: SessionHistoryEntry[]): Movement | undefined {
  if (candidates.length === 0) return undefined;
  const lastUsedAt = new Map<string, number>();
  history.forEach((entry, index) => {
    entry.movementIds.forEach((id) => lastUsedAt.set(id, index));
  });
  return [...candidates].sort((a, b) => (lastUsedAt.get(a.id) ?? -1) - (lastUsedAt.get(b.id) ?? -1))[0];
}
