import { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from './periodization';

/**
 * Racha de dias de entreno PROGRAMADOS cumplidos sin fallar ninguno, contando hacia atras desde
 * hoy. Los dias de descanso (segun la plantilla semanal de `trainingDaysPerWeek`) se saltan — ni
 * suman ni cortan la racha; un dia programado sin registro SI la corta. Pensada para llamarse solo
 * cuando hoy ya esta completado (si no, "hoy" cuenta como fallo y la racha sale a 0 aunque el atleta
 * lleve semanas sin fallar un dia).
 */
export function computeAdherenceStreak(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): number {
  const completedDates = new Set(history.map((h) => h.date));
  let streak = 0;
  const cursor = new Date(`${todayIso}T00:00:00`);
  // Tope de 400 dias de calendario (~13 meses) por seguridad — mismo horizonte que
  // `TRAINING_DATES_LOG_LIMIT` en localRepository.ts, nunca deberia hacer falta llegar tan lejos.
  for (let i = 0; i < 400; i++) {
    const dateIso = toLocalIsoDate(cursor);
    const plan = getDayPlan(getWeekdayIndex(cursor), profile.trainingDaysPerWeek);
    if (plan.isTrainingDay) {
      if (!completedDates.has(dateIso)) break;
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
  return { done, planned: profile.trainingDaysPerWeek };
}
