import type { Goal, Macrocycle } from '../data/athlete/types';
import { addDaysIso, isoDiffDays, weeksBetweenIso } from './periodization';
import { blockLengths, blockPhaseWeeks } from './seasonSetup';

/**
 * Después de una competición: qué hay que cerrar y qué viene. Siempre se entiende que hay otra competición en el horizonte, así que
 * la vuelta no es «volver al plan de siempre» sino arrancar el bloque que lleva a la siguiente (aunque su fecha sea provisional).
 * Puro: las fechas entran por parámetro.
 */

/** Cuántos días después de terminar se sigue ofreciendo cerrarla. */
export const CLOSE_WINDOW_DAYS = 30;
/** Semanas mínimas hasta la siguiente competición para montar un bloque propio. */
export const MIN_BLOCK_WEEKS = 4;

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

/**
 * Los macros que llevan de `startIso` a la competición, terminando una semana después de su último día (para que la recuperación
 * posterior quede dentro de un macro). Con 14 semanas o más, tres bloques (base 1, base 2 y pico); de 8 a 13, dos; de 4 a 7, solo el pico;
 * con menos no se monta nada (el modo competición se ocupa de las últimas semanas).
 */
export function buildBlocksToCompetition(startIso: string, eventEndIso: string, newId: () => string): Macrocycle[] {
  const endDate = addDaysIso(eventEndIso, 7);
  const total = weeksBetweenIso(startIso, endDate);
  if (total < MIN_BLOCK_WEEKS) return [];
  const shapes: { shape: 'base1' | 'base2' | 'pico'; label: string }[] =
    total >= 14
      ? [
          { shape: 'base1', label: 'Base 1 · Reconstrucción' },
          { shape: 'base2', label: 'Base 2 · Fuerza y motor' },
          { shape: 'pico', label: 'Pico y competición' },
        ]
      : total >= 8
        ? [
            { shape: 'base2', label: 'Base · Fuerza y motor' },
            { shape: 'pico', label: 'Pico y competición' },
          ]
        : [{ shape: 'pico', label: 'Pico y competición' }];
  const lengths = shapes.length === 3 ? blockLengths(total) : shapes.length === 2 ? [Math.round(total * 0.55), total - Math.round(total * 0.55)] : [total];
  const out: Macrocycle[] = [];
  let cursor = startIso;
  shapes.forEach(({ shape, label }, i) => {
    const last = i === shapes.length - 1;
    const end = last ? endDate : addDaysIso(cursor, lengths[i] * 7 - 1);
    out.push({ id: newId(), label, startDate: cursor, endDate: end, phaseWeeks: blockPhaseWeeks(lengths[i], shape) });
    cursor = addDaysIso(end, 1);
  });
  return out;
}
