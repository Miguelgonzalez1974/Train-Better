import type { WorkSetEntry } from '../data/athlete/types';
import { getWeekdayIndex, toLocalIsoDate } from './periodization';

export interface WeekVolumePoint {
  /** Lunes ISO de esa semana. */
  weekStart: string;
  /** Tonelaje (Σ kg × reps) de ese movimiento esa semana. */
  tonnageKg: number;
}

/** Lunes (ISO local) de la semana a la que pertenece `dateIso` — mismo criterio de semana que `getWeekdayIndex` (lunes = 0). */
function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() - getWeekdayIndex(d));
  return toLocalIsoDate(d);
}

/**
 * Tonelaje semanal (Σ kg × reps) de un movimiento CONCRETO (id exacto, mismo criterio que
 * `movementProgress.ts` — sin mezclar variantes) a partir de `workLog`. Series sin reps limpias
 * (reps = 0) no aportan tonelaje fiable y se descartan. Devuelve `weeks` puntos consecutivos
 * terminando en la semana de `referenceDate`, con 0 en las semanas sin sesiones — así una tendencia
 * se lee como caída real, no como hueco en los datos.
 */
export function buildWeeklyVolumeSeries(
  workLog: WorkSetEntry[],
  movementId: string,
  weeks = 8,
  referenceDate: Date = new Date(),
): WeekVolumePoint[] {
  const byWeek = new Map<string, number>();
  for (const entry of workLog) {
    if (entry.movementId !== movementId || !(entry.kg > 0) || !(entry.reps > 0)) continue;
    const week = mondayOf(entry.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + entry.kg * entry.reps);
  }

  const currentMonday = mondayOf(toLocalIsoDate(referenceDate));
  const points: WeekVolumePoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(`${currentMonday}T00:00:00`);
    d.setDate(d.getDate() - i * 7);
    const week = toLocalIsoDate(d);
    points.push({ weekStart: week, tonnageKg: Math.round(byWeek.get(week) ?? 0) });
  }
  return points;
}

export interface VolumeTrend {
  thisWeekKg: number;
  lastWeekKg: number;
  /** % de cambio semana actual vs. anterior, o null si la semana anterior no tuvo tonelaje que comparar. */
  deltaPct: number | null;
}

/** Resumen "esta semana vs. la anterior" de una serie de `buildWeeklyVolumeSeries` (ya en orden ascendente). */
export function summariseVolumeTrend(series: WeekVolumePoint[]): VolumeTrend {
  const thisWeekKg = series[series.length - 1]?.tonnageKg ?? 0;
  const lastWeekKg = series[series.length - 2]?.tonnageKg ?? 0;
  const deltaPct = lastWeekKg > 0 ? Math.round(((thisWeekKg - lastWeekKg) / lastWeekKg) * 100) : null;
  return { thisWeekKg, lastWeekKg, deltaPct };
}
