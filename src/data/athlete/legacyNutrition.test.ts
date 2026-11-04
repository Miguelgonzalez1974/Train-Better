import { describe, expect, it } from 'vitest';
import type { NutritionPrefs } from './types';
import { stripLegacyNutritionPrefs } from './legacyNutrition';

describe('stripLegacyNutritionPrefs', () => {
  it('quita los campos de los menús y conserva el diario y los alimentos propios', () => {
    const prefs = {
      excludedFoodIds: ['salmon'],
      swaps: { 'x|cena|carb': 'arroz' },
      doneMeals: { '2026-10-06': [0] },
      trainingHours: { '0': 17 },
      staples: ['aceite'],
      customMeals: { '2026-10-06': { cena: [{ foodId: 'pollo', grams: 150 }] } },
      customFoods: [{ id: 'c1', name: 'Barrita', proteinPer100: 15, carbsPer100: 55, group: 'Extra' as const }],
      extraFoods: { '2026-10-06': [{ id: 'e1', hour: 10, items: [{ foodId: 'platano', grams: 120 }] }] },
    } as NutritionPrefs;
    const clean = stripLegacyNutritionPrefs(prefs)!;
    expect(Object.keys(clean).sort()).toEqual(['customFoods', 'extraFoods']);
    expect(clean.extraFoods).toEqual(prefs.extraFoods);
    expect(clean.customFoods).toEqual(prefs.customFoods);
  });

  it('si no hay nada que limpiar devuelve el mismo objeto, y sin preferencias no hace nada', () => {
    const prefs: NutritionPrefs = { extraFoods: {} };
    expect(stripLegacyNutritionPrefs(prefs)).toBe(prefs);
    expect(stripLegacyNutritionPrefs(undefined)).toBeUndefined();
  });
});