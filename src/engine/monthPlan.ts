import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from './periodization';

/**
 * Cumplimiento del plan del mes: de los días de entreno que te tocaban este mes (desde el día 1, o desde que empezaste a usar la
 * app si fue después), a cuántos fuiste. Es la versión de un mes de la constancia del año (ver `yearConsistency.ts`), con la
 * diferencia de que aquí un día entrenado que no tocaba no cuenta: lo que se mide es si hiciste lo que tocaba.
 */

export interface MonthPlan {
  /** Días de entreno previstos en los que entrenaste. */
  done: number;
  /** Días de entreno previstos hasta hoy (hoy solo cuenta si ya entrenaste, un día sin acabar no es un fallo). */
  planned: number;
  /** 0-100, o null si todavía no ha pasado ningún día previsto. */
  pct: number | null;
}

export function computeMonthPlan(profile: AthleteProfile, history: SessionHistoryEntry[], today: Date): MonthPlan {
  const todayIso = toLocalIsoDate(today);
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const onboarded = profile.onboardedAt ? profile.onboardedAt.slice(0, 10) : monthStart;
  const since = onboarded > monthStart ? onboarded : monthStart;

  const trained = new Set<string>([...history.map((h) => h.date), ...(profile.trainingDatesLog ?? [])]);

  let planned = 0;
  let done = 0;
  const cursor = new Date(`${since}T00:00:00`);
  const end = new Date(`${todayIso}T00:00:00`);
  while (cursor <= end) {
    const iso = toLocalIsoDate(cursor);
    if (getDayPlan(getWeekdayIndex(cursor), profile.trainingDaysPerWeek).isTrainingDay) {
      const did = trained.has(iso);
      if (iso < todayIso || did) planned++;
      if (did) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { done, planned, pct: planned > 0 ? Math.round((done / planned) * 100) : null };
}
