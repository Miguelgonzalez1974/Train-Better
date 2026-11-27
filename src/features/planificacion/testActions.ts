import { athleteRepository } from '../../data/athlete/athleteRepository';
import { withTestSkipped } from '../../engine/levelTestPlan';

/**
 * Descarta las sesiones preparadas que un cambio en los tests puede alterar: las de los lunes que vienen (y la de hoy, si hoy es lunes y no está
 * registrada). No toca las que has editado, las elegidas a mano ni las propias. `force` es un día que se rehace aunque esté editado.
 */
export function dropTestDaySessions(todayIso: string, force?: string): void {
  const cache = athleteRepository.getProfile().sessionCache ?? {};
  const doneToday = athleteRepository.getHistory().some((h) => h.date === todayIso);
  for (const [date, session] of Object.entries(cache)) {
    if (date < todayIso || (date === todayIso && doneToday)) continue;
    const chosen = session.editedByAthlete || session.source === 'custom' || Boolean(session.swapLabel);
    if (date !== force && (chosen || new Date(`${date}T12:00:00`).getDay() !== 1)) continue;
    athleteRepository.deleteCachedSession(date);
  }
}

/** «Hoy no» o «a la semana siguiente»: ese lunes deja de ser de test y las sesiones afectadas se vuelven a preparar. */
export function postponeTest(todayIso: string, date: string): void {
  athleteRepository.saveProfile(withTestSkipped(athleteRepository.getProfile(), date));
  dropTestDaySessions(todayIso, date);
}
