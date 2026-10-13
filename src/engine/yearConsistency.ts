import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from './periodization';

/**
 * Constancia del año: de los días de entreno que te tocaban desde que empezaste a usar la app este año (o desde el 1 de
 * enero), a cuántos fuiste. Es el número de fondo del anillo de "Constancia": se mueve poco de un día a otro, como un hábito.
 * Un día entrenado que no tocaba suma a "días", pero el porcentaje se queda en un máximo de 100.
 */

export interface YearConsistency {
  /** 0-100: días entrenados frente a días de entreno previstos. Null si todavía no ha pasado ningún día previsto. */
  pct: number | null;
  /** Días en los que entrenaste este año (desde `since`). */
  days: number;
  /** Días de entreno previstos desde `since` hasta hoy (hoy solo cuenta si ya entrenaste). */
  planned: number;
  /** Desde cuándo se cuenta (yyyy-mm-dd). */
  since: string;
}

export function computeYearConsistency(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date): YearConsistency {
  const todayIso = toLocalIsoDate(today);
  const jan1 = `${today.getFullYear()}-01-01`;
  const onboarded = profile.onboardedAt ? profile.onboardedAt.slice(0, 10) : jan1;
  const since = onboarded > jan1 ? onboarded : jan1;

  const trained = new Set<string>([...history.map((h) => h.date), ...(profile.trainingDatesLog ?? [])]);

  let planned = 0;
  let days = 0;
  const cursor = new Date(`${since}T00:00:00`);
  const end = new Date(`${todayIso}T00:00:00`);
  while (cursor <= end) {
    const iso = toLocalIsoDate(cursor);
    const scheduled = getDayPlan(getWeekdayIndex(cursor), profile.trainingDaysPerWeek).isTrainingDay;
    const did = trained.has(iso);
    if (did) days++;
    // Hoy solo cuenta como previsto si ya entrenaste: un día sin acabar no es un fallo.
    if (scheduled && (iso < todayIso || did)) planned++;
    cursor.setDate(cursor.getDate() + 1);
  }

  const pct = planned > 0 ? Math.min(100, Math.round((days / planned) * 100)) : null;
  return { pct, days, planned, since };
}
