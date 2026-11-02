import { getFood, type Food } from '../data/nutrition/foods';
import type { CustomMealItem } from '../data/athlete/types';
import type { FoodResolver } from './customFoods';

/**
 * Apuntar lo que comes: el atleta elige alimentos del catálogo (o suyos) y la app suma la proteína y los hidratos
 * de cada cantidad. Los alimentos se agrupan para el selector (`builderGroup`) y las cantidades se mueven de un
 * salto razonable para cada alimento (`stepGrams`) sin tope por arriba (`gramsFromTyped`).
 *
 * ORIENTATIVO como el resto del módulo: cuenta proteína e hidratos, no grasa ni calorías.
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

/** Alimentos que se pueden elegir al apuntar (los que tienen un hueco asignado en el catálogo), por grupo. */
export function builderFoods(allFoods: Food[], excluded: Set<string> | string[] = []): Record<BuilderGroup, Food[]> {
  const ex = excluded instanceof Set ? excluded : new Set(excluded);
  const out = Object.fromEntries(BUILDER_GROUPS.map((g) => [g, [] as Food[]])) as Record<BuilderGroup, Food[]>;
  for (const f of allFoods) {
    if (f.roles.length === 0 || ex.has(f.id)) continue;
    out[builderGroup(f)].push(f);
  }
  return out;
}

/** Salto de cantidad razonable para un alimento (gramos, ml o piezas enteras). */
function foodStep(food: Food): number {
  if (food.unit) return food.unit.grams;
  if (food.range) return food.range[0] >= 150 ? 10 : 5;
  return (food.serving ?? 100) <= 30 ? 5 : 10;
}

/** Cantidad mínima que se puede apuntar a mano (gramos, ml o una pieza): sin tope por arriba. */
export const MIN_TYPED_GRAMS = 1;

/** Cantidad tras un toque de +/−: salta como el alimento (una pieza, 5 o 10 g), sin tope por arriba. */
export function stepGrams(food: Food, grams: number, dir: 1 | -1): number {
  const min = food.unit ? food.unit.grams : MIN_TYPED_GRAMS;
  return Math.max(min, Math.round(grams + dir * foodStep(food)));
}

/**
 * Cantidad tecleada por el atleta → gramos (o ml) guardados. Los alimentos que se cuentan por piezas (huevos, tortitas)
 * se teclean en piezas enteras; el resto, en gramos o ml enteros. Cualquier número positivo vale; null si no lo es.
 */
export function gramsFromTyped(food: Food, typed: number): number | null {
  if (!Number.isFinite(typed) || typed <= 0) return null;
  if (food.unit) return Math.max(1, Math.round(typed)) * food.unit.grams;
  return Math.max(MIN_TYPED_GRAMS, Math.round(typed));
}

/** Proteína e hidratos de una cantidad de un alimento (sin redondear). */
export function macrosOf(food: Food, grams: number): { p: number; c: number } {
  return { p: (food.per100.p * grams) / 100, c: (food.per100.c * grams) / 100 };
}

/** Ración con la que entra un alimento al apuntarlo de un toque: una pieza o la ración del catálogo. */
export function fixedPortion(food: Food): { grams: number; units?: number } {
  if (food.unit) {
    const units = food.servingUnits ?? 1;
    return { grams: food.unit.grams * units, units };
  }
  return { grams: food.serving ?? 100 };
}

/** Proteína e hidratos que suman los alimentos (redondeados a gramos enteros). `resolve` incluye los alimentos propios del atleta si los hay. */
export function totalsOf(items: CustomMealItem[], resolve: FoodResolver = getFood): { protein: number; carbs: number } {
  let p = 0;
  let c = 0;
  for (const i of items) {
    const f = resolve(i.foodId);
    if (!f) continue;
    const m = macrosOf(f, i.grams);
    p += m.p;
    c += m.c;
  }
  return { protein: Math.round(p), carbs: Math.round(c) };
}
