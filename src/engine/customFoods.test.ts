import { describe, expect, it } from 'vitest';
import type { CustomFood, CustomMealItem } from '../data/athlete/types';
import { getFood } from '../data/nutrition/foods';
import { FOODS } from '../data/nutrition/foods';
import { builderFoods, builderGroup, macrosOf, totalsOf } from './mealBuilder';
import { customFoodToCatalogFood, makeFoodResolver } from './customFoods';

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

  it('sin resolver (catalogo puro) un alimento propio no suma nada', () => {
    expect(totalsOf([{ foodId: 'custom2', grams: 100 }])).toEqual({ protein: 0, carbs: 0 });
    expect(totalsOf([{ foodId: 'custom2', grams: 100 }], makeFoodResolver([batido]))).toEqual({ protein: 30, carbs: 10 });
  });
});

describe('un alimento propio se puede elegir al apuntar', () => {
  it('builderFoods incluye los alimentos propios en su grupo, junto al catalogo', () => {
    const groups = builderFoods([...FOODS, customFoodToCatalogFood(batido), customFoodToCatalogFood(barrita)]);
    expect(groups['Proteína'].some((f) => f.id === 'custom2')).toBe(true);
    expect(groups['Extra'].some((f) => f.id === 'custom1')).toBe(true);
    // El catalogo sigue ahi tambien.
    expect(groups['Proteína'].some((f) => f.id === 'pollo')).toBe(true);
  });
});
