import type { MovementPattern } from '../data/movements/types';
import type { PersonalRecords, StrengthProgram, VariantPersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { DayPlan } from './periodization';
import { weeksSinceStart } from './periodization';
import { roundToNearestPlate } from './oneRepMaxTables';
import { resolveVariantPR } from './prResolution';

export const DEFAULT_STRENGTH_PROGRAM_LIFTS: (keyof PersonalRecords)[] = ['backSquat', 'benchPress', 'deadlift', 'strictPress'];

export const STRENGTH_METHOD_LABEL: Record<StrengthProgram['method'], string> = {
  '531': '5/3/1',
  lineal: 'Lineal',
  ondulante: 'Ondulante',
  conjugado: 'Conjugado',
  ruso: 'Ruso / Sheiko',
  texas: 'Texas Method',
  juggernaut: 'Juggernaut Invertido',
  haltero: 'Ciclo Halterofilia (14 semanas)',
  temporada: 'Bloque de Temporada (8 semanas)',
  dieSet: 'Die Set (autorregulado)',
  'mayhem-base': 'Mayhem Burgener — Base (6 semanas)',
};

/** Programa cuya ventana [startDate, endDate] contiene la fecha dada, o undefined — mismo criterio que getActiveMacrocycle. */
export function getActiveStrengthProgram(programs: StrengthProgram[], todayIso: string): StrengthProgram | undefined {
  return programs.find((p) => p.startDate <= todayIso && todayIso <= p.endDate);
}

export function resolveProgramLifts(program: StrengthProgram): (keyof PersonalRecords)[] {
  return program.lifts.length > 0 ? program.lifts : DEFAULT_STRENGTH_PROGRAM_LIFTS;
}

const PROGRAM_LIFT_MOVEMENT_ID: Record<keyof PersonalRecords, string> = {
  backSquat: 'back-squat',
  frontSquat: 'front-squat',
  benchPress: 'bench-press',
  deadlift: 'deadlift',
  strictPress: 'strict-press',
  clean: 'clean',
  snatch: 'snatch',
  cleanAndJerk: 'clean-and-jerk',
};

/** Levantamiento fijo del dia segun el indice de dia de entreno (no varia por variedad — varia por metodologia). */
export function resolveProgramLift(program: StrengthProgram, trainingDayIndex: number): keyof PersonalRecords {
  const lifts = resolveProgramLifts(program);
  return lifts[Math.max(trainingDayIndex, 0) % lifts.length];
}

/** Semana del programa (1-4), ciclando indefinidamente cada 4 semanas mientras el programa siga activo. */
export function resolveStrengthProgramWeek(program: StrengthProgram, today: Date): 1 | 2 | 3 | 4 {
  const elapsed = weeksSinceStart(program.startDate, today);
  return ((elapsed % 4) + 1) as 1 | 2 | 3 | 4;
}

/**
 * Indice de dia de entreno que NO se reinicia cada semana (a diferencia de `dayPlan.trainingDayIndex`) —
 * necesario para metodologias cuyo ciclo de roles no coincide con la semana natural (Texas Method es
 * un ciclo de 3, Conjugado de 4; con un calendario de entreno que no sea multiplo exacto de esos
 * numeros, un indice que se reinicia cada semana rompe la alineacion del ciclo).
 */
function continuousTrainingDayIndex(program: StrengthProgram, dayPlan: DayPlan, today: Date, trainingDaysPerWeek: number): number {
  const weeks = weeksSinceStart(program.startDate, today);
  return weeks * trainingDaysPerWeek + Math.max(dayPlan.trainingDayIndex, 0);
}

export interface StrengthProgramDay {
  movementId: string;
  prKey: keyof PersonalRecords;
  sets: number;
  reps: string;
  loadKg: number;
  format: string;
  notes: string;
  /** Si es true, el dia se envuelve como bloque 'wod' (puntuacion por reps o por carga) en vez de 'strength' — ver el test de maximo de reps y el test de complex de "temporada". */
  scoreAsWod?: boolean;
  /** Presente solo en un dia de test de "complex" — la secuencia completa de movimientos a la misma carga (`loadKg`), en el orden en que se hacen. `movementId` sigue apuntando al primero, para cualquier codigo que solo mire ese campo. */
  complexMovementIds?: string[];
}

// ---------------------------------------------------------------------------
// 5/3/1
// ---------------------------------------------------------------------------

interface FiveThreeOneScheme {
  percents: [number, number, number];
  reps: [string, string, string];
  label: string;
  coachNote: string;
}

const FIVETHREEONE_SCHEMES: Record<1 | 2 | 3 | 4, FiveThreeOneScheme> = {
  1: {
    percents: [0.65, 0.75, 0.85],
    reps: ['5', '5', '5+'],
    label: '5/3/1 · Semana 1 (5s)',
    coachNote: 'Sobre tu training max (90% de tu PR). Última serie: tantas reps de más como puedas con buena técnica.',
  },
  2: {
    percents: [0.7, 0.8, 0.9],
    reps: ['3', '3', '3+'],
    label: '5/3/1 · Semana 2 (3s)',
    coachNote: 'Sobre tu training max. Última serie: tantas reps de más como puedas con buena técnica.',
  },
  3: {
    percents: [0.75, 0.85, 0.95],
    reps: ['5', '3', '1+'],
    label: '5/3/1 · Semana 3 (5-3-1)',
    coachNote: 'Sobre tu training max — la semana de mayor intensidad del ciclo. Última serie AMRAP.',
  },
  4: {
    percents: [0.4, 0.5, 0.6],
    reps: ['5', '5', '5'],
    label: '5/3/1 · Semana 4 (descarga)',
    coachNote: 'Descarga programada del ciclo — baja la intensidad a propósito para asimilar antes de la siguiente onda.',
  },
};

// ---------------------------------------------------------------------------
// Lineal
// ---------------------------------------------------------------------------

interface LinealScheme {
  sets: number;
  reps: number;
  percent: number;
  label: string;
  coachNote: string;
}

const LINEAL_SCHEMES: Record<1 | 2 | 3 | 4, LinealScheme> = {
  1: { sets: 4, reps: 8, percent: 0.65, label: 'Lineal · Semana 1', coachNote: 'Bloque de acumulación: volumen alto, carga moderada.' },
  2: { sets: 4, reps: 6, percent: 0.72, label: 'Lineal · Semana 2', coachNote: 'Sube la intensidad, baja ligeramente el volumen.' },
  3: { sets: 4, reps: 4, percent: 0.8, label: 'Lineal · Semana 3', coachNote: 'Zona de fuerza — menos repeticiones, más peso.' },
  4: {
    sets: 3,
    reps: 3,
    percent: 0.87,
    label: 'Lineal · Semana 4 (pico)',
    coachNote: 'Semana de pico del bloque — si te sientes con margen, este es el día para buscar un número nuevo.',
  },
};

// ---------------------------------------------------------------------------
// Ondulante (DUP)
// ---------------------------------------------------------------------------

interface UndulatingStyle {
  sets: number;
  reps: number;
  percent: number;
  label: string;
  coachNote: string;
}

/** 3 estimulos que rotan por dia de entreno (no por semana) — el mismo levantamiento se siente distinto cada vez que aparece. */
const UNDULATING_STYLES: UndulatingStyle[] = [
  { sets: 5, reps: 3, percent: 0.85, label: 'Ondulante · pesado', coachNote: 'Día pesado: pocas repeticiones, cerca de tu máximo de la semana.' },
  { sets: 4, reps: 8, percent: 0.7, label: 'Ondulante · volumen', coachNote: 'Día de volumen: más series y repeticiones a carga moderada.' },
  {
    sets: 6,
    reps: 2,
    percent: 0.78,
    label: 'Ondulante · potencia',
    coachNote: 'Día de potencia: repeticiones bajas y explosivas — prioriza la velocidad de la barra.',
  },
];

// ---------------------------------------------------------------------------
// Ruso / Sheiko — frecuencia alta, volumen alto, intensidad moderada, nunca al fallo.
// ---------------------------------------------------------------------------

interface RusoScheme {
  sets: number;
  reps: number;
  percent: number;
  label: string;
  coachNote: string;
}

const RUSO_SCHEMES: Record<1 | 2 | 3 | 4, RusoScheme> = {
  1: { sets: 6, reps: 4, percent: 0.72, label: 'Ruso · Semana 1', coachNote: 'Volumen alto a intensidad submáxima — cada serie se queda lejos del fallo, prioriza la técnica repetida.' },
  2: { sets: 5, reps: 5, percent: 0.75, label: 'Ruso · Semana 2', coachNote: 'Sigue sin buscar el límite — el objetivo es acumular repeticiones de calidad, no series heroicas.' },
  3: { sets: 6, reps: 3, percent: 0.8, label: 'Ruso · Semana 3', coachNote: 'La semana más intensa del ciclo, aun así con margen — nada de series al fallo ni AMRAP.' },
  4: { sets: 4, reps: 3, percent: 0.6, label: 'Ruso · Semana 4 (descarga)', coachNote: 'Descarga: baja el volumen para asimilar la frecuencia acumulada antes de la siguiente onda.' },
};

// ---------------------------------------------------------------------------
// Juggernaut Invertido — ondas de 4 semanas (acumulacion / intensificacion / realizacion+AMRAP /
// descarga) que se repiten 4 veces con intensidad creciente y volumen decreciente por onda, tal
// y como documenta el metodo real (Inverted Juggernaut Method). Fuente: ciclo de 16 semanas de
// programacion real de box (PushJerk) importado en esta sesion — los porcentajes de cada rol en
// cada onda son los literales del ciclo real, salvo el rol de acumulacion de la onda 2 (semana 5),
// que no estaba presente en el material fuente y se interpola entre la onda 1 y la onda 3.
//
// El metodo original recalcula el "training max" cada onda a partir de las repeticiones reales
// conseguidas en la serie AMRAP del rol de realizacion (formula: (reps-referencia) x 2.5 + TM
// anterior). Esta app no pide todavia ese numero de reps AMRAP como dato aparte, asi que en su
// lugar recalcula el training max siempre al 90% del PR actual del atleta (igual que el 5/3/1) —
// que ya se autorregula solo en cuanto el atleta registra un PR nuevo en cualquier parte de la
// app, en vez de depender de una formula que solo se actualiza cada 4 semanas.
// ---------------------------------------------------------------------------

interface JuggernautStep {
  reps: string;
  percent: number;
}

interface JuggernautRole {
  steps: JuggernautStep[];
  label: string;
  coachNote: string;
}

interface JuggernautWave {
  accumulation: JuggernautRole;
  intensification: JuggernautRole;
  realization: JuggernautRole;
  deload: JuggernautRole;
}

const JUGGERNAUT_DELOAD: JuggernautRole = {
  steps: [
    { reps: '5', percent: 0.4 },
    { reps: '5', percent: 0.5 },
    { reps: '5', percent: 0.6 },
  ],
  label: 'Juggernaut · descarga',
  coachNote: 'Descarga programada de la onda — baja la intensidad a propósito para asimilar antes de recalcular el training max.',
};

const JUGGERNAUT_WAVES: JuggernautWave[] = [
  {
    accumulation: {
      steps: [
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5', percent: 0.6 },
        { reps: '5+', percent: 0.6 },
      ],
      label: 'Juggernaut · onda 1, acumulación',
      coachNote: '9 series de 5 sobre el training max (90% de tu PR) — volumen alto a intensidad moderada, última serie con reps de más si quedan.',
    },
    intensification: {
      steps: [
        { reps: '5', percent: 0.55 },
        { reps: '5', percent: 0.625 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.675 },
        { reps: '3+', percent: 0.675 },
      ],
      label: 'Juggernaut · onda 1, intensificación',
      coachNote: 'Sube la intensidad y baja el volumen respecto a la semana anterior — última serie con reps de más si quedan.',
    },
    realization: {
      steps: [
        { reps: '5', percent: 0.5 },
        { reps: '3', percent: 0.6 },
        { reps: '1', percent: 0.7 },
        { reps: 'AMRAP', percent: 0.75 },
      ],
      label: 'Juggernaut · onda 1, realización (AMRAP)',
      coachNote: 'Semana de test: la última serie es AMRAP real a fallo técnico — anota cuántas reps haces, es la referencia para la siguiente onda.',
    },
    deload: JUGGERNAUT_DELOAD,
  },
  {
    accumulation: {
      steps: [
        { reps: '5', percent: 0.65 },
        { reps: '5', percent: 0.65 },
        { reps: '5', percent: 0.65 },
        { reps: '5', percent: 0.65 },
        { reps: '5', percent: 0.65 },
        { reps: '5', percent: 0.65 },
        { reps: '5+', percent: 0.65 },
      ],
      label: 'Juggernaut · onda 2, acumulación',
      coachNote: '6 series de 5 sobre el training max recalculado — un poco menos de volumen que la onda 1, algo más de intensidad. (Interpolado entre onda 1 y onda 3: no estaba en el material fuente.)',
    },
    intensification: {
      steps: [
        { reps: '3', percent: 0.6 },
        { reps: '3', percent: 0.675 },
        { reps: '3', percent: 0.725 },
        { reps: '3', percent: 0.725 },
        { reps: '3', percent: 0.725 },
        { reps: '3', percent: 0.725 },
        { reps: '3+', percent: 0.725 },
      ],
      label: 'Juggernaut · onda 2, intensificación',
      coachNote: 'Todo en triples esta vez — sigue subiendo la intensidad respecto a la onda 1.',
    },
    realization: {
      steps: [
        { reps: '5', percent: 0.5 },
        { reps: '3', percent: 0.6 },
        { reps: '2', percent: 0.7 },
        { reps: '1', percent: 0.75 },
        { reps: 'AMRAP', percent: 0.8 },
      ],
      label: 'Juggernaut · onda 2, realización (AMRAP)',
      coachNote: 'Un escalón más de intensidad que la onda 1 antes del AMRAP — anota las reps para la siguiente onda.',
    },
    deload: JUGGERNAUT_DELOAD,
  },
  {
    accumulation: {
      steps: [
        { reps: '5', percent: 0.7 },
        { reps: '5', percent: 0.7 },
        { reps: '5', percent: 0.7 },
        { reps: '5', percent: 0.7 },
        { reps: '5', percent: 0.7 },
        { reps: '5+', percent: 0.7 },
      ],
      label: 'Juggernaut · onda 3, acumulación',
      coachNote: '5 series de 5 sobre el training max recalculado — menos volumen que las ondas anteriores, más peso en la barra.',
    },
    intensification: {
      steps: [
        { reps: '2', percent: 0.65 },
        { reps: '2', percent: 0.725 },
        { reps: '5', percent: 0.775 },
        { reps: '5+', percent: 0.775 },
      ],
      label: 'Juggernaut · onda 3, intensificación',
      coachNote: 'Vuelve a series de 5 pero a intensidad mucho mayor que la onda 1 — el training max ya debería haber subido dos veces.',
    },
    realization: {
      steps: [
        { reps: '5', percent: 0.5 },
        { reps: '3', percent: 0.6 },
        { reps: '2', percent: 0.7 },
        { reps: '1', percent: 0.75 },
        { reps: '1', percent: 0.8 },
        { reps: 'AMRAP', percent: 0.85 },
      ],
      label: 'Juggernaut · onda 3, realización (AMRAP)',
      coachNote: 'La rampa más larga hasta ahora antes del AMRAP — llega con margen a las primeras series.',
    },
    deload: JUGGERNAUT_DELOAD,
  },
  {
    accumulation: {
      steps: [
        { reps: '3', percent: 0.75 },
        { reps: '3', percent: 0.75 },
        { reps: '3', percent: 0.75 },
        { reps: '3', percent: 0.75 },
        { reps: '3', percent: 0.75 },
        { reps: '3', percent: 0.75 },
        { reps: '3+', percent: 0.75 },
      ],
      label: 'Juggernaut · onda 4, acumulación',
      coachNote: '6 series de 3 sobre el training max recalculado — la onda de mayor intensidad del ciclo completo.',
    },
    intensification: {
      steps: [
        { reps: '1', percent: 0.7 },
        { reps: '1', percent: 0.775 },
        { reps: '3', percent: 0.825 },
        { reps: '3', percent: 0.825 },
        { reps: '3', percent: 0.825 },
        { reps: '3+', percent: 0.825 },
      ],
      label: 'Juggernaut · onda 4, intensificación',
      coachNote: 'Cargas cercanas al máximo del ciclo — técnica por delante de la velocidad esta semana.',
    },
    realization: {
      steps: [
        { reps: '5', percent: 0.5 },
        { reps: '3', percent: 0.6 },
        { reps: '2', percent: 0.7 },
        { reps: '1', percent: 0.75 },
        { reps: '1', percent: 0.8 },
        { reps: '1', percent: 0.85 },
        { reps: 'AMRAP', percent: 0.9 },
      ],
      label: 'Juggernaut · onda 4, realización (AMRAP)',
      coachNote: 'Cierre del ciclo de 16 semanas — la serie AMRAP más pesada de todas. Después de esta onda, el ciclo vuelve a subir de intensidad desde aquí.',
    },
    deload: JUGGERNAUT_DELOAD,
  },
];

/** Onda 0-3 (16 semanas totales); a partir de ahi se mantiene en la onda 4 (la mas exigente) en vez de reiniciar o extrapolar sin fin. */
function resolveJuggernautWaveIndex(startDateIso: string, today: Date): number {
  const wavesSinceStart = Math.floor(weeksSinceStart(startDateIso, today) / 4);
  return Math.min(Math.max(wavesSinceStart, 0), JUGGERNAUT_WAVES.length - 1);
}

const JUGGERNAUT_ROLE_CYCLE: (keyof JuggernautWave)[] = ['accumulation', 'intensification', 'realization', 'deload'];

// ---------------------------------------------------------------------------
// Texas Method — 3 roles fijos por ciclo: volumen, recuperación, intensidad.
// ---------------------------------------------------------------------------

type TexasRole = 'volumen' | 'recuperacion' | 'intensidad';

const TEXAS_ROLE_CYCLE: TexasRole[] = ['volumen', 'recuperacion', 'intensidad'];

const TEXAS_SCHEME: Record<TexasRole, { sets: number; reps: number; percent: number; label: string; coachNote: string }> = {
  volumen: {
    sets: 5,
    reps: 5,
    percent: 0.85,
    label: 'Texas Method · día de volumen',
    coachNote: '5x5 de referencia — el día de más trabajo acumulado de tu ciclo para este levantamiento.',
  },
  recuperacion: {
    sets: 2,
    reps: 5,
    percent: 0.7,
    label: 'Texas Method · día de recuperación',
    coachNote: 'Carga ligera, foco en técnica — este día existe para que llegues fresco al día de intensidad, no para fatigarte.',
  },
  intensidad: {
    sets: 1,
    reps: 3,
    percent: 0.95,
    label: 'Texas Method · día de intensidad',
    coachNote: 'Busca un número nuevo esta semana sin perder la técnica — es el día que mide si el ciclo está funcionando.',
  },
};

// ---------------------------------------------------------------------------
// Conjugado (Westside) — max effort (variante rotativa) + dynamic effort (velocidad), separados por tren superior/inferior.
// ---------------------------------------------------------------------------

type ConjugateRole = 'me-lower' | 'de-lower' | 'me-upper' | 'de-upper';

const CONJUGATE_ROLE_CYCLE: ConjugateRole[] = ['me-lower', 'de-upper', 'me-upper', 'de-lower'];

const LOWER_BODY_LIFTS: (keyof PersonalRecords)[] = ['backSquat', 'frontSquat', 'deadlift'];

function isLowerBodyLift(key: keyof PersonalRecords): boolean {
  return LOWER_BODY_LIFTS.includes(key);
}

/** Variantes reales del catalogo para rotar en el dia de esfuerzo maximo — todas encadenan via progressionOf al PR raiz. */
/**
 * Solo rota a una variante cuando el atleta tiene un PR propio para ella (ver
 * VariantPersonalRecords / VARIANT_PR_MOVEMENT_ID en prResolution.ts) — de lo contrario el peso de
 * referencia saldria del PR del levantamiento raiz aplicado a un movimiento distinto, lo cual para
 * variantes como sumo deadlift o push press puede desviarse bastante del numero real. El resto de
 * variantes que existian antes en esta rotacion (box squat, deficit deadlift, block pull, banca con
 * variantes de agarre/rango, z-press...) se han quitado: mientras no tengan PR dedicado, Conjugado
 * se queda en el movimiento base.
 */
const CONJUGATE_ME_VARIANTS: Partial<Record<keyof PersonalRecords, string[]>> = {
  backSquat: ['back-squat'],
  frontSquat: ['front-squat'],
  deadlift: ['deadlift', 'sumo-deadlift'],
  benchPress: ['bench-press'],
  strictPress: ['strict-press', 'push-press'],
};

function conjugateVariantMovementId(liftKey: keyof PersonalRecords, variantIndex: number): string {
  const variants = CONJUGATE_ME_VARIANTS[liftKey] ?? [PROGRAM_LIFT_MOVEMENT_ID[liftKey]];
  return variants[variantIndex % variants.length];
}

function pickConjugateLift(candidates: (keyof PersonalRecords)[], cycleIndex: number, fallback: (keyof PersonalRecords)[]): keyof PersonalRecords | null {
  const pool = candidates.length > 0 ? candidates : fallback;
  if (pool.length === 0) return null;
  return pool[cycleIndex % pool.length];
}

// ---------------------------------------------------------------------------
// Bloque de Temporada — pensado para abrir una temporada de competicion (no
// para repetirse en bucle como el resto de metodos, igual que el ciclo de
// halterofilia): semana 1 es un test 1RM real de cada levantamiento elegido,
// semanas 2-6 suben en olas 5x5/4x4/3x3 (+2.5% cada semana sobre la base de
// cada tier), semana 7 descarga (misma tabla de tiers, -10 puntos), y semana
// 8 repite el mismo test 1RM sobre los mismos levantamientos que la semana 1
// — asi el atleta cierra el bloque con una comparacion real de antes/despues,
// no solo una sensacion. Inspirado en un patron real de temporada completa
// (test -> progresion -> retest) de un documento de programacion competitiva
// que el usuario aporto. Adaptacion deliberada respecto a la fuente: alli un
// unico levantamiento subia los 3 tiers dentro de la misma semana calendario;
// aqui el tier lo decide el dia de entreno (igual que Ondulante decide su
// estilo), asi que cualquier levantamiento de la lista del atleta pasa por
// alguno de los 3 tiers cada semana sin necesitar un motor de sub-ciclos por
// levantamiento que el resto de la app no tiene.
// ---------------------------------------------------------------------------

interface TemporadaTier {
  sets: number;
  reps: number;
  basePercent: number;
  label: string;
  /** Si true, se puntua por tiempo (reps totales fijas, la barra se puede soltar) en vez de series x reps normales — ver MFT Cycle 4 ("40 Front Squats for time @ 62.5%"). */
  scoreAsWod?: boolean;
}

const TEMPORADA_TIERS: TemporadaTier[] = [
  { sets: 5, reps: 5, basePercent: 0.7, label: '5x5' },
  { sets: 4, reps: 4, basePercent: 0.8, label: '4x4' },
  { sets: 3, reps: 3, basePercent: 0.85, label: '3x3' },
  { sets: 1, reps: 40, basePercent: 0.625, label: 'reps por tiempo', scoreAsWod: true },
];

const TEMPORADA_BUILD_WEEKS = 5;
/** test (1) + olas ascendentes (5) + descarga (1) + retest (1) */
export const TEMPORADA_TOTAL_WEEKS = TEMPORADA_BUILD_WEEKS + 3;

type TemporadaWeekKind = 'test' | 'build' | 'deload' | 'retest';

interface TemporadaWeek {
  kind: TemporadaWeekKind;
  /** 0-4, solo relevante en semanas de construccion — cuanto suma cada tier sobre su base. */
  buildOffset: number;
  weekNumber: number;
}

/**
 * "Complex": varios levantamientos distintos encadenados sin soltar la barra, todos a la MISMA
 * carga — la marca es el peso mas pesado con el que se completa la secuencia entera, no el 1RM de
 * ningun movimiento suelto (por eso siempre es mas ligero que el 1RM del eslabon mas fuerte de la
 * cadena). No existe un PR dedicado para esto en `PersonalRecords` ni tiene sentido inventarlo — el
 * "ancla" de referencia usa el PR mas bajo entre los movimientos clave de la secuencia, a un
 * porcentaje conservador, solo como punto de partida sugerido (editable), nunca como el objetivo.
 */
interface StrengthComplex {
  id: string;
  label: string;
  movementIds: string[];
  /** PR raiz a usar como ancla de referencia — el eslabon que mas limita la carga real de la secuencia. */
  anchorPrKey: keyof PersonalRecords;
}

/**
 * Hash estable y simple (no criptografico, no hace falta) de un string a un entero positivo — solo
 * para variar de forma deterministica que complex le toca a cada programa, ver mas abajo.
 */
function stableStringHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 1_000_000_007;
  return hash;
}

