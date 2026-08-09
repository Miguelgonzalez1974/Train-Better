import type { Goal } from '../data/athlete/types';

/**
 * De entre varios objetivos activos que podrian aplicar al mismo bloque el mismo dia, un coach
 * real prioriza el que tiene la fecha limite mas cercana — es el mas urgente. Devuelve undefined
 * si ninguno cumple el filtro.
 */
export function pickPriorityGoal(goals: Goal[], predicate: (goal: Goal) => boolean): Goal | undefined {
  const candidates = goals.filter(predicate);
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())[0];
}
