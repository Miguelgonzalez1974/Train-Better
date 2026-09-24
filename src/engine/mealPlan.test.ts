import { describe, expect, it } from 'vitest';
import { FOODS, getFood } from '../data/nutrition/foods';
import { buildShoppingList, mealTimings, planDayMeals, previewSwap, swapKey, type MealPlanInput } from './mealPlan';
import type { NutritionDayType } from './nutritionPlan';

const base = (over: Partial<MealPlanInput> = {}): MealPlanInput => ({ date: '2026-09-28', dayType: 'normal', weightKg: 80, trainingHour: 16, ...over });

const DAY_TYPES: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];

describe('planDayMeals', () => {
  it('cada dia tiene 5 comidas y los totales caen cerca del objetivo de proteina e hidrato', () => {
    for (const dayType of DAY_TYPES) {
      for (const weightKg of [65, 80, 95]) {
        for (const trainingHour of [10, 16, 17]) {
          const plan = planDayMeals(base({ dayType, weightKg, trainingHour }));
          expect(plan.meals).toHaveLength(5);
          const pMid = (plan.target.proteinG.min + plan.target.proteinG.max) / 2;
          const cMid = (plan.target.carbsG.min + plan.target.carbsG.max) / 2;
          // Tolerancia amplia: las raciones se redondean a algo pesable y los alimentos tienen limites razonables.
          expect(Math.abs(plan.totals.protein - pMid) / pMid).toBeLessThan(0.25);
          expect(Math.abs(plan.totals.carbs - cMid) / cMid).toBeLessThan(0.25);
        }
      }
    }
  });

  it('es determinista: misma entrada, mismo menu', () => {
    expect(planDayMeals(base())).toEqual(planDayMeals(base()));
  });

  it('comida y cena no repiten la proteina ni el hidrato', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-09-${String(d).padStart(2, '0')}`;
      const plan = planDayMeals(base({ date }));
      const comida = plan.meals.find((m) => m.key === 'comida')!;
      const cena = plan.meals.find((m) => m.key === 'cena')!;
      for (const kind of ['protein', 'carb'] as const) {
        const a = comida.items.find((i) => i.kind === kind);
        const b = cena.items.find((i) => i.kind === kind);
        // Con un plato hecho la toma puede no llevar hidrato aparte.
        if (a && b) expect(a.foodId).not.toBe(b.foodId);
      }
    }
  });

  it('respeta los alimentos excluidos y sigue dando un menu completo', () => {
    const excluded = FOODS.filter((f) => f.tags?.includes('pescado') || f.tags?.includes('lacteo') || f.category === 'verdura').map((f) => f.id);
    // Sin ninguna verdura la toma simplemente no lleva verdura: no debe romperse.
    for (let d = 1; d <= 14; d++) {
      const plan = planDayMeals(base({ date: `2026-10-${String(d).padStart(2, '0')}`, prefs: { excludedFoodIds: excluded } }));
      for (const meal of plan.meals) for (const item of meal.items) expect(excluded).not.toContain(item.foodId);
      expect(plan.meals.every((m) => m.items.length > 0)).toBe(true);
    }
  });

  it('un cambio manual sustituye el alimento y recalcula la cantidad', () => {
    const plan = planDayMeals(base());
    const cena = plan.meals.find((m) => m.key === 'cena')!;
    const carb = cena.items.find((i) => i.kind === 'carb')!;
    const other = ['arroz', 'pasta', 'patata', 'boniato'].find((id) => id !== carb.foodId)!;
    const swapped = planDayMeals(base({ prefs: { swaps: { [swapKey('2026-09-28', 'cena', 'carb')]: other } } }));
    const item = swapped.meals.find((m) => m.key === 'cena')!.items.find((i) => i.kind === 'carb')!;
    expect(item.foodId).toBe(other);
    expect(item.grams).not.toBe(carb.grams);
    expect(previewSwap(base(), 'cena', 'carb', other)?.grams).toBe(item.grams);
  });

  it('ignora un cambio que no cabe en el hueco (fruta en el hueco de proteina) o que esta excluido', () => {
    const plan = planDayMeals(base({ prefs: { swaps: { [swapKey('2026-09-28', 'cena', 'protein')]: 'platano' } } }));
    expect(plan.meals.find((m) => m.key === 'cena')!.items.find((i) => i.kind === 'protein')!.foodId).not.toBe('platano');
    const excludedSwap = planDayMeals(base({ prefs: { excludedFoodIds: ['pasta'], swaps: { [swapKey('2026-09-28', 'cena', 'carb')]: 'pasta' } } }));
    expect(excludedSwap.meals.find((m) => m.key === 'cena')!.items.find((i) => i.kind === 'carb')!.foodId).not.toBe('pasta');
  });

  it('las cantidades son pesables: multiplos de 5 g o piezas enteras', () => {
    for (let d = 1; d <= 14; d++) {
      const plan = planDayMeals(base({ date: `2026-09-${String(d).padStart(2, '0')}` }));
      for (const meal of plan.meals) {
        for (const item of meal.items) {
          const food = getFood(item.foodId)!;
          if (food.unit) expect(Number.isInteger(item.units)).toBe(true);
          else expect(item.grams % 5).toBe(0);
        }
      }
    }
  });

  it('el hidrato sube con la carga del dia y la proteina se mantiene', () => {
    const light = planDayMeals(base({ dayType: 'ligero' }));
    const high = planDayMeals(base({ dayType: 'alto' }));
    expect(high.totals.carbs).toBeGreaterThan(light.totals.carbs);
    expect(Math.abs(high.totals.protein - light.totals.protein)).toBeLessThan(25);
  });
});

describe('mealTimings', () => {
  it('por la tarde la merienda cae una hora antes del entreno y la cena es post-entreno', () => {
    expect(mealTimings('normal', 16).merienda.time).toBe('15:00');
    expect(mealTimings('normal', 17).merienda.time).toBe('16:00');
    expect(mealTimings('normal', 16).cena.tag).toBe('post-entreno');
  });

  it('el sabado a las 10:00 el desayuno y la media manana son previos y la comida es post-entreno', () => {
    const t = mealTimings('normal', 10);
    expect(t.desayuno.time).toBe('07:30');
    expect(t.mediaManana.time).toBe('09:00');
    expect(t.comida.tag).toBe('post-entreno');
  });

  it('en descanso no hay etiquetas de entreno', () => {
    for (const m of Object.values(mealTimings('descanso', 16))) expect(m.tag).toBe('');
  });
});

describe('buildShoppingList', () => {
  it('suma lo de varios dias y agrupa por seccion, sin lineas vacias', () => {
    const plans = Array.from({ length: 7 }, (_, i) => planDayMeals(base({ date: `2026-09-${String(28 - i).padStart(2, '0')}` })));
    const groups = buildShoppingList(plans);
    expect(groups.length).toBeGreaterThan(3);
    for (const g of groups) expect(g.lines.length).toBeGreaterThan(0);
    const items = plans.flatMap((p) => p.meals.flatMap((m) => m.items));
    // Aceite suelto + el de las recetas de los platos (la tortilla lleva aceite).
    const expected = items.reduce((s, i) => {
      if (i.foodId === 'aceite') return s + i.grams;
      const oil = getFood(i.foodId)?.recipe?.find((r) => r.foodId === 'aceite');
      return s + (oil ? (i.grams * oil.per100) / 100 : 0);
    }, 0);
    const aceite = groups.flatMap((g) => g.lines).find((l) => l.foodId === 'aceite');
    expect(aceite?.grams).toBeCloseTo(expected, 5);
  });

  it('un plato hecho se desglosa en ingredientes en la lista de la compra', () => {
    const day = Array.from({ length: 60 }, (_, i) => planDayMeals(base({ date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}` }))).find((p) =>
      p.meals.some((m) => m.items.some((i) => i.dish)),
    );
    expect(day).toBeDefined();
    const groups = buildShoppingList([day!]);
    const names = groups.flatMap((g) => g.lines).map((l) => l.foodId);
    expect(names).not.toContain('tortilla-patata');
    expect(names).not.toContain('pizza-casera');
  });
});

