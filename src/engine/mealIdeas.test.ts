import { describe, expect, it } from 'vitest';
import { FOODS } from '../data/nutrition/foods';
import { describeIdea, mealIdeas } from './mealIdeas';

describe('qué ceno: ideas para cerrar lo que falta', () => {
  it('con proteína e hidratos pendientes propone tres ideas distintas, cada una con las dos cosas', () => {
    const ideas = mealIdeas({ protein: 48, carbs: 90 }, FOODS);
    expect(ideas).toHaveLength(3);
    expect(new Set(ideas.map((i) => i.items.map((x) => x.foodId).join('+'))).size).toBe(3);
    for (const idea of ideas) {
      expect(idea.items.length).toBe(2);
      expect(idea.protein).toBeGreaterThanOrEqual(30);
      expect(idea.protein).toBeLessThanOrEqual(60);
      expect(idea.carbs).toBeGreaterThanOrEqual(50);
    }
  });

  it('empieza por lo que más apuntas', () => {
    const ideas = mealIdeas({ protein: 40, carbs: 80 }, FOODS, ['salmon', 'cuscus']);
    expect(ideas[0].items.map((i) => i.foodId)).toEqual(['salmon', 'cuscus']);
  });

  it('las piezas se cuentan en piezas (huevos, latas) y las cantidades se redondean a algo servible', () => {
    const ideas = mealIdeas({ protein: 30, carbs: 0 }, FOODS, ['huevos']);
    const eggs = ideas[0].items[0];
    expect(eggs.units?.count).toBeGreaterThanOrEqual(1);
    expect(eggs.grams % (eggs.grams / (eggs.units?.count ?? 1))).toBe(0);
    const rice = mealIdeas({ protein: 0, carbs: 90 }, FOODS, ['arroz'])[0].items[0];
    expect(rice.grams % 10).toBe(0);
  });

  it('si solo falta una parte, solo propone esa; si no falta nada, no propone nada', () => {
    const onlyProtein = mealIdeas({ protein: 30, carbs: 5 }, FOODS);
    expect(onlyProtein.every((i) => i.items.length === 1)).toBe(true);
    expect(mealIdeas({ protein: 3, carbs: 5 }, FOODS)).toEqual([]);
  });

  it('lo describe en una frase con las cantidades y lo que aporta', () => {
    const text = describeIdea(mealIdeas({ protein: 45, carbs: 90 }, FOODS, ['pollo', 'arroz'])[0]);
    expect(text).toMatch(/g de pechuga de pollo y \d+ g de arroz \(≈ \d+ g de proteína y \d+ g de hidratos\)/);
  });
});
