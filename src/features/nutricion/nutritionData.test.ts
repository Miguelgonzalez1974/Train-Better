import { describe, it, expect } from 'vitest';
import { dayTarget, eatenFor, withExtra, withExtraItemGrams } from './nutritionData';
import { nutritionForDay } from '../../engine/nutritionPlan';
import type { NutritionPrefs } from '../../data/athlete/types';

const ISO = '2026-10-15';

describe('diario: apuntes del día', () => {
  it('cambia la cantidad de un alimento de un apunte sin tocar el resto', () => {
    let prefs: NutritionPrefs = withExtra({}, ISO, {
      id: 'extra1',
      hour: 9,
      items: [
        { foodId: 'huevos', grams: 110 },
        { foodId: 'tortitas', grams: 30 },
      ],
    });
    prefs = withExtraItemGrams(prefs, ISO, 'extra1', 1, 60);
    expect(prefs.extraFoods?.[ISO]?.[0].items).toEqual([
      { foodId: 'huevos', grams: 110 },
      { foodId: 'tortitas', grams: 60 },
    ]);
  });

  it('suma la proteína y los hidratos de todos los apuntes del día, también los de alimentos propios', () => {
    expect(eatenFor(undefined, ISO)).toEqual({ count: 0, protein: 0, carbs: 0 });
    const prefs: NutritionPrefs = {
      customFoods: [{ id: 'custom1', name: 'Batido', proteinPer100: 30, carbsPer100: 10, group: 'Proteína' }],
      extraFoods: {
        [ISO]: [
          { id: 'a', hour: 9, items: [{ foodId: 'custom1', grams: 100 }] },
          { id: 'b', hour: 13, items: [{ foodId: 'custom1', grams: 200 }] },
        ],
      },
    };
    expect(eatenFor(prefs, ISO)).toEqual({ count: 2, protein: 90, carbs: 30 });
    expect(eatenFor(prefs, '2026-10-16').count).toBe(0);
  });
});

describe('objetivo del día', () => {
  it('es el punto medio del rango de proteína y de hidratos del tipo de día', () => {
    const n = nutritionForDay('normal', 82);
    expect(dayTarget('normal', 82)).toEqual({
      protein: Math.round((n.proteinG.min + n.proteinG.max) / 2),
      carbs: Math.round((n.carbsG.min + n.carbsG.max) / 2),
    });
    expect(dayTarget('alto', 82).carbs).toBeGreaterThan(dayTarget('descanso', 82).carbs);
  });
});
