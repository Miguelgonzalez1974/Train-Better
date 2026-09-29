import { MEAL_ORDER, type DayMealPlan, type MealKey } from './mealPlan';

/**
 * "Línea del día": cuánta proteína y cuánto hidrato lleva el atleta a lo largo del día frente a lo previsto, con las
 * comidas en su hora y el entreno como punto de corte (antes / después). Lo previsto sale de las comidas del plan (con
 * lo que el atleta haya montado a mano); lo hecho, de las comidas que marcó, más los extras del día (comida fuera de
 * las 5 comidas — siempre cuentan como ya tomados). Es una lectura pura, sin efectos.
 *
 * ORIENTATIVO como el resto del módulo: las horas son las del menú y los avisos orientan, no acusan.
 */

export type FlowStatus =
  /** Día sin entreno: solo se muestran totales. */
  | 'descanso'
  /** No se conoce la hora actual (otro día distinto de hoy): solo se muestra lo previsto y lo hecho. */
  | 'sin-hora'
  /** Antes del entreno y al día con lo que ya tocaba. */
  | 'al-dia'
  /** Antes del entreno y con comidas que ya tocaban sin hacer. */
  | 'atrasado'
  /** Ya toca (o ya pasó) el entreno: lo que importa es la recuperación. */
  | 'despues';

export interface Macros {
  protein: number;
  carbs: number;
}

export interface FlowMeal {
  key: MealKey;
  label: string;
  /** Hora en horas decimales (13.5 = 13:30). */
  hour: number;
  protein: number;
  carbs: number;
  done: boolean;
  /** true = cae antes del entreno; false = después; null = día sin entreno. */
  beforeTraining: boolean | null;
}

/** Un alimento (ya con sus macros calculadas) añadido fuera de las 5 comidas. */
export interface ExtraInput {
  id: string;
  label: string;
  hour: number;
  protein: number;
  carbs: number;
}

export interface FlowExtra extends ExtraInput {
  beforeTraining: boolean | null;
}

export interface DayFlow {
  meals: FlowMeal[];
  /** Alimentos añadidos fuera de las 5 comidas — siempre cuentan como hechos. */
  extras: FlowExtra[];
  trainingHour: number | null;
  nowHour: number | null;
  status: FlowStatus;
  /**
   * El objetivo real del día (punto medio del rango que calcula `nutritionForDay` para el peso y el tipo de día) —
   * fijo, no cambia si montas una comida a mano con menos de lo que tocaba. Es el que se muestra en los donuts.
   */
  objective: Macros;
  /**
   * Lo que suma el plan actual (automático, o con lo montado a mano ya aplicado) — puede ser menor que `objective`
   * si una comida montada a mano se queda corta. Se usa para "qué tocaba" en el reparto antes/después, no como
   * objetivo a mostrar.
   */
  planned: Macros;
  /** Lo hecho de las 5 comidas más todos los extras. */
  done: Macros;
  /** Lo previsto y lo hecho antes del entreno (solo con entreno) — el hecho incluye los extras de antes. */
  before: { planned: Macros; done: Macros } | null;
  /** Lo previsto después del entreno y lo que aún falta por tomar de ello — los extras de después ya cuentan como recuperación hecha. */
  after: { planned: Macros; remaining: Macros } | null;
  /** Comidas que ya tocaban por la hora y no están hechas (solo antes del entreno). Ajeno a los extras. */
  missed: Macros;
}

/** "13:30" → 13.5. */
export function parseHour(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + (m || 0) / 60;
}

const zero = (): Macros => ({ protein: 0, carbs: 0 });
const add = (a: Macros, m: { protein: number; carbs: number }): Macros => ({ protein: a.protein + m.protein, carbs: a.carbs + m.carbs });

/** Tiempo de cortesía tras la hora de una comida antes de darla por "atrasada". */
const GRACE_HOURS = 0.5;

export function computeDayFlow(
  plan: DayMealPlan,
  doneIndexes: number[],
  extraInputs: ExtraInput[],
  opts: { trainingHour: number | null; nowHour: number | null; trained?: boolean },
): DayFlow {
  const { trainingHour, nowHour } = opts;
  const meals: FlowMeal[] = plan.meals.map((m) => ({
    key: m.key,
    label: m.label,
    hour: parseHour(m.time),
    protein: m.protein,
    carbs: m.carbs,
    done: doneIndexes.includes(MEAL_ORDER.indexOf(m.key)),
    beforeTraining: trainingHour === null ? null : parseHour(m.time) < trainingHour,
  }));
  const extras: FlowExtra[] = extraInputs.map((e) => ({
    ...e,
    beforeTraining: trainingHour === null ? null : e.hour < trainingHour,
  }));

  let planned = zero();
  let done = zero();
  let beforePlanned = zero();
  let beforeDone = zero();
  let afterPlanned = zero();
  let afterRemaining = zero();
  let missed = zero();
  for (const m of meals) {
    planned = add(planned, m);
    if (m.done) done = add(done, m);
    if (m.beforeTraining === true) {
      beforePlanned = add(beforePlanned, m);
      if (m.done) beforeDone = add(beforeDone, m);
      if (!m.done && nowHour !== null && m.hour + GRACE_HOURS <= nowHour) missed = add(missed, m);
    } else if (m.beforeTraining === false) {
      afterPlanned = add(afterPlanned, m);
      if (!m.done) afterRemaining = add(afterRemaining, m);
    }
  }
  // Los extras siempre cuentan como ya tomados: suman a "hecho" y, si caen antes del entreno, también a lo hecho de
  // antes; si caen después, reducen lo que falta por recuperar (sin bajar de cero: comer de más no genera un "sobra").
  for (const e of extras) {
    done = add(done, e);
    if (e.beforeTraining === true) beforeDone = add(beforeDone, e);
    else if (e.beforeTraining === false) {
      afterRemaining = { protein: Math.max(0, afterRemaining.protein - e.protein), carbs: Math.max(0, afterRemaining.carbs - e.carbs) };
    }
  }

  let status: FlowStatus;
  if (trainingHour === null) status = 'descanso';
  else if (opts.trained || (nowHour !== null && nowHour >= trainingHour)) status = 'despues';
  else if (nowHour === null) status = 'sin-hora';
  else status = missed.carbs >= Math.max(20, beforePlanned.carbs * 0.15) || missed.protein >= Math.max(12, beforePlanned.protein * 0.25) ? 'atrasado' : 'al-dia';

  const objective: Macros = {
    protein: Math.round((plan.target.proteinG.min + plan.target.proteinG.max) / 2),
    carbs: Math.round((plan.target.carbsG.min + plan.target.carbsG.max) / 2),
  };

  // "Ya entrenó" sin conocer la hora (otro día): se trata como después.
  return {
    meals,
    extras,
    trainingHour,
    nowHour,
    status,
    objective,
    planned,
    done,
    before: trainingHour === null ? null : { planned: beforePlanned, done: beforeDone },
    after: trainingHour === null ? null : { planned: afterPlanned, remaining: afterRemaining },
    missed,
  };
}
