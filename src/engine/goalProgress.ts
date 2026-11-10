import type { Goal, PersonalRecords, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { goalPrKey } from './goalTarget';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';

/**
 * Progreso (0-1) del objetivo entre su fecha de creacion y su fecha objetivo — el suelo que
 * siempre se aplica, aunque el rendimiento real vaya por detras o no haya datos suficientes.
 */
export function getTimeProgress(goal: Goal, today: Date): number {
  const created = new Date(goal.createdAt).getTime();
  const target = new Date(goal.targetDate).getTime();
  const now = today.getTime();

  if (target <= created) return 1;
  return Math.min(1, Math.max(0, (now - created) / (target - created)));
}

/** Fracción (0-1) del camino de la marca de salida a la meta en kilos; null si el objetivo no tiene meta, punto de partida o marca actual. */
export function targetKgProgress(goal: Goal, prs?: Partial<PersonalRecords>): number | null {
  if (!goal.targetKg || goal.startKg === undefined || !prs) return null;
  const key = goalPrKey(goal);
  const current = key ? prs[key] : undefined;
  if (!current) return null;
  if (goal.targetKg <= goal.startKg) return current >= goal.targetKg ? 1 : 0;
  return Math.min(1, Math.max(0, (current - goal.startKg) / (goal.targetKg - goal.startKg)));
}

/** Crecimiento de carga en el lift objetivo que un coach consideraria "progreso completo" dentro de un ciclo. */
const FULL_PROGRESS_LOAD_GROWTH = 0.08;

/**
 * Progreso basado en rendimiento real: compara la primera y la ultima carga de test registradas
 * para el mismo PR (siguiendo la cadena de progresiones, no solo el movimiento exacto elegido)
 * desde que se creo el objetivo. Devuelve null si el objetivo no tiene un lift con PR rastreable
 * (p.ej. objetivos gimnasticos o de resistencia) o si aun no hay al menos dos tests que comparar.
 */
export function getPerformanceProgress(goal: Goal, history: SessionHistoryEntry[], prs?: Partial<PersonalRecords>): number | null {
  if (!goal.movementId) return null;
  // Con meta en kilos y punto de partida, el avance es lo que llevas recorrido de salida a meta.
  const kgProgress = targetKgProgress(goal, prs);
  if (kgProgress !== null) return kgProgress;
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
export function getGoalProgress(goal: Goal, history: SessionHistoryEntry[] = [], today: Date = new Date(), prs?: Partial<PersonalRecords>): number {
  const timeProgress = getTimeProgress(goal, today);
  const performanceProgress = getPerformanceProgress(goal, history, prs);
  return performanceProgress === null ? timeProgress : Math.max(timeProgress, performanceProgress);
}

/** Cuanto puede ir por detras el rendimiento real del tiempo transcurrido antes de considerarse "atrasado" de verdad, no solo ruido de una medicion suelta. */
const BEHIND_SCHEDULE_MARGIN = 0.15;
/** Con mas de la mitad del plazo consumido y ningun test registrado todavia, un coach real ya preguntaria donde estas — no hace falta esperar a un dato que quiza no llegue nunca. */
const NO_DATA_BEHIND_THRESHOLD = 0.5;

/**
 * true cuando hay evidencia real (no solo paso del calendario) de que el objetivo va por detras:
 * o bien el rendimiento medido esta claramente por debajo de lo que tocaria a estas alturas, o
 * bien ha pasado mas de la mitad del plazo sin ni un solo test registrado. `getGoalProgress` nunca
 * baja del suelo temporal, asi que por si solo no distingue "vas justo a tiempo" de "vas realmente
 * mal" — esta funcion es la que sí lo hace, para no aplicar siempre el mismo sesgo fijo.
 */
export function isGoalBehindSchedule(goal: Goal, history: SessionHistoryEntry[] = [], today: Date = new Date(), prs?: Partial<PersonalRecords>): boolean {
  const timeProgress = getTimeProgress(goal, today);
  const performanceProgress = getPerformanceProgress(goal, history, prs);
  if (performanceProgress === null) return timeProgress > NO_DATA_BEHIND_THRESHOLD;
  return performanceProgress < timeProgress - BEHIND_SCHEDULE_MARGIN;
}
