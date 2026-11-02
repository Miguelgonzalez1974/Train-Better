import { describe, expect, it } from 'vitest';
import { FOODS, getFood } from '../data/nutrition/foods';
import { builderFoods, builderGroup, BUILDER_GROUPS, fixedPortion, gramsFromTyped, macrosOf, stepGrams, totalsOf } from './mealBuilder';

const food = (id: string) => getFood(id)!;

describe('grupos del selector', () => {
  it('todos los alimentos con hueco en el catálogo caen en un grupo del selector', () => {
    const groups = builderFoods(FOODS);
    const grouped = BUILDER_GROUPS.flatMap((g) => groups[g]);
    expect(grouped.length).toBe(FOODS.filter((f) => f.roles.length > 0).length);
  });

  it('los ingredientes sueltos de los platos no se pueden elegir y los excluidos tampoco', () => {
    const all = Object.values(builderFoods(FOODS)).flat().map((f) => f.id);
    for (const id of ['cebolla', 'harina', 'mozzarella', 'tomate-triturado']) expect(all).not.toContain(id);
    const without = Object.values(builderFoods(FOODS, ['skyr'])).flat().map((f) => f.id);
    expect(without).not.toContain('skyr');
    expect(builderGroup(food('tortilla-patata'))).toBe('Plato');
    expect(builderGroup(food('huevos'))).toBe('Proteína');
    expect(builderGroup(food('avena'))).toBe('Hidrato');
    expect(builderGroup(food('cafe'))).toBe('Bebida');
  });
});

describe('cantidades libres (tecleadas)', () => {
  it('cualquier cantidad positiva vale: sin el mínimo ni el máximo del catálogo', () => {
    expect(gramsFromTyped(food('avena'), 7)).toBe(7);
    expect(gramsFromTyped(food('avena'), 37)).toBe(37);
    expect(gramsFromTyped(food('arroz'), 1200)).toBe(1200);
    expect(gramsFromTyped(food('avena'), 0.4)).toBe(1);
  });

  it('lo que no es un número positivo no se acepta', () => {
    expect(gramsFromTyped(food('avena'), 0)).toBeNull();
    expect(gramsFromTyped(food('avena'), -5)).toBeNull();
    expect(gramsFromTyped(food('avena'), Number.NaN)).toBeNull();
  });

  it('lo que se cuenta por piezas se teclea en piezas enteras', () => {
    const g = food('huevos').unit!.grams;
    expect(gramsFromTyped(food('huevos'), 1)).toBe(g);
    expect(gramsFromTyped(food('huevos'), 9)).toBe(9 * g);
    expect(gramsFromTyped(food('huevos'), 2.4)).toBe(2 * g);
  });

  it('+/− saltan como el alimento pero bajan hasta 1 g y suben sin tope', () => {
    expect(stepGrams(food('avena'), 37, -1)).toBe(32);
    expect(stepGrams(food('avena'), 37, 1)).toBe(42);
    expect(stepGrams(food('avena'), 3, -1)).toBe(1);
    expect(stepGrams(food('arroz'), 1000, 1)).toBeGreaterThan(1000);
    const g = food('huevos').unit!.grams;
    expect(stepGrams(food('huevos'), g, -1)).toBe(g);
    expect(stepGrams(food('huevos'), 8 * g, 1)).toBe(9 * g);
  });
});

describe('proteína e hidratos de lo apuntado', () => {
  it('macrosOf es proporcional a la cantidad y totalsOf suma y redondea', () => {
    const m = macrosOf(food('avena'), 50);
    expect(m.p).toBeCloseTo((food('avena').per100.p * 50) / 100, 5);
    expect(m.c).toBeCloseTo((food('avena').per100.c * 50) / 100, 5);
    const t = totalsOf([{ foodId: 'avena', grams: 50 }, { foodId: 'inventado', grams: 100 }]);
    expect(t.protein).toBe(Math.round(m.p));
    expect(t.carbs).toBe(Math.round(m.c));
  });

  it('la ración de un toque es una pieza (o las que lleve el catálogo) o la ración del alimento', () => {
    const huevos = food('huevos');
    expect(fixedPortion(huevos).grams).toBe(huevos.unit!.grams * (huevos.servingUnits ?? 1));
    expect(fixedPortion(food('platano'))).toEqual({ grams: 120, units: 1 });
    expect(fixedPortion(food('tomate'))).toEqual({ grams: 150 });
  });
});
