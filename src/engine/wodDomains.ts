/**
 * Clasificacion de los movimientos de `wod.ts` por dominio de estimulo, y prescripcion
 * de reps/unidad realista por movimiento. Metodologia general de programacion CrossFit
 * (balance gimnastico / con carga externa / monoestructural, tambien llamado "trifecta"),
 * no programacion propietaria de ningun servicio de pago.
 */

import type { BenchmarkWorkout } from '../data/movements/types';
import { olyMovements, strengthMovements } from '../data/movements';

export const GYMNASTICS_IDS = [
  'strict-pull-up',
  'kipping-pull-up',
  'chest-to-bar-pull-up',
  'butterfly-pull-up',
  'toes-to-bar',
  'knees-to-elbow',
  'push-up',
  'handstand-push-up',
  'kipping-hspu',
  'ring-dip',
  'bar-muscle-up',
  'ring-muscle-up',
  'handstand-walk',
  'wall-walk',
  'rope-climb',
  'pistol-squat',
  'box-jump',
  'box-jump-over',
  'burpee',
  'burpee-box-jump-over',
  'air-squat',
  'abmat-situp',
  'l-sit',
  'burpee-pull-up',
  'bar-facing-burpee',
  'burpee-to-target',
  'lateral-burpee',
  'ring-row',
];

export const MONOSTRUCTURAL_IDS = ['run', 'row', 'air-bike', 'ski-erg', 'double-under', 'single-under', 'shuttle-run'];

export const WEIGHTED_IDS = [
  'wall-ball',
  'thruster',
  'kettlebell-swing-russian',
  'kettlebell-swing-american',
  'dumbbell-snatch',
  'dumbbell-clean-and-jerk',
  'devils-press',
  'man-maker',
  'farmers-carry',
  'sandbag-carry',
  'sled-push',
  'wall-walk-alt',
  'shoulder-to-overhead',
  'dumbbell-hang-clean',
  'dumbbell-push-jerk',
  'sumo-deadlift-high-pull',
  'kettlebell-front-squat',
  'kettlebell-goblet-squat',
  'suitcase-carry',
];

export type WodDomain = 'gymnastics' | 'monostructural' | 'weighted';

/** Levantamientos de halterofilia y fuerza con barra tambien cuentan como dominio "con carga" en la trifecta. */
const LOAD_MOVEMENT_IDS = new Set([...olyMovements, ...strengthMovements].map((m) => m.id));

export function getWodDomain(movementId: string): WodDomain {
  if (MONOSTRUCTURAL_IDS.includes(movementId)) return 'monostructural';
  if (WEIGHTED_IDS.includes(movementId)) return 'weighted';
  if (LOAD_MOVEMENT_IDS.has(movementId)) return 'weighted';
  return 'gymnastics';
}

