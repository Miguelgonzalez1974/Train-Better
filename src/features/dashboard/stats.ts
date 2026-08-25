import type { SessionHistoryEntry } from '../../data/athlete/types';
import { daysBetween } from '../../engine/loadMetrics';

const WEEKLY_RPE_WINDOW_DAYS = 7;

export interface MonthlyStats {
  diasEntrenados: number;
  diasRx: number;
  rpeMedio: number | null;
  /** RPE medio de los ultimos 7 dias, para comparar contra el medio del mes — null si no hay sesiones en la ventana. */
  rpeMedioSemana: number | null;
  totalSesiones: number;
  /** Dias entrenados en el año en curso — viene de `trainingDatesLog`, no de `history` (limitado a 30 entradas). */
  diasEsteAnio: number;
}

/** `new Date(dateIso)` sobre una fecha suelta se interpreta como medianoche UTC, que cae en el dia local anterior en zonas detras de UTC — anadir la hora fuerza el parseo en hora local. */
function isSameMonth(dateIso: string, reference: Date): boolean {
  const d = new Date(`${dateIso}T00:00:00`);
  return d.getFullYear() === reference.getFullYear() && d.getMonth() === reference.getMonth();
}

function averageRpe(entries: SessionHistoryEntry[]): number | null {
  const withRpe = entries.filter((h) => typeof h.rpe === 'number');
  return withRpe.length > 0 ? withRpe.reduce((sum, h) => sum + h.rpe, 0) / withRpe.length : null;
}

export function getMonthlyStats(
  history: SessionHistoryEntry[],
  trainingDatesLog: string[] = [],
  referenceDate: Date = new Date(),
): MonthlyStats {
  const entriesThisMonth = history.filter((h) => isSameMonth(h.date, referenceDate));
  const diasEntrenados = entriesThisMonth.length;
  const diasRx = entriesThisMonth.filter((h) => h.rxOrScaled === 'rx').length;
  const rpeMedio = averageRpe(entriesThisMonth);
  const entriesThisWeek = history.filter((h) => {
    const age = daysBetween(h.date, referenceDate);
    return age >= 0 && age < WEEKLY_RPE_WINDOW_DAYS;
  });
  const rpeMedioSemana = averageRpe(entriesThisWeek);
  const diasEsteAnio = trainingDatesLog.filter((d) => new Date(`${d}T00:00:00`).getFullYear() === referenceDate.getFullYear()).length;

  return { diasEntrenados, diasRx, rpeMedio, rpeMedioSemana, totalSesiones: history.length, diasEsteAnio };
}
