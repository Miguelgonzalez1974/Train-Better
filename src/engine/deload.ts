import type { Goal } from '../data/athlete/types';
import type { AcwrZone } from './loadMetrics';

export type DeloadReason = 'fatiga' | 'taper';

export const DELOAD_REASON_NOTE: Record<DeloadReason, string> = {
  fatiga: 'Descarga activada por tu carga acumulada (ACWR en riesgo alto) — hoy toca bajar el pie del acelerador, no seguir el plan estándar de la semana.',
  taper: 'Taper pre-competición: quedan pocos días para tu objetivo — bajamos volumen para que llegues fresco, no más fuerte que hoy.',
};

/** Ventana de taper: los ultimos 7 dias antes de la fecha de una competicion se entrenan en descarga. */
const TAPER_WINDOW_DAYS = 7;

function daysUntil(targetDateIso: string, today: Date): number {
  const target = new Date(targetDateIso).setHours(0, 0, 0, 0);
  const now = new Date(today).setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

export function isTaperActive(goal: Goal | null, today: Date): boolean {
  if (goal?.type !== 'preparar-competicion') return false;
  const daysToGoal = daysUntil(goal.targetDate, today);
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
  goal: Goal | null,
  today: Date,
): { week: 1 | 2 | 3 | 4; reason?: DeloadReason } {
  if (isTaperActive(goal, today)) return { week: 4, reason: 'taper' };
  if (acwrZone === 'alta') return { week: 4, reason: 'fatiga' };
  return { week: calendarWeek };
}
