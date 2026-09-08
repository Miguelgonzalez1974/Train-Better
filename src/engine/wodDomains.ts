/**
 * Clasificacion de los movimientos de `wod.ts` por dominio de estimulo, y prescripcion
 * de reps/unidad realista por movimiento. Metodologia general de programacion CrossFit
 * (balance gimnastico / con carga externa / monoestructural, tambien llamado "trifecta"),
 * no programacion propietaria de ningun servicio de pago.
 */

import type { BenchmarkWorkout } from '../data/movements/types';
import { olyMovements, strengthMovements } from '../data/movements';
import { rng } from './rng';

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
  'sandbag-clean',
  'devils-press',
  'man-maker',
  'farmers-carry',
  'sandbag-carry',
  'yoke-walk',
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

  return finalPool[Math.floor(rng() * finalPool.length)];
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
  'sandbag-clean': '8-10',
  'devils-press': '6-10',
  'man-maker': '6-10',
  'farmers-carry': '40m',
  'sandbag-carry': '40m',
  'yoke-walk': '25m',
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

  // --- Barra pesada / olimpico como movimiento de WOD (no solo de fuerza/oly dedicado) ---
  'back-squat': '8-10',
  'front-squat': '8-10',
  deadlift: '10-15',
  snatch: '5-8',
  'power-snatch': '6-9',
  'hang-snatch': '6-9',
  clean: '5-8',
  'power-clean': '6-9',
  'hang-clean': '6-9',
  'clean-and-jerk': '5-8',
};

/**
 * Carga de WOD para un levantamiento de barra/olimpico — un porcentaje submaximo fijo del PR del
 * atleta, pensado para poder ciclar la barra durante varias rondas sin acercarse al fallo tecnico.
 * Deliberadamente NO se autorregula (a diferencia de fuerza/oly): igual que los benchmarks con
 * nombre ya usan un peso fijo sea cual sea el estado del atleta ese dia, esta carga ya es
 * suficientemente conservadora por diseño. Solo cubre los levantamientos que de verdad aparecen en
 * WODs reales (ver `~/Desktop/MFT Cycle 1.docx`, analizado 2026-08-27) — variantes puramente
 * tecnicas (snatch/clean pulls, muscle snatch/clean, snatch balance...) nunca son contenido de WOD,
 * por eso no estan aqui aunque sean movimientos validos en el bloque de oly dedicado. Overhead
 * Squat tambien queda fuera a proposito: no existe un PR de Overhead Squat en `PersonalRecords`, y
 * derivar su carga del PR de Snatch (por su `progressionOf`) daria un numero incorrecto.
 */
export const WOD_BARBELL_LOAD_PERCENT: Record<string, number> = {
  'back-squat': 0.5,
  'front-squat': 0.5,
  deadlift: 0.55,
  snatch: 0.55,
  'power-snatch': 0.6,
  'hang-snatch': 0.6,
  clean: 0.55,
  'power-clean': 0.6,
  'hang-clean': 0.6,
  'clean-and-jerk': 0.5,
};

/**
 * Carga RX de un movimiento de WOD como FRACCION DEL PESO CORPORAL, para los movimientos que NO
 * tienen un PR propio en `PersonalRecords` (thruster, shoulder-to-overhead, mancuernas, kettlebells,
 * sumo DL high pull…). El `#/lb` de un WOD real escala con el tamaño del atleta, no es un absoluto —
 * así un WOD generado con un thruster ya trae un peso concreto en vez de solo "12-15". Solo se aplica
 * si hay peso corporal registrado; si no, esos movimientos van sin carga como hasta ahora. `round`:
 * 'plate' -> múltiplo de disco; 'kb' -> tamaño de kettlebell real. Valores calibrados a ~80 kg de
 * referencia contra los estándares RX habituales.
 */
