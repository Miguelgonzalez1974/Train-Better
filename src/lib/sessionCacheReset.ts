import { athleteRepository } from '../data/athlete/athleteRepository';

/**
 * Tras un cambio que altera lo que el coach calcula (una marca nueva, las programaciones de las que sale el WOD, los días de entreno), las
 * sesiones ya generadas se quedan con lo antiguo. Esto las descarta para que se recalculen al abrirlas: las de los días que vienen y la de
 * hoy, salvo que hoy ya esté registrada (lo que hiciste no se toca). Devuelve las fechas borradas.
 */
export function resetUpcomingSessions(todayIso: string): string[] {
  const cache = athleteRepository.getProfile().sessionCache ?? {};
  const doneToday = athleteRepository.getHistory().some((h) => h.date === todayIso);
  const dropped: string[] = [];
  for (const date of Object.keys(cache)) {
    if (date > todayIso || (date === todayIso && !doneToday)) {
      athleteRepository.deleteCachedSession(date);
      dropped.push(date);
    }
  }
  return dropped;
}
