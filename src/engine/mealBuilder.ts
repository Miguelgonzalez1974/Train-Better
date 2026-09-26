import { getFood, type Food } from '../data/nutrition/foods';
import type { CustomMealItem } from '../data/athlete/types';
import { FIST_CARB_G, PALM_PROTEIN_G } from './nutritionPlan';
import {
  fixedPortion,
  halfSteps,
  macrosOf,
  MEAL_ORDER,
  quantityText,
  swapKey,
  type DayMealPlan,
  type MealKey,
  type PlannedItem,
  type PlannedMeal,
  type SlotKind,
} from './mealPlan';

/**
 * Montar una comida a mano: el atleta elige alimentos del catálogo y la app le dice cuánto de cada uno hace falta
 * para cubrir la proteína y el hidrato de esa toma (los mismos objetivos que la sugerencia automática). Lo elegido
 * sustituye a la sugerencia de esa comida (`applyCustomMeals`); quitarlo devuelve la sugerencia.
 *
 * ORIENTATIVO como el resto del módulo: cuenta proteína e hidratos, no grasa ni calorías, y los avisos no bloquean.
 */

export type BuilderGroup = 'Proteína' | 'Hidrato' | 'Fruta' | 'Verdura' | 'Bebida' | 'Extra' | 'Plato';
export const BUILDER_GROUPS: BuilderGroup[] = ['Proteína', 'Hidrato', 'Fruta', 'Verdura', 'Bebida', 'Extra', 'Plato'];

/** En qué grupo del selector cae un alimento. */
export function builderGroup(food: Food): BuilderGroup {
  const has = (r: Food['roles'][number]) => food.roles.includes(r);
  if (food.dish) return 'Plato';
  if (has('proteinMain') || has('proteinBreakfast') || has('proteinLight') || has('proteinSnack')) return 'Proteína';
  if (has('carbMain') || has('carbBreakfast') || has('carbSnack')) return 'Hidrato';
  if (has('fruit') || has('fruitPre')) return 'Fruta';
  if (has('veg')) return 'Verdura';
  if (has('drink')) return 'Bebida';
  return 'Extra';
}

const KIND_OF_GROUP: Record<BuilderGroup, SlotKind> = {
  Proteína: 'protein',
  Hidrato: 'carb',
  Fruta: 'fruit',
  Verdura: 'veg',
  Bebida: 'drink',
  Extra: 'extra',
  Plato: 'protein',
};

/** Alimentos que se pueden elegir al montar una comida (los que tienen un hueco en el menú y el atleta no excluyó), por grupo. */
export function builderFoods(allFoods: Food[], excluded: Set<string> | string[] = []): Record<BuilderGroup, Food[]> {
  const ex = excluded instanceof Set ? excluded : new Set(excluded);
  const out = Object.fromEntries(BUILDER_GROUPS.map((g) => [g, [] as Food[]])) as Record<BuilderGroup, Food[]>;
  for (const f of allFoods) {
    if (f.roles.length === 0 || ex.has(f.id)) continue;
    out[builderGroup(f)].push(f);
  }
  return out;
}

export interface FoodBounds {
  min: number;
  max: number;
  step: number;
}

