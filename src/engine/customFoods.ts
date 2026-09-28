import type { CustomFood, CustomFoodGroup } from '../data/athlete/types';
import { getFood, type Food, type FoodRole, type ShoppingCategory } from '../data/nutrition/foods';

/**
 * Alimentos propios: el atleta solo da proteína e hidratos por 100 g (y el grupo donde quiere verlo). Este módulo
 * los convierte en un `Food` normal para poder usarlos con el resto del motor — montar comidas, extras del día y
 * lista de la compra — sin que el catálogo estático tenga que saber que existen.
 *
 * Deliberadamente NO entran en el menú automático (`generateSession`/`mealPlan`, que solo lee `data/nutrition/foods.ts`):
 * son para montar a mano o añadir como extra, nunca para que el motor los elija solo.
 */

export type FoodResolver = (id: string) => Food | undefined;

const GROUP_TO_CATEGORY: Record<CustomFoodGroup, ShoppingCategory> = {
  Proteína: 'proteinas',
  Hidrato: 'hidratos',
  Fruta: 'fruta',
  Verdura: 'verdura',
  Bebida: 'despensa',
  Extra: 'despensa',
};

/** Rango de gramos razonable por defecto, ya que un alimento propio no trae ración típica ni unidad. */
const GROUP_TO_RANGE: Record<CustomFoodGroup, [number, number]> = {
  Proteína: [50, 300],
  Hidrato: [30, 250],
  Fruta: [80, 250],
  Verdura: [80, 250],
  Bebida: [100, 400],
  Extra: [10, 100],
};

const GROUP_TO_ROLE: Record<CustomFoodGroup, FoodRole> = {
  Proteína: 'proteinMain',
  Hidrato: 'carbMain',
  Fruta: 'fruit',
  Verdura: 'veg',
  Bebida: 'drink',
  Extra: 'extra',
};

/** Convierte un alimento propio en un `Food` del catálogo, para poder usarlo con `mealBuilder`/`mealPlan`. */
export function customFoodToCatalogFood(cf: CustomFood): Food {
  return {
    id: cf.id,
    name: cf.name,
    roles: [GROUP_TO_ROLE[cf.group]],
    category: GROUP_TO_CATEGORY[cf.group],
    per100: { p: cf.proteinPer100, c: cf.carbsPer100, f: 0 },
    range: GROUP_TO_RANGE[cf.group],
  };
}

/** Resuelve un id de alimento: primero entre los alimentos propios del atleta, si no en el catálogo. */
export function makeFoodResolver(customFoods: CustomFood[] | undefined): FoodResolver {
  if (!customFoods || customFoods.length === 0) return getFood;
  const map = new Map(customFoods.map((cf) => [cf.id, customFoodToCatalogFood(cf)]));
  return (id: string) => map.get(id) ?? getFood(id);
}

/** true si el id no está en el catálogo estático (es propio del atleta o ya no existe). */
export function isCustomFoodId(id: string): boolean {
  return getFood(id) === undefined;
}