const STRENGTH_COMPLEXES: StrengthComplex[] = [
  {
    id: 'misfit-clean-complex',
    label: 'Misfit Clean Complex',
    movementIds: ['power-clean', 'push-jerk', 'front-squat', 'hang-clean', 'split-jerk'],
    anchorPrKey: 'clean',
  },
  {
    id: 'misfit-snatch-complex',
    label: 'Misfit Snatch Complex',
    movementIds: ['snatch', 'overhead-squat', 'hang-snatch', 'overhead-squat'],
    anchorPrKey: 'snatch',
  },
  {
    // Mas corto que el Misfit Clean Complex (3 movimientos en vez de 5) — misma familia (clean),
    // variedad real de longitud entre los complex disponibles, no solo de movimientos.
    id: 'clean-complex',
    label: 'Clean Complex',
    movementIds: ['clean', 'front-squat', 'split-jerk'],
    anchorPrKey: 'clean',
  },
  {
    id: 'snatch-complex',
    label: 'Snatch Complex',
    movementIds: ['power-snatch', 'snatch', 'hang-snatch'],
    anchorPrKey: 'snatch',
  },
];

/** Nunca pasa de la semana 8 (retest) aunque el programa siga activo mas tiempo — un bloque de una sola pasada, no un ciclo que se repite. */
function resolveTemporadaWeek(startDateIso: string, today: Date): TemporadaWeek {
  const elapsed = Math.min(weeksSinceStart(startDateIso, today), TEMPORADA_TOTAL_WEEKS - 1);
  const weekNumber = elapsed + 1;
  if (elapsed === 0) return { kind: 'test', buildOffset: 0, weekNumber };
  if (elapsed <= TEMPORADA_BUILD_WEEKS) return { kind: 'build', buildOffset: elapsed - 1, weekNumber };
  if (elapsed === TEMPORADA_BUILD_WEEKS + 1) return { kind: 'deload', buildOffset: 0, weekNumber };
  return { kind: 'retest', buildOffset: 0, weekNumber };
}