export const WOD_RX_BW_FRACTION: Record<string, { fraction: number; round: 'plate' | 'kb' }> = {
  thruster: { fraction: 0.52, round: 'plate' },
  'shoulder-to-overhead': { fraction: 0.52, round: 'plate' },
  'sumo-deadlift-high-pull': { fraction: 0.55, round: 'plate' },
  'sandbag-clean': { fraction: 0.6, round: 'plate' },
  'kettlebell-swing-russian': { fraction: 0.3, round: 'kb' },
  'kettlebell-swing-american': { fraction: 0.3, round: 'kb' },
  'kettlebell-front-squat': { fraction: 0.3, round: 'kb' },
  'kettlebell-goblet-squat': { fraction: 0.3, round: 'kb' },
  'dumbbell-snatch': { fraction: 0.28, round: 'plate' },
  'dumbbell-clean-and-jerk': { fraction: 0.28, round: 'plate' },
  'dumbbell-hang-clean': { fraction: 0.28, round: 'plate' },
  'dumbbell-push-jerk': { fraction: 0.28, round: 'plate' },
  'devils-press': { fraction: 0.26, round: 'plate' },
  'man-maker': { fraction: 0.26, round: 'plate' },
};

/** Tamaños de kettlebell reales (kg) para redondear una carga RX relativa al peso corporal. */
export const KETTLEBELL_SIZES_KG = [8, 12, 16, 20, 24, 28, 32, 40];

/**
 * "Cardio chipper" de base aeróbica: 3 bloques descendentes de puro monoestructural (ej. 1.000 m Row
 * / 1 milla Bike / 200 comba, luego 750 / 0.8 / 150, luego 500 / 0.6 / 100). Cantidad base por
 * movimiento y factores de cada bloque. Patrón tomado de `docs/importar-coach-ia.md` ("Cardio
 * Complex").
 */
export const CARDIO_CHIPPER_BASE: Record<string, { amount: number; unit: 'm' | 'cal' | 'reps' }> = {
  run: { amount: 1200, unit: 'm' },
  row: { amount: 1200, unit: 'm' },
  'ski-erg': { amount: 1000, unit: 'm' },
  'air-bike': { amount: 45, unit: 'cal' },
  'double-under': { amount: 150, unit: 'reps' },
  'single-under': { amount: 250, unit: 'reps' },
};
export const CARDIO_CHIPPER_TIERS = [1, 0.7, 0.5];

/**
 * Parejas de movimientos de WOD que ENCAJAN — para cada id, sus mejores compañeros ordenados de
 * mejor a peor. Destilado de ~130 WODs del banco `docs/importar-coach-ia.md` (co-ocurrencia real:
 * deadlift+box jump, thruster+bar-facing burpee, power snatch+toes-to-bar, pull-up+push-up de
 * "Cindy", wall ball+pull-up…) más metodología general. `buildWodBlock` lo usa para sesgar
 * (probabilidad, no obligación) la elección del 2º y 3er movimiento hacia combos probados en vez de
 * "válido pero al azar". No cambia formato, dominio ni dosis.
 */
