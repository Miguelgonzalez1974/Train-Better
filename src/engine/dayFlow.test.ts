import { describe, expect, it } from 'vitest';
import { computeDayFlow, parseHour, type ExtraInput } from './dayFlow';
import { planDayMeals, type MealPlanInput } from './mealPlan';

const base = (over: Partial<MealPlanInput> = {}): MealPlanInput => ({ date: '2026-10-06', dayType: 'normal', weightKg: 80, trainingHour: 16, ...over });
const EMPTY: ExtraInput[] = [];

describe('parseHour', () => {
  it('convierte horas del menu a horas decimales', () => {
    expect(parseHour('08:00')).toBe(8);
    expect(parseHour('13:30')).toBe(13.5);
    expect(parseHour('21:45')).toBe(21.75);
  });
});

describe('computeDayFlow', () => {
  const plan = planDayMeals(base());

  it('suma lo previsto y lo hecho, y reparte antes y despues del entreno', () => {
    const flow = computeDayFlow(plan, [0, 1], EMPTY, { trainingHour: 16, nowHour: 12 });
    expect(flow.planned.protein).toBe(plan.totals.protein);
    expect(flow.planned.carbs).toBe(plan.totals.carbs);
    expect(flow.done.protein).toBe(plan.meals[0].protein + plan.meals[1].protein);
    // Con el entreno a las 16:00 caen antes el desayuno, la media manana, la comida y la merienda (15:00).
    expect(flow.meals.map((m) => m.beforeTraining)).toEqual([true, true, true, true, false]);
    expect(flow.before!.planned.carbs + flow.after!.planned.carbs).toBe(flow.planned.carbs);
    expect(flow.after!.remaining.carbs).toBe(plan.meals[4].carbs);
    expect(flow.extras).toEqual([]);
  });

  it('antes del entreno: al dia si lo que ya tocaba esta hecho, atrasado si no', () => {
    // A las 12:00 tocan el desayuno (08:00) y la media manana (11:00; con cortesia de media hora).
    expect(computeDayFlow(plan, [0, 1], EMPTY, { trainingHour: 16, nowHour: 12 }).status).toBe('al-dia');
    const behind = computeDayFlow(plan, [], EMPTY, { trainingHour: 16, nowHour: 12 });
    expect(behind.status).toBe('atrasado');
    expect(behind.missed.carbs).toBe(plan.meals[0].carbs + plan.meals[1].carbs);
  });

  it('a primera hora no esta atrasado por comidas que aun no tocan', () => {
    expect(computeDayFlow(plan, [], EMPTY, { trainingHour: 16, nowHour: 7 }).status).toBe('al-dia');
    // Media hora de cortesia: a las 08:15 el desayuno de las 08:00 todavia no cuenta como atrasado.
    expect(computeDayFlow(plan, [], EMPTY, { trainingHour: 16, nowHour: 8.25 }).missed.carbs).toBe(0);
  });

  it('desde la hora del entreno (o si ya entreno) el estado pasa a despues', () => {
    expect(computeDayFlow(plan, [], EMPTY, { trainingHour: 16, nowHour: 16 }).status).toBe('despues');
    expect(computeDayFlow(plan, [], EMPTY, { trainingHour: 16, nowHour: 10, trained: true }).status).toBe('despues');
  });

  it('sin hora actual (otro dia) solo hay totales; sin entreno es descanso', () => {
    expect(computeDayFlow(plan, [], EMPTY, { trainingHour: 16, nowHour: null }).status).toBe('sin-hora');
    const rest = computeDayFlow(planDayMeals(base({ dayType: 'descanso' })), [0], EMPTY, { trainingHour: null, nowHour: 12 });
    expect(rest.status).toBe('descanso');
    expect(rest.before).toBeNull();
    expect(rest.after).toBeNull();
    expect(rest.meals.every((m) => m.beforeTraining === null)).toBe(true);
  });

  it('el sabado por la manana (10:00) el desayuno y la media manana son previos y la comida es de despues', () => {
    const sat = planDayMeals(base({ trainingHour: 10 }));
    const flow = computeDayFlow(sat, [], EMPTY, { trainingHour: 10, nowHour: null });
    expect(flow.meals.map((m) => m.beforeTraining)).toEqual([true, true, false, false, false]);
  });
});

describe('computeDayFlow con extras', () => {
  const plan = planDayMeals(base());
  const extra = (hour: number, protein: number, carbs: number, id = 'e1'): ExtraInput => ({ id, label: 'Plátano', hour, protein, carbs });

  it('un extra siempre cuenta como hecho, y su hora decide si es antes o despues del entreno', () => {
    const flow = computeDayFlow(plan, [], [extra(10, 20, 30)], { trainingHour: 16, nowHour: 12 });
    expect(flow.extras).toEqual([{ id: 'e1', label: 'Plátano', hour: 10, protein: 20, carbs: 30, beforeTraining: true }]);
    expect(flow.done).toEqual({ protein: 20, carbs: 30 });
    expect(flow.before!.done).toEqual({ protein: 20, carbs: 30 });
  });

  it('un extra de despues del entreno reduce lo que falta por recuperar, sin bajar de cero', () => {
    const small = computeDayFlow(plan, [], [extra(20, 5, 5)], { trainingHour: 16, nowHour: 12 });
    expect(small.after!.remaining.protein).toBe(plan.meals[4].protein - 5);
    expect(small.after!.remaining.carbs).toBe(plan.meals[4].carbs - 5);
    const huge = computeDayFlow(plan, [], [extra(20, 9999, 9999)], { trainingHour: 16, nowHour: 12 });
    expect(huge.after!.remaining).toEqual({ protein: 0, carbs: 0 });
  });

  it('varios extras se suman todos a lo hecho del dia', () => {
    const flow = computeDayFlow(plan, [0], [extra(10, 20, 30, 'e1'), extra(19, 15, 10, 'e2')], { trainingHour: 16, nowHour: 12 });
    expect(flow.done.protein).toBe(plan.meals[0].protein + 20 + 15);
    expect(flow.done.carbs).toBe(plan.meals[0].carbs + 30 + 10);
    expect(flow.extras.map((e) => e.beforeTraining)).toEqual([true, false]);
  });

  it('los extras no afectan a lo previsto del dia ni a las comidas atrasadas', () => {
    const flow = computeDayFlow(plan, [], [extra(9, 500, 500)], { trainingHour: 16, nowHour: 12 });
    expect(flow.planned).toEqual({ protein: plan.totals.protein, carbs: plan.totals.carbs });
    expect(flow.missed.carbs).toBe(plan.meals[0].carbs + plan.meals[1].carbs);
  });

  it('en un dia de descanso, un extra no tiene antes/despues (null)', () => {
    const rest = computeDayFlow(planDayMeals(base({ dayType: 'descanso' })), [], [extra(12, 10, 10)], { trainingHour: null, nowHour: 12 });
    expect(rest.extras[0].beforeTraining).toBeNull();
    expect(rest.done).toEqual({ protein: 10, carbs: 10 });
  });
});
