import type { SessionHistoryEntry } from '../../data/athlete/types';

export interface MonthlyStats {
  diasEntrenados: number;
  diasRx: number;
  rpeMedio: number | null;
  totalSesiones: number;
}

function isSameMonth(dateIso: string, reference: Date): boolean {
  const d = new Date(dateIso);
  return d.getFullYear() === reference.getFullYear() && d.getMonth() === reference.getMonth();
}

export function getMonthlyStats(history: SessionHistoryEntry[], referenceDate: Date = new Date()): MonthlyStats {
  const entriesThisMonth = history.filter((h) => isSameMonth(h.date, referenceDate));
  const diasEntrenados = entriesThisMonth.length;
  const diasRx = entriesThisMonth.filter((h) => h.rxOrScaled === 'rx').length;
  const withRpe = entriesThisMonth.filter((h) => typeof h.rpe === 'number');
  const rpeMedio = withRpe.length > 0 ? withRpe.reduce((sum, h) => sum + h.rpe, 0) / withRpe.length : null;

  return { diasEntrenados, diasRx, rpeMedio, totalSesiones: history.length };
}
