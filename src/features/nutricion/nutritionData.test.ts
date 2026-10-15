import { describe, it, expect } from 'vitest';
import { isMenuEaten, menuEntryId, withExtra, withExtraItemGrams, withMenuEaten, withoutMenuEaten } from './nutritionData';
import type { NutritionPrefs } from '../../data/athlete/types';

const ISO = '2026-10-15';

describe('menús que se comen: apuntes del diario', () => {
  it('comer una comida del menú la apunta una sola vez, aunque se repita', () => {
    let prefs: NutritionPrefs = {};
    expect(isMenuEaten(prefs, ISO, 'desayuno')).toBe(false);
    prefs = withMenuEaten(prefs, ISO, 'desayuno', 9, [{ foodId: 'huevos', grams: 110 }]);
    prefs = withMenuEaten(prefs, ISO, 'desayuno', 9, [{ foodId: 'huevos', grams: 165 }]);
    expect(isMenuEaten(prefs, ISO, 'desayuno')).toBe(true);
    expect(prefs.extraFoods?.[ISO]).toHaveLength(1);
    expect(prefs.extraFoods?.[ISO]?.[0]).toMatchObject({ id: menuEntryId('desayuno'), items: [{ foodId: 'huevos', grams: 165 }] });
  });

  it('quitarla la saca del diario y no toca los demás apuntes', () => {
    let prefs: NutritionPrefs = withExtra({}, ISO, { id: 'extra1', hour: 17, items: [{ foodId: 'tortitas', grams: 30 }] });
    prefs = withMenuEaten(prefs, ISO, 'comida', 14, [{ foodId: 'pollo-tiras', grams: 150 }]);
    prefs = withoutMenuEaten(prefs, ISO, 'comida');
    expect(isMenuEaten(prefs, ISO, 'comida')).toBe(false);
    expect(prefs.extraFoods?.[ISO]?.map((e) => e.id)).toEqual(['extra1']);
  });

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
});
