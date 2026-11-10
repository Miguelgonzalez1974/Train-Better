import type { Goal } from '../data/athlete/types';
import { isoDiffDays } from './periodization';

/**
 * Después de una competición: qué hay que cerrar y qué viene. Siempre se entiende que hay otra competición en el horizonte, así que
 * la vuelta no es «volver al plan de siempre» sino arrancar el bloque que lleva a la siguiente (aunque su fecha sea provisional).
 * Puro: las fechas entran por parámetro.
 */

/** Cuántos días después de terminar se sigue ofreciendo cerrarla. */
export const CLOSE_WINDOW_DAYS = 30;
export interface CompetitionToClose {
  goal: Goal;
  eventStart: string;
  eventEnd: string;
  /** Días desde el último día de la competición (1 = ayer). */
  daysSince: number;
}

const eventEndOf = (g: Goal) => (g.eventEndDate && g.eventEndDate >= g.targetDate ? g.eventEndDate : g.targetDate);

/** La competición recién pasada que aún no se ha cerrado con Rex (la más reciente), o null. */
export function competitionToClose(goals: Goal[] | undefined, todayIso: string): CompetitionToClose | null {
  const found = (goals ?? [])
    .filter((g) => g.type === 'preparar-competicion' && !g.result)
    .map((g) => ({ goal: g, eventStart: g.targetDate, eventEnd: eventEndOf(g), daysSince: isoDiffDays(eventEndOf(g), todayIso) }))
    .filter((c) => c.daysSince >= 1 && c.daysSince <= CLOSE_WINDOW_DAYS)
    .sort((a, b) => b.eventEnd.localeCompare(a.eventEnd));
  return found[0] ?? null;
}

/** La siguiente competición ya apuntada (la más próxima que aún no ha empezado), o null. */
export function nextCompetitionGoal(goals: Goal[] | undefined, todayIso: string): Goal | null {
  const future = (goals ?? []).filter((g) => g.type === 'preparar-competicion' && g.targetDate > todayIso).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  return future[0] ?? null;
}

export const FEELING_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = { 1: 'muy mal', 2: 'mal', 3: 'regular', 4: 'bien', 5: 'muy bien' };
