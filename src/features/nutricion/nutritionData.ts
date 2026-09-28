import type { AthleteProfile, CustomFood, CustomMealItem, ExtraFoodEntry, NutritionPrefs, SessionHistoryEntry } from '../../data/athlete/types';
import { makeFoodResolver } from '../../engine/customFoods';
import { generateSessionForDate } from '../../engine/generateSession';
import { applyCustomMeals, totalsOf } from '../../engine/mealBuilder';
import type { ExtraInput } from '../../engine/dayFlow';
import { defaultTrainingHour, planDayMeals, type DayMealPlan, type MealKey } from '../../engine/mealPlan';
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

/** El menú automático de un día, SIN aplicar lo que el atleta haya montado a mano — para comparar contra ello. */
export function autoPlanFor(prefs: NutritionPrefs | undefined, iso: string, dayType: NutritionDayType, weightKg: number, trainingHour?: number): DayMealPlan {
  return planDayMeals({
    date: iso,
    dayType,
    weightKg,
    trainingHour: trainingHour ?? trainingHourFor(prefs, iso),
    prefs: { excludedFoodIds: prefs?.excludedFoodIds, swaps: prefs?.swaps },
  });
}

/** Menú de un día: la sugerencia automática con las comidas que el atleta montó a mano ya aplicadas. */
export function planFor(prefs: NutritionPrefs | undefined, iso: string, dayType: NutritionDayType, weightKg: number, trainingHour?: number): DayMealPlan {
  const plan = autoPlanFor(prefs, iso, dayType, weightKg, trainingHour);
  return applyCustomMeals(plan, prefs?.customMeals?.[iso], makeFoodResolver(prefs?.customFoods));
}

/** Los extras de un día (ver [[ExtraFoodEntry]]), ya con sus macros calculadas — listos para `computeDayFlow`. */
export function extraInputsFor(prefs: NutritionPrefs | undefined, iso: string): ExtraInput[] {
  const entries = prefs?.extraFoods?.[iso] ?? [];
  if (entries.length === 0) return [];
  const resolve = makeFoodResolver(prefs?.customFoods);
  return entries.map((e) => {
    const t = totalsOf(e.items, resolve);
    const label = e.items.map((it) => resolve(it.foodId)?.name).filter((n): n is string => Boolean(n)).join(' + ') || 'Alimento';
    return { id: e.id, label, hour: e.hour, protein: t.protein, carbs: t.carbs };
  });
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

type CustomMap = NonNullable<NutritionPrefs['customMeals']>;

/** Preferencias con la comida `meal` de `iso` montada a mano (lista completa de alimentos). */
export function withCustomMeal(prefs: NutritionPrefs, iso: string, meal: MealKey, items: CustomMealItem[]): NutritionPrefs {
  const all: CustomMap = { ...(prefs.customMeals ?? {}) };
  all[iso] = { ...(all[iso] ?? {}), [meal]: items };
  return { ...prefs, customMeals: all };
}

/**
 * Preferencias sin lo montado a mano de una comida (`meal`) o del día entero (sin `meal`): vuelve la sugerencia
 * automática. La fecha se queda con un objeto vacío en vez de borrarse, para que la fusión entre dispositivos no
 * "reviva" lo que el otro dispositivo aún tuviera guardado.
 */
export function withoutCustomMeal(prefs: NutritionPrefs, iso: string, meal?: MealKey): NutritionPrefs {
  const all: CustomMap = { ...(prefs.customMeals ?? {}) };
  if (meal) {
    const day = { ...(all[iso] ?? {}) };
    delete day[meal];
    all[iso] = day;
  } else {
    all[iso] = {};
  }
  return { ...prefs, customMeals: all };
}

export function customMealCount(prefs: NutritionPrefs, iso: string): number {
  return Object.keys(prefs.customMeals?.[iso] ?? {}).length;
}

/** "hoy", "mañana" o "lun 28 sep". */
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Hoy';
  if (iso === addDays(todayIso, 1)) return 'Mañana';
  if (iso === addDays(todayIso, -1)) return 'Ayer';
  const d = parseIso(iso);
  return `${WEEKDAY_LONG[getWeekdayIndex(d)]} ${d.getDate()}`;
}
