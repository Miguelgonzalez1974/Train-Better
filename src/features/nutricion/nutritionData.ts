import type { AthleteProfile, NutritionPrefs, SessionHistoryEntry } from '../../data/athlete/types';
import { generateSessionForDate } from '../../engine/generateSession';
import { defaultTrainingHour, planDayMeals, type DayMealPlan } from '../../engine/mealPlan';
import { classifyNutritionDay, type NutritionDayType } from '../../engine/nutritionPlan';
import { getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import { resolveWeekLocks } from '../../engine/weekLocks';

export const WEEKDAY_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const WEEKDAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

export function mondayOf(iso: string): string {
  return addDays(iso, -getWeekdayIndex(parseIso(iso)));
}

export function weekIsos(anyIsoInWeek: string): string[] {
  const monday = mondayOf(anyIsoInWeek);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface WeekDay {
  iso: string;
  weekdayIndex: number;
  type: NutritionDayType;
  /** El día tiene una sesión de doble WOD (afecta a la cena y al agua, no al menú). */
  doubleWod: boolean;
}

/**
 * Tipo de día nutricional de cada día de la semana que contiene `anyIsoInWeek`, con el mismo criterio que el
 * semáforo de hoy (`classifyNutritionDay`): la sesión ya guardada si existe y, si no, la que el motor generaría
 * (con el bloqueo semanal resuelto, sin persistirlo). Las semanas futuras son una previsión.
 */
export function computeWeekDays(profile: AthleteProfile, history: SessionHistoryEntry[], anyIsoInWeek: string): WeekDay[] {
  const locked = resolveWeekLocks(profile, history, profile.goals, anyIsoInWeek);
  return weekIsos(anyIsoInWeek).map((iso) => {
    const date = parseIso(iso);
    const session = profile.sessionCache?.[iso] ?? generateSessionForDate(locked, history.filter((h) => h.date < iso), date, profile.goals);
    return { iso, weekdayIndex: getWeekdayIndex(date), type: classifyNutritionDay(session), doubleWod: Boolean(session.doubleWod) };
  });
}

export function trainingHourFor(prefs: NutritionPrefs | undefined, iso: string): number {
  const idx = getWeekdayIndex(parseIso(iso));
  return prefs?.trainingHours?.[String(idx)] ?? defaultTrainingHour(idx);
}

export function planFor(prefs: NutritionPrefs | undefined, iso: string, dayType: NutritionDayType, weightKg: number, trainingHour?: number): DayMealPlan {
  return planDayMeals({
    date: iso,
    dayType,
    weightKg,
    trainingHour: trainingHour ?? trainingHourFor(prefs, iso),
    prefs: { excludedFoodIds: prefs?.excludedFoodIds, swaps: prefs?.swaps },
  });
}

/** "hoy", "mañana" o "lun 28 sep". */
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Hoy';
  if (iso === addDays(todayIso, 1)) return 'Mañana';
  if (iso === addDays(todayIso, -1)) return 'Ayer';
  const d = parseIso(iso);
  return `${WEEKDAY_LONG[getWeekdayIndex(d)]} ${d.getDate()}`;
}
