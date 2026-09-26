import { describe, expect, it } from 'vitest';
import { FOODS, getFood } from '../data/nutrition/foods';
import type { CustomMealItem } from '../data/athlete/types';
import {
  applyCustomMeals,
  autoGrams,
  builderFoods,
  builderGroup,
  BUILDER_GROUPS,
  copyMeals,
  foodBounds,
  materialize,
  mealStatus,
  scaleMealItems,
  snapGrams,
  totalsOf,
} from './mealBuilder';
import { buildShoppingList, planDayMeals, type MealPlanInput } from './mealPlan';

const base = (over: Partial<MealPlanInput> = {}): MealPlanInput => ({ date: '2026-10-06', dayType: 'normal', weightKg: 80, trainingHour: 16, ...over });
const food = (id: string) => getFood(id)!;

describe('grupos y limites del selector', () => {
  it('todos los alimentos con hueco en el menu caen en un grupo y tienen limites coherentes', () => {
    const groups = builderFoods(FOODS);
    const grouped = BUILDER_GROUPS.flatMap((g) => groups[g]);
    expect(grouped.length).toBe(FOODS.filter((f) => f.roles.length > 0).length);
    for (const f of grouped) {
      const b = foodBounds(f);
      expect(b.min, f.id).toBeGreaterThan(0);
      expect(b.max, f.id).toBeGreaterThanOrEqual(b.min);
      expect(b.step, f.id).toBeGreaterThan(0);
    }
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

  it('snapGrams respeta el salto (piezas enteras, 5 g) y los limites', () => {
    expect(snapGrams(food('huevos'), 137)).toBe(150);
    expect(snapGrams(food('huevos'), 5000)).toBe(250);
    expect(snapGrams(food('avena'), 33)).toBe(35);
    expect(snapGrams(food('avena'), 1)).toBe(30);
    expect(snapGrams(food('wasa'), 500)).toBe(50);
  });
});

describe('autoGrams: la cantidad que cubre lo que falta', () => {
  const target = { protein: 35, carbs: 70 };

  it('una proteina entra con los gramos que cubren la proteina que falta', () => {
    const g = autoGrams(food('skyr'), [], target);
    expect(Math.abs(totalsOf([{ foodId: 'skyr', grams: g }]).protein - 35)).toBeLessThanOrEqual(6);
  });

  it('un hidrato entra con los gramos que cubren el hidrato que falta, teniendo en cuenta lo ya puesto', () => {
    const items: CustomMealItem[] = [{ foodId: 'platano', grams: 120 }];
    const g = autoGrams(food('avena'), items, target);
    const total = totalsOf([...items, { foodId: 'avena', grams: g }]);
    expect(Math.abs(total.carbs - 70)).toBeLessThanOrEqual(6);
  });

  it('si el macro ya esta cubierto, el alimento entra con su cantidad minima, no con cero ni con una barbaridad', () => {
    const items: CustomMealItem[] = [{ foodId: 'avena', grams: 120 }];
    expect(autoGrams(food('arroz'), items, { protein: 35, carbs: 40 })).toBe(foodBounds(food('arroz')).min);
  });

  it('fruta, verdura, bebida y extras entran con su racion normal; un plato, con su racion', () => {
    expect(autoGrams(food('platano'), [], target)).toBe(120);
    expect(autoGrams(food('cafe-leche'), [], target)).toBe(200);
    expect(autoGrams(food('aceite'), [], target)).toBe(10);
    expect(autoGrams(food('tortilla-patata'), [], target)).toBe(200);
  });

  it('las cantidades nunca se salen de los limites del alimento aunque el objetivo sea enorme o minusculo', () => {
    for (const f of FOODS.filter((x) => x.roles.length > 0)) {
      const b = foodBounds(f);
      for (const t of [{ protein: 1, carbs: 1 }, { protein: 300, carbs: 900 }]) {
        const g = autoGrams(f, [], t);
        expect(g, f.id).toBeGreaterThanOrEqual(Math.min(b.min, f.serving ?? b.min, f.unit?.grams ?? b.min));
        expect(g, f.id).toBeLessThanOrEqual(Math.max(b.max, f.serving ?? 0, (f.unit?.grams ?? 0) * (f.servingUnits ?? 1)));
      }
    }
  });
});

describe('mealStatus', () => {
  const target = { protein: 40, carbs: 80 };
  it('cubierta dentro del margen', () => {
    expect(mealStatus([{ foodId: 'pollo', grams: 150 }, { foodId: 'arroz', grams: 90 }], target).state).toBe('ok');
  });
  it('falta cuando se queda corta y dice que macro', () => {
    const s = mealStatus([{ foodId: 'pollo', grams: 60 }], target);
    expect(s.state).toBe('low');
    expect(s.text).toMatch(/hidratos/);
    expect(s.carbsGap).toBeGreaterThan(0);
  });
  it('te pasas cuando sobra mas de un 15 %', () => {
    const s = mealStatus([{ foodId: 'arroz', grams: 180 }, { foodId: 'pollo', grams: 200 }], target);
    expect(s.state).toBe('over');
  });
  it('una toma vacia falta de las dos cosas', () => {
    const s = mealStatus([], target);
    expect(s.state).toBe('low');
    expect(s.text).toMatch(/proteína y .*hidratos/);
  });
});

describe('applyCustomMeals', () => {
  it('sin nada montado devuelve el mismo plan', () => {
    const plan = planDayMeals(base());
    expect(applyCustomMeals(plan, undefined)).toBe(plan);
    expect(applyCustomMeals(plan, {})).toBe(plan);
  });

  it('sustituye solo la comida montada, marca custom y recalcula lo que aporta y los totales del dia', () => {
    const plan = planDayMeals(base());
    const items: CustomMealItem[] = [
      { foodId: 'huevos', grams: 150 },
      { foodId: 'avena', grams: 60 },
    ];
    const applied = applyCustomMeals(plan, { desayuno: items });
    const des = applied.meals.find((m) => m.key === 'desayuno')!;
    expect(des.custom).toBe(true);
    expect(des.items.map((i) => i.foodId)).toEqual(['huevos', 'avena']);
    expect(des.items[0].quantity).toBe('3 huevos');
    expect(des.protein).toBe(totalsOf(items).protein);
    expect(des.carbs).toBe(totalsOf(items).carbs);
    // El resto de comidas no cambia.
    for (const key of ['mediaManana', 'comida', 'merienda', 'cena'] as const) {
      expect(applied.meals.find((m) => m.key === key)).toEqual(plan.meals.find((m) => m.key === key));
    }
    expect(applied.totals.protein).toBe(applied.meals.reduce((s, m) => s + m.protein, 0));
  });

  it('ignora alimentos que ya no existen y admite una comida vaciada a proposito', () => {
    const plan = planDayMeals(base());
    const applied = applyCustomMeals(plan, { cena: [{ foodId: 'inventado', grams: 100 }], merienda: [] });
    expect(applied.meals.find((m) => m.key === 'cena')!.items).toEqual([]);
    const mer = applied.meals.find((m) => m.key === 'merienda')!;
    expect(mer.items).toEqual([]);
    expect(mer.protein).toBe(0);
  });

  it('materializar y volver a aplicar da la misma comida (ida y vuelta)', () => {
    const plan = planDayMeals(base());
    const meal = plan.meals.find((m) => m.key === 'comida')!;
    const back = applyCustomMeals(plan, { comida: materialize(meal) }).meals.find((m) => m.key === 'comida')!;
    expect(back.items.map((i) => [i.foodId, i.grams])).toEqual(meal.items.map((i) => [i.foodId, i.grams]));
    expect(Math.abs(back.protein - meal.protein)).toBeLessThanOrEqual(1);
  });

  it('la lista de la compra usa lo montado a mano', () => {
    const plan = planDayMeals(base());
    const applied = applyCustomMeals(plan, { desayuno: [{ foodId: 'langostinos', grams: 200 }] });
    const ids = buildShoppingList([applied]).flatMap((g) => g.lines).map((l) => l.foodId);
    expect(ids).toContain('langostinos');
  });
});

describe('copiar dias', () => {
  it('copia todo el dia adaptando los hidratos al objetivo del dia de destino', () => {
    const high = planDayMeals(base({ date: '2026-10-06', dayType: 'alto' }));
    const rest = planDayMeals(base({ date: '2026-10-07', dayType: 'descanso' }));
    const copied = copyMeals(high, rest, 'all');
    expect(Object.keys(copied).sort()).toEqual(['cena', 'comida', 'desayuno', 'mediaManana', 'merienda']);
    const applied = applyCustomMeals(rest, copied);
    // Los hidratos bajan mucho respecto al dia fuerte y quedan cerca del objetivo del dia de descanso.
    expect(applied.totals.carbs).toBeLessThan(high.totals.carbs);
    expect(Math.abs(applied.totals.carbs - rest.totals.carbs)).toBeLessThan(rest.totals.carbs * 0.25);
  });

  it('copia solo la comida elegida', () => {
    const a = planDayMeals(base({ date: '2026-10-06' }));
    const b = planDayMeals(base({ date: '2026-10-07' }));
    const custom = applyCustomMeals(a, { desayuno: [{ foodId: 'skyr', grams: 200 }, { foodId: 'avena', grams: 60 }] });
    const copied = copyMeals(custom, b, 'desayuno');
    expect(Object.keys(copied)).toEqual(['desayuno']);
    expect(copied.desayuno!.map((i) => i.foodId)).toEqual(['skyr', 'avena']);
  });

  it('scaleMealItems solo toca los hidratos y solo si el cambio pasa del 5 %', () => {
    const items: CustomMealItem[] = [{ foodId: 'pollo', grams: 150 }, { foodId: 'arroz', grams: 100 }];
    expect(scaleMealItems(items, { carbs: 100 }, { carbs: 102 })).toEqual(items);
    const scaled = scaleMealItems(items, { carbs: 100 }, { carbs: 60 });
    expect(scaled[0]).toEqual(items[0]);
    expect(scaled[1].grams).toBeLessThan(100);
    expect(scaled[1].grams % 5).toBe(0);
  });
});