// ---------------------------------------------------------------------------
// Resolucion unificada
// ---------------------------------------------------------------------------

/**
 * Si el levantamiento que tocaria hoy tiene un patron marcado como molesto (ver painFlags.ts), lo
 * sustituye por el primer otro levantamiento de la lista del atleta cuyo patron no este avisado —
 * si todos lo estan (o no hay avisos), devuelve el original sin tocar. `substitutedFrom` solo va
 * relleno cuando de verdad hubo un cambio, para poder avisarlo en las notas del dia.
 */
function resolveLiftAvoidingPain(
  lifts: (keyof PersonalRecords)[],
  liftKey: keyof PersonalRecords,
  avoidedPatterns: Set<MovementPattern>,
): { liftKey: keyof PersonalRecords; substitutedFrom?: keyof PersonalRecords } {
  if (avoidedPatterns.size === 0) return { liftKey };
  const pattern = getMovementById(PROGRAM_LIFT_MOVEMENT_ID[liftKey])?.pattern;
  if (!pattern || !avoidedPatterns.has(pattern)) return { liftKey };

  const alternative = lifts.find((l) => {
    const p = getMovementById(PROGRAM_LIFT_MOVEMENT_ID[l])?.pattern;
    return p && !avoidedPatterns.has(p);
  });
  return alternative ? { liftKey: alternative, substitutedFrom: liftKey } : { liftKey };
}