/** Dominio predominante de una lista de movimientos (mayoria simple), usado para no repetir el mismo estimulo dos benchmarks seguidos. */
export function dominantWodDomain(movementIds: string[]): WodDomain {
  const counts: Record<WodDomain, number> = { gymnastics: 0, monostructural: 0, weighted: 0 };
  movementIds.forEach((id) => {
    counts[getWodDomain(id)] += 1;
  });
  return (Object.entries(counts) as [WodDomain, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

export type BenchmarkDurationTag = 'corto' | 'medio' | 'largo' | 'muy-largo';

/** Duracion de benchmark preferida por semana del mesociclo: acumulacion tolera mas volumen, pico exige corto e intenso. */
const WEEK_DURATION_PREFERENCE: Record<1 | 2 | 3 | 4, BenchmarkDurationTag[]> = {
  1: ['largo', 'muy-largo', 'medio'],
  2: ['medio', 'largo'],
  3: ['corto', 'medio'],
  4: ['corto', 'medio'],
};

/**
 * Elige un benchmark del pool priorizando: duracion acorde a la semana del mesociclo, y dominio de
 * estimulo distinto al del ultimo benchmark realizado (para no repetir gimnasia/oly/monoestructural
 * dos veces seguidas). Si el filtro deja el pool vacio en cualquier paso, cae al paso anterior.
 */
export function pickSmartBenchmark(
  pool: BenchmarkWorkout[],
  week: 1 | 2 | 3 | 4,
  lastDomain: WodDomain | null,
): BenchmarkWorkout {
  const preference = WEEK_DURATION_PREFERENCE[week];
  const byDuration = pool.filter((w) => w.tags.some((t) => preference.includes(t as BenchmarkDurationTag)));
  const durationPool = byDuration.length > 0 ? byDuration : pool;

  const byDomain = lastDomain ? durationPool.filter((w) => dominantWodDomain(w.movements) !== lastDomain) : durationPool;
  const finalPool = byDomain.length > 0 ? byDomain : durationPool;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/** Prescripcion realista por movimiento (reps, distancia o tiempo), no un "12-15" generico para todo. */
export const WOD_PRESCRIPTION: Record<string, string> = {
  'strict-pull-up': '5-8',
  'kipping-pull-up': '8-12',
  'chest-to-bar-pull-up': '6-10',
  'butterfly-pull-up': '10-15',
  'toes-to-bar': '8-12',
  'knees-to-elbow': '10-15',
  'push-up': '12-20',
  'handstand-push-up': '5-8',
  'kipping-hspu': '6-10',
  'ring-dip': '8-12',
  'bar-muscle-up': '3-6',
  'ring-muscle-up': '3-6',
  'handstand-walk': '2x15m',
  'wall-walk': '3-5',
  'rope-climb': '3-5',
  'pistol-squat': '6-10 por pierna',
  'box-jump': '12-15',
  'box-jump-over': '12-15',
  burpee: '10-15',
  'burpee-box-jump-over': '8-12',
  'air-squat': '20-30',
  'abmat-situp': '15-25',
  'l-sit': '20-30 seg',
  run: '400m',
  row: '500m',
  'air-bike': '15-20 cal',
  'ski-erg': '15-20 cal',
  'double-under': '30-50',
  'single-under': '50-80',
  'wall-ball': '15-20',
  thruster: '9-15',
  'kettlebell-swing-russian': '15-20',
  'kettlebell-swing-american': '12-15',
  'dumbbell-snatch': '8-12',
  'dumbbell-clean-and-jerk': '8-12',
  'devils-press': '6-10',
  'man-maker': '6-10',
  'farmers-carry': '40m',
  'sandbag-carry': '40m',
  'sled-push': '20m',
  'wall-walk-alt': '10-16 pasos',
  'burpee-pull-up': '8-12',
  'bar-facing-burpee': '10-15',
  'burpee-to-target': '10-15',
  'lateral-burpee': '10-15',
  'shoulder-to-overhead': '8-12',
  'dumbbell-hang-clean': '8-12',
  'dumbbell-push-jerk': '8-12',
  'shuttle-run': '4-6 x 10m',
  'ring-row': '10-15',
  'sumo-deadlift-high-pull': '12-15',
  'kettlebell-front-squat': '8-12',
  'kettlebell-goblet-squat': '12-15',
  'suitcase-carry': '40m por lado',
};

export interface WodTimeDomain {
  rounds: number;
  amrapMin: number;
  emomMin: number;
}

/** Dominio temporal del WOD segun la semana del mesociclo — mas largo en acumulacion, corto e intenso en pico. */
export const WOD_TIME_DOMAIN: Record<1 | 2 | 3 | 4, WodTimeDomain> = {
  1: { rounds: 5, amrapMin: 18, emomMin: 16 },
  2: { rounds: 4, amrapMin: 15, emomMin: 14 },
  3: { rounds: 3, amrapMin: 10, emomMin: 8 },
  4: { rounds: 3, amrapMin: 12, emomMin: 10 },
};

/**
 * Generador de nombres propios para WODs custom — vocabulario original, no tomado de
 * ningun programa de pago. Da al WOD del dia identidad, igual que un coach de verdad
 * le pone nombre a la sesion en vez de dejarla como "3 movimientos sueltos".
 */
const WOD_NAME_PART_A = [
  'Storm',
  'Fury',
  'Thunder',
  'Fire',
  'Iron',
  'Chaos',
  'Lightning',
  'Tempest',
  'Echo',
  'Vertigo',
  'Breaker',
  'Edge',
  'Beast',
  'Mutiny',
  'Pulse',
];

const WOD_NAME_PART_B = [
  'Savage',
  'of Steel',
  'Unleashed',
  'Crossfire',
  'Ablaze',
  'Midnight',
  'Relentless',
  'Rebel',
  'in Flames',
  'at Dawn',
  'Ironclad',
  'Untamed',
];

export function generateWodName(): string {
  const a = WOD_NAME_PART_A[Math.floor(Math.random() * WOD_NAME_PART_A.length)];
  const b = WOD_NAME_PART_B[Math.floor(Math.random() * WOD_NAME_PART_B.length)];
  return `${a} ${b}`;
}
