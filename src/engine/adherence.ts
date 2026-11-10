import { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from './periodization';
import { isRestMarked } from './restDays';
import { companionTrainedDates } from './companionLoad';

/**
 * Racha de dias de entreno PROGRAMADOS cumplidos sin fallar ninguno, contando hacia atras desde
 * hoy. Los dias de descanso (segun la plantilla semanal de `trainingDaysPerWeek`) se saltan — ni
 * suman ni cortan la racha; un dia programado sin registro SI la corta. Pensada para llamarse solo
 * cuando hoy ya esta completado (si no, "hoy" cuenta como fallo y la racha sale a 0 aunque el atleta
 * lleve semanas sin fallar un dia).
 */
export function computeAdherenceStreak(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): number {
  const completedDates = new Set([...history.map((h) => h.date), ...companionTrainedDates(profile)]);
  let streak = 0;
  const cursor = new Date(`${todayIso}T00:00:00`);
  // Tope de 400 dias de calendario (~13 meses) por seguridad — mismo horizonte que
  // `TRAINING_DATES_LOG_LIMIT` en localRepository.ts, nunca deberia hacer falta llegar tan lejos.
  for (let i = 0; i < 400; i++) {
    const dateIso = toLocalIsoDate(cursor);
    const plan = getDayPlan(getWeekdayIndex(cursor), profile.trainingDaysPerWeek);
    if (plan.isTrainingDay) {
      if (!completedDates.has(dateIso)) {
        // Un descanso elegido ("Hoy descanso") ni suma ni corta la racha; un día olvidado sí la corta.
        if (isRestMarked(profile.restDates, dateIso)) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Lunes (00:00 local) de la semana de calendario que contiene `date`. */
function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - getWeekdayIndex(date));
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Cuantas sesiones ya se han registrado esta semana de calendario (lunes-hoy, no la semana entera —
 * los dias que aun no han llegado no cuentan como "fallados") frente a los dias de entreno que la
 * plantilla semanal marca en total. `done` puede superar `planned` si se entreno un dia de descanso.
 */
export function computeWeekCount(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  today: Date,
): { done: number; planned: number } {
  const mondayIso = toLocalIsoDate(startOfWeek(today));
  const todayIso = toLocalIsoDate(today);
  const done = history.filter((h) => h.date >= mondayIso && h.date <= todayIso).length;
  // Un día de entreno previsto que descansaste a propósito ("Hoy descanso") sale de lo previsto: no es un fallo.
  const doneDates = new Set(history.map((h) => h.date));
  let rested = 0;
  const cursor = startOfWeek(today);
  for (let i = 0; i < 7; i++) {
    const iso = toLocalIsoDate(cursor);
    if (iso <= todayIso && getDayPlan(i, profile.trainingDaysPerWeek).isTrainingDay && isRestMarked(profile.restDates, iso) && !doneDates.has(iso)) rested++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return { done, planned: Math.max(0, profile.trainingDaysPerWeek - rested) };
}
