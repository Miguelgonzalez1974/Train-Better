import { MEAL_ORDER, type DayMealPlan, type MealKey } from './mealPlan';

/**
 * "Línea del día": cuánta proteína y cuánto hidrato lleva el atleta a lo largo del día frente a lo previsto, con las
 * comidas en su hora y el entreno como punto de corte (antes / después). Lo previsto sale de las comidas del plan (con
 * lo que el atleta haya montado a mano); lo hecho, de las comidas que marcó. Es una lectura pura, sin efectos.
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

export interface DayFlow {
  meals: FlowMeal[];
  trainingHour: number | null;
  nowHour: number | null;
  status: FlowStatus;
  planned: Macros;
  done: Macros;
  /** Lo previsto y lo hecho antes del entreno (solo con entreno). */
  before: { planned: Macros; done: Macros } | null;
  /** Lo previsto después del entreno y lo que aún falta por tomar de ello (solo con entreno). */
  after: { planned: Macros; remaining: Macros } | null;
  /** Comidas que ya tocaban por la hora y no están hechas (solo antes del entreno). */
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

  let status: FlowStatus;
  if (trainingHour === null) status = 'descanso';
  else if (opts.trained || (nowHour !== null && nowHour >= trainingHour)) status = 'despues';
  else if (nowHour === null) status = 'sin-hora';
  else status = missed.carbs >= Math.max(20, beforePlanned.carbs * 0.15) || missed.protein >= Math.max(12, beforePlanned.protein * 0.25) ? 'atrasado' : 'al-dia';

  // "Ya entrenó" sin conocer la hora (otro día): se trata como después.
  return {
    meals,
    trainingHour,
    nowHour,
    status,
    planned,
    done,
    before: trainingHour === null ? null : { planned: beforePlanned, done: beforeDone },
    after: trainingHour === null ? null : { planned: afterPlanned, remaining: afterRemaining },
    missed,
  };
}