/** Mínimo, máximo y salto de cantidad razonables para un alimento (gramos, ml o piezas enteras). */
export function foodBounds(food: Food): FoodBounds {
  if (food.unit) {
    const g = food.unit.grams;
    const [lo, hi] = food.range ?? [g, g * 6];
    return { min: Math.max(g, lo), max: Math.max(g, hi), step: g };
  }
  if (food.range) {
    const [lo, hi] = food.range;
    return { min: lo, max: hi, step: lo >= 150 ? 10 : 5 };
  }
  const serving = food.serving ?? 100;
  const step = serving <= 30 ? 5 : 10;
  return { min: step, max: Math.max(step, Math.round((serving * 4) / step) * step), step };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Redondea una cantidad al salto del alimento y la mantiene dentro de sus límites. */
export function snapGrams(food: Food, grams: number): number {
  const b = foodBounds(food);
  const g = clamp(grams, b.min, b.max);
  return Math.max(b.min, Math.min(b.max, Math.round(g / b.step) * b.step));
}

/** Proteína e hidratos que suman los alimentos (redondeados a gramos enteros). */
export function totalsOf(items: CustomMealItem[]): { protein: number; carbs: number } {
  let p = 0;
  let c = 0;
  for (const i of items) {
    const f = getFood(i.foodId);
    if (!f) continue;
    const m = macrosOf(f, i.grams);
    p += m.p;
    c += m.c;
  }
  return { protein: Math.round(p), carbs: Math.round(c) };
}

/**
 * Cantidad con la que entra un alimento al añadirlo: la que cubre lo que aún falta de su macro principal (proteína
 * para los de proteína, hidrato para los de hidrato), dentro de sus límites; fruta, verdura, bebida y extras entran
 * con su ración normal; un plato hecho, con su ración.
 */
export function autoGrams(food: Food, items: CustomMealItem[], target: { protein: number; carbs: number }): number {
  const group = builderGroup(food);
  if (food.dish) return snapGrams(food, food.serving ?? foodBounds(food).max);
  if (group !== 'Proteína' && group !== 'Hidrato') return fixedPortion(food).grams;
  const t = totalsOf(items);
  const remaining = group === 'Proteína' ? target.protein - t.protein : target.carbs - t.carbs;
  const per = group === 'Proteína' ? food.per100.p : food.per100.c;
  if (per <= 0) return fixedPortion(food).grams;
  const b = foodBounds(food);
  const raw = remaining <= 0 ? b.min : (remaining / per) * 100;
  return snapGrams(food, raw);
}

export type MealState = 'ok' | 'low' | 'over';

export interface MealStatus {
  state: MealState;
  /** Gramos que faltan (positivo) o sobran (negativo) de cada macro respecto al objetivo de la toma. */
  proteinGap: number;
  carbsGap: number;
  text: string;
}

/**
 * Cómo va la toma frente a su objetivo. Los umbrales son holgados a propósito (falta más de un 10 %, sobra más de un
 * 15 %): las cantidades de los alimentos son aproximadas y el aviso orienta, no bloquea.
 */
export function mealStatus(items: CustomMealItem[], target: { protein: number; carbs: number }): MealStatus {
  const t = totalsOf(items);
  const proteinGap = target.protein - t.protein;
  const carbsGap = target.carbs - t.carbs;
  const overP = -proteinGap > Math.max(5, target.protein * 0.15);
  const overC = -carbsGap > Math.max(8, target.carbs * 0.15);
  const lowP = proteinGap > Math.max(4, target.protein * 0.1);
  const lowC = carbsGap > Math.max(6, target.carbs * 0.1);
  if (overP || overC) {
    const parts = [overP ? `${-proteinGap} g de proteína` : '', overC ? `${-carbsGap} g de hidratos` : ''].filter(Boolean);
    return { state: 'over', proteinGap, carbsGap, text: `Te pasas de ${parts.join(' y ')}. Puedes quitar o bajar algo.` };
  }
  if (lowP || lowC) {
    const parts = [lowP ? `${proteinGap} g de proteína` : '', lowC ? `${carbsGap} g de hidratos` : ''].filter(Boolean);
    return { state: 'low', proteinGap, carbsGap, text: `Te faltan ${parts.join(' y ')}.` };
  }
  return { state: 'ok', proteinGap, carbsGap, text: 'Toma cubierta.' };
}

/** Los alimentos de una comida del plan como lista editable. */
export function materialize(meal: PlannedMeal): CustomMealItem[] {
  return meal.items.map((i) => ({ foodId: i.foodId, grams: i.grams }));
}

function buildItem(date: string, meal: MealKey, index: number, ci: CustomMealItem): PlannedItem | null {
  const food = getFood(ci.foodId);
  if (!food) return null;
  const group = builderGroup(food);
  const units = food.unit ? Math.max(1, Math.round(ci.grams / food.unit.grams)) : undefined;
  return {
    kind: group === 'Extra' && food.roles.includes('fat') ? 'fat' : KIND_OF_GROUP[group],
    role: food.roles[0],
    foodId: food.id,
    name: food.name,
    grams: ci.grams,
    units,
    quantity: quantityText(food, ci.grams, units),
    swapKey: swapKey(date, meal, `c${index}` as SlotKind),
    dish: food.dish || undefined,
  };
}

/**
 * Sustituye por lo que el atleta montó a mano las comidas que tengan entrada en `custom`, recalculando lo que aporta
 * cada una y los totales del día. Las demás comidas quedan como la sugerencia automática.
 */
export function applyCustomMeals(plan: DayMealPlan, custom?: Partial<Record<MealKey, CustomMealItem[]>>): DayMealPlan {
  if (!custom || MEAL_ORDER.every((k) => custom[k] === undefined)) return plan;
  const meals = plan.meals.map((meal) => {
    const list = custom[meal.key];
    if (!list) return meal;
    const items = list.map((ci, i) => buildItem(plan.date, meal.key, i, ci)).filter((x): x is PlannedItem => x !== null);
    const t = totalsOf(items.map((i) => ({ foodId: i.foodId, grams: i.grams })));
    return {
      ...meal,
      items,
      custom: true,
      protein: t.protein,
      carbs: t.carbs,
      palms: halfSteps(t.protein / PALM_PROTEIN_G),
      fists: halfSteps(t.carbs / FIST_CARB_G),
    };
  });
  return {
    ...plan,
    meals,
    totals: { protein: meals.reduce((s, m) => s + m.protein, 0), carbs: meals.reduce((s, m) => s + m.carbs, 0) },
  };
}

/**
 * Adapta las cantidades de una comida a otro objetivo (otro tipo de día): solo los hidratos de verdad (arroz, pan,
 * avena, patata...) se reescalan; la proteína es la misma todos los días. Cambios de menos de un 5 % no se tocan.
 */
export function scaleMealItems(items: CustomMealItem[], from: { carbs: number }, to: { carbs: number }): CustomMealItem[] {
  if (from.carbs <= 0 || to.carbs <= 0) return items;
  const k = to.carbs / from.carbs;
  if (Math.abs(k - 1) < 0.05) return items;
  return items.map((i) => {
    const f = getFood(i.foodId);
    if (!f || builderGroup(f) !== 'Hidrato' || !f.range) return i;
    return { foodId: i.foodId, grams: snapGrams(f, i.grams * k) };
  });
}

/**
 * Comidas que se copian de un día a otro: las de `source` (con lo que el atleta haya montado o la sugerencia) adaptadas
 * al objetivo de cada toma del día de destino. `scope` = todo el día o una sola comida.
 */
export function copyMeals(source: DayMealPlan, target: DayMealPlan, scope: 'all' | MealKey): Partial<Record<MealKey, CustomMealItem[]>> {
  const out: Partial<Record<MealKey, CustomMealItem[]>> = {};
  for (const src of source.meals) {
    if (scope !== 'all' && scope !== src.key) continue;
    const dst = target.meals.find((m) => m.key === src.key);
    if (!dst) continue;
    out[src.key] = scaleMealItems(materialize(src), src.target, dst.target);
  }
  return out;
}