describe('alimentos nuevos', () => {
  const week = (start: number, over: Partial<MealPlanInput> = {}) =>
    Array.from({ length: 28 }, (_, i) => planDayMeals(base({ date: `2026-10-${String(((start + i) % 28) + 1).padStart(2, '0')}`, ...over })));

  it('los platos hechos (tortilla, pizza) salen de vez en cuando, no a diario, y la toma sigue cuadrando', () => {
    const plans = week(0);
    const dishDays = plans.filter((p) => p.meals.some((m) => m.items.some((i) => i.dish)));
    expect(dishDays.length).toBeGreaterThan(0);
    expect(dishDays.length).toBeLessThan(10);
    for (const p of dishDays) {
      const pMid = (p.target.proteinG.min + p.target.proteinG.max) / 2;
      expect(Math.abs(p.totals.protein - pMid) / pMid).toBeLessThan(0.3);
      // Nunca dos platos el mismo dia.
      expect(p.meals.flatMap((m) => m.items).filter((i) => i.dish)).toHaveLength(1);
    }
  });

  it('un plato elegido a mano ocupa el hueco de proteina y se puede quitar', () => {
    const swapped = planDayMeals(base({ prefs: { swaps: { [swapKey('2026-09-28', 'cena', 'protein')]: 'tortilla-patata' } } }));
    const cena = swapped.meals.find((m) => m.key === 'cena')!;
    expect(cena.items[0]).toMatchObject({ foodId: 'tortilla-patata', dish: true, grams: 200 });
    // Sin aceite suelto: el plato ya lo lleva.
    expect(cena.items.some((i) => i.kind === 'fat')).toBe(false);
    const back = planDayMeals(base({ prefs: { swaps: { [swapKey('2026-09-28', 'cena', 'protein')]: 'pollo' } } }));
    expect(back.meals.find((m) => m.key === 'cena')!.items.some((i) => i.dish)).toBe(false);
  });

  it('excluir el plato (o el huevo por etiqueta) lo saca de los menus', () => {
    const excluded = FOODS.filter((f) => f.tags?.includes('huevo') || f.tags?.includes('gluten')).map((f) => f.id);
    for (const p of week(0, { prefs: { excludedFoodIds: excluded } })) {
      for (const i of p.meals.flatMap((m) => m.items)) expect(['tortilla-patata', 'pizza-casera', 'huevos']).not.toContain(i.foodId);
    }
  });

  it('frutos secos o chocolate van en la media manana, salvo si es la toma previa al entreno', () => {
    const normal = planDayMeals(base({ trainingHour: 16 })).meals.find((m) => m.key === 'mediaManana')!;
    expect(normal.items.some((i) => i.kind === 'extra')).toBe(true);
    const pre = planDayMeals(base({ trainingHour: 10 })).meals.find((m) => m.key === 'mediaManana')!;
    expect(pre.items.some((i) => i.kind === 'extra')).toBe(false);
  });

  it('el desayuno lleva bebida (cafe, leche desnatada o cafe con leche) y la leche cuenta en ml', () => {
    const drinks = new Set(week(0).map((p) => p.meals[0].items.find((i) => i.kind === 'drink')?.foodId));
    expect([...drinks].sort()).toEqual(['cafe', 'cafe-leche', 'leche']);
    const milk = planDayMeals(base({ prefs: { swaps: { [swapKey('2026-09-28', 'desayuno', 'drink')]: 'leche' } } })).meals[0].items.find((i) => i.kind === 'drink')!;
    expect(milk.quantity).toBe('250 ml');
  });

  it('queso cottage, pan Wasa y pina estan disponibles como alternativas', () => {
    const plan = planDayMeals(base({ prefs: { swaps: { [swapKey('2026-09-28', 'desayuno', 'protein')]: 'cottage', [swapKey('2026-09-28', 'desayuno', 'carb')]: 'wasa', [swapKey('2026-09-28', 'desayuno', 'fruit')]: 'pina' } } }));
    const ids = plan.meals[0].items.map((i) => i.foodId);
    expect(ids).toEqual(expect.arrayContaining(['cottage', 'wasa', 'pina']));
    expect(plan.meals[0].items.find((i) => i.foodId === 'wasa')!.quantity).toMatch(/tostadas/);
  });
});


