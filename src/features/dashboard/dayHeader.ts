import type { Macrocycle } from '../../data/athlete/types';
import { currentWeekInRange, getActiveMacrocycle, totalMacrocycleWeeks } from '../../engine/periodization';

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «Viernes 6 nov»: la fecha del día que se mira, a mano (sin depender del idioma del navegador). */
export function headerDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export interface MacroChip {
  /** El nombre del macro tal como lo puso el atleta. */
  label: string;
  /** «sem. 3/6» */
  week: string;
  /** «31 d» hasta la competición, si la hay por delante. */
  countdown: string | null;
}

/**
 * El programa activo hoy, en una línea: nombre, semana dentro del macro y, si hay competición por delante, cuántos días faltan.
 * Sin macro activo no hay nada que enseñar (null).
 */
export function macroChip(macrocycles: Macrocycle[], todayIso: string, daysToEvent: number | null): MacroChip | null {
  const macro = getActiveMacrocycle(macrocycles, todayIso);
  if (!macro) return null;
  const today = new Date(`${todayIso}T00:00:00`);
  return {
    label: macro.label.trim() || 'Macrociclo',
    week: `sem. ${currentWeekInRange(macro, today)}/${totalMacrocycleWeeks(macro)}`,
    countdown: daysToEvent !== null && daysToEvent > 0 ? `${daysToEvent} d` : null,
  };
}
