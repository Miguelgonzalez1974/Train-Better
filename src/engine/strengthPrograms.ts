import type { PersonalRecords, StrengthProgram } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { DayPlan } from './periodization';
import { weeksSinceStart } from './periodization';
import { roundToNearestPlate } from './oneRepMaxTables';

export const DEFAULT_STRENGTH_PROGRAM_LIFTS: (keyof PersonalRecords)[] = ['backSquat', 'benchPress', 'deadlift', 'strictPress'];

export const STRENGTH_METHOD_LABEL: Record<StrengthProgram['method'], string> = {
  '531': '5/3/1',
  lineal: 'Lineal',
  ondulante: 'Ondulante',
  conjugado: 'Conjugado',
  ruso: 'Ruso / Sheiko',
  texas: 'Texas Method',
  juggernaut: 'Juggernaut Invertido',
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
const CONJUGATE_ME_VARIANTS: Partial<Record<keyof PersonalRecords, string[]>> = {
  backSquat: ['back-squat', 'box-squat', 'pause-back-squat', 'tempo-back-squat'],
  frontSquat: ['front-squat'],
  deadlift: ['deadlift', 'sumo-deadlift', 'deficit-deadlift', 'block-pull'],
  benchPress: ['bench-press', 'close-grip-bench-press', 'incline-bench-press', 'floor-press', 'spoto-press'],
  strictPress: ['strict-press', 'seated-strict-press', 'z-press'],
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
// Resolucion unificada
// ---------------------------------------------------------------------------

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
): StrengthProgramDay | null {
  const lifts = resolveProgramLifts(program);

  if (program.method === 'conjugado') {
    const cycleIndex = continuousTrainingDayIndex(program, dayPlan, today, trainingDaysPerWeek);
    const role = CONJUGATE_ROLE_CYCLE[cycleIndex % CONJUGATE_ROLE_CYCLE.length];
    const wantsLower = role === 'me-lower' || role === 'de-lower';
    const lowerLifts = lifts.filter(isLowerBodyLift);
    const upperLifts = lifts.filter((l) => !isLowerBodyLift(l));
    const liftKey = wantsLower
      ? pickConjugateLift(lowerLifts, Math.floor(cycleIndex / CONJUGATE_ROLE_CYCLE.length), lifts)
      : pickConjugateLift(upperLifts, Math.floor(cycleIndex / CONJUGATE_ROLE_CYCLE.length), lifts);
    if (!liftKey) return null;

    const isMaxEffort = role === 'me-lower' || role === 'me-upper';
    const currentPR = prs[liftKey];

    if (isMaxEffort) {
      const variantIndex = Math.floor(weeksSinceStart(program.startDate, today) / 2);
      const movementId = conjugateVariantMovementId(liftKey, variantIndex);
      const movement = getMovementById(movementId);
      if (!movement) return null;
      const referenceLoad = roundToNearestPlate(currentPR * 0.9 * autoregFactor);
      return {
        movementId,
        prKey: liftKey,
        sets: 1,
        reps: '1-3',
        loadKg: referenceLoad,
        format: `Conjugado · esfuerzo máximo (${movement.name})`,
        notes: `Sube en series hasta un máximo real de 1 a 3 repeticiones en esta variante, parando 1-2 reps antes del fallo técnico — ${referenceLoad} kg es solo tu referencia de partida, no el objetivo final. La variante rota cada 2 semanas para no acomodarte.`,
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
      notes: `8 series de 2-3 repeticiones a máxima velocidad de barra, descanso corto (45-60 seg) — el objetivo es potencia, no fatiga. Mantén siempre la misma técnica que en tu variante de esfuerzo máximo.`,
    };
  }

  if (program.method === 'texas') {
    const cycleIndex = continuousTrainingDayIndex(program, dayPlan, today, trainingDaysPerWeek);
    const role = TEXAS_ROLE_CYCLE[cycleIndex % TEXAS_ROLE_CYCLE.length];
    const liftKey = lifts[Math.floor(cycleIndex / TEXAS_ROLE_CYCLE.length) % lifts.length];
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
      notes: scheme.coachNote,
    };
  }

  if (program.method === 'juggernaut') {
    const liftKey = resolveProgramLift(program, dayPlan.trainingDayIndex);
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
      notes: `${scheme.coachNote} Series: ${loads.map((load, i) => `${scheme.steps[i].reps} @ ${load} kg`).join(', ')}.`,
    };
  }

  // 5/3/1, lineal, ondulante, ruso: un levantamiento fijo por dia de entreno (sin rotar por rol).
  const liftKey = resolveProgramLift(program, dayPlan.trainingDayIndex);
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
      notes: `${scheme.coachNote} Series: ${loads.map((load, i) => `${scheme.reps[i]} @ ${load} kg`).join(', ')}.`,
    };
  }

  if (program.method === 'lineal') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = LINEAL_SCHEMES[week];
    const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor);
    return { movementId, prKey: liftKey, sets: scheme.sets, reps: String(scheme.reps), loadKg, format: scheme.label, notes: scheme.coachNote };
  }

  if (program.method === 'ruso') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = RUSO_SCHEMES[week];
    const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor);
    return { movementId, prKey: liftKey, sets: scheme.sets, reps: String(scheme.reps), loadKg, format: scheme.label, notes: scheme.coachNote };
  }

  // ondulante
  const style = UNDULATING_STYLES[Math.max(dayPlan.trainingDayIndex, 0) % UNDULATING_STYLES.length];
  const loadKg = roundToNearestPlate(currentPR * style.percent * autoregFactor);
  return { movementId, prKey: liftKey, sets: style.sets, reps: String(style.reps), loadKg, format: style.label, notes: style.coachNote };
}
