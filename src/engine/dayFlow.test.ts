import { describe, expect, it } from 'vitest';
import { computeDayFlow, parseHour } from './dayFlow';
import { planDayMeals, type MealPlanInput } from './mealPlan';

const base = (over: Partial<MealPlanInput> = {}): MealPlanInput => ({ date: '2026-10-06', dayType: 'normal', weightKg: 80, trainingHour: 16, ...over });

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
    const flow = computeDayFlow(plan, [0, 1], { trainingHour: 16, nowHour: 12 });
    expect(flow.planned.protein).toBe(plan.totals.protein);
    expect(flow.planned.carbs).toBe(plan.totals.carbs);
    expect(flow.done.protein).toBe(plan.meals[0].protein + plan.meals[1].protein);
    // Con el entreno a las 16:00 caen antes el desayuno, la media manana, la comida y la merienda (15:00).
    expect(flow.meals.map((m) => m.beforeTraining)).toEqual([true, true, true, true, false]);
    expect(flow.before!.planned.carbs + flow.after!.planned.carbs).toBe(flow.planned.carbs);
    expect(flow.after!.remaining.carbs).toBe(plan.meals[4].carbs);
  });

  it('antes del entreno: al dia si lo que ya tocaba esta hecho, atrasado si no', () => {
    // A las 12:00 tocan el desayuno (08:00) y la media manana (11:00; con cortesia de media hora).
    expect(computeDayFlow(plan, [0, 1], { trainingHour: 16, nowHour: 12 }).status).toBe('al-dia');
    const behind = computeDayFlow(plan, [], { trainingHour: 16, nowHour: 12 });
    expect(behind.status).toBe('atrasado');
    expect(behind.missed.carbs).toBe(plan.meals[0].carbs + plan.meals[1].carbs);
  });

  it('a primera hora no esta atrasado por comidas que aun no tocan', () => {
    expect(computeDayFlow(plan, [], { trainingHour: 16, nowHour: 7 }).status).toBe('al-dia');
    // Media hora de cortesia: a las 08:15 el desayuno de las 08:00 todavia no cuenta como atrasado.
    expect(computeDayFlow(plan, [], { trainingHour: 16, nowHour: 8.25 }).missed.carbs).toBe(0);
  });

  it('desde la hora del entreno (o si ya entreno) el estado pasa a despues', () => {
    expect(computeDayFlow(plan, [], { trainingHour: 16, nowHour: 16 }).status).toBe('despues');
    expect(computeDayFlow(plan, [], { trainingHour: 16, nowHour: 10, trained: true }).status).toBe('despues');
  });

  it('sin hora actual (otro dia) solo hay totales; sin entreno es descanso', () => {
    expect(computeDayFlow(plan, [], { trainingHour: 16, nowHour: null }).status).toBe('sin-hora');
    const rest = computeDayFlow(planDayMeals(base({ dayType: 'descanso' })), [0], { trainingHour: null, nowHour: 12 });
    expect(rest.status).toBe('descanso');
    expect(rest.before).toBeNull();
    expect(rest.after).toBeNull();
    expect(rest.meals.every((m) => m.beforeTraining === null)).toBe(true);
  });

  it('el sabado por la manana (10:00) el desayuno y la media manana son previos y la comida es de despues', () => {
    const sat = planDayMeals(base({ trainingHour: 10 }));
    const flow = computeDayFlow(sat, [], { trainingHour: 10, nowHour: null });
    expect(flow.meals.map((m) => m.beforeTraining)).toEqual([true, true, false, false, false]);
  });
});
