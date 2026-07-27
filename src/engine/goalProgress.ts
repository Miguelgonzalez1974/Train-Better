import type { Goal } from '../data/athlete/types';

/**
 * Progreso (0-1) del objetivo activo entre su fecha de creacion y su fecha objetivo.
 * Se usa para que el sesgo del motor se intensifique gradualmente a medida que se
 * acerca la fecha, en vez de aplicar siempre el mismo sesgo constante.
 */
export function getGoalProgress(goal: Goal, today: Date = new Date()): number {
  const created = new Date(goal.createdAt).getTime();
  const target = new Date(goal.targetDate).getTime();
  const now = today.getTime();

  if (target <= created) return 1;
  return Math.min(1, Math.max(0, (now - created) / (target - created)));
}
