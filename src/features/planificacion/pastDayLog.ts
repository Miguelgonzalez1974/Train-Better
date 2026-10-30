import type { DailySession, SessionHistoryEntry } from '../../data/athlete/types';

/**
 * Registrar a posteriori un día que se pasó sin apuntar (ver `LogPastDay`): la sesión "otra cosa" y el orden del historial.
 * Una sesión sin detalle de bloques es lo que se guarda cuando el atleta hizo algo distinto de lo previsto (entreno de equipo, otro
 * deporte…): solo RPE y duración, para que la carga, la racha y el esfuerzo vean el día sin fingir que se hizo lo prescrito.
 */

export function customDaySession(dateIso: string, mesocycleWeek: DailySession['mesocycleWeek']): DailySession {
  return {
    date: dateIso,
    mesocycleWeek,
    isRestDay: false,
    blocks: [],
    source: 'custom',
    customTitle: 'Entreno de equipo',
    customNote: 'Registrado solo con RPE, sin detalle de bloques.',
    swapLabel: 'Otra cosa',
    editedByAthlete: true,
  };
}

/** El historial por fecha (estable: dos entradas del mismo día conservan su orden). El motor da por hecho que el último es el más reciente. */
export function sortHistoryByDate(history: SessionHistoryEntry[]): SessionHistoryEntry[] {
  return [...history].sort((a, b) => a.date.localeCompare(b.date));
}

/** ¿El historial ya está por fecha? (para no reescribirlo sin necesidad). */
export function isHistorySorted(history: SessionHistoryEntry[]): boolean {
  return history.every((entry, i) => i === 0 || history[i - 1].date <= entry.date);
}
