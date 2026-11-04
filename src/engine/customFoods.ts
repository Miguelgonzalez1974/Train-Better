import type { CustomFood, CustomFoodGroup } from '../data/athlete/types';
import { getFood, type Food } from '../data/nutrition/foods';

/**
 * Alimentos propios: el atleta solo da proteína e hidratos por 100 g (y el grupo donde quiere verlo). Este módulo
 * los convierte en un `Food` normal para poder usarlos al apuntar lo que comes, sin que el catálogo estático tenga que
 * saber que existen.
 *
 * Solo se usan al apuntar en el diario (`ExtraFoodPanel`): el catálogo estático (`data/nutrition/foods.ts`) no los lee.
 */

export type FoodResolver = (id: string) => Food | undefined;

/** Rango habitual por defecto (marca el salto de los botones +/−), ya que un alimento propio no trae ración típica ni unidad. */
const GROUP_TO_RANGE: Record<CustomFoodGroup, [number, number]> = {
  Proteína: [50, 300],
  Hidrato: [30, 250],
  Fruta: [80, 250],
  Verdura: [80, 250],
  Bebida: [100, 400],
  Extra: [10, 100],
};

/** Convierte un alimento propio en un `Food` del catálogo, para poder usarlo con `mealBuilder`. */
export function customFoodToCatalogFood(cf: CustomFood): Food {
  return {
    id: cf.id,
    name: cf.name,
    group: cf.group,
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