export const WOD_PAIR_AFFINITY: Record<string, string[]> = {
  // --- Barra pesada / olímpico ---
  deadlift: ['box-jump-over', 'box-jump', 'double-under', 'handstand-push-up', 'burpee', 'strict-pull-up'],
  thruster: ['bar-facing-burpee', 'chest-to-bar-pull-up', 'kipping-pull-up', 'double-under', 'toes-to-bar', 'row'],
  'power-snatch': ['toes-to-bar', 'double-under', 'handstand-push-up', 'wall-ball', 'run', 'box-jump-over', 'bar-facing-burpee'],
  'hang-snatch': ['toes-to-bar', 'double-under', 'wall-ball', 'box-jump-over'],
  snatch: ['toes-to-bar', 'double-under', 'burpee', 'run'],
  'power-clean': ['bar-facing-burpee', 'box-jump-over', 'toes-to-bar', 'burpee', 'double-under'],
  'hang-clean': ['bar-facing-burpee', 'front-squat', 'toes-to-bar'],
  clean: ['bar-facing-burpee', 'front-squat', 'box-jump-over', 'toes-to-bar'],
  'clean-and-jerk': ['toes-to-bar', 'row', 'box-jump-over', 'bar-facing-burpee', 'kipping-pull-up', 'run'],
  'front-squat': ['push-up', 'bar-facing-burpee', 'hang-clean', 'toes-to-bar'],
  'back-squat': ['double-under', 'abmat-situp', 'burpee'],
  'shoulder-to-overhead': ['kipping-pull-up', 'run', 'abmat-situp', 'burpee'],
  'sumo-deadlift-high-pull': ['push-up', 'box-jump-over', 'abmat-situp'],
  // --- Gimnasia ---
  'chest-to-bar-pull-up': ['thruster', 'deadlift', 'clean-and-jerk', 'double-under', 'wall-ball'],
  'kipping-pull-up': ['push-up', 'air-squat', 'ring-dip', 'thruster', 'run', 'wall-ball', 'clean-and-jerk'],
  'strict-pull-up': ['push-up', 'deadlift', 'ring-dip'],
  'butterfly-pull-up': ['thruster', 'double-under', 'wall-ball'],
  'toes-to-bar': ['power-snatch', 'clean-and-jerk', 'power-clean', 'double-under', 'burpee-box-jump-over', 'thruster'],
  'handstand-push-up': ['deadlift', 'power-snatch', 'double-under', 'row'],
  'kipping-hspu': ['deadlift', 'power-snatch', 'double-under'],
  'ring-dip': ['kipping-pull-up', 'strict-pull-up', 'row', 'handstand-push-up'],
  'bar-muscle-up': ['wall-ball', 'row', 'double-under'],
  'ring-muscle-up': ['wall-ball', 'row', 'double-under'],
  'wall-walk': ['ski-erg', 'row', 'run'],
  'rope-climb': ['run', 'row', 'wall-ball'],
  'push-up': ['air-squat', 'kipping-pull-up', 'row', 'front-squat', 'sumo-deadlift-high-pull', 'air-bike'],
  'air-squat': ['push-up', 'kipping-pull-up', 'double-under', 'run', 'air-bike', 'row'],
  'abmat-situp': ['kettlebell-swing-american', 'kettlebell-swing-russian', 'back-squat', 'shoulder-to-overhead', 'row'],
  'box-jump': ['deadlift', 'double-under'],
  'box-jump-over': ['deadlift', 'power-clean', 'power-snatch', 'double-under', 'clean-and-jerk'],
  burpee: ['air-bike', 'wall-ball', 'kipping-pull-up', 'run'],
  'bar-facing-burpee': ['thruster', 'power-clean', 'clean', 'deadlift'],
  'burpee-box-jump-over': ['toes-to-bar', 'dumbbell-snatch', 'clean', 'abmat-situp'],
  // --- Monoestructural ---
  'double-under': ['deadlift', 'thruster', 'power-snatch', 'box-jump-over', 'back-squat', 'clean-and-jerk'],
  run: ['kipping-pull-up', 'clean-and-jerk', 'shoulder-to-overhead', 'double-under', 'air-squat', 'power-snatch'],
  row: ['thruster', 'push-up', 'kettlebell-swing-american', 'ring-dip', 'clean-and-jerk', 'handstand-push-up', 'wall-ball'],
  'air-bike': ['burpee', 'air-squat', 'push-up', 'kipping-pull-up'],
  'ski-erg': ['wall-walk', 'burpee', 'push-up'],
  // --- Con carga funcional ---
  'wall-ball': ['kipping-pull-up', 'toes-to-bar', 'burpee', 'double-under', 'chest-to-bar-pull-up', 'row', 'kettlebell-swing-american'],
  'kettlebell-swing-russian': ['abmat-situp', 'row', 'push-up', 'box-jump-over'],
  'kettlebell-swing-american': ['abmat-situp', 'row', 'push-up', 'wall-ball', 'box-jump-over'],
  'dumbbell-snatch': ['toes-to-bar', 'burpee-box-jump-over', 'double-under', 'box-jump-over'],
  'dumbbell-clean-and-jerk': ['toes-to-bar', 'double-under', 'box-jump-over'],
  'devils-press': ['row', 'double-under', 'box-jump-over'],
  'farmers-carry': ['double-under', 'air-squat', 'run'],
};

