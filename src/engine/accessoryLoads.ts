import type { PersonalRecords } from '../data/athlete/types';
import { roundToNearestPlate } from './oneRepMaxTables';

/**
 * Carga sugerida de los accesorios con peso. Hasta ahora el bloque de accesorio solo prescribia series
 * y reps y dejaba la carga a ojo; aqui se deriva de los PR de fuerza (o del peso corporal) con la
 * fraccion tipica de cada movimiento respecto a su levantamiento de referencia.
 *
 * Es una GUIA orientativa, no un absoluto: la fraccion base es la de una serie de ~10-12 reps con
 * 2 en reserva (la semana 1 del mesociclo), y cada semana la mueve segun sus reps objetivo (ver
 * `ACCESSORY_WEEK_LOAD_FACTOR`). Los movimientos de peso corporal (dominadas, flexiones, saltos,
 * extensiones lumbares...) no llevan carga.
 */

type AccessoryLoadModel =
  | { pr: keyof PersonalRecords; pct: number; unit: 'plate' | 'dumbbell' }
  | { bodyweightFraction: number; unit: 'stack' };

const ACCESSORY_LOAD_MODEL: Record<string, AccessoryLoadModel> = {
  // Cadena posterior
  'romanian-deadlift': { pr: 'deadlift', pct: 0.5, unit: 'plate' },
  'hip-thrust': { pr: 'deadlift', pct: 0.6, unit: 'plate' },
  'good-morning': { pr: 'backSquat', pct: 0.3, unit: 'plate' },
  // Pierna unilateral (barra / total movido)
  'walking-lunge': { pr: 'backSquat', pct: 0.3, unit: 'plate' },
  'reverse-lunge': { pr: 'backSquat', pct: 0.35, unit: 'plate' },
  'bulgarian-split-squat': { pr: 'backSquat', pct: 0.35, unit: 'plate' },
  'step-up': { pr: 'backSquat', pct: 0.25, unit: 'plate' },
  // Empuje
  'close-grip-bench-press': { pr: 'benchPress', pct: 0.65, unit: 'plate' },
  'bench-press': { pr: 'benchPress', pct: 0.7, unit: 'plate' },
  'dumbbell-bench-press': { pr: 'benchPress', pct: 0.3, unit: 'dumbbell' },
  'dumbbell-floor-press': { pr: 'benchPress', pct: 0.28, unit: 'dumbbell' },
  'seated-strict-press': { pr: 'strictPress', pct: 0.7, unit: 'plate' },
  'strict-press': { pr: 'strictPress', pct: 0.72, unit: 'plate' },
  'dumbbell-z-press': { pr: 'strictPress', pct: 0.3, unit: 'dumbbell' },
  'lateral-raise': { pr: 'strictPress', pct: 0.1, unit: 'dumbbell' },
  // Tiron
  'pendlay-row': { pr: 'deadlift', pct: 0.42, unit: 'plate' },
  'landmine-row': { pr: 'deadlift', pct: 0.28, unit: 'plate' },
  'single-arm-dumbbell-row': { pr: 'deadlift', pct: 0.22, unit: 'dumbbell' },
  'lat-pulldown': { bodyweightFraction: 0.6, unit: 'stack' },
};

/**
 * Factor por semana del mesociclo sobre la fraccion base (semana 1 = 10-12 reps con 2 en reserva).
 * Sale de la formula de Epley (fraccion del 1RM = 1 / (1 + repsHastaElFallo / 30)) con las reps
 * objetivo y la reserva de cada semana (ver `ACCESSORY_WEEK_SCHEME` en generateSession.ts): sube hacia
 * el pico (series de 6-8 a 1 del fallo) y baja en la descarga (12-15 lejos del fallo).
 */
export const ACCESSORY_WEEK_LOAD_FACTOR: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 1.06, 3: 1.13, 4: 0.92 };

export interface AccessoryLoadContext {
  prs: PersonalRecords;
  bodyweightKg: number | null;
  week: 1 | 2 | 3 | 4;
  /** Factor de autorregulacion del dia (0.8-1, ver `getWodLoadFactor`): un accesorio tampoco pide lo mismo un dia de fatiga. */
  loadFactor: number;
  /** Multiplicador de carga de la dosis del dia (~0.93-1.07). */
  doseLoad: number;
}

function roundDumbbell(kg: number): number {
  const step = kg < 10 ? 1 : kg < 30 ? 2 : 2.5;
  return Math.max(step, Math.round(kg / step) * step);
}

/** `true` si el movimiento tiene un modelo de carga (aunque falte el dato para calcularla hoy). */
export function hasAccessoryLoadModel(movementId: string): boolean {
  return movementId in ACCESSORY_LOAD_MODEL;
}

/** Carga sugerida (kg) o `undefined` si el movimiento no lleva peso o falta el PR / peso corporal de referencia. */
export function suggestAccessoryLoadKg(movementId: string, ctx: AccessoryLoadContext): number | undefined {
  const model = ACCESSORY_LOAD_MODEL[movementId];
  if (!model) return undefined;
  const adjust = ACCESSORY_WEEK_LOAD_FACTOR[ctx.week] * ctx.loadFactor * ctx.doseLoad;

  if ('bodyweightFraction' in model) {
    if (!ctx.bodyweightKg || ctx.bodyweightKg <= 0) return undefined;
    return roundToNearestPlate(ctx.bodyweightKg * model.bodyweightFraction * adjust);
  }
  const ref = ctx.prs[model.pr];
  if (!ref || ref <= 0) return undefined;
  const raw = ref * model.pct * adjust;
  return model.unit === 'dumbbell' ? roundDumbbell(raw) : roundToNearestPlate(raw);
}
