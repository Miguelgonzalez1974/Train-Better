import type { Goal, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';

/**
 * Progreso (0-1) del objetivo entre su fecha de creacion y su fecha objetivo — el suelo que
 * siempre se aplica, aunque el rendimiento real vaya por detras o no haya datos suficientes.
 */
function getTimeProgress(goal: Goal, today: Date): number {
  const created = new Date(goal.createdAt).getTime();
  const target = new Date(goal.targetDate).getTime();
  const now = today.getTime();

  if (target <= created) return 1;
  return Math.min(1, Math.max(0, (now - created) / (target - created)));
}

/** Crecimiento de carga en el lift objetivo que un coach consideraria "progreso completo" dentro de un ciclo. */
const FULL_PROGRESS_LOAD_GROWTH = 0.08;

/**
 * Progreso basado en rendimiento real: compara la primera y la ultima carga de test registradas
 * para el mismo PR (siguiendo la cadena de progresiones, no solo el movimiento exacto elegido)
 * desde que se creo el objetivo. Devuelve null si el objetivo no tiene un lift con PR rastreable
 * (p.ej. objetivos gimnasticos o de resistencia) o si aun no hay al menos dos tests que comparar.
 */
function getPerformanceProgress(goal: Goal, history: SessionHistoryEntry[]): number | null {
  if (!goal.movementId) return null;
  const goalMovement = getMovementById(goal.movementId);
  if (!goalMovement) return null;

  const prKey = resolveStrengthPRKey(goalMovement) ?? resolveOlyPRKey(goalMovement);
  if (!prKey) return null;

  const loads = history
    .filter((entry) => entry.testLoadKg && entry.date >= goal.createdAt)
    .filter((entry) =>
      entry.movementIds.some((id) => {
        const movement = getMovementById(id);
        if (!movement) return false;
        return (resolveStrengthPRKey(movement) ?? resolveOlyPRKey(movement)) === prKey;
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => entry.testLoadKg as number);

  if (loads.length < 2) return null;

  const growth = (loads[loads.length - 1] - loads[0]) / loads[0];
  return Math.min(1, Math.max(0, growth / FULL_PROGRESS_LOAD_GROWTH));
}

/**
 * Progreso (0-1) del objetivo activo, usado para que el sesgo del motor se intensifique
 * gradualmente. Combina el paso del tiempo (suelo, siempre presente) con el rendimiento real
 * medido en tests recientes (si el objetivo tiene un lift rastreable y ya hay datos): un atleta
 * que ya esta subiendo carga de verdad no deberia esperar solo a que pase el calendario para que
 * el coach se lo tome en serio.
 */
export function getGoalProgress(goal: Goal, history: SessionHistoryEntry[] = [], today: Date = new Date()): number {
  const timeProgress = getTimeProgress(goal, today);
  const performanceProgress = getPerformanceProgress(goal, history);
  return performanceProgress === null ? timeProgress : Math.max(timeProgress, performanceProgress);
}