/** Escaleras descendentes clasicas (Fran/Diane/Elizabeth siguen este patron) — se elige una al azar cuando toca este formato. */
export const DESCENDING_LADDER_SCHEMES = ['21-15-9', '15-12-9', '10-8-6', '21-18-15-12-9-6-3'];

/** Escalera ascendente compartida — misma idea que la descendente pero contando hacia arriba (ej. "Climb the Ladder": 5-10-15-20 Wallballs + Box Jump Overs). */
export const ASCENDING_LADDER_SCHEMES = ['5-10-15-20', '6-12-18', '4-8-12-16'];

/**
 * Escalera con "peaje" de monoestructural entre cada escalon — patron real tomado de MFT Cycle 2
 * (ej. "15-12-9-6-3 Back Squats, con calorias de bici entre cada tramo"). Descendente = numero fijo
 * de escalones, For Time; ascendente = sigue subiendo hasta que se acaba el reloj (AMRAP), aqui
 * limitado a los primeros 5 escalones mostrados — el ultimo lleva nota explicita de que sigue.
 */
export const DESCENDING_LADDER_FILLER_STEPS = [15, 12, 9, 6, 3];
export const ASCENDING_LADDER_FILLER_STEPS = [2, 4, 6, 8, 10];

/**
 * Intervalo hasta el fallo donde lo que sube cada ronda es el PESO, no las reps — variante real
 * tomada de MFT Cycle 3 (ej. "Every :90 Until Failure: 5 Shoulder to Overhead, +10/5lbs cada
 * ronda"). Igual que en la escalera ascendente con peaje, se muestran los primeros escalones y una
 * nota explica que sigue subiendo hasta que de verdad no completes una ronda en el tiempo.
 */
export const RISING_LOAD_INTERVAL_STEPS = 5;
export const RISING_LOAD_INTERVAL_INCREMENT_PERCENT = 0.05;

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

/** Familias de formato de WOD que genera el motor — compartido para poder sesgarlas por sistema energetico. */
export type WodFormatKind =
  | 'forTime'
  | 'amrap'
  | 'emom'
  | 'interval'
  | 'ladder'
  | 'chipper'
  | 'descendingLadder'
  | 'ascendingLadder'
  | 'risingInterval'
  | 'risingLoadInterval'
  | 'descendingLadderFiller'
  | 'ascendingLadderFiller'
  | 'barbellComplex'
  | 'maxReps'
  | 'cardioChipper';

// ---- Periodizacion del acondicionamiento (sistema energetico por fase) ----

export type EnergySystem = 'base-aerobica' | 'umbral' | 'potencia' | 'recuperacion';

export interface EnergySystemPlan {
  system: EnergySystem;
  label: string;
  /** Minimo de movimientos monoestructurales a empujar en el WOD (cardio ciclico). */
  monoFloor: number;
  /** Formatos que esta fase favorece — NO exclusivo, solo sube su probabilidad frente al resto. */
  preferFormats: WodFormatKind[];
  /** Factor sobre rondas/minutos del `WOD_TIME_DOMAIN` de la semana (base aerobica alarga, pico/descarga acortan). */
  durationScale: number;
  /** Pista de ritmo para la nota del WOD. */
  paceCue: string;
  /** Nota de coach del enfoque de acondicionamiento de la fase (va a `coachReasons`). */
  note: string;
}

/**
 * La fuerza ya esta periodizada (volumen -> intensidad -> pico). El acondicionamiento no lo estaba:
 * el WOD solo variaba duracion por semana. Aqui se le da la misma progresion clasica de resistencia
 * — base aerobica -> umbral -> potencia anaerobica -> recuperacion — con dos niveles: la FASE del
 * macrociclo fija el sistema dominante, y dentro de la semana el planificador de microciclo ROTA los
 * dias alrededor de ese dominante (ver PHASE_ENERGY_MENU en weekPlan.ts) para que dos dias seguidos
 * no repitan el mismo estimulo metabolico. Cada plan sesga duracion, formato y cardio ciclico del
 * WOD sin tocar la trifecta de fondo.
 */
