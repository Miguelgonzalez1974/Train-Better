import type { Goal } from '../data/athlete/types';
import type { AcwrZone } from './loadMetrics';
import { daysBetween } from './loadMetrics';
import { pickPriorityGoal } from './goalPriority';

export type DeloadReason = 'fatiga' | 'taper';

export const DELOAD_REASON_NOTE: Record<DeloadReason, string> = {
  fatiga: 'Descarga activada por tu carga acumulada (ACWR en riesgo alto) — hoy toca bajar el pie del acelerador, no seguir el plan estándar de la semana.',
  taper: 'Taper pre-competición: quedan pocos días para tu objetivo — bajamos volumen para que llegues fresco, no más fuerte que hoy.',
};

/** Ventana de taper: los ultimos 7 dias antes de la fecha de una competicion se entrenan en descarga. */
const TAPER_WINDOW_DAYS = 7;

/** Dias que faltan hasta la fecha objetivo — `daysBetween` da el sentido contrario (referencia menos fecha), asi que se invierte. */
function daysUntil(targetDateIso: string, today: Date): number {
  return -daysBetween(targetDateIso, today);
}

export function isTaperActive(goals: Goal[], today: Date): boolean {
  const competicionGoal = pickPriorityGoal(goals, (g) => g.type === 'preparar-competicion');
  if (!competicionGoal) return false;
  const daysToGoal = daysUntil(competicionGoal.targetDate, today);
  return daysToGoal >= 0 && daysToGoal <= TAPER_WINDOW_DAYS;
}

/**
 * Un coach real no descarga solo porque "toca semana 4 de 4": si el ACWR esta en zona de riesgo
 * alto, o si quedan pocos dias para una competicion, la semana se convierte en descarga aunque el
 * ciclo de calendario diga otra cosa. La semana de calendario sigue existiendo para las demas
 * semanas (progresion de intensidad 1-2-3), pero puede ser sustituida por estos dos motivos.
 */
export function resolveTrainingWeek(
  calendarWeek: 1 | 2 | 3 | 4,
  acwrZone: AcwrZone,
  goals: Goal[],
  today: Date,
): { week: 1 | 2 | 3 | 4; reason?: DeloadReason } {
  if (isTaperActive(goals, today)) return { week: 4, reason: 'taper' };
  if (acwrZone === 'alta') return { week: 4, reason: 'fatiga' };
  return { week: calendarWeek };
}
