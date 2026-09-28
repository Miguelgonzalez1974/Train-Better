import { describe, expect, it } from 'vitest';
import type { CustomFood, CustomMealItem } from '../data/athlete/types';
import { getFood } from '../data/nutrition/foods';
import { FOODS } from '../data/nutrition/foods';
import { applyCustomMeals, builderFoods, builderGroup, mealStatus, totalsOf } from './mealBuilder';
import { customFoodToCatalogFood, isCustomFoodId, makeFoodResolver } from './customFoods';
import { buildShoppingList, macrosOf, planDayMeals, type MealPlanInput } from './mealPlan';

const base = (over: Partial<MealPlanInput> = {}): MealPlanInput => ({ date: '2026-10-06', dayType: 'normal', weightKg: 80, trainingHour: 16, ...over });

const barrita: CustomFood = { id: 'custom1', name: 'Barrita del gimnasio', proteinPer100: 15, carbsPer100: 55, group: 'Extra' };
const batido: CustomFood = { id: 'custom2', name: 'Batido casero', proteinPer100: 30, carbsPer100: 10, group: 'Proteína' };

describe('customFoodToCatalogFood', () => {
  it('convierte el alimento propio en un Food usable, con el grupo que se le dio', () => {
    const f = customFoodToCatalogFood(barrita);
    expect(f.id).toBe('custom1');
    expect(f.per100).toEqual({ p: 15, c: 55, f: 0 });
    expect(builderGroup(f)).toBe('Extra');
  });

  it('el mismo grupo elegido siempre resuelve al mismo builderGroup, para las 6 opciones', () => {
    const groups: CustomFood['group'][] = ['Proteína', 'Hidrato', 'Fruta', 'Verdura', 'Bebida', 'Extra'];
    for (const group of groups) {
      const f = customFoodToCatalogFood({ id: 'x', name: 'x', proteinPer100: 1, carbsPer100: 1, group });
      expect(builderGroup(f)).toBe(group);
    }
  });
});

describe('makeFoodResolver', () => {
  it('sin alimentos propios, resuelve exactamente igual que el catalogo (getFood)', () => {
    const resolve = makeFoodResolver(undefined);
    expect(resolve).toBe(getFood);
    expect(resolve('pollo')).toBe(getFood('pollo'));
  });

  it('resuelve primero los alimentos propios y despues el catalogo, sin pisar ids reales', () => {
    const resolve = makeFoodResolver([barrita, batido]);
    expect(resolve('custom1')?.name).toBe('Barrita del gimnasio');
    expect(resolve('pollo')?.name).toBe(getFood('pollo')?.name);
    expect(resolve('no-existe')).toBeUndefined();
  });
});

describe('isCustomFoodId', () => {
  it('distingue un id del catalogo de uno propio', () => {
    expect(isCustomFoodId('pollo')).toBe(false);
    expect(isCustomFoodId('custom1')).toBe(true);
  });
});

describe('un alimento propio se recalcula proporcionalmente segun la cantidad', () => {
  it('a 50 g cuenta la mitad de lo indicado por 100 g (lo que preguntaba el usuario)', () => {
    const m = macrosOf(customFoodToCatalogFood(barrita), 50);
    expect(m.p).toBeCloseTo(7.5, 5);
    expect(m.c).toBeCloseTo(27.5, 5);
  });

  it('totalsOf con el resolver suma correctamente varias cantidades de un alimento propio', () => {
    const resolve = makeFoodResolver([barrita]);
    const items: CustomMealItem[] = [{ foodId: 'custom1', grams: 50 }, { foodId: 'custom1', grams: 200 }];
    const t = totalsOf(items, resolve);
    // 50 g: 7.5/27.5 · 200 g: 30/110 -> total 37.5/137.5, redondeado
    expect(t.protein).toBe(38);
    expect(t.carbs).toBe(138);
  });
});

describe('un alimento propio se puede montar en una comida', () => {
  const plan = planDayMeals(base());
  const resolve = makeFoodResolver([barrita, batido]);

  it('applyCustomMeals lo resuelve con la cantidad correcta y lo marca como custom', () => {
    const items: CustomMealItem[] = [{ foodId: 'custom2', grams: 100 }];
    const applied = applyCustomMeals(plan, { desayuno: items }, resolve);
    const des = applied.meals.find((m) => m.key === 'desayuno')!;
    expect(des.custom).toBe(true);
    expect(des.items[0].name).toBe('Batido casero');
    expect(des.protein).toBe(30);
    expect(des.carbs).toBe(10);
  });

  it('mealStatus con el resolver ve el alimento propio, y sin resolver (catalogo puro) lo ignora', () => {
    const items: CustomMealItem[] = [{ foodId: 'custom2', grams: 100 }];
    const withResolver = mealStatus(items, { protein: 30, carbs: 10 }, resolve);
    expect(withResolver.state).toBe('ok');
    const withoutResolver = mealStatus(items, { protein: 30, carbs: 10 });
    expect(withoutResolver.state).toBe('low');
  });

  it('builderFoods incluye los alimentos propios en su grupo, junto al catalogo', () => {
    const groups = builderFoods([...FOODS, customFoodToCatalogFood(batido), customFoodToCatalogFood(barrita)]);
    expect(groups['Proteína'].some((f) => f.id === 'custom2')).toBe(true);
    expect(groups['Extra'].some((f) => f.id === 'custom1')).toBe(true);
    // El catalogo sigue ahi tambien.
    expect(groups['Proteína'].some((f) => f.id === 'pollo')).toBe(true);
  });
});

describe('lista de la compra con alimentos propios', () => {
  it('un alimento propio usado en el dia aparece en su categoria, sin romper el orden del catalogo', () => {
    const plan = planDayMeals(base());
    const resolve = makeFoodResolver([batido]);
    const applied = applyCustomMeals(plan, { desayuno: [{ foodId: 'custom2', grams: 150 }] }, resolve);
    const groups = buildShoppingList([applied], resolve);
    const proteinas = groups.find((g) => g.category === 'proteinas');
    expect(proteinas?.lines.some((l) => l.foodId === 'custom2' && l.name === 'Batido casero')).toBe(true);
  });

  it('sin pasar resolver (por defecto), un alimento propio simplemente no aparece — no rompe nada', () => {
    const plan = planDayMeals(base());
    const resolve = makeFoodResolver([batido]);
    const applied = applyCustomMeals(plan, { desayuno: [{ foodId: 'custom2', grams: 150 }] }, resolve);
    const groups = buildShoppingList([applied]);
    const ids = groups.flatMap((g) => g.lines).map((l) => l.foodId);
    expect(ids).not.toContain('custom2');
  });
});
