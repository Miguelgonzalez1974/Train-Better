import type { AthleteProfile, CustomFood, ExtraFoodEntry, NutritionPrefs, SessionHistoryEntry } from '../../data/athlete/types';
import { makeFoodResolver } from '../../engine/customFoods';
import { generateSessionForDate } from '../../engine/generateSession';
import { totalsOf } from '../../engine/mealBuilder';
import { classifyNutritionDay, nutritionForDay, type NutritionDayType } from '../../engine/nutritionPlan';
import { getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import { resolveWeekLocks } from '../../engine/weekLocks';

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

/** Lo que toca de proteína y de hidratos en un día: el punto medio del rango de cada uno (`nutritionForDay`), en gramos. */
export function dayTarget(dayType: NutritionDayType, weightKg: number): { protein: number; carbs: number } {
  const n = nutritionForDay(dayType, weightKg);
  return { protein: Math.round((n.proteinG.min + n.proteinG.max) / 2), carbs: Math.round((n.carbsG.min + n.carbsG.max) / 2) };
}

/** Lo apuntado en el diario de un día: cuántos apuntes hay y la proteína y los hidratos que suman. */
export function eatenFor(prefs: NutritionPrefs | undefined, iso: string): { count: number; protein: number; carbs: number } {
  const entries = prefs?.extraFoods?.[iso] ?? [];
  const resolve = makeFoodResolver(prefs?.customFoods);
  let protein = 0;
  let carbs = 0;
  for (const e of entries) {
    const t = totalsOf(e.items, resolve);
    protein += t.protein;
    carbs += t.carbs;
  }
  return { count: entries.length, protein, carbs };
}

/** Añade un extra al día. */
export function withExtra(prefs: NutritionPrefs, iso: string, entry: ExtraFoodEntry): NutritionPrefs {
  const all = { ...(prefs.extraFoods ?? {}) };
  all[iso] = [...(all[iso] ?? []), entry];
  return { ...prefs, extraFoods: all };
}

/** Quita un extra del día por id. */
export function withoutExtra(prefs: NutritionPrefs, iso: string, entryId: string): NutritionPrefs {
  const all = { ...(prefs.extraFoods ?? {}) };
  all[iso] = (all[iso] ?? []).filter((e) => e.id !== entryId);
  return { ...prefs, extraFoods: all };
}

/** Cambia la cantidad de un alimento de un apunte del diario. */
export function withExtraItemGrams(prefs: NutritionPrefs, iso: string, entryId: string, itemIndex: number, grams: number): NutritionPrefs {
  const all = { ...(prefs.extraFoods ?? {}) };
  all[iso] = (all[iso] ?? []).map((e) => (e.id === entryId ? { ...e, items: e.items.map((it, i) => (i === itemIndex ? { ...it, grams } : it)) } : e));
  return { ...prefs, extraFoods: all };
}

/** Preferencias con un alimento propio nuevo dado de alta. */
export function withCustomFood(prefs: NutritionPrefs, food: CustomFood): NutritionPrefs {
  return { ...prefs, customFoods: [...(prefs.customFoods ?? []), food] };
}

/** Preferencias sin un alimento propio (por id) — también lo quita de cualquier extra que lo usara, para no dejar referencias colgando. */
export function withoutCustomFood(prefs: NutritionPrefs, foodId: string): NutritionPrefs {
  const extraFoods = prefs.extraFoods
    ? Object.fromEntries(
        Object.entries(prefs.extraFoods).map(([iso, entries]) => [
          iso,
          entries.map((e) => ({ ...e, items: e.items.filter((it) => it.foodId !== foodId) })).filter((e) => e.items.length > 0),
        ]),
      )
    : prefs.extraFoods;
  return { ...prefs, customFoods: (prefs.customFoods ?? []).filter((f) => f.id !== foodId), extraFoods };
}

/** "hoy", "mañana" o "lun 28 sep". */
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Hoy';
  if (iso === addDays(todayIso, 1)) return 'Mañana';
  if (iso === addDays(todayIso, -1)) return 'Ayer';
  const d = parseIso(iso);
  return `${WEEKDAY_LONG[getWeekdayIndex(d)]} ${d.getDate()}`;
}