function painSubstitutionNote(substitutedFrom: keyof PersonalRecords | undefined): string {
  if (!substitutedFrom) return '';
  const name = getMovementById(PROGRAM_LIFT_MOVEMENT_ID[substitutedFrom])?.name ?? substitutedFrom;
  return ` Cambiado desde ${name} — tienes un aviso de molestia activo que lo evita.`;
}

/**
 * Resuelve el dia completo (que movimiento, cuantas series/reps, a que peso) para cualquiera de
 * las 7 metodologias soportadas. Devuelve null solo si el catalogo de movimientos no tiene el id
 * esperado (no deberia pasar con los ids fijos de este archivo) o si Conjugado no tiene ningun
 * levantamiento disponible para el rol del dia (el atleta eligio, por ejemplo, solo tren superior).
 */
export function resolveStrengthProgramDay(
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
  trainingDaysPerWeek: number,
  avoidedPatterns: Set<MovementPattern> = new Set(),
  variantPrs?: VariantPersonalRecords,
): StrengthProgramDay | null {
  const lifts = resolveProgramLifts(program);

  if (program.method === 'conjugado') {
    const cycleIndex = continuousTrainingDayIndex(program, dayPlan, today, trainingDaysPerWeek);
    const role = CONJUGATE_ROLE_CYCLE[cycleIndex % CONJUGATE_ROLE_CYCLE.length];
    const wantsLower = role === 'me-lower' || role === 'de-lower';
    const lowerLifts = lifts.filter(isLowerBodyLift);
    const upperLifts = lifts.filter((l) => !isLowerBodyLift(l));
    const rawLiftKey = wantsLower
      ? pickConjugateLift(lowerLifts, Math.floor(cycleIndex / CONJUGATE_ROLE_CYCLE.length), lifts)
      : pickConjugateLift(upperLifts, Math.floor(cycleIndex / CONJUGATE_ROLE_CYCLE.length), lifts);
    if (!rawLiftKey) return null;
    const { liftKey, substitutedFrom } = resolveLiftAvoidingPain(lifts, rawLiftKey, avoidedPatterns);
    const painNote = painSubstitutionNote(substitutedFrom);

    const isMaxEffort = role === 'me-lower' || role === 'me-upper';
    const currentPR = prs[liftKey];

    if (isMaxEffort) {
      const variantIndex = Math.floor(weeksSinceStart(program.startDate, today) / 2);
      const movementId = conjugateVariantMovementId(liftKey, variantIndex);
      const movement = getMovementById(movementId);
      if (!movement) return null;
      // Si la variante elegida tiene PR propio (sumo deadlift, push press), se parte de ese numero
      // en vez del PR del levantamiento raiz — para esas variantes concretas suele ser bastante
      // distinto y usar el raiz da una referencia poco fiable.
      const variantPR = resolveVariantPR(movement, variantPrs);
      const referenceLoad = roundToNearestPlate((variantPR ?? currentPR) * 0.9 * autoregFactor);
      return {
        movementId,
        prKey: liftKey,
        sets: 1,
        reps: '1-3',
        loadKg: referenceLoad,
        format: `Conjugado · esfuerzo máximo (${movement.name})`,
        notes: `Sube en series hasta un máximo real de 1 a 3 repeticiones en esta variante, parando 1-2 reps antes del fallo técnico — ${referenceLoad} kg es solo tu referencia de partida, no el objetivo final. La variante rota cada 2 semanas para no acomodarte.${painNote}`,
      };
    }

    const movementId = PROGRAM_LIFT_MOVEMENT_ID[liftKey];
    const movement = getMovementById(movementId);
    if (!movement) return null;
    const loadKg = roundToNearestPlate(currentPR * 0.55 * autoregFactor);
    return {
      movementId,
      prKey: liftKey,
      sets: 8,
      reps: '2-3',
      loadKg,
      format: `Conjugado · esfuerzo dinámico (${movement.name})`,
      notes: `8 series de 2-3 repeticiones a máxima velocidad de barra, descanso corto (45-60 seg) — el objetivo es potencia, no fatiga. Mantén siempre la misma técnica que en tu variante de esfuerzo máximo.${painNote}`,
    };
  }

  if (program.method === 'texas') {
    const cycleIndex = continuousTrainingDayIndex(program, dayPlan, today, trainingDaysPerWeek);
    const role = TEXAS_ROLE_CYCLE[cycleIndex % TEXAS_ROLE_CYCLE.length];
    const rawLiftKey = lifts[Math.floor(cycleIndex / TEXAS_ROLE_CYCLE.length) % lifts.length];
    const { liftKey, substitutedFrom } = resolveLiftAvoidingPain(lifts, rawLiftKey, avoidedPatterns);
    const movementId = PROGRAM_LIFT_MOVEMENT_ID[liftKey];
    const movement = getMovementById(movementId);
    if (!movement) return null;
    const scheme = TEXAS_SCHEME[role];
    const loadKg = roundToNearestPlate(prs[liftKey] * scheme.percent * autoregFactor);
    return {
      movementId,
      prKey: liftKey,
      sets: scheme.sets,
      reps: String(scheme.reps),
      loadKg,
      format: scheme.label,
      notes: `${scheme.coachNote}${painSubstitutionNote(substitutedFrom)}`,
    };
  }

  if (program.method === 'juggernaut') {
    const rawLiftKey = resolveProgramLift(program, dayPlan.trainingDayIndex);
    const { liftKey, substitutedFrom } = resolveLiftAvoidingPain(lifts, rawLiftKey, avoidedPatterns);
    const movementId = PROGRAM_LIFT_MOVEMENT_ID[liftKey];
    const movement = getMovementById(movementId);
    if (!movement) return null;
    const currentPR = prs[liftKey];

    const waveIndex = resolveJuggernautWaveIndex(program.startDate, today);
    const wave = JUGGERNAUT_WAVES[waveIndex];
    const week = resolveStrengthProgramWeek(program, today);
    const role = JUGGERNAUT_ROLE_CYCLE[week - 1];
    const scheme = wave[role];

    const trainingMax = currentPR * 0.9;
    const loads = scheme.steps.map((step) => roundToNearestPlate(trainingMax * step.percent * autoregFactor));
    return {
      movementId,
      prKey: liftKey,
      sets: scheme.steps.length,
      reps: scheme.steps[scheme.steps.length - 1].reps,
      loadKg: loads[loads.length - 1],
      format: scheme.label,
      notes: `${scheme.coachNote} Series: ${loads.map((load, i) => `${scheme.steps[i].reps} @ ${load} kg`).join(', ')}.${painSubstitutionNote(substitutedFrom)}`,
    };
  }

  // 5/3/1, lineal, ondulante, ruso: un levantamiento fijo por dia de entreno (sin rotar por rol).
  const rawSharedLiftKey = resolveProgramLift(program, dayPlan.trainingDayIndex);
  const { liftKey, substitutedFrom: sharedSubstitutedFrom } = resolveLiftAvoidingPain(lifts, rawSharedLiftKey, avoidedPatterns);
  const sharedPainNote = painSubstitutionNote(sharedSubstitutedFrom);
  const movementId = PROGRAM_LIFT_MOVEMENT_ID[liftKey];
  const movement = getMovementById(movementId);
  if (!movement) return null;
  const currentPR = prs[liftKey];

  if (program.method === '531') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = FIVETHREEONE_SCHEMES[week];
    const trainingMax = currentPR * 0.9;
    const loads = scheme.percents.map((percent) => roundToNearestPlate(trainingMax * percent * autoregFactor));
    return {
      movementId,
      prKey: liftKey,
      sets: 3,
      reps: scheme.reps.join('-'),
      loadKg: loads[loads.length - 1],
      format: scheme.label,
      notes: `${scheme.coachNote} Series: ${loads.map((load, i) => `${scheme.reps[i]} @ ${load} kg`).join(', ')}.${sharedPainNote}`,
    };
  }

  if (program.method === 'lineal') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = LINEAL_SCHEMES[week];
    const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor);
    return {
      movementId,
      prKey: liftKey,
      sets: scheme.sets,
      reps: String(scheme.reps),
      loadKg,
      format: scheme.label,
      notes: `${scheme.coachNote}${sharedPainNote}`,
    };
  }

  if (program.method === 'temporada') {
    const { kind, buildOffset, weekNumber } = resolveTemporadaWeek(program.startDate, today);

    if (kind === 'test' || kind === 'retest') {
      // Alternar 1RM real, maximo de reps a carga submaxima, y un complex de varios movimientos da
      // variedad real de estimulo en la semana de test/retest — fuerza maxima, resistencia de
      // fuerza, y coordinacion/tecnica bajo fatiga, en vez de repetir "busca tu 1RM" en cada
      // levantamiento. La MISMA posicion de dia en test y en retest usa siempre el mismo tipo de
      // prueba, para que la comparacion sea justa.
      const testVariant = dayPlan.trainingDayIndex % 3;

      if (testVariant === 2) {
        // El complex se elige por posicion de dia + el propio programa (nunca por semana), asi que
        // test y retest en la misma posicion siempre caen en el mismo complex — indispensable para
        // poder comparar. Solo sumar `trainingDayIndex` no bastaba: como mucho hay 2 posiciones de
        // dia posibles con testVariant===2 (indice 2, y el 5 solo con 6 dias/semana), asi que
        // `floor(trainingDayIndex/3) % length` nunca llegaba a alcanzar mas de 2 de los complex
        // disponibles por mucho que hubiera mas en la lista. Sumar el hash del id del programa da
        // variedad real entre programas distintos del mismo atleta sin romper la estabilidad
        // dentro de un mismo programa (su id no cambia entre semana 1 y semana 8).
        const complexIndex = (dayPlan.trainingDayIndex + stableStringHash(program.id)) % STRENGTH_COMPLEXES.length;
        const complex = STRENGTH_COMPLEXES[complexIndex];
        const anchorLoadKg = roundToNearestPlate(prs[complex.anchorPrKey] * 0.5);
        const complexClosingNote =
          kind === 'retest'
            ? ' Es el mismo complex de la semana 1 — compara el peso mas pesado que completes entero.'
            : ' Referencia de partida: en la semana 8 repites este mismo complex para medir tu progreso real.';
        return {
          movementId: complex.movementIds[0],
          complexMovementIds: complex.movementIds,
          prKey: complex.anchorPrKey,
          sets: 1,
          reps: '1',
          loadKg: anchorLoadKg,
          format: `Test — Complex (${complex.label})`,
          notes: `Semana ${weekNumber} de ${TEMPORADA_TOTAL_WEEKS} · encadena los ${complex.movementIds.length} movimientos sin soltar la barra, todos a la misma carga. Empieza sobre ${anchorLoadKg} kg y sube hasta encontrar el peso mas pesado con el que completes la secuencia entera sin fallar ningun movimiento — sin límite de tiempo, es técnica y control, no velocidad.${complexClosingNote}${sharedPainNote}`,
          scoreAsWod: true,
        };
      }

      if (testVariant === 1) {
        const repMaxPercent = 0.65;
        // Tampoco se autorregula: la carga ya es submaxima a proposito, y hace falta la MISMA carga
        // en el retest para que las reps conseguidas sean comparables de verdad.
        const repMaxLoadKg = roundToNearestPlate(currentPR * repMaxPercent);
        const repMaxClosingNote =
          kind === 'retest'
            ? ' Es la misma carga y el mismo levantamiento de la semana 1 — compara las reps directamente.'
            : ' Referencia de partida: en la semana 8 repites esta misma carga para medir tu progreso real.';
        return {
          movementId,
          prKey: liftKey,
          sets: 1,
          // "Máximo" a secas — la tarjeta de WOD siempre añade la palabra "reps" detrás del valor,
          // asi que "Máximo de reps" duplicaria la palabra ("Máximo de reps reps").
          reps: 'Máximo',
          loadKg: repMaxLoadKg,
          format: `Test — Máximo de reps @ ${Math.round(repMaxPercent * 100)}%`,
          notes: `Semana ${weekNumber} de ${TEMPORADA_TOTAL_WEEKS} · con ${repMaxLoadKg} kg, consigue tantas repeticiones como puedas en una sola serie sin perder la técnica.${repMaxClosingNote}${sharedPainNote}`,
          scoreAsWod: true,
        };
      }

      // Igual que en el resto de la app, un test real nunca se descuenta por autorregulacion — un
      // maximo a intencion reducida no es un dato valido para comparar contra el cierre del bloque.
      const testLoadKg = roundToNearestPlate(currentPR);
      const closingNote =
        kind === 'retest'
          ? ' Es el mismo test que hiciste en la semana 1 de este bloque — compara el número directamente.'
          : ' Referencia de partida para todo el bloque: en la semana 8 repites este mismo test para medir tu progreso real.';
      return {
        movementId,
        prKey: liftKey,
        sets: 1,
        reps: '1',
        loadKg: testLoadKg,
        format: 'Test 1RM',
        notes: `Semana ${weekNumber} de ${TEMPORADA_TOTAL_WEEKS} · ${kind === 'test' ? 'test de apertura' : 'retest de cierre'} — calienta con series de aproximación y busca un nuevo máximo a 1 repetición. Tu referencia de hoy es ${testLoadKg} kg.${closingNote}${sharedPainNote}`,
      };
    }

    const tier = TEMPORADA_TIERS[Math.max(dayPlan.trainingDayIndex, 0) % TEMPORADA_TIERS.length];
    const percent = kind === 'deload' ? tier.basePercent - 0.1 : tier.basePercent + 0.025 * buildOffset;
    const loadKg = roundToNearestPlate(currentPR * percent * autoregFactor);
    const formatSuffix = kind === 'deload' ? 'descarga' : tier.label;

    if (tier.scoreAsWod) {
      // Reps totales fijas a un % fijo, puntuadas por tiempo (la barra se puede soltar cuantas
      // veces haga falta) — a diferencia de las 3 series normales, esto se puntua como un WOD, no
      // como una serie de fuerza clasica (mismo mecanismo `scoreAsWod` que el test de max reps).
      const repsForTimeNote =
        kind === 'deload'
          ? 'Descarga antes del retest — mismo esquema de reps, menos carga.'
          : `${tier.reps} repeticiones del mismo levantamiento — suelta la barra las veces que necesites, lo que cuenta es el tiempo total.`;
      return {
        movementId,
        prKey: liftKey,
        sets: tier.sets,
        reps: String(tier.reps),
        loadKg,
        format: `For Time · Bloque de Temporada · Semana ${weekNumber} de ${TEMPORADA_TOTAL_WEEKS} (${formatSuffix}) — ${tier.reps} reps @ ${Math.round(percent * 100)}%`,
        notes: `${repsForTimeNote}${sharedPainNote}`,
        scoreAsWod: true,
      };
    }

    const note =
      kind === 'deload'
        ? 'Descarga antes del retest — baja la intensidad a propósito para llegar fresco a la semana de cierre.'
        : `Ola ascendente ${tier.label} al ${Math.round(percent * 100)}% — cada semana sube 2.5% hasta la descarga antes del retest.`;
    return {
      movementId,
      prKey: liftKey,
      sets: tier.sets,
      reps: String(tier.reps),
      loadKg,
      format: `Bloque de Temporada · Semana ${weekNumber} de ${TEMPORADA_TOTAL_WEEKS} (${formatSuffix})`,
      notes: `${note}${sharedPainNote}`,
    };
  }

  if (program.method === 'ruso') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = RUSO_SCHEMES[week];
    const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor);
    return {
      movementId,
      prKey: liftKey,
      sets: scheme.sets,
      reps: String(scheme.reps),
      loadKg,
      format: scheme.label,
      notes: `${scheme.coachNote}${sharedPainNote}`,
    };
  }

  if (program.method === 'dieSet') {
    // A diferencia de todos los demas metodos, aqui el peso lo elige el atleta, no el motor — la
    // carga sugerida es solo un punto de partida editable (60% del PR), nunca la prescripcion real.
    // Tampoco hay progresion por semana: cada semana es estructuralmente la misma, el propio atleta
    // se autorregula con la regla de la nota segun lo que hizo la vez anterior (el motor no
    // persiste el peso elegido en ningun sitio para leerlo de vuelta — es deliberadamente el
    // atleta quien lleva la cuenta, igual que en el metodo real).
    const suggestedLoadKg = roundToNearestPlate(currentPR * 0.6 * autoregFactor);
    return {
      movementId,
      prKey: liftKey,
      sets: 1,
      reps: '8-15',
      loadKg: suggestedLoadKg,
      format: 'Die Set — Máximo de reps',
      notes: `Elige tú el peso (edita la carga si quieres empezar en otro número) buscando una serie de 8-15 repeticiones a máximo esfuerzo, con calentamiento previo progresivo. La próxima vez que te toque este levantamiento: si hoy haces menos de 8 reps, baja el peso; si haces entre 8 y 15, repite este mismo peso y busca superar tu marca; si superas las 15, sube el peso. ${suggestedLoadKg} kg es solo un punto de partida sugerido.${sharedPainNote}`,
      scoreAsWod: true,
    };
  }

  // ondulante
  const style = UNDULATING_STYLES[Math.max(dayPlan.trainingDayIndex, 0) % UNDULATING_STYLES.length];
  const loadKg = roundToNearestPlate(currentPR * style.percent * autoregFactor);
  return {
    movementId,
    prKey: liftKey,
    sets: style.sets,
    reps: String(style.reps),
    loadKg,
    format: style.label,
    notes: `${style.coachNote}${sharedPainNote}`,
  };
}
