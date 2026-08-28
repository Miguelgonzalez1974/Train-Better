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
  | 'barbellComplex';

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
 * — base aerobica -> umbral -> potencia anaerobica -> recuperacion — atada a la fase del macrociclo,
 * sesgando duracion, formato y cantidad de cardio ciclico del WOD sin cambiar la trifecta de fondo.
 */
const ENERGY_SYSTEM_BY_WEEK: Record<1 | 2 | 3 | 4, EnergySystemPlan> = {
  1: {
    system: 'base-aerobica',
    label: 'Base aeróbica',
    monoFloor: 2,
    // amrap / interval / chipper respetan el suelo de monoestructurales y dan trabajo ciclico
    // sostenido; las escaleras-con-peaje solo meten un monoestructural suelto, menos on-theme aqui.
    preferFormats: ['amrap', 'interval', 'chipper'],
    durationScale: 1.15,
    paceCue: 'ritmo sostenible y conversacional, sin sprints',
    note: 'Acondicionamiento de esta fase: base aeróbica — piezas más largas a ritmo sostenible y más cardio cíclico. Construyes motor, no buscas fallar.',
  },
  2: {
    system: 'umbral',
    label: 'Umbral',
    monoFloor: 1,
    preferFormats: ['forTime', 'interval', 'ladder', 'ascendingLadderFiller'],
    durationScale: 1.0,
    paceCue: 'cómodo-duro: rápido pero sin colapsar',
    note: 'Acondicionamiento de esta fase: umbral — intervalos y For Time de duración media a ritmo "cómodo-duro", justo por debajo de acumular demasiado lactato.',
  },
  3: {
    system: 'potencia',
    label: 'Potencia anaeróbica',
    monoFloor: 1,
    preferFormats: ['forTime', 'emom', 'risingLoadInterval', 'risingInterval'],
    durationScale: 0.9,
    paceCue: 'máximo esfuerzo en piezas cortas',
    note: 'Acondicionamiento de esta fase: potencia anaeróbica — piezas cortas y máximas, estilo competición. Menos volumen, más intensidad.',
  },
  4: {
    system: 'recuperacion',
    label: 'Recuperación aeróbica',
    monoFloor: 2,
    preferFormats: ['amrap', 'interval'],
    durationScale: 0.9,
    paceCue: 'suave, para recuperar — nunca al límite',
    note: 'Acondicionamiento de esta fase: recuperación aeróbica — cardio suave y continuo para bajar fatiga, nunca cerca del fallo.',
  },
};

export function resolveEnergySystem(week: 1 | 2 | 3 | 4): EnergySystemPlan {
  return ENERGY_SYSTEM_BY_WEEK[week];
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
  const a = WOD_NAME_PART_A[Math.floor(Math.random() * WOD_NAME_PART_A.length)];
  const b = WOD_NAME_PART_B[Math.floor(Math.random() * WOD_NAME_PART_B.length)];
  return `${a} ${b}`;
}