const ENERGY_SYSTEM_PLANS: Record<EnergySystem, EnergySystemPlan> = {
  'base-aerobica': {
    system: 'base-aerobica',
    label: 'Base aeróbica',
    monoFloor: 2,
    // amrap / interval / chipper respetan el suelo de monoestructurales y dan trabajo ciclico
    // sostenido; las escaleras-con-peaje solo meten un monoestructural suelto, menos on-theme aqui.
    preferFormats: ['amrap', 'interval', 'chipper'],
    durationScale: 1.15,
    paceCue: 'ritmo sostenible y conversacional, sin sprints',
    note: 'Hoy: base aeróbica — pieza larga a ritmo sostenible. Construyes motor.',
  },
  umbral: {
    system: 'umbral',
    label: 'Umbral',
    monoFloor: 1,
    preferFormats: ['forTime', 'interval', 'ladder', 'ascendingLadderFiller'],
    durationScale: 1.0,
    paceCue: 'cómodo-duro: rápido pero sin colapsar',
    note: 'Hoy: umbral — duración media a ritmo "cómodo-duro", justo por debajo del lactato.',
  },
  potencia: {
    system: 'potencia',
    label: 'Potencia anaeróbica',
    monoFloor: 1,
    preferFormats: ['forTime', 'emom', 'risingLoadInterval', 'risingInterval'],
    durationScale: 0.9,
    paceCue: 'máximo esfuerzo en piezas cortas',
    note: 'Hoy: potencia anaeróbica — pieza corta y máxima, estilo competición.',
  },
  recuperacion: {
    system: 'recuperacion',
    label: 'Recuperación aeróbica',
    monoFloor: 2,
    preferFormats: ['amrap', 'interval'],
    durationScale: 0.9,
    paceCue: 'suave, para recuperar — nunca al límite',
    note: 'Hoy: recuperación — cardio suave y continuo para bajar fatiga.',
  },
};

export interface WodEffortTarget {
  /** RPE objetivo del metcon esa semana del meso. */
  rpe: string;
  /** El "para qué" del esfuerzo de hoy, en una línea. */
  intent: string;
}

/**
 * Objetivo de esfuerzo del metcon por semana de mesociclo. La fuerza ya tiene su onda
 * (volumen -> intensidad -> pico -> descarga); el acondicionamiento la sigue: RPE creciente hasta el
 * pico y descarga aeróbica en la 4. Va a la nota del WOD para que el atleta lo ataque con un objetivo
 * concreto, no solo con "3 movimientos y un formato".
 */
export const WOD_EFFORT_BY_WEEK: Record<1 | 2 | 3 | 4, WodEffortTarget> = {
  1: { rpe: '7', intent: 'construyes motor — a un ritmo que puedas repetir mañana, no lo revientes' },
  2: { rpe: '8', intent: 'aprieta el ritmo y aguanta la técnica cuando queme' },
  3: { rpe: '9', intent: 'hoy sí vacías el depósito, estilo competición' },
  4: { rpe: '5-6', intent: 'suave, para mover sangre y bajar fatiga — hoy no se puntúa' },
};

/** Sistema energetico dominante de cada fase de mesociclo — el punto de gravedad alrededor del cual rota la semana. */
export const PHASE_DOMINANT_ENERGY: Record<1 | 2 | 3 | 4, EnergySystem> = {
  1: 'base-aerobica',
  2: 'umbral',
  3: 'potencia',
  4: 'recuperacion',
};

/** Plan del sistema energetico dominante de la fase — usado cuando no hay un plan de dia concreto (fallback). */
export function resolveEnergySystem(week: 1 | 2 | 3 | 4): EnergySystemPlan {
  return ENERGY_SYSTEM_PLANS[PHASE_DOMINANT_ENERGY[week]];
}

/** Plan de un sistema energetico concreto — usado con el sistema que el planificador de microciclo asigno a HOY. */
export function resolveEnergySystemPlan(system: EnergySystem): EnergySystemPlan {
  return ENERGY_SYSTEM_PLANS[system];
}

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
  const a = WOD_NAME_PART_A[Math.floor(rng() * WOD_NAME_PART_A.length)];
  const b = WOD_NAME_PART_B[Math.floor(rng() * WOD_NAME_PART_B.length)];
  return `${a} ${b}`;
}
