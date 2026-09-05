import type { BenchmarkWorkout, Movement, MovementPattern } from '../data/movements/types';
import {
  getMovementById,
  getMovementsByBlock,
  benchmarkWorkouts,
  strengthMovements,
  olyMovements,
  skillMovements,
} from '../data/movements';
import { getSkillProgressionFor, skillProgressionStepAt, type SkillProgression } from '../data/movements/skillProgressions';
import type {
  AthleteProfile,
  DailySession,
  Goal,
  IntensityRamp,
  Macrocycle,
  PainFlag,
  PersonalRecords,
  ReadinessCheck,
  RxOrScaled,
  SessionBlockResult,
  SessionHistoryEntry,
  StrengthProgram,
  VariantPersonalRecords,
  WodResult,
} from '../data/athlete/types';
import { SESSION_GEN_VERSION } from '../data/athlete/types';
import {
  expectedStrengthSessionsPerWeek,
  getActiveMacrocycle,
  getDayPlan,
  getWeekdayIndex,
  isEmphasisDay,
  resolveDayEmphasis,
  resolveMacrocyclePhase,
  resolveWeekProgression,
  toLocalIsoDate,
  weeksSinceStart,
  type DayPlan,
  type OlyFamily,
} from './periodization';
import { OLY_WEEK_SCHEMES, roundToNearestPlate, STRENGTH_WEEK_SCHEMES } from './oneRepMaxTables';
import { getRecentMovementIds, pickLeastRecentlyUsed, pickManyVaried, pickVaried, pickVariedWithPreference } from './variability';
import { getGoalProgress, isGoalBehindSchedule } from './goalProgress';
import { pickPriorityGoal } from './goalPriority';
import {
  dominantWodDomain,
  ASCENDING_LADDER_FILLER_STEPS,
  ASCENDING_LADDER_SCHEMES,
  DESCENDING_LADDER_FILLER_STEPS,
  DESCENDING_LADDER_SCHEMES,
  generateWodName,
  getWodDomain,
  pickSmartBenchmark,
  resolveEnergySystem,
  resolveEnergySystemPlan,
  RISING_LOAD_INTERVAL_INCREMENT_PERCENT,
  RISING_LOAD_INTERVAL_STEPS,
  WOD_BARBELL_LOAD_PERCENT,
  WOD_PRESCRIPTION,
  WOD_TIME_DOMAIN,
  type EnergySystem,
  type WodFormatKind,
  type WodTimeDomain,
} from './wodDomains';
import {
  computeAcwr,
  computePatternFatigue,
  getPatternFatigueFactor,
  isPatternOvercooked,
  overcookedPatterns,
  type AcwrZone,
  type PatternFatigue,
} from './loadMetrics';
import { combineAutoregFactors, getAutoregFactor, getAutoregNote, getRpeAutoregFactor } from './autoregulation';
import { getReadinessCheckForDate, getReadinessFactor, READINESS_TEST_POSTPONE_NOTE } from './readiness';
import { resolveTrainingWeek, isTaperActive, DELOAD_REASON_NOTE } from './deload';
import { resolveOlyPRKey, resolveStrengthPRKey, resolveVariantPR, resolveVariantPRKey } from './prResolution';
import {
  avoidOlyFamilyRepeat,
  avoidPatternRepeat,
  WEAK_POINT_BIAS_CHANCE,
  weakestUntrainedOlyFamily,
  weakestUntrainedStrengthPattern,
  weeklyUnderTrainedPattern,
} from './movementBalance';
import { computeWeakPoints } from './weakPoints';
import { getImbalanceBias, type ImbalanceBias } from './imbalances';
import { buildMicrocyclePlan, type DayIntensity } from './weekPlan';
import { rng, withSeededRng } from './rng';
import {
  computeResponseProfile,
  engineResponseProfile,
  liftTierFor,
  bodyweightLoadFactor,
  perLiftLoadFactor,
  setFeelLoadFactor,
  stalledOlyFamily,
  stalledStrengthPattern,
  type ResponseProfile,
} from './responseProfile';
import { getActiveStrengthProgram, resolveStrengthProgramDay } from './strengthPrograms';
import { HALTERO_TOTAL_WEEKS, resolveHalteroDay } from './halteroProgram';
import { filterAvoidingPain, getAvoidedPatterns, getPainReintroFactor, getPainReintroPatterns } from './painFlags';
import { getRampFactor, isWodRampActive } from './intensityRamp';

export { OLY_ROOT_PR_MAP, resolveOlyPRKey, resolveStrengthPRKey, resolveVariantPRKey, STRENGTH_ROOT_PR_MAP } from './prResolution';

/**
 * Los mismos fragmentos que ya se concatenan en `notes` de un bloque (aviso de dolor, sesgo de
 * punto debil/balance semanal, rampa de vuelta, autorregulacion) tambien se recogen aparte, limpios
 * de espacios, para el resumen "por que tu sesion es asi hoy" (`DailySession.coachReasons`) — misma
 * fuente de verdad que el texto ya visible en el bloque, nunca una segunda logica que pueda
 * desincronizarse de el.
 */
function collectReasons(...fragments: (string | undefined)[]): string[] {
  return fragments.map((f) => f?.trim()).filter((f): f is string => Boolean(f));
}

/**
 * Con que probabilidad el motor prioriza el levantamiento/familia infra-desarrollado de un par en
 * desbalance (ver `getImbalanceBias`). Mas bajo que un objetivo activo — es un ajuste fino, no una
 * orden — y solo entra cuando nada mas alto (objetivo, hueco semanal, punto debil de patron) actua.
 */
const IMBALANCE_BIAS_CHANCE = 0.45;

/** Perfil de respuesta: frecuencia extra que gana el lift de un objetivo que progresa despacio/retrocede. */
const STALLED_LIFT_FREQ_BONUS = 0.15;
/** Perfil de respuesta: el sesgo de reporte de RPE (±2 pts) se traduce en un factor de carga acotado a ±3%. */
function clampResponseBias(rpeBias: number): number {
  return Math.min(1.03, Math.max(0.97, 1 + rpeBias * 0.015));
}

/**
 * Rol funcional de un movimiento dentro del bloque de accesorio. El dia de accesorio se construye
 * como 1-2 superseries "principal + contraste" (patron del dia 4 de Mayhem Burgener): pierna
 * unilateral + salto, empuje + tiron, etc. Los ids salen del catalogo (accessory / wod / strength) —
 * no hace falta que sean de bloque 'accessory', igual que en STRENGTH_SUPERSET_POOL.
 */
type AccessoryRole = 'unilateralLeg' | 'plyo' | 'posterior' | 'hPush' | 'vPush' | 'hPull' | 'vPull';

const ACCESSORY_ROLE_POOL: Record<AccessoryRole, string[]> = {
  unilateralLeg: ['walking-lunge', 'reverse-lunge', 'bulgarian-split-squat', 'step-up', 'cossack-squat'],
  plyo: ['box-jump', 'broad-jump', 'jumping-lunge'],
  posterior: ['romanian-deadlift', 'good-morning', 'back-extension', 'ghd-hip-extension', 'hip-thrust'],
  hPush: ['close-grip-bench-press', 'dumbbell-bench-press', 'push-up', 'dumbbell-floor-press', 'bench-press'],
  vPush: ['seated-strict-press', 'dumbbell-z-press', 'lateral-raise', 'strict-press'],
  hPull: ['pendlay-row', 'landmine-row', 'chest-supported-row', 'single-arm-dumbbell-row'],
  vPull: ['strict-pull-up', 'kipping-pull-up', 'chest-to-bar-pull-up', 'lat-pulldown'],
};

/** Familia del levantamiento principal de hoy -> las superseries de accesorio que mejor complementan. */
type StrengthFamily = 'lower' | 'push' | 'pull';

function strengthFamilyOf(pattern: MovementPattern): StrengthFamily {
  if (pattern === 'horizontalPush' || pattern === 'verticalPush') return 'push';
  if (pattern === 'horizontalPull' || pattern === 'verticalPull') return 'pull';
  return 'lower';
}

interface AccessorySupersetPlan {
  roles: [AccessoryRole, AccessoryRole];
  label: string;
  rationale: string;
}

const ACCESSORY_SUPERSET_PLAN: Record<StrengthFamily, AccessorySupersetPlan[]> = {
  lower: [
    { roles: ['unilateralLeg', 'plyo'], label: 'Pierna unilateral + salto', rationale: 'Corrige asimetrías de pierna y añade potencia sin recargar la sentadilla de hoy.' },
    { roles: ['hPull', 'vPull'], label: 'Tirón horizontal + vertical', rationale: 'Volumen de espalda para equilibrar la sesión de tren inferior.' },
  ],
  push: [
    { roles: ['hPull', 'vPull'], label: 'Tirón horizontal + vertical', rationale: 'Equilibrio empuje/tirón para proteger el hombro tras el press de hoy.' },
    { roles: ['unilateralLeg', 'posterior'], label: 'Pierna unilateral + cadena posterior', rationale: 'Mantenimiento de tren inferior a baja fatiga en un día de empuje.' },
  ],
  pull: [
    { roles: ['hPush', 'vPush'], label: 'Empuje horizontal + vertical', rationale: 'Equilibrio tirón/empuje tras el trabajo de espalda de hoy.' },
    { roles: ['unilateralLeg', 'plyo'], label: 'Pierna unilateral + salto', rationale: 'Potencia y simetría de pierna sin recargar el patrón de hoy.' },
  ],
};

/** Reps del accesorio por semana de meso — sube intensidad y baja reps hacia el pico, descarga en W4. */
const ACCESSORY_WEEK_SCHEME: Record<1 | 2 | 3 | 4, { reps: string; note: string }> = {
  1: { reps: '10-12', note: 'Sube la carga cada serie hasta un tope exigente; deja 2 repeticiones en reserva.' },
  2: { reps: '8-10', note: 'Sube la carga cada serie; la última debe costar de verdad (1-2 en reserva).' },
  3: { reps: '6-8', note: 'Series cortas y pesadas — para a 1 repetición del fallo.' },
  4: { reps: '12-15', note: 'Semana de descarga: carga moderada, técnica limpia, sin acercarte al fallo.' },
};

/** Patron de fuerza marcado "a trabajar" por computeWeakPoints -> rol de accesorio que lo refuerza. */
const WEAK_POINT_ACCESSORY_ROLE: Record<string, AccessoryRole> = {
  squat: 'unilateralLeg',
  hinge: 'posterior',
  horizontalPush: 'hPush',
  verticalPush: 'vPush',
};

/** Categorías del circuito de core — se rota entre ellas para que no sea siempre lo mismo. */
type CoreCategory = 'antiExtension' | 'antiRotation' | 'flexion' | 'carry';

const CORE_POOL: Record<CoreCategory, string[]> = {
  antiExtension: ['weighted-plank', 'dead-bug', 'ab-wheel-rollout', 'plank'],
  antiRotation: ['pallof-press', 'side-plank-hold'],
  flexion: ['toes-to-bar', 'ghd-situp', 'v-up', 'abmat-situp'],
  carry: ['farmers-carry', 'suitcase-carry'],
};

const CORE_REPS: Record<CoreCategory, string> = {
  antiExtension: '30-45 s',
  antiRotation: '10-12/lado',
  flexion: '12-15',
  carry: '30-40 m',
};

/** Orden de categorías de core segun el patron de fuerza del dia (lo primero pesa mas en la seleccion). */
const CORE_PRIORITY_BY_FAMILY: Record<StrengthFamily, CoreCategory[]> = {
  lower: ['antiExtension', 'carry', 'antiRotation', 'flexion'],
  push: ['antiRotation', 'flexion', 'antiExtension', 'carry'],
  pull: ['flexion', 'antiRotation', 'carry', 'antiExtension'],
};

/**
 * Segundo movimiento (A2) que se empareja en superserie con el levantamiento principal de fuerza,
 * por patron. Empuje -> su antagonista de tiron (equilibrio de hombro, estilo "bench + row" /
 * "press + laterales"); tren inferior -> cadena posterior o unilateral. Ids del catalogo de
 * accesorios.
 */
const STRENGTH_SUPERSET_POOL: Partial<Record<MovementPattern, string[]>> = {
  horizontalPush: ['single-arm-dumbbell-row', 'pendlay-row', 'landmine-row', 'chest-supported-row'],
  verticalPush: ['lateral-raise', 'face-pull', 'lat-pulldown', 'band-pull-apart'],
  squat: ['good-morning', 'back-extension', 'hip-thrust', 'bulgarian-split-squat'],
  hinge: ['ab-wheel-rollout', 'ghd-situp', 'weighted-plank', 'pallof-press'],
};

/**
 * Cuanto de a menudo el bloque de fuerza lleva un A2 en superserie. El press y el bench se
 * emparejan SIEMPRE con su tiron antagonista (salud de hombro); squat y peso muerto, con menos
 * frecuencia. En pico y descarga (semanas 3-4) vuelve a un solo movimiento: se recorta volumen.
 */
function strengthSupersetChance(pattern: MovementPattern, week: 1 | 2 | 3 | 4): number {
  if (week >= 3) return 0;
  return pattern === 'horizontalPush' || pattern === 'verticalPush' ? 1 : 0.6;
}

/** El A2 del bloque de fuerza (superserie con el levantamiento principal), o null si hoy no toca. */
function buildStrengthSuperset(
  pattern: MovementPattern,
  week: 1 | 2 | 3 | 4,
  mainMovementId: string,
  recentIds: Set<string>,
  avoidedPatterns: Set<MovementPattern>,
): SessionBlockResult | null {
  if (rng() >= strengthSupersetChance(pattern, week)) return null;
  const ids = STRENGTH_SUPERSET_POOL[pattern];
  if (!ids) return null;
  const pool = filterAvoidingPain(
    ids.map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m)),
    avoidedPatterns,
  );
  const pick = pickVaried(pool, new Set([...recentIds, mainMovementId]));
  if (!pick) return null;
  return {
    block: 'strength',
    movementId: pick.id,
    sets: 3,
    reps: '10-12',
    notes:
      'Superserie con el levantamiento principal (A2): carga moderada, deja 2-3 repeticiones en reserva — equilibra el patrón y suma volumen sin restarle a la barra pesada.',
  };
}

const WOD_FORMAT_RATIONALE: Record<WodFormatKind, string> = {
  forTime: 'Estímulo de intensidad — controla el ritmo en las primeras rondas para no colapsar al final.',
  amrap: 'Acumula el máximo de rondas de calidad — no sacrifiques técnica por velocidad.',
  emom: 'Gestiona el descanso dentro del minuto — la técnica manda sobre la velocidad.',
  interval: 'Cada intervalo debe sobrarte descanso — si llegas justo, baja el ritmo en el siguiente.',
  ladder: 'Empieza ligero y controlado: la exigencia real llega en las últimas rondas, no en la primera.',
  chipper: 'Una sola ronda larga — reparte el esfuerzo, no ataques los primeros movimientos como un sprint.',
  descendingLadder: 'Reps que bajan cada ronda — sal fuerte, el volumen real está en la primera ronda, no en la última.',
  ascendingLadder: 'Reps que suben cada ronda — dosifica desde el principio, el peligro real está en los últimos peldaños, no en los primeros.',
  risingInterval: 'Sube la exigencia cada ronda hasta que de verdad no puedas completarla en el tiempo — para ahí, no antes.',
  risingLoadInterval: 'Aquí sube el peso, no las reps — mantén la técnica intacta y para en la primera ronda que de verdad no completes.',
  descendingLadderFiller: 'El peaje de cardio entre cada tramo es fijo — el ritmo real se ajusta en el movimiento principal, no en el peaje.',
  ascendingLadderFiller: 'Sigue subiendo la escalera mientras quede reloj — anota en qué escalón te pilla el final.',
  barbellComplex: 'Tres movimientos de barra seguidos — reparte el esfuerzo entre los tres, no vacíes el depósito en el primero.',
};

/** Que tag de cooldown.ts encaja mejor con cada patron de fuerza del dia (ver buildCooldownBlock). */
const COOLDOWN_TAG_BY_PATTERN: Partial<Record<MovementPattern, string>> = {
  squat: 'especifico-squat',
  lunge: 'especifico-squat',
  hinge: 'especifico-hinge',
  verticalPush: 'especifico-strength',
  horizontalPush: 'especifico-strength',
  olyLift: 'especifico-oly',
};

type StrengthSchemeStyle = 'straightSets' | 'ascendingLadder' | 'volumeSets';

const STRENGTH_SCHEME_LABEL: Record<StrengthSchemeStyle, string> = {
  straightSets: 'Series rectas',
  ascendingLadder: 'Rampa ascendente',
  volumeSets: 'Volumen de acumulación',
};

const STRENGTH_SCHEME_NOTE: Record<StrengthSchemeStyle, string> = {
  straightSets: '',
  ascendingLadder: 'Las primeras series son de aproximación — sube la carga en cada una hasta la serie final, la que de verdad cuenta.',
  volumeSets: 'Serie de volumen a intensidad moderada para construir base de trabajo — prioriza completar todas las repeticiones sin fallar.',
};

/** Un coach no entrena la fuerza siempre igual: rota el estilo de la sesion en vez de series rectas todos los dias. */
/**
 * `preferVolume` (perfil de respuesta): si el levantamiento de hoy viene estancado en el historial
 * de PRs, se sube la probabilidad de un dia de volumen — mas tonelaje semanal es la primera
 * respuesta razonable a una meseta. Sigue siendo probabilistico: el lift no queda condenado a
 * volumen ligero perpetuo, sigue viendo dias de intensidad.
 */
function pickStrengthSchemeStyle(week: 1 | 2 | 3 | 4, preferVolume = false): StrengthSchemeStyle {
  if (week === 4) return rng() < 0.5 ? 'straightSets' : 'volumeSets';
  const roll = rng();
  if (preferVolume) {
    if (roll < 0.35) return 'straightSets';
    if (roll < 0.55) return 'ascendingLadder';
    return 'volumeSets';
  }
  if (roll < 0.55) return 'straightSets';
  if (roll < 0.8) return 'ascendingLadder';
  return 'volumeSets';
}

/**
 * Notacion de tempo real (ej. "3011", "10X0"): excentrica-pausa abajo-concentrica-pausa arriba,
 * "X"/"x" en cualquier posicion significa maxima velocidad. Un solo formateador en vez de una frase
 * escrita a mano por valor (como hacia el antiguo STRENGTH_SCHEME_NOTE.tempoWork) para que cualquier
 * notacion nueva se explique sola.
 */
const TEMPO_PHASE_LABELS = ['bajando', 'pausa abajo', 'subiendo', 'pausa arriba'] as const;

function describeTempoNotation(tempo: string): string {
  return tempo
    .split('')
    .map((char, i) => {
      const label = TEMPO_PHASE_LABELS[i];
      const isPause = i === 1 || i === 3;
      if (char.toUpperCase() === 'X') return isPause ? `${label} explosiva` : `máxima velocidad ${label}`;
      const seconds = Number(char);
      return isPause && seconds === 0 ? `sin ${label}` : `${seconds}s ${label}`;
    })
    .join(', ');
}

/**
 * El pool de tempos disponibles lo decide la fase (semana 1-2 acumulacion/intensificacion pide
 * control excentrico; semana 3 pico pide velocidad concentrica); semana 4 (descarga) no usa tempo,
 * anadir exigencia tecnica justo cuando toca bajar la demanda iria contra el proposito de esa semana.
 */
const TEMPO_POOL_BY_WEEK: Record<1 | 2 | 3, string[]> = {
  1: ['3011', '4010', '2020'],
  2: ['3011', '4010', '2020'],
  3: ['10X0', '20X0'],
};

const TEMPO_BASE_CHANCE_BY_WEEK: Record<1 | 2 | 3, number> = { 1: 0.35, 2: 0.25, 3: 0.12 };
/** Cuando el dia ya prioriza un patron (punto debil u objetivo activo), el coach recurre al tempo con mas frecuencia — reforzar control justo en el movimiento que ya le importa hoy, no un porcentaje desconectado del resto de decisiones del dia. */
const TEMPO_FOCUS_CHANCE = 0.6;

function pickTempoForDay(params: {
  week: 1 | 2 | 3 | 4;
  hasWeakPointFocus: boolean;
  hasGoalFocus: boolean;
  readinessIsLow: boolean;
}): string | undefined {
  const { week, hasWeakPointFocus, hasGoalFocus, readinessIsLow } = params;
  // Un test necesita un maximo real (sin cadencia impuesta) y una descarga busca bajar la demanda,
  // no anadir exigencia tecnica — en ambos casos el tempo no aplica, sea cual sea el resto de senales.
  if (week === 4 || readinessIsLow) return undefined;
  const chance = hasWeakPointFocus || hasGoalFocus ? Math.max(TEMPO_BASE_CHANCE_BY_WEEK[week], TEMPO_FOCUS_CHANCE) : TEMPO_BASE_CHANCE_BY_WEEK[week];
  if (rng() >= chance) return undefined;
  const pool = TEMPO_POOL_BY_WEEK[week];
  return pool[Math.floor(rng() * pool.length)];
}

export type TestDayFocus = 'strength' | 'oly' | null;

/**
 * Un coach testea maximos de vez en cuando, no solo en el WOD benchmark — concentrado en la semana
 * pico. Pero nunca testea fuerza maxima y el levantamiento completo de oly el mismo dia (demasiada
 * fatiga de golpe para un test real), asi que es una unica tirada que reparte la misma probabilidad
 * total de antes (35%) entre los dos focos en vez de dejar que compitan de forma independiente.
 */
function resolveTestDayFocus(week: 1 | 2 | 3 | 4): TestDayFocus {
  if (week !== 3) return null;
  const roll = rng();
  if (roll < 0.175) return 'strength';
  if (roll < 0.35) return 'oly';
  return null;
}

function resolveStrengthPR(movement: Movement, prs: PersonalRecords, variantPrs?: VariantPersonalRecords): number {
  const variant = resolveVariantPR(movement, variantPrs);
  if (variant !== undefined) return variant;
  const key = resolveStrengthPRKey(movement);
  return key ? prs[key] : prs.backSquat;
}

function resolveOlyPR(movement: Movement, prs: PersonalRecords, family: OlyFamily, variantPrs?: VariantPersonalRecords): number {
  const variant = resolveVariantPR(movement, variantPrs);
  if (variant !== undefined) return variant;
  if (movement.id === 'clean-and-jerk' || movement.id.includes('jerk')) return prs.cleanAndJerk;
  return family === 'snatch' ? prs.snatch : prs.clean;
}

interface GoalPreference {
  movementId?: string;
  preferChance: number;
  /** Progreso (0-1) del objetivo hacia su fecha, usado para intensificar gradualmente el sesgo. */
  progress: number;
  /** El objetivo concreto que gano la prioridad hoy, si alguno aplico. */
  goal?: Goal;
  /** true cuando hay evidencia real (no solo paso del calendario) de que el objetivo va por detras — ver isGoalBehindSchedule. */
  behindSchedule: boolean;
}

/**
 * Puede haber varios objetivos concurrentes que apliquen al mismo bloque (p.ej. dos objetivos de
 * tipo oly). Un coach real prioriza el mas urgente: el que tiene la fecha limite mas cercana.
 */
function goalPreference(
  goals: Goal[],
  appliesTo: (movement: Movement) => boolean,
  history: SessionHistoryEntry[],
): GoalPreference {
  const goal = pickPriorityGoal(goals, (g) => {
    if (!g.movementId) return false;
    const movement = getMovementById(g.movementId);
    return Boolean(movement && appliesTo(movement));
  });
  if (!goal || !goal.movementId) return { preferChance: 0, progress: 0, behindSchedule: false };

  const progress = getGoalProgress(goal, history);
  const behindSchedule = isGoalBehindSchedule(goal, history);
  const base = goal.emphasis === 'intensivo' ? 0.9 : 0.6;
  const ramped = goal.emphasis === 'intensivo' ? 0.95 : 0.75;
  // Ir por detras de verdad pesa mas que el enfasis elegido: un objetivo "moderado" que se esta
  // quedando atras se prioriza como si fuera intensivo, no se espera a que el calendario lo fuerce solo.
  const preferChance = behindSchedule ? Math.max(base + (ramped - base) * progress, 0.9) : base + (ramped - base) * progress;
  return { movementId: goal.movementId, preferChance, progress, goal, behindSchedule };
}

/** A partir del ultimo tercio antes de la fecha del objetivo, un enfasis "moderado" empieza a comportarse como "intensivo" — o en cuanto hay evidencia real de que el objetivo va por detras, sea cual sea el enfasis elegido. */
function actsIntensive(goal: Goal, progress: number, behindSchedule: boolean): boolean {
  return goal.emphasis === 'intensivo' || progress > 0.66 || behindSchedule;
}

/** Mismos 4 patrones que rotan por dia de entreno (ver periodization.ts) — se reutiliza aqui como pool de sustitucion cuando el patron del dia esta marcado como molesto. */
const STRENGTH_SUBSTITUTE_PATTERNS: MovementPattern[] = ['squat', 'hinge', 'verticalPush', 'horizontalPush'];

function buildStrengthBlock(
  dayPlan: DayPlan,
  week: 1 | 2 | 3 | 4,
  prs: PersonalRecords,
  recentIds: Set<string>,
  goals: Goal[],
  acwrZone: AcwrZone,
  acwrColdStart: boolean,
  isTestDay: boolean,
  history: SessionHistoryEntry[],
  avoidedPatterns: Set<MovementPattern>,
  rampFactor: number,
  variantPrs: VariantPersonalRecords | undefined,
  readinessCheck: ReadinessCheck | undefined,
  date: Date,
  trainingDaysPerWeek: 3 | 4 | 5 | 6,
  imbalanceBias: ImbalanceBias,
  painReintro: Map<MovementPattern, number>,
  patternFatigue: Map<MovementPattern, PatternFatigue>,
  responseProfile: ResponseProfile,
  /** Patron que el planificador de microciclo reservo para hoy (ver weekPlan.ts); null si no hay macro/plan. */
  plannedPattern: MovementPattern | null,
  /** Dosis del dia (progresion intra-fase x onda de intensidad) — ver `DayDose`. */
  dose: DayDose,
): { blocks: SessionBlockResult[]; pattern: MovementPattern; reasons: string[] } {
  const responseBias = clampResponseBias(responseProfile.rpe.bias);
  const rpeAutoreg = getRpeAutoregFactor(history, date, responseProfile.rpe.reliability);
  const readiness = getReadinessFactor(readinessCheck);
  const autoregFactor =
    combineAutoregFactors(getAutoregFactor(acwrZone), rpeAutoreg.factor, readiness.factor, responseBias) * rampFactor;
  const rampNote = rampFactor < 1 ? ' Rampa de vuelta activa — carga reducida a propósito mientras coges ritmo de nuevo.' : '';
  const autoregNote = [getAutoregNote(acwrZone, acwrColdStart), rpeAutoreg.note, readiness.note].filter(Boolean).join(' ') || undefined;
  const isStrengthGoal = goals.some((g) => g.type === 'elevar-fuerza' || g.type === 'subir-pr');
  const pref = isStrengthGoal
    ? goalPreference(goals, (m) => strengthMovements.some((s) => s.id === m.id), history)
    : { preferChance: 0, progress: 0, behindSchedule: false };
  // Perfil de respuesta: un lift del objetivo que viene progresando despacio (o retrocediendo)
  // recibe algo mas de frecuencia para desbloquearlo — solo si el motor ya se fia del perfil.
  let responseTag = '';
  if (pref.movementId) {
    const prKey = (() => {
      const mv = getMovementById(pref.movementId!);
      return mv ? (resolveStrengthPRKey(mv) ?? resolveVariantPRKey(mv)) : undefined;
    })();
    const tier = prKey ? liftTierFor(responseProfile, prKey) : null;
    if (tier === 'lento' || tier === 'regresion') {
      pref.preferChance = Math.min(0.95, pref.preferChance + STALLED_LIFT_FREQ_BONUS);
      responseTag =
        tier === 'regresion'
          ? ' Este levantamiento ha retrocedido últimamente — le damos más frecuencia para recuperar terreno.'
          : ' Este levantamiento progresa despacio en tu historial — más frecuencia para desbloquearlo.';
    }
  }

  // Base: lo que reservo el planificador de microciclo para este dia; si no hay plan, el ciclo natural.
  let pattern = plannedPattern ?? dayPlan.strengthPattern;
  let weakPointTag = '';
  // Si el objetivo va claramente por detras de su calendario (no solo "se acerca la fecha"), se
  // fuerza todos los dias que apliquen, no solo en los dias de enfasis alternos — un atleta que se
  // esta quedando atras de verdad no puede esperar a que le toque el turno.
  const goalForcedPattern = Boolean(
    pref.movementId &&
      pref.goal &&
      actsIntensive(pref.goal, pref.progress, pref.behindSchedule) &&
      (pref.behindSchedule || isEmphasisDay(dayPlan.trainingDayIndex)),
  );
  if (goalForcedPattern) {
    pattern = getMovementById(pref.movementId!)!.pattern;
  } else if (!plannedPattern) {
    // Sin plan de semana: se decide el patron dia a dia como antes. Con plan, el reparto ya
    // equilibro la semana (incluido el sesgo por estancamiento del perfil de respuesta) y esta
    // cadena reactiva se salta — pelearia contra una eleccion deliberada.
    // Antes de mirar puntos debiles a largo plazo, se corrige un desequilibrio real de la semana en
    // curso (p.ej. horizontalPush lleva 7 dias a cero mientras otro patron ya va por 2+) — el ciclo
    // natural de 4 patrones deja huecos estructurales para atletas de 3 o 6 dias/semana, y esto pesa
    // mas que el sesgo probabilistico de un punto flaco: no es una posibilidad, es un hueco real ya
    // confirmado en el historial de esta semana.
    // Un patron en reintroduccion progresiva (aviso de molestia recien retirado) o sobrecargado esta
    // semana (fatiga de zona) no se usa para forzar frecuencia extra: tras semanas evitandolo saldra
    // como "hueco" y como punto flaco, pero lo que toca es volver poco a poco / dejar asimilar, no
    // meterle un dia de mas. El ciclo natural si puede caer en el — a carga reducida (ver factores
    // reintroFactor / fatigueFactor mas abajo).
    const blockedForBias = (p: MovementPattern) => painReintro.has(p) || isPatternOvercooked(patternFatigue, p);
    const weeklyGapPattern = weeklyUnderTrainedPattern(history, date, expectedStrengthSessionsPerWeek(trainingDaysPerWeek));
    if (weeklyGapPattern && !blockedForBias(weeklyGapPattern)) {
      pattern = weeklyGapPattern;
      weakPointTag = ' Esta semana no había tocado este patrón todavía — se corrige antes de que se acumule el hueco.';
    } else {
      // Prioridad, en orden: un patron cuyo levantamiento raiz lleva estancado/en caida en el
      // historial real de PRs (señal concreta, no probabilistica) y, si no, el peor valorado por
      // `computeWeakPoints` (RPE/escalado/tendencia). Ninguno se aplica el 100% de las veces — un
      // coach da mas frecuencia al punto flaco, no reconstruye la semana entera alrededor de el.
      const stalledPattern = stalledStrengthPattern(responseProfile);
      const weakPattern = weakestUntrainedStrengthPattern(computeWeakPoints(history), history);
      if (stalledPattern && !blockedForBias(stalledPattern) && rng() < WEAK_POINT_BIAS_CHANCE) {
        pattern = stalledPattern;
        weakPointTag = ' Este patrón lleva estancado en tu historial de PRs — prioridad de frecuencia para desbloquearlo.';
      } else if (weakPattern && !blockedForBias(weakPattern) && rng() < WEAK_POINT_BIAS_CHANCE) {
        pattern = weakPattern;
        weakPointTag = ' Prioridad extra hoy: este patrón lleva estancado, le damos más frecuencia.';
      }
    }
  }
  // Se aplica siempre que el objetivo no este forzando el patron por ir atrasado: el ciclo natural
  // de la semana tambien puede coincidir con lo entrenado el dia anterior (p.ej. entre semanas). Si
  // el atleta va detras de un objetivo de verdad, evitar la repeticion iria en contra de lo que se
  // acaba de decidir — mas frecuencia es exactamente el punto.
  if (!(goalForcedPattern && pref.behindSchedule)) {
    pattern = avoidPatternRepeat(pattern, history);
  }

  // Si el patron de hoy coincide con un aviso de molestia activo, se sustituye por otro de los 4
  // patrones habituales que no este marcado — un coach real no ignora un aviso de dolor solo
  // porque "hoy tocaba" ese movimiento.
  let painTag = '';
  if (avoidedPatterns.has(pattern)) {
    const substitute = STRENGTH_SUBSTITUTE_PATTERNS.find((p) => p !== pattern && !avoidedPatterns.has(p));
    if (substitute) {
      painTag = ` Cambiado de ${pattern === 'squat' ? 'sentadilla' : pattern === 'hinge' ? 'bisagra de cadera' : pattern === 'verticalPush' ? 'press vertical' : 'press horizontal'} — tienes un aviso de molestia activo que lo evita.`;
      pattern = substitute;
    }
  }

  // Reintroduccion progresiva: si el patron final de hoy sale de un aviso de molestia retirado hace
  // poco, la carga vuelve en rampa (0.6 -> 1.0 en PAIN_REINTRO_WEEKS) en vez de saltar al 100%.
  const reintroFactor = getPainReintroFactor(painReintro, [pattern]);
  const reintroNote =
    reintroFactor < 1 ? ' Reintroducción progresiva tras tu aviso de molestia — la carga de este patrón vuelve poco a poco, no de golpe.' : '';

  // Fatiga de zona: si este patron acumula bastante mas carga que su norma esta semana (ACWR por
  // patron), se baja algo el peso — puntual y acotado, encima ya actua el ACWR global.
  const fatigueFactor = getPatternFatigueFactor(patternFatigue, [pattern]);
  const fatigueNote =
    fatigueFactor < 1 ? ' Este patrón lleva bastante carga esta semana — bajamos algo el peso para que la zona asimile.' : '';

  const candidates = getMovementsByBlock('strength').filter((m) => m.pattern === pattern);

  // Sesgo de desbalance: dentro del patron que ya toca hoy, inclina hacia el levantamiento
  // infra-desarrollado de un par en desbalance. Solo si ningun objetivo reclama movimiento y
  // ninguna correccion de patron (hueco semanal / punto debil) ha actuado — es el ajuste mas fino,
  // cede ante todo lo demas y no genera una segunda nota de "prioridad".
  let imbalanceTag = '';
  let preferId = pref.movementId;
  let preferChance = pref.preferChance;
  if (!pref.movementId && weakPointTag === '' && !painReintro.has(pattern) && !isPatternOvercooked(patternFatigue, pattern)) {
    const imbId = imbalanceBias.strengthLiftIds.find((id) => candidates.some((c) => c.id === id));
    if (imbId) {
      preferId = imbId;
      preferChance = IMBALANCE_BIAS_CHANCE;
      imbalanceTag = ' Hoy priorizamos este levantamiento: va flojo respecto a otro de su grupo y lo equilibramos.';
    }
  }
  const movement = pickVariedWithPreference(candidates, recentIds, preferId, preferChance);
  if (!movement) return { blocks: [], pattern, reasons: [] };

  // Perfil de respuesta: ¿el levantamiento concreto de hoy viene estancado? (puede diferir del del objetivo)
  const todayLiftKey = resolveStrengthPRKey(movement) ?? resolveVariantPRKey(movement);
  const todayLiftStalled = todayLiftKey
    ? liftTierFor(responseProfile, todayLiftKey) === 'lento' || liftTierFor(responseProfile, todayLiftKey) === 'regresion'
    : false;

  // Perfil de respuesta: calibracion de carga de la serie de trabajo de ESTE levantamiento. Si el
  // atleta ha registrado series reales ("hice X kg x Y @ RPE Z"), se usa el factor por e1RM medido
  // (mas preciso); si no, el cualitativo del feedback de la 1ª serie. Ambos acotados; 1 = sin efecto.
  const loadCalibFactor = perLiftLoadFactor(responseProfile, todayLiftKey);
  const setFeelFactor = loadCalibFactor !== 1 ? loadCalibFactor : setFeelLoadFactor(responseProfile, todayLiftKey);
  const setFeelNote =
    loadCalibFactor !== 1
      ? ` Ajustado a tu 1RM estimado por las series reales que registraste en este levantamiento (${loadCalibFactor > 1 ? 'ibas sobrado, subimos' : 'venías justo, bajamos'}).`
      : setFeelFactor < 1
        ? ' Tus valoraciones de la primera serie en este levantamiento venían pesadas — ajustamos la carga un pelín a la baja.'
        : setFeelFactor > 1
          ? ' Tus valoraciones de la primera serie en este levantamiento venían sobradas — subimos la carga un pelín.'
          : '';
  // Perfil de respuesta: si el atleta viene perdiendo peso corporal, menos margen de recuperacion — carga algo mas baja.
  const bwFactor = bodyweightLoadFactor(responseProfile);
  const bwNote =
    bwFactor < 1 ? ' Vienes perdiendo peso corporal — bajamos un poco la carga hasta que se estabilice.' : '';

  const currentPR = resolveStrengthPR(movement, prs, variantPrs);
  const goalTag =
    pref.movementId && movement.id === pref.movementId
      ? pref.behindSchedule
        ? ' Vas por detrás de tu objetivo — le damos más peso hasta que te pongas al día.'
        : ' Prioridad por tu objetivo activo.'
      : '';

  if (isTestDay) {
    const testLoadKg = roundToNearestPlate(currentPR);
    const testReintroNote = reintroFactor < 1 ? ' Vienes de una molestia en este patrón — si no lo notas al 100%, plantéate posponer el test unos días.' : '';
    const testReasons = collectReasons(weakPointTag, imbalanceTag, painTag, testReintroNote, fatigueNote, rampNote, readiness.isLow ? READINESS_TEST_POSTPONE_NOTE : undefined);
    return {
      blocks: [
        {
          block: 'strength',
          movementId: movement.id,
          format: 'Test 1RM',
          reps: '1',
          loadKg: testLoadKg,
          notes: `Test de fuerza máxima — calienta con aproximaciones y busca un nuevo máximo a 1 rep. Referencia: ${testLoadKg} kg.${goalTag}${testReintroNote}${readiness.isLow ? READINESS_TEST_POSTPONE_NOTE : ''}`,
        },
      ],
      pattern,
      reasons: testReasons,
    };
  }

  // Superserie: el A2 se empareja con el levantamiento principal (bench + remo, press + laterales…).
  // Nunca en un dia de test. Los 3 estilos de esquema comparten el mismo A2.
  const supersetEntry = buildStrengthSuperset(pattern, week, movement.id, recentIds, avoidedPatterns);
  const withSuperset = (main: SessionBlockResult): SessionBlockResult[] => (supersetEntry ? [main, supersetEntry] : [main]);

  const scheme = STRENGTH_WEEK_SCHEMES[week];
  // Dosis del dia sobre las series: nunca menos de 2 ni mas de 2 por encima del esquema base.
  const setsFor = (base: number): number => Math.min(base + 2, Math.max(2, Math.round(base * dose.strengthSets)));
  const style = pickStrengthSchemeStyle(week, todayLiftStalled);
  const styleNote = STRENGTH_SCHEME_NOTE[style];
  // La rampa ascendente ya construye hacia una serie casi maxima — ningun documento real prescribe
  // tempo lento justo ahi, asi que solo straightSets/volumeSets son candidatas.
  const tempo =
    style === 'ascendingLadder'
      ? undefined
      : pickTempoForDay({
          week,
          hasWeakPointFocus: Boolean(weakPointTag),
          hasGoalFocus: Boolean(goalTag),
          readinessIsLow: readiness.isLow,
        });
  const tempoNote = tempo ? ` Tempo ${tempo} — ${describeTempoNotation(tempo)}.` : '';
  // La nota del bloque se queda con lo específico de ESTE levantamiento (esquema, estilo, objetivo,
  // tempo, y las causas cortas de que el peso se desvíe: sensación previa, rampa, reintro, fatiga).
  // El "por qué hoy" de la sesión entera (ACWR/RPE/readiness, punto débil, desbalance, peso
  // corporal, perfil de respuesta) va SOLO a `coachReasons` — ver el resumen "Avisos del coach".
  const notes = `${scheme.coachNote}${styleNote ? ` ${styleNote}` : ''}${goalTag}${setFeelNote}${painTag}${reintroNote}${fatigueNote}${rampNote}${tempoNote}`;
  const reasons = collectReasons(responseTag, setFeelNote, bwNote, weakPointTag, imbalanceTag, painTag, reintroNote, fatigueNote, rampNote, autoregNote, tempoNote);

  if (style === 'ascendingLadder') {
    const topPercent = Math.min(scheme.percent + 0.08, 0.92);
    return {
      blocks: withSuperset({
        block: 'strength',
        movementId: movement.id,
        format: STRENGTH_SCHEME_LABEL.ascendingLadder,
        sets: 3,
        reps: '5-3-1',
        loadKg: roundToNearestPlate(currentPR * topPercent * autoregFactor * reintroFactor * fatigueFactor * setFeelFactor * bwFactor),
        notes,
      }),
      pattern,
      reasons,
    };
  }

  if (style === 'volumeSets') {
    const volumePercent = Math.max(scheme.percent - 0.12, 0.45);
    return {
      blocks: withSuperset({
        block: 'strength',
        movementId: movement.id,
        format: STRENGTH_SCHEME_LABEL.volumeSets,
        sets: setsFor(scheme.sets + 1),
        reps: String(scheme.reps + 4),
        loadKg: roundToNearestPlate(currentPR * volumePercent * autoregFactor * reintroFactor * fatigueFactor * setFeelFactor * bwFactor * dose.strengthLoad),
        notes,
        ...(tempo ? { tempo } : {}),
      }),
      pattern,
      reasons,
    };
  }

  const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor * reintroFactor * fatigueFactor * setFeelFactor * bwFactor * dose.strengthLoad);
  return {
    blocks: withSuperset({
      block: 'strength',
      movementId: movement.id,
      sets: setsFor(scheme.sets),
      reps: String(scheme.reps),
      loadKg,
      notes,
      ...(tempo ? { tempo } : {}),
    }),
    pattern,
    reasons,
  };
}

/**
 * Drills de recepcion por familia — el primer del complejo cuando un desbalance `direction: 'high'`
 * dice que el limite es recibir abajo (ver `getImbalanceBias`). El snatch tiene versiones de
 * recepcion puras en el catalogo; el clean no (se apoya solo en el sesgo hacia el lift completo).
 */
const RECEIVING_PRIMER_IDS: Record<OlyFamily, string[]> = {
  snatch: ['snatch-balance', 'overhead-squat'],
  clean: [],
};

/**
 * Factor de carga del primer del complejo sobre el % del esquema, segun su tipo — un tiron o un
 * hang NO es un drill ligero, se hace casi al peso del levantamiento; solo los tecnicos puros
 * (muscle, tall, tres posiciones) van de verdad ligeros. El `0.75` plano de antes dejaba, p.ej.,
 * un hang clean en ~46% del PR, que no tiene sentido (deberia rondar 60-70%).
 */
function primerLoadFactor(primerId: string): number {
  if (/pull|deadlift/.test(primerId)) return 1.0; // clean/snatch pull, high-pull, deadlift — como el lift
  if (primerId.includes('hang')) return 0.9; // hang clean/snatch (from / above knee)
  if (/balance|overhead-squat|dip-drill/.test(primerId)) return 0.9; // trabajo de recepcion
  return 0.7; // muscle, tall, tres-posiciones... — drill tecnico ligero de verdad
}

function buildOlyBlock(
  dayPlan: DayPlan,
  week: 1 | 2 | 3 | 4,
  prs: PersonalRecords,
  recentIds: Set<string>,
  goals: Goal[],
  acwrZone: AcwrZone,
  acwrColdStart: boolean,
  isTestDay: boolean,
  history: SessionHistoryEntry[],
  avoidedPatterns: Set<MovementPattern>,
  rampFactor: number,
  variantPrs: VariantPersonalRecords | undefined,
  readinessCheck: ReadinessCheck | undefined,
  date: Date,
  imbalanceBias: ImbalanceBias,
  painReintro: Map<MovementPattern, number>,
  patternFatigue: Map<MovementPattern, PatternFatigue>,
  responseProfile: ResponseProfile,
  /** Familia que el planificador de microciclo reservo para hoy (ver weekPlan.ts); null si no hay macro/plan. */
  plannedFamily: OlyFamily | null,
  /** Dosis del dia — solo se usa `strengthLoad` para que la carga de oly progrese dentro de la fase (el volumen de oly no se toca). */
  dose: DayDose,
): { blocks: SessionBlockResult[]; reasons: string[] } {
  // El snatch y el clean & jerk cargan hombro y cadera a la vez por naturaleza — no hay una
  // variante "segura" dentro de oly si cualquiera de las dos zonas tiene un aviso activo, asi que
  // ese dia se salta el bloque entero en vez de forzar una sustitucion que no evita el patron real.
  if (avoidedPatterns.has('olyLift')) {
    return { blocks: [], reasons: ['Oly saltado hoy — tienes un aviso de molestia activo que afecta a hombro o cadera.'] };
  }

  const responseBias = clampResponseBias(responseProfile.rpe.bias);
  const rpeAutoreg = getRpeAutoregFactor(history, date, responseProfile.rpe.reliability);
  const readiness = getReadinessFactor(readinessCheck);
  // Reintroduccion progresiva: si un aviso de hombro/cadera se retiro hace poco, el oly (que carga
  // ambas zonas) vuelve en rampa de carga, no de golpe.
  const reintroFactor = getPainReintroFactor(painReintro, ['olyLift']);
  const reintroNote =
    reintroFactor < 1 ? ' Reintroducción progresiva tras tu aviso de molestia — la carga olímpica vuelve poco a poco.' : '';
  // Fatiga de zona: si el trabajo olimpico acumula mucha carga esta semana respecto a su norma, se
  // baja algo el peso para que hombro y cadera asimilen.
  const fatigueFactor = getPatternFatigueFactor(patternFatigue, ['olyLift']);
  const fatigueNote =
    fatigueFactor < 1 ? ' El trabajo olímpico lleva bastante carga esta semana — carga algo más baja para que hombro y cadera asimilen.' : '';
  const autoregFactor =
    combineAutoregFactors(getAutoregFactor(acwrZone), rpeAutoreg.factor, readiness.factor, responseBias) * rampFactor * reintroFactor * fatigueFactor;
  const rampNote = rampFactor < 1 ? ' Rampa de vuelta activa — carga reducida a propósito mientras coges ritmo de nuevo.' : '';
  const autoregNote = [getAutoregNote(acwrZone, acwrColdStart), rpeAutoreg.note, readiness.note].filter(Boolean).join(' ') || undefined;
  const isOlyGoal = goals.some((g) => g.type === 'mejorar-potencia' || g.type === 'subir-pr');
  const pref = isOlyGoal
    ? goalPreference(goals, (m) => olyMovements.some((o) => o.id === m.id), history)
    : { preferChance: 0, progress: 0, behindSchedule: false };
  // Perfil de respuesta: un levantamiento olimpico del objetivo que progresa despacio gana algo de frecuencia.
  let responseTag = '';
  if (pref.movementId) {
    const mv = getMovementById(pref.movementId);
    const prKey = mv ? (resolveOlyPRKey(mv) ?? resolveVariantPRKey(mv)) : undefined;
    const tier = prKey ? liftTierFor(responseProfile, prKey) : null;
    if (tier === 'lento' || tier === 'regresion') {
      pref.preferChance = Math.min(0.95, pref.preferChance + STALLED_LIFT_FREQ_BONUS);
      responseTag = ' Este levantamiento progresa despacio en tu historial — más frecuencia para desbloquearlo.';
    }
  }

  let family = plannedFamily ?? dayPlan.olyFamily;
  let weakPointTag = '';
  const goalForcedFamily = Boolean(
    pref.movementId &&
      pref.goal &&
      actsIntensive(pref.goal, pref.progress, pref.behindSchedule) &&
      (pref.behindSchedule || isEmphasisDay(dayPlan.trainingDayIndex)),
  );
  if (goalForcedFamily) {
    family = pref.movementId!.includes('snatch') ? 'snatch' : 'clean';
  } else if (!plannedFamily) {
    // Sin plan de semana: se decide la familia dia a dia. Con plan ya viene alternada y con el
    // ancla del objetivo/estancamiento, asi que esta cadena reactiva se salta.
    // Mismo orden que en fuerza: primero una familia con un levantamiento estancado/en caida en el
    // historial real de PRs, si no la peor valorada en `computeWeakPoints`, si no el sesgo de desbalance.
    const stalledFam = stalledOlyFamily(responseProfile);
    const weakFamily = weakestUntrainedOlyFamily(computeWeakPoints(history), history);
    if (stalledFam && rng() < WEAK_POINT_BIAS_CHANCE) {
      family = stalledFam;
      weakPointTag = ' Esta familia lleva estancada en tu historial de PRs — más frecuencia para desbloquearla.';
    } else if (weakFamily && rng() < WEAK_POINT_BIAS_CHANCE) {
      family = weakFamily;
      weakPointTag = ' Prioridad extra hoy: esta familia lleva estancada, le damos más frecuencia.';
    } else if (weakPointTag === '' && imbalanceBias.olyFamilies.length > 0 && rng() < IMBALANCE_BIAS_CHANCE) {
      // Sin punto debil de familia que corregir, inclina hacia la familia infra-desarrollada de un
      // par en desbalance (p.ej. snatch bajo respecto al clean). Mismo mecanismo, prioridad menor.
      family = imbalanceBias.olyFamilies[0];
      weakPointTag = ' Prioridad hoy: esta familia va floja respecto a la otra — la equilibramos.';
    }
  }
  // Se aplica siempre que el objetivo no este forzando la familia por ir atrasado (ver buildStrengthBlock):
  // el ciclo natural tambien puede coincidir con lo entrenado el dia anterior (p.ej. entre semanas
  // en calendarios de 3 dias).
  if (!(goalForcedFamily && pref.behindSchedule)) {
    family = avoidOlyFamilyRepeat(family, history);
  }

  // Desbalance `direction: 'high'`: la variante de potencia de esta familia va demasiado cerca del
  // levantamiento completo -> el limite es recibir abajo, no el tiron. Hoy se prioriza la version
  // completa (recepcion en sentadilla) y un primer de recepcion, sea cual sea la semana.
  const receivingFocus = imbalanceBias.receivingFamilies.includes(family);
  const receivingTag = receivingFocus
    ? ` Tu ${family === 'snatch' ? 'power snatch' : 'power clean'} va muy cerca de tu levantamiento completo — hoy el foco es recibir abajo (${
        family === 'snatch' ? 'snatch balance / overhead squat, recepción profunda' : 'recepción en sentadilla completa'
      }), no la fuerza de tirón.`
    : '';

  const fullLiftIds = family === 'snatch' ? ['snatch'] : ['clean-and-jerk', 'clean'];
  let candidates = getMovementsByBlock('oly').filter((m) =>
    family === 'snatch' ? m.id.includes('snatch') : m.id.includes('clean') || m.id.includes('jerk'),
  );

  const isEarlyWeek = week <= 2 && !receivingFocus;
  const biased = isEarlyWeek
    ? candidates.filter((m) => !fullLiftIds.includes(m.id))
    : candidates.filter((m) => fullLiftIds.includes(m.id));
  if (biased.length > 0) candidates = biased;

  if (pref.movementId && !candidates.some((c) => c.id === pref.movementId)) {
    const preferredMovement = getMovementById(pref.movementId);
    const sameFamily = preferredMovement && (family === 'snatch' ? preferredMovement.id.includes('snatch') : true);
    if (preferredMovement && sameFamily) candidates = [...candidates, preferredMovement];
  }

  const movement = pickVariedWithPreference(candidates, recentIds, pref.movementId, pref.preferChance);
  if (!movement) return { blocks: [], reasons: [] };

  if (isTestDay && fullLiftIds.includes(movement.id)) {
    const testLoadKg = roundToNearestPlate(resolveOlyPR(movement, prs, family, variantPrs));
    const goalTag =
      pref.movementId && movement.id === pref.movementId
        ? pref.behindSchedule
          ? ' Vas por detrás de tu objetivo — le damos más peso hasta que te pongas al día.'
          : ' Prioridad por tu objetivo activo.'
        : '';
    const liftLabel = family === 'snatch' ? 'snatch' : 'clean & jerk';
    const testReasons = collectReasons(weakPointTag, fatigueNote, rampNote, readiness.isLow ? READINESS_TEST_POSTPONE_NOTE : undefined);
    return {
      blocks: [
        {
          block: 'oly',
          movementId: movement.id,
          format: 'Test 1RM',
          reps: '1',
          loadKg: testLoadKg,
          notes: `Test de máximo en ${liftLabel} — calienta con aproximaciones técnicas y busca un nuevo máximo a 1 rep. Referencia: ${testLoadKg} kg.${goalTag}${readiness.isLow ? READINESS_TEST_POSTPONE_NOTE : ''}`,
        },
      ],
      reasons: testReasons,
    };
  }

  const scheme = OLY_WEEK_SCHEMES[week];
  // Perfil de respuesta: calibracion de carga de este lift — e1RM medido de series reales si lo hay,
  // si no el feedback cualitativo de la 1ª serie (ver buildStrengthBlock).
  const olyLiftKey = resolveOlyPRKey(movement) ?? resolveVariantPRKey(movement);
  const loadCalibFactor = perLiftLoadFactor(responseProfile, olyLiftKey);
  const setFeelFactor = loadCalibFactor !== 1 ? loadCalibFactor : setFeelLoadFactor(responseProfile, olyLiftKey);
  const setFeelNote =
    loadCalibFactor !== 1
      ? ` Ajustado a tu 1RM estimado por las series reales que registraste (${loadCalibFactor > 1 ? 'ibas sobrado, subimos' : 'venías justo, bajamos'}).`
      : setFeelFactor < 1
        ? ' Tus valoraciones de la primera serie en este levantamiento venían pesadas — ajustamos la carga un pelín a la baja.'
        : setFeelFactor > 1
          ? ' Tus valoraciones de la primera serie en este levantamiento venían sobradas — subimos la carga un pelín.'
          : '';
  const bwFactor = bodyweightLoadFactor(responseProfile);
  const bwNote = bwFactor < 1 ? ' Vienes perdiendo peso corporal — bajamos un poco la carga hasta que se estabilice.' : '';
  const loadKg = roundToNearestPlate(
    resolveOlyPR(movement, prs, family, variantPrs) * scheme.percent * autoregFactor * setFeelFactor * bwFactor * dose.strengthLoad,
  );
  // Igual que en fuerza: la nota del bloque solo lleva lo de ESTE levantamiento (esquema, objetivo,
  // sensación previa, foco de recepción, rampa/reintro/fatiga). El "por qué hoy" de la sesión
  // (ACWR/RPE/readiness, punto débil, peso corporal, perfil de respuesta) va solo a `coachReasons`.
  const baseNote =
    (pref.movementId && movement.id === pref.movementId
      ? `${scheme.coachNote}${
          pref.behindSchedule ? ' Vas por detrás de tu objetivo — le damos más peso hasta que te pongas al día.' : ' Prioridad por tu objetivo activo.'
        }`
      : scheme.coachNote) +
    setFeelNote +
    receivingTag +
    reintroNote +
    fatigueNote +
    rampNote;
  const reasons = collectReasons(responseTag, setFeelNote, bwNote, weakPointTag, receivingTag, reintroNote, fatigueNote, rampNote, autoregNote);

  // Semana pico: siempre series rectas (consolidar tecnica al maximo esfuerzo). Resto de semanas: variabilidad de formato.
  // EMOM es un estilo del levantamiento principal, no reemplaza el complejo de 2 movimientos (primer + principal).
  const canUseEmom = week !== 3;
  const useEmom = canUseEmom && rng() < 0.3;

  let mainEntry: SessionBlockResult;
  if (useEmom) {
    const emomMinutes = [8, 10, 12][Math.floor(rng() * 3)];
    mainEntry = {
      block: 'oly',
      movementId: movement.id,
      reps: '1 rep/min',
      loadKg,
      notes: `${baseNote} Formato EMOM ${emomMinutes} min: una repetición técnica cada minuto.`,
    };
  } else {
    const repStyleNote =
      scheme.reps >= 2
        ? 'Toca y sigue (touch-and-go): encadena las repeticiones sin soltar la barra para acumular volumen técnico.'
        : 'Repeticiones individuales: resetea la posición por completo en cada una — prioriza la técnica a esta intensidad.';

    mainEntry = {
      block: 'oly',
      movementId: movement.id,
      sets: scheme.sets,
      reps: String(scheme.reps),
      loadKg,
      notes: `${baseNote} ${repStyleNote}`,
    };
  }

  // Calentamiento especifico de barra, al inicio del bloque de Oly (que se hace despues del WOD, ya
  // en caliente): Burgener con PVC segun la familia -> complejo de barra vacia -> rampa de carga en
  // 3-4 series hasta el primer peso de trabajo. Nada de movilidad/articular aqui: eso ya se hizo
  // arriba. Ver `buildWarmupBlock` para el reparto por fases.
  const barbellPrimer: SessionBlockResult[] = [
    {
      block: 'oly',
      movementId: family === 'snatch' ? 'burgener-warmup-snatch' : 'burgener-warmup-clean',
      subgroup: 'Calentamiento de barra',
      reps: 'PVC · 3-5 reps/posición',
      notes: `Ya vienes en caliente del WOD — aquí solo barra, sin movilidad. Burgener con PVC y complejo de barra vacía, y luego sube en 3-4 series hasta tu primer peso de trabajo (${loadKg} kg). Prioriza posiciones y velocidad de codos, no la carga.`,
    },
    { block: 'oly', movementId: 'barbell-warmup-complex', subgroup: 'Calentamiento de barra', reps: '2-3 rondas' },
    { block: 'oly', movementId: 'movement-specific-primer', subgroup: 'Calentamiento de barra', reps: '3-4 series ascendentes', loadKg },
  ];

  // Complejo real de oly: un primer tecnico (hang, muscle, pull, balance...) antes del levantamiento
  // principal, no un movimiento aislado — asi se entrena de verdad en programacion profesional.
  const familyPool = getMovementsByBlock('oly').filter((m) =>
    family === 'snatch' ? m.id.includes('snatch') : m.id.includes('clean') || m.id.includes('jerk'),
  );
  const primerCandidates = familyPool.filter((m) => m.id !== movement.id && m.progressionOf);
  // Con foco de recepcion, el primer se elige entre drills de recibir abajo (solo el snatch tiene
  // versiones de recepcion puras en el catalogo; el clean se apoya solo en el sesgo de arriba).
  const receivingPrimers = receivingFocus
    ? primerCandidates.filter((m) => RECEIVING_PRIMER_IDS[family].includes(m.id))
    : [];
  const primerMovement = pickVaried(receivingPrimers.length > 0 ? receivingPrimers : primerCandidates, recentIds);
  if (!primerMovement) return { blocks: [...barbellPrimer, mainEntry], reasons };

  const primerLoadKg = roundToNearestPlate(
    resolveOlyPR(primerMovement, prs, family, variantPrs) * scheme.percent * primerLoadFactor(primerMovement.id) * autoregFactor,
  );
  const primerEntry: SessionBlockResult = {
    block: 'oly',
    movementId: primerMovement.id,
    sets: scheme.sets,
    reps: '2-3',
    notes: `Primer técnico antes del levantamiento principal — prioriza posición, no peso.${
      receivingPrimers.length > 0 ? ' Hoy es un drill de recepción: recibe lo más abajo posible.' : ''
    }${autoregNote ? ` ${autoregNote}` : ''}`,
    loadKg: primerLoadKg,
  };

  return { blocks: [...barbellPrimer, primerEntry, mainEntry], reasons };
}

/**
 * Cada cuantos dias de benchmark se fuerza un retest deliberado de un benchmark real ya hecho
 * (~5-6 semanas a 1 benchmark/semana). Se mide en dias transcurridos desde el ultimo intento
 * conocido (no un contador acumulado) porque el historial es una ventana rodante de HISTORY_LIMIT
 * sesiones: un contador absoluto se desincroniza en cuanto empiezan a expirar entradas antiguas.
 */
const RETEST_INTERVAL = 6;

function formatIsoDateShort(iso: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00`));
}

function countBenchmarkDaySessions(history: SessionHistoryEntry[]): number {
  return history.filter((entry) => entry.movementIds.some((id) => id.startsWith('benchmark:'))).length;
}

/** Dias de benchmark ocurridos estrictamente despues de una fecha dada, dentro del historial visible. */
function benchmarkDaysSince(history: SessionHistoryEntry[], sinceDateIso: string): number {
  return history.filter(
    (entry) => entry.date > sinceDateIso && entry.movementIds.some((id) => id.startsWith('benchmark:')),
  ).length;
}

/** Domino predominante del ultimo benchmark completado, para que el siguiente no repita el mismo estimulo. */
function getLastBenchmarkDomain(history: SessionHistoryEntry[]): ReturnType<typeof dominantWodDomain> | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const benchmarkId = history[i].movementIds.find((id) => id.startsWith('benchmark:'))?.replace('benchmark:', '');
    if (!benchmarkId) continue;
    const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
    if (wod) return dominantWodDomain(wod.movements);
  }
  return null;
}

/**
 * Busca el benchmark real (girl/hero/open, no custom) cuyo ultimo intento registrado sea el mas
 * antiguo — el mas "atrasado" para un retest. Un coach de verdad no reintroduce piezas custom sin
 * identidad propia para medir progreso, solo los benchmarks reconocibles.
 */
function findRetestCandidate(
  history: SessionHistoryEntry[],
): { wod: BenchmarkWorkout; prevDate: string; prevResult: WodResult } | null {
  const lastAttempt = new Map<string, { date: string; result: WodResult }>();
  for (const entry of history) {
    if (!entry.wodResult) continue;
    const benchmarkId = entry.movementIds.find((id) => id.startsWith('benchmark:'))?.replace('benchmark:', '');
    if (!benchmarkId) continue;
    const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
    if (!wod || wod.category === 'custom') continue;
    lastAttempt.set(benchmarkId, { date: entry.date, result: entry.wodResult });
  }
  if (lastAttempt.size === 0) return null;

  const [oldestId, info] = [...lastAttempt.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date))[0];
  const wod = benchmarkWorkouts.find((w) => w.id === oldestId)!;
  return { wod, prevDate: info.date, prevResult: info.result };
}

export interface RetestHeadsUp {
  name: string;
  /** Marca anterior formateada (ej. "4:32", "8+12"). */
  prevValue: string;
  /** Fecha ISO del intento anterior. */
  prevDate: string;
  /** true si la puntuacion es tiempo (bajar es mejorar). */
  lowerIsBetter: boolean;
}

/**
 * Aviso anticipado de retest: el motor ya decide "hoy toca retest de X" el propio dia (dentro de
 * `buildWodBlock`), pero el atleta se entera sin margen para prepararse. Esto mira si el benchmark
 * real mas atrasado esta a punto de tocar (this o el proximo dia de benchmark) para poder avisar
 * antes. No cambia nada del motor — es una lectura pura para un banner en Planificacion.
 */
export function peekRetestHeadsUp(
  history: SessionHistoryEntry[],
  today: Date,
  trainingDaysPerWeek: 3 | 4 | 5 | 6,
): RetestHeadsUp | null {
  const candidate = findRetestCandidate(history);
  if (!candidate) return null;

  // Se avisa cuando ya toca o falta un solo dia de benchmark para que toque.
  const since = benchmarkDaysSince(history, candidate.prevDate);
  if (since < RETEST_INTERVAL - 1) return null;

  // El dia-de ya lo cubre la nota del bloque WOD (lunes / dia de benchmark). Aqui solo interesa
  // el aviso previo, en un dia que no sea el propio dia de benchmark.
  if (getDayPlan(getWeekdayIndex(today), trainingDaysPerWeek).trainingDayIndex === 0) return null;

  return {
    name: candidate.wod.name,
    prevValue: candidate.prevResult.value,
    prevDate: candidate.prevDate,
    lowerIsBetter: candidate.wod.scoreType === 'time',
  };
}

/**
 * Escalera (ascendente o descendente) con un "peaje" de monoestructural fijo entre cada escalon —
 * cada escalon y cada peaje son su propia entrada en el bloque, en el orden real en que se hacen
 * (main, peaje, main, peaje...). No hace falta ningun campo nuevo en SessionBlockResult: la tarjeta
 * ya numera las entradas del WOD en orden, asi que una secuencia intercalada se representa tal cual
 * es, sin inventar una sub-estructura de "pasos" separada.
 */
function buildLadderFillerEntries(
  main: Movement,
  filler: Movement,
  steps: number[],
  loadKg: number | undefined,
  format: string,
  title: string,
  notes: string,
): SessionBlockResult[] {
  const entries: SessionBlockResult[] = [];
  for (const reps of steps) {
    entries.push({ block: 'wod', movementId: main.id, reps: String(reps), loadKg, format, title, notes });
    entries.push({ block: 'wod', movementId: filler.id, reps: WOD_PRESCRIPTION[filler.id] ?? '10 cal', format, title, notes });
  }
  return entries;
}

/**
 * Intervalo hasta el fallo donde el peso sube cada ronda en vez de las reps — un movimiento de
 * barra/olimpico a reps fijas subiendo de carga, emparejado con un movimiento gimnastico a reps
 * fijas que no cambia. Solo tiene sentido para un levantamiento con PR real (WOD_BARBELL_LOAD_PERCENT),
 * por eso este formato nunca se ofrece en mantenimiento (ver buildMaintenanceWodBlock).
 */
function buildRisingLoadIntervalEntries(
  barbell: Movement,
  fixed: Movement,
  basePercent: number,
  pr: number,
  format: string,
  title: string,
  notes: string,
): SessionBlockResult[] {
  const entries: SessionBlockResult[] = [];
  for (let step = 0; step < RISING_LOAD_INTERVAL_STEPS; step++) {
    const percent = basePercent + RISING_LOAD_INTERVAL_INCREMENT_PERCENT * step;
    const loadKg = roundToNearestPlate(pr * percent);
    entries.push({ block: 'wod', movementId: barbell.id, reps: WOD_PRESCRIPTION[barbell.id] ?? '5-8', loadKg, format, title, notes });
    entries.push({ block: 'wod', movementId: fixed.id, reps: WOD_PRESCRIPTION[fixed.id] ?? '8-12', format, title, notes });
  }
  return entries;
}

/**
 * Triada de barra + peaje de monoestructural entre cada movimiento (ej. Deadlift/Power Clean/Push
 * Jerk con dobles entre cada uno) — mismo principio que `buildLadderFillerEntries` pero con 3
 * movimientos principales a reps fijas en vez de una escalera. El numero de rondas se comunica en
 * `format` (igual que ya hace el resto de formatos con `timeDomain.rounds`), no se repiten las 6
 * entradas por cada ronda real.
 */
function buildBarbellComplexEntries(
  mains: Movement[],
  filler: Movement,
  prs: PersonalRecords,
  format: string,
  title: string,
  notes: string,
): SessionBlockResult[] {
  const entries: SessionBlockResult[] = [];
  for (const m of mains) {
    const barbellPercent = WOD_BARBELL_LOAD_PERCENT[m.id];
    const prKey = barbellPercent ? (resolveStrengthPRKey(m) ?? resolveOlyPRKey(m)) : undefined;
    const loadKg = prKey ? roundToNearestPlate(prs[prKey] * barbellPercent) : undefined;
    entries.push({ block: 'wod', movementId: m.id, reps: WOD_PRESCRIPTION[m.id] ?? '8-10', loadKg, format, title, notes });
    entries.push({ block: 'wod', movementId: filler.id, reps: WOD_PRESCRIPTION[filler.id] ?? '20-25', format, title, notes });
  }
  return entries;
}

/**
 * Cada dia de entreno lleva WOD; lo que cambia con el enfasis del dia es cuanto: en un dia de
 * fuerza el metcon es corto y de bajo impacto (el presupuesto de recuperacion va a la barra), en un
 * dia de metcon es mas largo, y en un dia mixto es el de siempre. Factor sobre rondas/minutos, ADEMAS
 * del `energy.durationScale` de la fase.
 */
const EMPHASIS_WOD_SCALE: Record<'mixto' | 'fuerza' | 'metcon', number> = {
  fuerza: 0.6,
  mixto: 1,
  metcon: 1.15,
};

/**
 * Dosis del dia: la progresion DENTRO del mesociclo (ver `resolveWeekProgression`) por la onda de
 * intensidad dura/media/suave de la semana (ver `planDayIntensity`), ya combinadas y acotadas. Se
 * calcula una vez en `generateDailySession` y se pasa a los bloques.
 */
interface DayDose {
  /** Multiplicador sobre rondas/minutos del WOD. */
  wodVolume: number;
  /** Multiplicador sobre el numero de series de fuerza y accesorio. */
  strengthSets: number;
  /** Multiplicador (pequeño) sobre la carga de fuerza. */
  strengthLoad: number;
  /** Intensidad relativa del dia, para las notas. */
  dayIntensity: DayIntensity;
}

/** Factores de la onda de intensidad del dia — un dia 'alta' empuja un pelin, un 'baja' recorta volumen (y algo de carga). */
const INTENSITY_VOL: Record<DayIntensity, number> = { alta: 1.05, media: 1, baja: 0.9 };
const INTENSITY_LOAD: Record<DayIntensity, number> = { alta: 1, media: 1, baja: 0.97 };

const clampDose = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function buildWodBlock(
  dayPlan: DayPlan,
  week: 1 | 2 | 3 | 4,
  trainingDaysPerWeek: 3 | 4 | 5 | 6,
  recentIds: Set<string>,
  excludePatterns: Set<MovementPattern>,
  goals: Goal[],
  isTaper: boolean,
  history: SessionHistoryEntry[],
  wodRampActive: boolean,
  prs: PersonalRecords,
  responseProfile: ResponseProfile,
  dayEmphasis: 'mixto' | 'fuerza' | 'metcon',
  /** Sistema energetico que el planificador de microciclo asigno a HOY (ver weekPlan.ts); null sin
   *  macro/plan -> cae al dominante de la fase. */
  plannedEnergy: EnergySystem | null,
  /** Dosis del dia (progresion intra-fase x onda de intensidad) — ver `DayDose`. */
  dose: DayDose,
): SessionBlockResult[] {
  // Dia de fuerza: el WOD no debe competir con el trabajo pesado de barra que ya se ha hecho —
  // formatos ciclicos de duracion acotada (nada de escaleras al fallo, chippers, complejos de
  // barra ni intervalos de carga creciente), mas monoestructural, y el patron con carga al final
  // del reparto para minimizar solapamiento.
  const lowInterferenceWod = dayEmphasis === 'fuerza';
  const recentBenchmarkIds = new Set(
    [...recentIds].filter((id) => id.startsWith('benchmark:')).map((id) => id.replace('benchmark:', '')),
  );

  const competicionGoal = pickPriorityGoal(goals, (g) => g.type === 'preparar-competicion');
  const competicionProgress = competicionGoal ? getGoalProgress(competicionGoal, history) : 0;
  // Perfil de respuesta: si el RPE del atleta da poca señal, el coach tiene menos feedback real de
  // cuanto se esta exigiendo — asi que fuerza menos testeo extra a maximo esfuerzo (solo muy cerca
  // de la competicion) y se apoya mas en el ACWR.
  const rpeUnreliable = responseProfile.rpe.reliability < 0.7;
  // En taper no se fuerza testeo extra: un coach real no busca fatiga nueva a dias de competir.
  // Tampoco durante la rampa de vuelta: un test/retest a maximo esfuerzo es justo lo que se quiere
  // evitar mientras el atleta esta cogiendo ritmo de nuevo.
  const forceBenchmarkByGoal =
    !isTaper &&
    !wodRampActive &&
    Boolean(competicionGoal) &&
    (competicionProgress > (rpeUnreliable ? 0.9 : 0.8) ||
      ((competicionGoal!.emphasis === 'intensivo' || competicionProgress > (rpeUnreliable ? 0.6 : 0.4)) &&
        isEmphasisDay(dayPlan.trainingDayIndex)));

  // En semana pico se testea mas: un segundo dia de benchmark a mitad de la semana de entreno — pero
  // no si no nos fiamos del RPE (ver arriba).
  const isPeakWeekExtraBenchmark =
    !wodRampActive && !rpeUnreliable && week === 3 && dayPlan.trainingDayIndex === Math.floor(trainingDaysPerWeek / 2);

  if (!wodRampActive && (dayPlan.trainingDayIndex === 0 || isPeakWeekExtraBenchmark || forceBenchmarkByGoal)) {
    // Retest deliberado: si el benchmark real mas atrasado lleva RETEST_INTERVAL dias de benchmark
    // sin repetirse, hoy se vuelve a hacer ese mismo para medir progreso real contra una marca anterior.
    const retestCandidate = !isTaper ? findRetestCandidate(history) : null;
    const isRetestDue = retestCandidate ? benchmarkDaysSince(history, retestCandidate.prevDate) >= RETEST_INTERVAL : false;

    if (retestCandidate && isRetestDue) {
      const { wod, prevDate, prevResult } = retestCandidate;
      const chaseNote = wod.scoreType === 'time' ? 'Intenta bajar ese tiempo.' : 'Intenta superar esa marca.';
      return [
        {
          block: 'wod',
          movementId: `benchmark:${wod.id}`,
          format: wod.format,
          notes: `${wod.name} — ${wod.format}. Retest: tu marca del ${formatIsoDateShort(prevDate)} fue ${prevResult.value}. ${chaseNote}`,
        },
      ];
    }

    if (!isTaper && !retestCandidate) {
      // Aun no hay ningun benchmark real (girl/hero/open) con marca registrada en el historial
      // visible: sembramos uno real hoy, cada RETEST_INTERVAL dias de benchmark, en vez de dejarlo
      // al azar entre un pool dominado por piezas custom sin identidad propia que comparar.
      const benchmarkDayCount = countBenchmarkDaySessions(history);
      const dueForSeed = benchmarkDayCount > 0 && benchmarkDayCount % RETEST_INTERVAL === 0;
      if (dueForSeed) {
        const realPool = benchmarkWorkouts.filter((w) => w.category !== 'custom' && !recentBenchmarkIds.has(w.id));
        const seedPool = realPool.length > 0 ? realPool : benchmarkWorkouts.filter((w) => w.category !== 'custom');
        if (seedPool.length > 0) {
          const wod = pickSmartBenchmark(seedPool, week, getLastBenchmarkDomain(history));
          return [
            {
              block: 'wod',
              movementId: `benchmark:${wod.id}`,
              format: wod.format,
              notes: `${wod.name} — ${wod.format}. Benchmark de referencia: registra bien tu marca, en unas semanas lo repetimos para medir progreso real.`,
            },
          ];
        }
      }
    }

    const freshBenchmarks = benchmarkWorkouts.filter((w) => !recentBenchmarkIds.has(w.id));
    const pool = freshBenchmarks.length > 0 ? freshBenchmarks : benchmarkWorkouts;
    const wod = pickSmartBenchmark(pool, week, getLastBenchmarkDomain(history));
    return [
      {
        block: 'wod',
        movementId: `benchmark:${wod.id}`,
        format: wod.format,
        notes: `${wod.name} — ${wod.format}. WOD de referencia: usa el resultado para medir tu progreso real.`,
      },
    ];
  }

  const filtered = getMovementsByBlock('wod').filter((m) => !excludePatterns.has(m.pattern));
  const pool = filtered.length >= 3 ? filtered : getMovementsByBlock('wod');

  const baseDomain = WOD_TIME_DOMAIN[week];
  const isPeakWeek = week === 3;

  // Periodizacion del acondicionamiento en dos niveles: la FASE marca el sistema energetico
  // dominante y el planificador de microciclo ROTA el sistema de cada dia a su alrededor (para no
  // encadenar el mismo estimulo dos dias seguidos). El plan resultante ajusta la duracion sobre el
  // time domain de la semana, empuja mas o menos cardio ciclico y sesga que formatos salen. Sin
  // plan de dia (no deberia pasar en el motor periodizado) cae al dominante de la fase.
  const energy = plannedEnergy ? resolveEnergySystemPlan(plannedEnergy) : resolveEnergySystem(week);
  const emphasisScale = EMPHASIS_WOD_SCALE[dayEmphasis];
  // Escala total del WOD: fase (duracion del sistema energetico) x enfasis del dia x dosis del dia
  // (progresion intra-fase + onda de intensidad), acotada de golpe para que los tres factores no se
  // compongan hasta un extremo (un AMRAP de 30 min o de 4).
  const wodScale = clampDose(energy.durationScale * emphasisScale * dose.wodVolume, 0.6, 1.35);
  const timeDomain: WodTimeDomain = {
    rounds: Math.max(2, Math.round(baseDomain.rounds * wodScale)),
    amrapMin: Math.max(lowInterferenceWod ? 8 : 6, Math.round(baseDomain.amrapMin * wodScale)),
    emomMin: Math.max(lowInterferenceWod ? 8 : 6, Math.round(baseDomain.emomMin * wodScale)),
  };

  // Semana pico: formatos cortos e intensos, sin chipper largo ni escalera de acumulacion de volumen.
  // Rampa de vuelta: mismo criterio que la semana pico, por la razon contraria — nada de formatos
  // largos de alto volumen mientras el atleta esta cogiendo ritmo de nuevo.
  const isChipperDay = !isPeakWeek && !wodRampActive && !lowInterferenceWod && rng() < 0.15;
  const regularFormats: { label: string; kind: WodFormatKind }[] = [
    { label: `For Time (${timeDomain.rounds} rondas)`, kind: 'forTime' },
    { label: `AMRAP ${timeDomain.amrapMin} min`, kind: 'amrap' },
    { label: `EMOM ${timeDomain.emomMin} min (movimientos alternos)`, kind: 'emom' },
    { label: `Cada 3:00 x ${timeDomain.rounds} rondas`, kind: 'interval' },
    ...(isPeakWeek || wodRampActive || lowInterferenceWod
      ? []
      : [
          { label: `Escalera ascendente · ${timeDomain.rounds} rondas (+3 reps/ronda)`, kind: 'ladder' as WodFormatKind },
          { label: 'For Time', kind: 'descendingLadder' as WodFormatKind },
          { label: 'For Time', kind: 'ascendingLadder' as WodFormatKind },
          { label: 'Cada 3:00 hasta el fallo (+3 reps/ronda)', kind: 'risingInterval' as WodFormatKind },
          { label: 'Cada 1:30 hasta el fallo (+peso cada ronda)', kind: 'risingLoadInterval' as WodFormatKind },
          { label: `${DESCENDING_LADDER_FILLER_STEPS.join('-')} + peaje`, kind: 'descendingLadderFiller' as WodFormatKind },
          { label: `AMRAP ${timeDomain.amrapMin} min — escalera + peaje`, kind: 'ascendingLadderFiller' as WodFormatKind },
          { label: `${timeDomain.rounds} Rondas — Tríada de barra`, kind: 'barbellComplex' as WodFormatKind },
        ]),
  ];
  // Sesgo de formato por sistema energetico: los formatos que la fase favorece pesan ~3x, sin
  // excluir el resto (misma filosofia que pickVariedWithPreference). Opera dentro de la lista ya
  // filtrada por pico/rampa, asi que nunca reintroduce un formato descartado.
  const preferredFormats = regularFormats.filter((f) => energy.preferFormats.includes(f.kind));
  const formatPool = preferredFormats.length > 0 ? [...regularFormats, ...preferredFormats, ...preferredFormats] : regularFormats;
  const chosenFormat = isChipperDay
    ? { label: 'Chipper — 1 ronda completa', kind: 'chipper' as WodFormatKind }
    : formatPool[Math.floor(rng() * formatPool.length)];
  // Escalera compartida, ascendente o descendente — misma pareja de movimientos, misma cifra de
  // reps para los dos, solo cambia si cuenta hacia arriba o hacia abajo (Fran/Diane/Elizabeth son
  // descendentes; "Climb the Ladder" es la version ascendente del mismo patron).
  const isSharedLadder = chosenFormat.kind === 'descendingLadder' || chosenFormat.kind === 'ascendingLadder';
  // Esta pareja es siempre eso, una pareja, nunca un triplete.
  const movementCount = chosenFormat.kind === 'chipper' ? 5 : isSharedLadder ? 2 : 3;

  const resistenciaGoal = pickPriorityGoal(goals, (g) => g.type === 'elevar-resistencia');
  const resistenciaProgress = resistenciaGoal ? getGoalProgress(resistenciaGoal, history) : 0;
  // Suelo de cardio ciclico por fase (base aerobica y descarga empujan 2 monoestructurales); un
  // objetivo de resistencia puede subirlo mas.
  let monoTarget = energy.monoFloor;
  if (resistenciaGoal) {
    const emphasisTarget = resistenciaGoal.emphasis === 'intensivo' ? 2 : 1;
    const progressTarget = resistenciaProgress > 0.5 ? 2 : 1;
    monoTarget = Math.max(monoTarget, emphasisTarget, progressTarget);
  }
  // Dia de fuerza: al menos 2 de los 3 movimientos ciclicos -> el metcon corto queda aerobico y de
  // bajo impacto, sin volver a exigir los patrones que ya han cargado en la barra.
  if (lowInterferenceWod) monoTarget = Math.max(monoTarget, 2);

  // Mismo mecanismo de sesgo que ya usan fuerza y skill (goalPreference + pickVariedWithPreference):
  // si el atleta tiene un objetivo de fuerza/potencia sobre un lift que ademas es de los habilitados
  // para WOD (ver WOD_BARBELL_LOAD_PERCENT), ese lift aparece con mas frecuencia como el movimiento
  // "con carga" del WOD, no solo en su bloque de fuerza dedicado. Si el objetivo no aplica a ningun
  // lift de WOD (p.ej. un objetivo de gimnasticos), preferChance queda a 0 y no cambia nada.
  const wodLiftPref = goalPreference(goals, (m) => m.id in WOD_BARBELL_LOAD_PERCENT, history);

  // Trifecta clasica de CrossFit: 1 gimnastico + 1 con carga + 1 monoestructural cuando es posible.
  const gymnasticsPool = pool.filter((m) => getWodDomain(m.id) === 'gymnastics');
  const weightedPool = pool.filter((m) => getWodDomain(m.id) === 'weighted');
  const monoPool = pool.filter((m) => getWodDomain(m.id) === 'monostructural');
  // Orden de relleno segun fase del macrociclo: en acumulacion/intensificacion (semana 1-2) hay mas
  // margen para tolerar volumen de barra, asi que "con carga" se prueba primero; en pico/descarga
  // (semana 3-4) se prueba al final — mismo criterio conservador que ya usa el resto del motor esas
  // semanas (nada de chipper ni escalera), aqui aplicado a que domina el WOD en vez de a su formato.
  const domainCycle =
    lowInterferenceWod || week > 2 ? [gymnasticsPool, monoPool, weightedPool] : [weightedPool, gymnasticsPool, monoPool];

  const title = generateWodName();
  const wodRampNote = wodRampActive ? ' Rampa de vuelta activa — formato más suave a propósito.' : '';
  // El énfasis del día (fuerza/metcon) y el sistema energético van a `coachReasons` (emphasisNote /
  // energyReason) — la nota del bloque se queda solo con cómo atacar este formato + la rampa.
  const notes = `${WOD_FORMAT_RATIONALE[chosenFormat.kind]}${wodRampNote}`;

  if (chosenFormat.kind === 'barbellComplex') {
    const usedForComplex = new Set(recentIds);
    const mains = pickManyVaried(weightedPool, 3, usedForComplex);
    mains.forEach((m) => usedForComplex.add(m.id));
    const filler = pickVaried(monoPool, usedForComplex);
    if (mains.length === 3 && filler) {
      return buildBarbellComplexEntries(mains, filler, prs, chosenFormat.label, title, notes);
    }
    // No hay suficiente variedad de movimientos con carga distintos hoy (pool filtrado muy corto) —
    // cae al reparto normal de abajo en vez de forzar una triada incompleta.
  }

  if (chosenFormat.kind === 'risingLoadInterval') {
    // Solo movimientos con PR real detras (WOD_BARBELL_LOAD_PERCENT) — subir peso cada ronda no
    // tiene sentido sobre un movimiento sin una referencia de carga propia.
    const barbellCandidates = weightedPool.filter((m) => m.id in WOD_BARBELL_LOAD_PERCENT);
    const usedForRisingLoad = new Set(recentIds);
    const barbell = pickVariedWithPreference(barbellCandidates, usedForRisingLoad, wodLiftPref.movementId, wodLiftPref.preferChance);
    if (barbell) {
      usedForRisingLoad.add(barbell.id);
      const fixed = pickVaried(gymnasticsPool, usedForRisingLoad);
      const prKey = resolveStrengthPRKey(barbell) ?? resolveOlyPRKey(barbell);
      if (fixed && prKey) {
        return buildRisingLoadIntervalEntries(barbell, fixed, WOD_BARBELL_LOAD_PERCENT[barbell.id], prs[prKey], chosenFormat.label, title, notes);
      }
    }
    // Sin candidatos con PR hoy (patron excluido, etc.) — cae al reparto normal de abajo.
  }

  if (chosenFormat.kind === 'descendingLadderFiller' || chosenFormat.kind === 'ascendingLadderFiller') {
    const isAscending = chosenFormat.kind === 'ascendingLadderFiller';
    const mainPool = rng() < 0.5 ? weightedPool : gymnasticsPool;
    const usedForLadder = new Set(recentIds);
    const main = pickVariedWithPreference(mainPool, usedForLadder, wodLiftPref.movementId, wodLiftPref.preferChance);
    if (main) {
      usedForLadder.add(main.id);
      const filler = pickVaried(monoPool, usedForLadder);
      if (filler) {
        const steps = isAscending ? ASCENDING_LADDER_FILLER_STEPS : DESCENDING_LADDER_FILLER_STEPS;
        const barbellPercent = WOD_BARBELL_LOAD_PERCENT[main.id];
        const prKey = barbellPercent ? (resolveStrengthPRKey(main) ?? resolveOlyPRKey(main)) : undefined;
        const loadKg = prKey ? roundToNearestPlate(prs[prKey] * barbellPercent) : undefined;
        const laddedNotes = isAscending ? `${notes} Sigue +2 reps cada escalón hasta que se acabe el reloj.` : notes;
        return buildLadderFillerEntries(main, filler, steps, loadKg, chosenFormat.label, title, laddedNotes);
      }
    }
    // Sin candidatos suficientes hoy (pool corto tras excluir patrones) — cae al reparto normal.
  }

  const picks: Movement[] = [];
  const usedIds = new Set(recentIds);

  function pickFrom(domainPool: Movement[], preferredId?: string, preferChance = 0): void {
    const remaining = domainPool.filter((m) => !picks.some((p) => p.id === m.id));
    const fallback = pool.filter((m) => !picks.some((p) => p.id === m.id));
    const candidates = remaining.length > 0 ? remaining : fallback;
    const pick = preferredId ? pickVariedWithPreference(candidates, usedIds, preferredId, preferChance) : pickVaried(candidates, usedIds);
    if (pick) {
      picks.push(pick);
      usedIds.add(pick.id);
    }
  }

  if (isSharedLadder) {
    // Pareja clasica barra + gimnastico (Fran = thruster+pull-up, Diane = deadlift+HSPU, Elizabeth =
    // clean+dip; "Climb the Ladder" sigue el mismo patron en su version ascendente) — nunca dos
    // movimientos con carga ni dos gimnasticos en este formato en concreto.
    pickFrom(weightedPool, wodLiftPref.movementId, wodLiftPref.preferChance);
    pickFrom(gymnasticsPool);
  } else {
    pickFrom(gymnasticsPool);
    for (let i = 0; i < monoTarget && picks.length < movementCount; i++) pickFrom(monoPool);
    // Indice de relleno propio en vez de reusar `picks.length` contra `domainCycle`: con
    // monoTarget=1 (el caso normal) picks.length ya vale 2 al llegar aqui, asi que
    // `domainCycle[picks.length % 3]` caia siempre en monoPool (indice 2) y el dominio "con carga"
    // (indice 0) nunca se alcanzaba en un WOD de 3 movimientos — la trifecta de verdad nunca se
    // completaba pese a que el comentario de arriba diga que si. Un contador que arranca en 0 aqui
    // sí cicla de verdad por los 3 dominios.
    let fillIndex = 0;
    while (picks.length < movementCount) {
      const domain = domainCycle[fillIndex % domainCycle.length];
      if (domain === weightedPool) pickFrom(domain, wodLiftPref.movementId, wodLiftPref.preferChance);
      else pickFrom(domain);
      fillIndex++;
    }
  }

  const ladderSchemes = chosenFormat.kind === 'ascendingLadder' ? ASCENDING_LADDER_SCHEMES : DESCENDING_LADDER_SCHEMES;
  const ladderReps = isSharedLadder ? ladderSchemes[Math.floor(rng() * ladderSchemes.length)] : null;
  const format = ladderReps ? `${ladderReps} — ${chosenFormat.label}` : chosenFormat.label;

  return picks.map((m) => {
    // Carga de barra/olimpico solo para los levantamientos que de verdad aparecen en WODs reales
    // (ver WOD_BARBELL_LOAD_PERCENT) — el resto de movimientos de este pool son bodyweight/funcional
    // y nunca necesitaron loadKg.
    const barbellPercent = WOD_BARBELL_LOAD_PERCENT[m.id];
    const prKey = barbellPercent ? (resolveStrengthPRKey(m) ?? resolveOlyPRKey(m)) : undefined;
    const loadKg = prKey ? roundToNearestPlate(prs[prKey] * barbellPercent) : undefined;
    return {
      block: 'wod',
      movementId: m.id,
      reps: ladderReps ?? WOD_PRESCRIPTION[m.id] ?? '12-15',
      loadKg,
      format,
      title,
      notes,
    };
  });
}

/** Elige un movimiento para un rol de accesorio, evitando dolor y lo ya usado; null si el pool se agota. */
function pickAccessoryRoleMovement(
  role: AccessoryRole,
  used: Set<string>,
  avoidedPatterns: Set<MovementPattern>,
): Movement | null {
  const pool = filterAvoidingPain(
    (ACCESSORY_ROLE_POOL[role] ?? []).map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m)),
    avoidedPatterns,
  );
  return pickVaried(pool, used) ?? null;
}

/**
 * Bloque de accesorio como 1-2 superseries "principal + contraste" (patron del dia 4 de Mayhem
 * Burgener), elegidas para complementar el levantamiento principal de hoy y sesgadas por el patron
 * de fuerza peor situado en `computeWeakPoints`. Reps y carga siguen la onda del meso
 * (`ACCESSORY_WEEK_SCHEME`). Cada superserie sale con su propio `format` para que la tarjeta la
 * agrupe aparte; si el pool se agota, cae a 2 movimientos sueltos como antes.
 */
function buildAccessoryBlock(
  strengthPattern: MovementPattern,
  recentIds: Set<string>,
  avoidedPatterns: Set<MovementPattern>,
  dose: DayDose,
  week: 1 | 2 | 3 | 4,
  history: SessionHistoryEntry[],
): SessionBlockResult[] {
  // 3 series es el base; la dosis del dia lo mueve entre 2 y 4.
  const accSets = Math.min(4, Math.max(2, Math.round(3 * dose.strengthSets)));
  const family = strengthFamilyOf(strengthPattern);
  const scheme = ACCESSORY_WEEK_SCHEME[week];
  // 2 superseries de normal; en un dia suave (dosis baja) solo 1.
  const supersetCount = dose.strengthSets < 0.9 ? 1 : 2;

  const plan: AccessorySupersetPlan[] = ACCESSORY_SUPERSET_PLAN[family]
    .slice(0, supersetCount)
    .map((p) => ({ ...p, roles: [...p.roles] as [AccessoryRole, AccessoryRole] }));

  // Sesgo de punto debil: si un patron de fuerza esta "a trabajar" y su rol no entra ya en el plan
  // de hoy, se fuerza como principal de la primera superserie (no siempre, es un ajuste fino).
  const weakKey = computeWeakPoints(history).find((w) => w.status === 'a-trabajar' && WEAK_POINT_ACCESSORY_ROLE[w.key])?.key;
  const weakRole = weakKey ? WEAK_POINT_ACCESSORY_ROLE[weakKey] : undefined;
  if (weakRole && !plan.some((p) => p.roles.includes(weakRole)) && rng() < 0.6) {
    plan[0] = {
      roles: [weakRole, plan[0].roles[1]],
      label: `${plan[0].label} · énfasis punto débil`,
      rationale: 'Rol reforzado hoy: este patrón va flojo en tu historial de PRs.',
    };
  }

  const used = new Set(recentIds);
  const out: SessionBlockResult[] = [];
  plan.forEach((p, i) => {
    const members: Movement[] = [];
    for (const role of p.roles) {
      const pick = pickAccessoryRoleMovement(role, used, avoidedPatterns);
      if (pick) {
        used.add(pick.id);
        members.push(pick);
      }
    }
    if (members.length === 0) return;
    const format = `Superserie ${String.fromCharCode(65 + i)}`;
    const notes = `${p.label}. ${p.rationale} ${scheme.note} Alterna ambos movimientos con el mínimo descanso; descansa al completar la pareja.`;
    for (const m of members) {
      out.push({ block: 'accessory', movementId: m.id, sets: accSets, reps: scheme.reps, format, notes });
    }
  });

  if (out.length === 0) {
    // Pool agotado por dolor/variedad: 2 movimientos sueltos, mejor eso que un bloque vacio.
    const fallback = pickManyVaried(getMovementsByBlock('accessory'), 2, recentIds);
    return fallback.map((m) => ({
      block: 'accessory',
      movementId: m.id,
      sets: accSets,
      reps: scheme.reps,
      format: 'Accesorio',
      notes: scheme.note,
    }));
  }
  return out;
}

/**
 * Circuito de core de 3 ejercicios / 3 rondas, con la librería de Mayhem Burgener. Rota entre
 * anti-extensión, anti-rotación, flexión y carry; el orden de prioridad depende del patron de
 * fuerza del dia (dia de pierna -> mas anti-extensión y carry; dia de empuje/oly -> mas
 * anti-rotación y flexión). Devuelve entradas de bloque 'accessory' con `format` propio para que la
 * tarjeta lo muestre como una sección aparte.
 */
function buildCoreBlock(
  strengthPattern: MovementPattern,
  recentIds: Set<string>,
  avoidedPatterns: Set<MovementPattern>,
): SessionBlockResult[] {
  const family = strengthFamilyOf(strengthPattern);
  const order = CORE_PRIORITY_BY_FAMILY[family];
  // Las 2 primeras categorias por prioridad del dia + 1 rotatoria de las 2 restantes.
  const categories: CoreCategory[] = [order[0], order[1], rng() < 0.5 ? order[2] : order[3]];

  const used = new Set(recentIds);
  const picks: { movement: Movement; category: CoreCategory }[] = [];
  for (const category of categories) {
    const pool = filterAvoidingPain(
      CORE_POOL[category].map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m)),
      avoidedPatterns,
    );
    const pick = pickVaried(pool, used);
    if (pick) {
      used.add(pick.id);
      picks.push({ movement: pick, category });
    }
  }
  if (picks.length === 0) return [];

  const notes =
    family === 'lower'
      ? 'Circuito de core para tolerar carga axial tras el trabajo de pierna de hoy — 3 rondas, poco descanso entre ejercicios.'
      : 'Circuito de core de anti-rotación y control tras el trabajo de empuje/oly de hoy — 3 rondas, poco descanso entre ejercicios.';
  return picks.map(({ movement, category }) => ({
    block: 'accessory',
    movementId: movement.id,
    sets: 3,
    reps: CORE_REPS[category],
    format: 'Core · 3 rondas',
    notes,
  }));
}

/**
 * Sesiones de gimnasticos (registradas, con un movimiento del arbol) que valen para subir un
 * escalon. Calibrado para ~2 dias de skill por semana (ver `SKILL_DAY_INDICES`): 6 ≈ 3 semanas de
 * trabajo real por escalon si el atleta no falta.
 */
const SKILL_SESSIONS_PER_RUNG = 6;

/**
 * En que dias de entreno de la semana (por `trainingDayIndex`) se programa el bloque de skill —
 * 2 por microciclo, espaciados y evitando (salvo en 3 dias/semana) el dia 0, que ya abre con el
 * benchmark. El resto de dias no llevan skill: se entrena una progresion, no se toca a diario.
 */
const SKILL_DAY_INDICES: Record<3 | 4 | 5 | 6, readonly number[]> = {
  3: [0, 2],
  4: [1, 3],
  5: [1, 3],
  6: [1, 4],
};

/**
 * Micro-progresion DENTRO de un escalon — para que no se prescriba el mismo texto identico semana
 * tras semana. Sube por el mayor de: sesiones ya hechas en este escalon, y semanas transcurridas
 * (con tope 1 — el calendario solo, sin sesiones registradas, no llega a "casi listo para subir").
 * 0 -> volumen tecnico, 1 -> mas control/tempo, 2 -> estirar el rango antes de subir.
 */
const SKILL_RUNG_BLOCKS = [
  { reps: '4-5 series cortas', focus: 'Volumen técnico: series cortas y perfectas, descanso completo entre ellas.' },
  { reps: '3-4 series · más control', focus: 'Sube el tiempo bajo tensión: cada repetición más lenta y controlada que la semana pasada.' },
  { reps: '3 series · al filo del paso', focus: 'Estira el rango o la dificultad dentro de este paso — casi listo para el siguiente.' },
];

/**
 * Escalon efectivo de una progresion de gimnasticos. Antes solo miraba el calendario
 * (`tiempo transcurrido / plazo del objetivo`), en saltos de `1/nº escalones`, asi que un objetivo
 * largo mostraba el MISMO ejercicio en todas las sesiones durante muchas semanas. Ahora sube por el
 * mayor de tres: sesiones de gimnasticos ya registradas (competencia real, `SKILL_SESSIONS_PER_RUNG`
 * por escalon), calendario (suelo lento), y el nivel de partida declarado. `sessionsOnRung` alimenta
 * la micro-progresion dentro del escalon.
 */
function resolveSkillProgression(
  progression: SkillProgression,
  goal: Goal,
  history: SessionHistoryEntry[],
  date: Date,
): { index: number; total: number; rungPhase: number; driver: 'tiempo' | 'sesiones' | 'nivel' } {
  const total = progression.steps.length;
  const treeIds = new Set<string>(progression.steps.map((s) => s.movementId));
  treeIds.add(progression.targetMovementId);
  const dateIso = toLocalIsoDate(date);
  const sessionsDone = history.filter(
    (h) => h.date >= goal.createdAt && h.date <= dateIso && h.movementIds.some((id) => treeIds.has(id)),
  ).length;

  const competenceFrac = sessionsDone / (total * SKILL_SESSIONS_PER_RUNG);
  const timeFrac = getGoalProgress(goal, history, date); // objetivos de skill: es progreso puramente temporal
  const levelFrac = Math.min(1, Math.max(0, goal.skillLevel ?? 0));
  const bestFrac = Math.max(competenceFrac, timeFrac, levelFrac);

  const { index } = skillProgressionStepAt(progression, bestFrac);
  const driver =
    bestFrac === competenceFrac && competenceFrac >= timeFrac && competenceFrac >= levelFrac
      ? 'sesiones'
      : levelFrac === bestFrac && levelFrac > timeFrac
        ? 'nivel'
        : 'tiempo';

  // Micro-progresion dentro del escalon: sesiones ya hechas en el / semanas transcurridas (tope 1),
  // lo que sea mayor. Sin esto, previsualizando la semana con el historial vacio salia el mismo
  // texto identico todos los dias (lo que veia el usuario). Se estima ~2 semanas por escalon para
  // no contar dos veces el tiempo ya "gastado" en escalones anteriores.
  const sessionsOnRung = Math.max(0, sessionsDone - index * SKILL_SESSIONS_PER_RUNG);
  const weeksSinceStart = Math.max(0, (date.getTime() - new Date(`${goal.createdAt}T00:00:00`).getTime()) / (7 * 86400000));
  const weeksOnRung = weeksSinceStart - index * 2;
  const rungPhase = Math.min(
    SKILL_RUNG_BLOCKS.length - 1,
    Math.max(Math.floor(sessionsOnRung / 4), Math.min(1, Math.floor(Math.max(0, weeksOnRung)))),
  );
  return { index, total, rungPhase, driver };
}

function buildSkillBlock(
  history: SessionHistoryEntry[],
  goals: Goal[],
  avoidedPatterns: Set<MovementPattern>,
  date: Date = new Date(),
): SessionBlockResult[] {
  const candidates = filterAvoidingPain(getMovementsByBlock('skill'), avoidedPatterns);

  // Objetivo de gimnasticos con arbol de progresion: se programa el escalon efectivo (competencia +
  // calendario + nivel de partida, ver `resolveSkillProgression`), y se ROTA que sale hoy — casi
  // siempre el escalon actual, a veces el anterior para reforzar la base, y de vez en cuando un
  // toque del siguiente cuando ya se lleva rodaje. Dentro del escalon, la prescripcion tambien
  // progresa (`SKILL_RUNG_BLOCKS`).
  const progressionGoal = pickPriorityGoal(goals, (g) => g.type === 'mejorar-gimnasticos' && Boolean(g.movementId));
  if (progressionGoal?.movementId) {
    const progression = getSkillProgressionFor(progressionGoal.movementId);
    if (progression) {
      const { index, total, rungPhase, driver } = resolveSkillProgression(progression, progressionGoal, history, date);
      const steps = progression.steps;
      const anchor = steps[index];
      const anchorMovement = getMovementById(anchor.movementId);

      // El escalon de hoy toca un patron con aviso de molestia -> cae a la rotacion normal de abajo.
      if (anchorMovement && !avoidedPatterns.has(anchorMovement.pattern)) {
        const rb = SKILL_RUNG_BLOCKS[rungPhase];
        const driverNote =
          driver === 'sesiones'
            ? ' Subes de paso por las sesiones de gimnásticos que ya llevas, no solo por el calendario.'
            : driver === 'nivel'
              ? ' Empezaste aquí por el nivel de partida que marcaste.'
              : '';

        // Junto al escalon actual (ancla, siempre presente) se intercala un paso vecino de forma
        // deterministica y ciclica, para tocar toda la escalera camino de la meta: feeder = afianzar
        // la base; reach = tantear el siguiente (cuando ya hay rodaje en el escalon o la meta esta
        // cerca); objetivo = intentos del movimiento final cuando quedan <= 2 escalones. Se descarta
        // el vecino que toque un patron con aviso de molestia.
        const rungsLeft = total - 1 - index;
        const nearTarget = rungsLeft <= 2;
        const feeder = index > 0 ? steps[index - 1] : null;
        const reach = index < total - 1 ? steps[index + 1] : null;
        type Comp = { role: 'feeder' | 'reach' | 'objetivo'; movementId: string; name: string };
        const nameOf = (id: string, fallback: string) => getMovementById(id)?.name ?? fallback;
        const rotation: Comp[] = [];
        if (feeder) rotation.push({ role: 'feeder', movementId: feeder.movementId, name: nameOf(feeder.movementId, 'el paso anterior') });
        if (reach && (rungPhase >= 1 || nearTarget)) {
          const isTarget = reach.movementId === progression.targetMovementId;
          rotation.push({
            role: isTarget ? 'objetivo' : 'reach',
            movementId: reach.movementId,
            name: nameOf(reach.movementId, 'el paso siguiente'),
          });
        }
        if (
          nearTarget &&
          reach?.movementId !== progression.targetMovementId &&
          anchor.movementId !== progression.targetMovementId
        ) {
          rotation.push({ role: 'objetivo', movementId: progression.targetMovementId, name: progression.targetName });
        }
        const usable = rotation.filter((c) => {
          const m = getMovementById(c.movementId);
          return Boolean(m) && !avoidedPatterns.has(m!.pattern);
        });

        const entries: SessionBlockResult[] = [
          {
            block: 'skill',
            movementId: anchor.movementId,
            sets: 4,
            reps: rb.reps,
            notes: `Progresión hacia ${progression.targetName} — paso ${index + 1} de ${total}: ${anchor.cue} ${rb.focus}${driverNote}`,
          },
        ];

        if (usable.length > 0) {
          // tick deterministico (dias desde el alta del objetivo): cicla parejo entre los dos dias
          // de skill de la semana y avanza semana a semana, sin RNG — misma sesion en todo dispositivo.
          const tick = Math.floor(
            Math.max(0, (date.getTime() - new Date(`${progressionGoal.createdAt}T00:00:00`).getTime()) / 86400000),
          );
          const comp = usable[tick % usable.length];
          const compNote =
            comp.role === 'feeder'
              ? `Complemento — un paso por debajo (${comp.name}) para afianzar el patrón base: ligero, calidad sobre cantidad.`
              : comp.role === 'objetivo'
                ? `Complemento — intentos técnicos de ${comp.name}, el movimiento objetivo: ya estás cerca, pruébalo fresco al principio y para antes del fallo.`
                : `Complemento — tanteo del paso siguiente (${comp.name}): 1-2 series técnicas, sin forzar.`;
          entries.push({ block: 'skill', movementId: comp.movementId, sets: 2, reps: 'técnica / calidad', notes: compNote });
        }

        return entries;
      }
    }
  }

  // Objetivo de gimnasticos con un drill suelto (sin arbol) o `subir-pr`: sesgo directo, como antes.
  const isSkillGoal = goals.some((g) => g.type === 'mejorar-gimnasticos' || g.type === 'subir-pr');
  const pref = isSkillGoal
    ? goalPreference(goals, (m) => skillMovements.some((s) => s.id === m.id), history)
    : { preferChance: 0, progress: 0, behindSchedule: false };

  const movement = pref.movementId
    ? pickVariedWithPreference(candidates, new Set(), pref.movementId, pref.preferChance)
    : pickLeastRecentlyUsed(candidates, history);
  if (!movement) return [];
  const notes =
    pref.movementId && movement.id === pref.movementId
      ? 'Progresión directa hacia tu objetivo de gimnásticos.'
      : 'Rotación de habilidades gimnásticas para mantener variedad y evitar estancamiento.';
  return [{ block: 'skill', movementId: movement.id, sets: 4, reps: 'tecnica / tiempo', notes }];
}

/**
 * Varia el calentamiento dia a dia en vez de repetir siempre las mismas 2-3 piezas: 2 generales
 * + 1 especifica del patron de hoy para "Para el WOD", y 2 especificas de oly para "Para Oly",
 * eligiendas con `pickManyVaried` (evita lo usado en sesiones recientes) sobre el pool ampliado
 * con rutinas reales de programacion de box.
 */
/** Pool minimo de piezas monoestructurales para "subir el pulso" al arrancar el especifico del WOD. */
const WARMUP_PULSE_IDS = ['row', 'air-bike', 'ski-erg', 'jumping-jacks'];

interface WodRampInfo {
  /** movementIds reales del WOD de hoy (sin benchmarks) — para hacer una rampa progresiva con ellos. */
  movementIds: string[];
  /** true si algun movimiento del WOD lleva carga: cambia el texto de la ultima ronda ("al peso" vs "al ritmo"). */
  weighted: boolean;
}

/**
 * Calentamiento por fases: (1) Activacion fija (hombro/escapula + gluteo/cadera), y (2) Especifico
 * del WOD. Cuando llegan los movimientos reales del WOD (`wodRamp`), el especifico deja de ser
 * estiramientos sueltos y pasa a ser una rampa progresiva con esos mismos movimientos, terminando en
 * una ronda al peso y ritmo del WOD. Sin esa info (mantenimiento, programas de fuerza) se mantiene el
 * comportamiento clasico. El calentamiento especifico de barra (Burgener + rampa de carga) YA NO va
 * aqui: se ancla al inicio del bloque de Oly, que se hace despues del WOD — ver `buildOlyBlock`.
 */
function buildWarmupBlock(
  strengthPattern: MovementPattern,
  recentIds: Set<string>,
  wodRamp?: WodRampInfo | null,
): SessionBlockResult[] {
  const generalPool = getMovementsByBlock('warmup').filter((m) => m.tags.includes('general'));
  const generalPicks = pickManyVaried(generalPool, 2, recentIds);

  const toEntries = (movs: (Movement | undefined)[], subgroup: string, notes: string): SessionBlockResult[] =>
    movs.filter((m): m is Movement => Boolean(m)).map((m) => ({ block: 'warmup', movementId: m.id, subgroup, notes }));

  const activacion = toEntries(
    [getMovementById('crossover-symmetry'), getMovementById('hip-halo')],
    'Activación',
    'Ritual fijo antes de cada sesión: hombro/escápula (Crossover Symmetry) y glúteo/cadera (Hip Halo) activados, da igual lo que toque hoy.',
  );

  const rampIds = (wodRamp?.movementIds ?? [])
    .filter((id, i, arr) => arr.indexOf(id) === i && Boolean(getMovementById(id)))
    .slice(0, 3);

  let paraWod: SessionBlockResult[];
  if (rampIds.length > 0) {
    const pulse = pickVaried(
      WARMUP_PULSE_IDS.map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m)),
      new Set([...recentIds, ...rampIds]),
    );
    const lastRound = wodRamp?.weighted ? 'una ronda al peso y ritmo del WOD' : 'una ronda al ritmo del WOD';
    paraWod = toEntries(
      [pulse, ...rampIds.map((id) => getMovementById(id))],
      'Específico del WOD',
      `Sube el pulso 2 min y haz 3 rondas ascendentes con estos movimientos: técnica ligera → ritmo de trabajo → ${lastRound}.`,
    );
  } else {
    const specificPool = getMovementsByBlock('warmup').filter((m) => m.tags.includes(`especifico-${strengthPattern}`));
    const specificPick = pickVaried(specificPool, new Set([...recentIds, ...generalPicks.map((m) => m.id)]));
    paraWod = toEntries(
      specificPick ? [...generalPicks, specificPick] : generalPicks,
      'Específico del WOD',
      'Activa el patrón de movimiento de hoy antes de cargar peso.',
    );
  }

  return [...activacion, ...paraWod];
}

/** Piezas de cardio suave para el dia de recuperacion activa (bike, row, ski, run, trineo). */
const RECOVERY_CARDIO_IDS = ['row', 'air-bike', 'ski-erg', 'run', 'sled-push'];

/** Habilidades gimnasticas ligeras aptas para un dia de recuperacion (sin fatiga ni carga). */
const RECOVERY_SKILL_IDS = [
  'handstand-walk-progression',
  'l-sit-progression',
  'pistol-squat-progression',
  'double-under-practice',
  'rope-climb-technique',
];

function buildRecoveryWodBlock(recentIds: Set<string>, avoidedPatterns: Set<MovementPattern>): SessionBlockResult[] {
  const pool = filterAvoidingPain(
    RECOVERY_CARDIO_IDS.map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m)),
    avoidedPatterns,
  );
  const picks = pickManyVaried(pool, 2, recentIds);
  if (picks.length === 0) return [];

  const totalMinutes = 45 + Math.floor(rng() * 4) * 5; // 45 / 50 / 55 / 60
  const perPieceMinutes = Math.max(10, Math.round(totalMinutes / picks.length / 5) * 5);
  const title = 'Recuperación activa';
  const format = `RPE 2 · ~${totalMinutes} min total`;
  const notes =
    'No es un WOD puntuable: ritmo conversacional (RPE 2) en toda la pieza — el objetivo es circular sangre y acelerar la recuperación, no generar fatiga.';

  return picks.map((movement) => ({
    block: 'wod',
    movementId: movement.id,
    reps: movement.id === 'sled-push' ? '8-10 x 30-40m caminando' : `${perPieceMinutes} min continuo`,
    title,
    format,
    notes,
  }));
}

function buildRecoverySkillBlock(recentIds: Set<string>, avoidedPatterns: Set<MovementPattern>): SessionBlockResult[] {
  const pool = filterAvoidingPain(
    RECOVERY_SKILL_IDS.map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m)),
    avoidedPatterns,
  );
  const movement = pickVaried(pool, recentIds) ?? pool[0];
  if (!movement) return [];

  return [
    {
      block: 'skill',
      movementId: movement.id,
      reps: '10 min',
      notes: 'Trabajo ligero de técnica en tu día de recuperación — sin buscar fatiga ni carga, solo calidad de movimiento.',
    },
  ];
}

/**
 * Fuera de macrociclo, la mayoria de los dias de entreno llevan un WOD de mantenimiento con
 * estimulo real (trifecta gimnastico/con carga/monoestructural, igual que en el macrociclo
 * completo pero sin periodizacion ni cargas basadas en PR); la recuperacion activa es la
 * excepcion deliberada — antes se generaba recuperacion todos los dias, lo cual no es una
 * progresion realista para semanas seguidas de espera antes del macrociclo.
 */
function isMaintenanceRecoveryDay(): boolean {
  return rng() < 0.25;
}

function buildMaintenanceWodBlock(
  recentIds: Set<string>,
  avoidedPatterns: Set<MovementPattern>,
  wodRampActive: boolean,
): SessionBlockResult[] {
  // Los levantamientos de barra/olimpico (ver WOD_BARBELL_LOAD_PERCENT) necesitan un PR para
  // calcular su carga — mantenimiento es deliberadamente "sin cargas basadas en PR ni
  // periodizacion" (ver comentario de buildMaintenanceStyleBlocks), asi que se excluyen aqui en vez
  // de mostrarlos sin ningun peso prescrito.
  const pool = filterAvoidingPain(getMovementsByBlock('wod'), avoidedPatterns).filter((m) => !(m.id in WOD_BARBELL_LOAD_PERCENT));
  const timeDomain = WOD_TIME_DOMAIN[2];

  const regularFormats: { label: string; kind: WodFormatKind }[] = [
    { label: `For Time (${timeDomain.rounds} rondas)`, kind: 'forTime' },
    { label: `AMRAP ${timeDomain.amrapMin} min`, kind: 'amrap' },
    { label: `EMOM ${timeDomain.emomMin} min (movimientos alternos)`, kind: 'emom' },
    { label: `Cada 3:00 x ${timeDomain.rounds} rondas`, kind: 'interval' },
    { label: 'Cada 3:00 hasta el fallo (+3 reps/ronda)', kind: 'risingInterval' },
    { label: `${DESCENDING_LADDER_FILLER_STEPS.join('-')} + peaje`, kind: 'descendingLadderFiller' },
    { label: `AMRAP ${timeDomain.amrapMin} min — escalera + peaje`, kind: 'ascendingLadderFiller' },
    // La triada de barra (WOD_BARBELL_LOAD_PERCENT) queda fuera a proposito: necesita un PR para
    // calcular su carga, y mantenimiento no hace cargas basadas en PR (ver arriba).
  ];
  const chosenFormat = regularFormats[Math.floor(rng() * regularFormats.length)];

  // Misma trifecta clasica que en el macrociclo completo: 1 gimnastico + 1 con carga + 1 monoestructural.
  const gymnasticsPool = pool.filter((m) => getWodDomain(m.id) === 'gymnastics');
  const weightedPool = pool.filter((m) => getWodDomain(m.id) === 'weighted');
  const monoPool = pool.filter((m) => getWodDomain(m.id) === 'monostructural');
  const domainOrder = [gymnasticsPool, weightedPool, monoPool];

  const title = generateWodName();
  const wodRampNote = wodRampActive ? ' Rampa de vuelta activa — formato más suave a propósito mientras coges ritmo de nuevo.' : '';
  const notes = `${WOD_FORMAT_RATIONALE[chosenFormat.kind]}${wodRampNote}`;

  if (chosenFormat.kind === 'descendingLadderFiller' || chosenFormat.kind === 'ascendingLadderFiller') {
    const isAscending = chosenFormat.kind === 'ascendingLadderFiller';
    const mainPool = rng() < 0.5 ? weightedPool : gymnasticsPool;
    const usedForLadder = new Set(recentIds);
    const main = pickVaried(mainPool, usedForLadder);
    if (main) {
      usedForLadder.add(main.id);
      const filler = pickVaried(monoPool, usedForLadder);
      if (filler) {
        const steps = isAscending ? ASCENDING_LADDER_FILLER_STEPS : DESCENDING_LADDER_FILLER_STEPS;
        const laddedNotes = isAscending ? `${notes} Sigue +2 reps cada escalón hasta que se acabe el reloj.` : notes;
        return buildLadderFillerEntries(main, filler, steps, undefined, chosenFormat.label, title, laddedNotes);
      }
    }
    // Sin candidatos suficientes hoy — cae al reparto normal de abajo.
  }

  const picks: Movement[] = [];
  const usedIds = new Set(recentIds);
  function pickFrom(domainPool: Movement[]): void {
    const remaining = domainPool.filter((m) => !picks.some((p) => p.id === m.id));
    const fallback = pool.filter((m) => !picks.some((p) => p.id === m.id));
    const pick = pickVaried(remaining.length > 0 ? remaining : fallback, usedIds);
    if (pick) {
      picks.push(pick);
      usedIds.add(pick.id);
    }
  }
  domainOrder.forEach(pickFrom);

  return picks.map((m) => ({
    block: 'wod',
    movementId: m.id,
    reps: WOD_PRESCRIPTION[m.id] ?? '12-15',
    format: chosenFormat.label,
    title,
    notes,
  }));
}

/** Como buildWarmupBlock: 1 estiramiento especifico del patron de hoy + 2 mas variados del pool general/recuperacion. */
function buildCooldownBlock(strengthPattern: MovementPattern, recentIds: Set<string>): SessionBlockResult[] {
  const tag = COOLDOWN_TAG_BY_PATTERN[strengthPattern];
  const specificPool = tag ? getMovementsByBlock('cooldown').filter((m) => m.tags.includes(tag)) : [];
  const generalPool = getMovementsByBlock('cooldown').filter((m) => m.tags.includes('general') || m.tags.includes('recuperacion'));

  const specificPick = pickVaried(specificPool, recentIds);
  const usedIds = specificPick ? new Set([...recentIds, specificPick.id]) : recentIds;
  const fillerPool = [...generalPool, ...specificPool].filter((m) => m.id !== specificPick?.id);
  const fillerPicks = pickManyVaried(fillerPool, specificPick ? 2 : 3, usedIds);

  const picks = specificPick ? [specificPick, ...fillerPicks] : fillerPicks;
  return picks.map((m) => ({ block: 'cooldown', movementId: m.id }));
}

export function generateDailySession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  macro: Macrocycle,
  date: Date = new Date(),
  goals: Goal[] = [],
): DailySession {
  const phaseProgress = resolveMacrocyclePhase(macro, date);
  const calendarWeek = phaseProgress.phaseIndex;
  const weekdayIndex = getWeekdayIndex(date);
  const dayPlan = getDayPlan(weekdayIndex, profile.trainingDaysPerWeek);
  const dateIso = toLocalIsoDate(date);

  if (!dayPlan.isTrainingDay) {
    return {
      date: dateIso,
      mesocycleWeek: calendarWeek,
      isRestDay: true,
      blocks: [],
      phaseWeekInPhase: phaseProgress.weekInPhase,
      phaseLengthWeeks: phaseProgress.phaseLengthWeeks,
    };
  }

  const recentIds = getRecentMovementIds(history);
  const avoidedPatterns = getAvoidedPatterns(profile.painFlags, dateIso);
  const painReintro = getPainReintroPatterns(profile.painFlags, dateIso);

  if (dayPlan.isRecoveryDay) {
    const warmupBlock = buildWarmupBlock(dayPlan.strengthPattern, recentIds);
    const recoveryWodBlock = buildRecoveryWodBlock(recentIds, avoidedPatterns);
    const recoverySkillBlock = buildRecoverySkillBlock(recentIds, avoidedPatterns);
    const cooldownBlock = buildCooldownBlock(dayPlan.strengthPattern, recentIds);

    return {
      date: dateIso,
      mesocycleWeek: calendarWeek,
      isRestDay: false,
      blocks: [...warmupBlock, ...recoveryWodBlock, ...recoverySkillBlock, ...cooldownBlock],
      phaseWeekInPhase: phaseProgress.weekInPhase,
      phaseLengthWeeks: phaseProgress.phaseLengthWeeks,
    };
  }

  const acwrResult = computeAcwr(history, date);
  // Cold-start del ACWR: sin >=4 sesiones en la ventana cronica, `computeAcwr` fuerza la zona a
  // 'moderada' (−5% de carga) por precaucion. Pero si el atleta ya trae PRs reales editados (o un
  // registro de fechas de entreno), es evidencia de que entrena — no de que vuelve desentrenado.
  // En ese caso se mantiene el aviso de "empezamos conservador" pero sin el recorte de carga.
  const knownAthlete = (profile.prLog?.length ?? 0) > 0 || (profile.trainingDatesLog?.length ?? 0) > 0;
  const acwrZone: AcwrZone =
    acwrResult.coldStart && knownAthlete && acwrResult.zone === 'moderada' ? 'optima' : acwrResult.zone;
  // Perfil de respuesta del atleta (ver responseProfile.ts) — el motor solo lo aplica cuando hay
  // datos suficientes (`engineResponseProfile` devuelve el neutro si no). Individualiza: cuanto se
  // fia del RPE, sesgo de reporte, ritmo de progreso por lift, y velocidad de recuperacion.
  const responseProfile = engineResponseProfile(
    computeResponseProfile(history, profile.prLog, date, profile.setFeedbackLog, profile.bodyweightLog),
  );
  const { week, reason: deloadReason } = resolveTrainingWeek(calendarWeek, acwrZone, goals, date, responseProfile.recovery.tier);
  const isTaper = isTaperActive(goals, date);
  const testDayFocus = resolveTestDayFocus(week);
  const strengthRampFactor = getRampFactor(profile.intensityRamp, 'strength', date);
  const olyRampFactor = getRampFactor(profile.intensityRamp, 'oly', date);
  const wodRampActive = isWodRampActive(profile.intensityRamp, date);
  const readinessCheck = getReadinessCheckForDate(profile.readinessLog, dateIso);
  // Sesgo de desbalance entre levantamientos relacionados (Front Squat flojo vs Back Squat, etc.) —
  // se calcula una vez y lo comparten fuerza y oly. Solo el motor periodizado lo usa (no mantenimiento
  // ni programas con nombre), igual que el resto de senales del macrociclo.
  const imbalanceBias = getImbalanceBias(profile.prs, profile.variantPrs, history);
  // Fatiga por zona (ACWR por patron de movimiento): baja algo la carga del patron/oly que este
  // sobrecargado esta semana respecto a su propia norma, y excluye esas zonas del pool del WOD.
  const patternFatigue = computePatternFatigue(history, date);
  const fatiguedPatterns = overcookedPatterns(patternFatigue);

  // Planificador de microciclo (ver weekPlan.ts): reparte el patron de fuerza y la familia de oly
  // sobre LA SEMANA ENTERA de una vez, en vez de decidir cada dia en aislamiento. Se pasa como
  // preferencia base a los bloques; el forzado por objetivo, la sustitucion por dolor, el
  // anti-repeticion entre semanas y la autorregulacion siguen actuando encima, por dia.
  const strengthGoal = pickPriorityGoal(goals, (g) => (g.type === 'elevar-fuerza' || g.type === 'subir-pr') && Boolean(g.movementId));
  const olyGoal = pickPriorityGoal(goals, (g) => (g.type === 'mejorar-potencia' || g.type === 'subir-pr') && Boolean(g.movementId));
  const microPlan = buildMicrocyclePlan({
    macroId: macro.id,
    weekNumber: weeksSinceStart(macro.startDate, date) + 1,
    phase: week,
    trainingDaysPerWeek: profile.trainingDaysPerWeek,
    responseProfile,
    avoidedPatterns,
    goalForcedPattern: strengthGoal?.movementId ? getMovementById(strengthGoal.movementId)?.pattern ?? null : null,
    goalForcedFamily: olyGoal?.movementId ? (olyGoal.movementId.includes('snatch') ? 'snatch' : 'clean') : null,
  });
  const plannedPattern = microPlan.strengthPattern[dayPlan.trainingDayIndex] ?? null;
  const plannedFamily = microPlan.olyFamily[dayPlan.trainingDayIndex] ?? null;
  const plannedEnergy = microPlan.energySystem[dayPlan.trainingDayIndex] ?? null;

  // Dosis del dia = progresion DENTRO del mesociclo (el volumen/intensidad ondula a lo largo de las
  // semanas de la fase, no es plano) x onda de intensidad dura/media/suave de la semana. Se calcula
  // aqui una vez y se pasa a WOD, fuerza y accesorio. `week` (semana de entreno ya resuelta) manda
  // sobre la fase de calendario: en una descarga forzada -> fase 4 -> progresion plana, correcto.
  const weekProg = resolveWeekProgression(week, phaseProgress.weekInPhase, phaseProgress.phaseLengthWeeks);
  const dayIntensity: DayIntensity = microPlan.dayIntensity[dayPlan.trainingDayIndex] ?? 'media';
  const dayDose: DayDose = {
    wodVolume: clampDose(weekProg.wodVolume * INTENSITY_VOL[dayIntensity], 0.72, 1.2),
    strengthSets: clampDose(weekProg.strengthVolume * INTENSITY_VOL[dayIntensity], 0.75, 1.18),
    strengthLoad: clampDose(weekProg.strengthLoad * INTENSITY_LOAD[dayIntensity], 0.93, 1.07),
    dayIntensity,
  };

  // Enfasis del dia segun la fase (ver `resolveDayEmphasis`): 'fuerza' = solo barra, sin WOD;
  // 'metcon' = solo condicion fisica, sin fuerza pesada; 'mixto' = ambos, como siempre. Dos
  // anulaciones: en taper el ultimo dia de la semana es un metcon de simulacion, y un dia de test
  // de maximo nunca se salta la fuerza/oly.
  let dayEmphasis = resolveDayEmphasis(week, dayPlan.trainingDayIndex, profile.trainingDaysPerWeek);
  if (isTaper && dayPlan.trainingDayIndex >= profile.trainingDaysPerWeek - 1) dayEmphasis = 'metcon';
  if (testDayFocus) dayEmphasis = 'mixto';
  // La PRIMERA semana del macrociclo va siempre completa (fuerza + WOD cada dia de entreno), aunque
  // caiga en Acumulacion (donde `resolveDayEmphasis` normalmente deja dias de solo barra). Un coach
  // real abre un bloque con una "forma de salida": una lectura base de fuerza Y de condicion fisica,
  // para tener contra que medir el progreso. Recortar dominios por dia desde el dia 1 deja media
  // semana sin metcon y sin referencia. A partir de la semana 2 la periodizacion actua normal.
  if (weeksSinceStart(macro.startDate, date) === 0) dayEmphasis = 'mixto';
  const doStrength = dayEmphasis !== 'metcon';
  // Todos los días de entreno llevan WOD — el énfasis del día ya no lo quita, solo escala su
  // duración/intensidad dentro de `buildWodBlock` (día de fuerza = corto y de bajo impacto).

  const strengthResult = doStrength
    ? buildStrengthBlock(
        dayPlan,
        week,
        profile.prs,
        recentIds,
        goals,
        acwrZone,
        acwrResult.coldStart,
        testDayFocus === 'strength',
        history,
        avoidedPatterns,
        strengthRampFactor,
        profile.variantPrs,
        readinessCheck,
        date,
        profile.trainingDaysPerWeek,
        imbalanceBias,
        painReintro,
        patternFatigue,
        responseProfile,
        plannedPattern,
        dayDose,
      )
    : { blocks: [] as SessionBlockResult[], pattern: plannedPattern ?? dayPlan.strengthPattern, reasons: [] as string[] };
  const { blocks: strengthBlock, pattern: trainedStrengthPattern, reasons: strengthReasons } = strengthResult;

  const { blocks: olyBlock, reasons: olyReasons } = doStrength
    ? buildOlyBlock(
        dayPlan,
        week,
        profile.prs,
        recentIds,
        goals,
        acwrZone,
        acwrResult.coldStart,
        testDayFocus === 'oly',
        history,
        avoidedPatterns,
        olyRampFactor,
        profile.variantPrs,
        readinessCheck,
        date,
        imbalanceBias,
        painReintro,
        patternFatigue,
        responseProfile,
        plannedFamily,
        dayDose,
      )
    : { blocks: [] as SessionBlockResult[], reasons: [] as string[] };

  const wodBlock = buildWodBlock(
    dayPlan,
    week,
    profile.trainingDaysPerWeek,
    recentIds,
    new Set([trainedStrengthPattern, ...avoidedPatterns, ...fatiguedPatterns]),
    goals,
    isTaper,
    history,
    wodRampActive,
    profile.prs,
    responseProfile,
    dayEmphasis,
    plannedEnergy,
    dayDose,
  );
  // El accesorio no debe repetir el movimiento que ya haya salido como A2 de la superserie de fuerza.
  const accessoryExclude = new Set([...recentIds, ...strengthBlock.map((b) => b.movementId)]);
  const accessoryWork = doStrength
    ? buildAccessoryBlock(trainedStrengthPattern, accessoryExclude, avoidedPatterns, dayDose, week, history)
    : [];
  const coreWork = doStrength
    ? buildCoreBlock(
        trainedStrengthPattern,
        new Set([...accessoryExclude, ...accessoryWork.map((b) => b.movementId)]),
        avoidedPatterns,
      )
    : [];
  const accessoryBlock = [...accessoryWork, ...coreWork];
  // Skill 2 dias por microciclo (ver `SKILL_DAY_INDICES`) — una progresion se entrena por bloques,
  // no a diario. El resto de dias no llevan bloque de skill.
  const skillBlock = SKILL_DAY_INDICES[profile.trainingDaysPerWeek].includes(dayPlan.trainingDayIndex)
    ? buildSkillBlock(history, goals, avoidedPatterns, date)
    : [];
  // El especifico del WOD se calienta con los movimientos reales de hoy (rampa progresiva), no con
  // estiramientos genericos — ver `buildWarmupBlock`. En dia de benchmark el WOD es una pieza unica
  // conocida, asi que no hay rampa y cae al calentamiento clasico.
  const wodRamp: WodRampInfo = {
    movementIds: wodBlock.filter((b) => !b.movementId.startsWith('benchmark:')).map((b) => b.movementId),
    weighted: wodBlock.some((b) => (b.loadKg ?? 0) > 0),
  };
  const warmupBlock = buildWarmupBlock(trainedStrengthPattern, recentIds, wodRamp);
  const cooldownBlock = buildCooldownBlock(trainedStrengthPattern, recentIds);

  // Mismos fragmentos ya visibles en cada bloque, deduplicados (fuerza y oly casi siempre comparten
  // el mismo texto de autorregulacion/rampa, ya que salen de la misma senal) — resumen "por que hoy
  // es asi" para no tener que leer bloque a bloque para enterarte. El deload va primero por ser el
  // motivo de mayor peso cuando aplica. Ver DailySession.coachReasons.
  const deloadNote = deloadReason ? DELOAD_REASON_NOTE[deloadReason] : undefined;
  const emphasisNote =
    dayEmphasis === 'fuerza'
      ? 'Hoy es día de fuerza — el WOD es corto y de bajo impacto, la prioridad está en la barra.'
      : dayEmphasis === 'metcon'
        ? 'Hoy es día de metcon — sin fuerza pesada ni oly y con un WOD algo más largo, para afilar tu condición física de cara al pico.'
        : undefined;
  const energyReason = (plannedEnergy ? resolveEnergySystemPlan(plannedEnergy) : resolveEnergySystem(week)).note;
  // Progresion dentro del bloque + onda de intensidad del dia (ver `resolveWeekProgression` / `planDayIntensity`).
  const progressionNote = weekProg.note || undefined;
  const intensityNote =
    dayIntensity === 'alta'
      ? 'Día fuerte de la semana — aquí empujas.'
      : dayIntensity === 'baja'
        ? 'Día suave de la semana — menos volumen para asimilar.'
        : undefined;
  const coachReasons = Array.from(
    new Set(collectReasons(deloadNote, emphasisNote, progressionNote, intensityNote, energyReason, ...strengthReasons, ...olyReasons)),
  );

  // El sistema energetico del dia solo se atribuye cuando el WOD es de verdad el WOD rotativo — en
  // un dia de benchmark (dia 0, o testeo extra de pico/objetivo) el estimulo lo manda el benchmark,
  // no la rotacion de fase, asi que no cuenta para el reparto de dominios del Dashboard.
  const wodIsBenchmark = wodBlock.some((b) => b.movementId.startsWith('benchmark:'));

  return {
    date: dateIso,
    mesocycleWeek: week,
    isRestDay: false,
    blocks: [...warmupBlock, ...strengthBlock, ...wodBlock, ...olyBlock, ...accessoryBlock, ...skillBlock, ...cooldownBlock],
    deloadReason,
    deloadNote,
    dayEmphasis: dayEmphasis === 'mixto' ? undefined : dayEmphasis,
    coachReasons: coachReasons.length > 0 ? coachReasons : undefined,
    energySystem: wodIsBenchmark ? undefined : plannedEnergy ?? undefined,
    dayIntensity: dayIntensity === 'media' ? undefined : dayIntensity,
    phaseWeekInPhase: phaseProgress.weekInPhase,
    phaseLengthWeeks: phaseProgress.phaseLengthWeeks,
  };
}

/** Bloques de una sesion "estilo mantenimiento": sin cargas de PR ni periodizacion, con o sin recuperacion. */
function buildMaintenanceStyleBlocks(
  dayPlan: DayPlan,
  history: SessionHistoryEntry[],
  recentIds: Set<string>,
  isRecovery: boolean,
  avoidedPatterns: Set<MovementPattern>,
  wodRampActive: boolean,
): SessionBlockResult[] {
  const warmupBlock = buildWarmupBlock(dayPlan.strengthPattern, recentIds);
  const wodBlock = isRecovery
    ? buildRecoveryWodBlock(recentIds, avoidedPatterns)
    : buildMaintenanceWodBlock(recentIds, avoidedPatterns, wodRampActive);
  const skillBlock = isRecovery ? buildRecoverySkillBlock(recentIds, avoidedPatterns) : buildSkillBlock(history, [], avoidedPatterns);
  const cooldownBlock = buildCooldownBlock(dayPlan.strengthPattern, recentIds);
  return [...warmupBlock, ...wodBlock, ...skillBlock, ...cooldownBlock];
}

/**
 * Sesion de mantenimiento para dias fuera de cualquier macrociclo activo (ver `getActiveMacrocycle`):
 * sin cargas basadas en PRs ni periodizacion, pero con variedad real — la mayoria de los dias
 * llevan un WOD de mantenimiento (trifecta gimnastico/con carga/monoestructural) y solo 1 de cada
 * 4 aprox. es recuperacion activa pura, en vez de recuperacion todos los dias. Sirve para seguir
 * entrenando y registrando RPE (alimenta el ACWR) mientras no hay un macrociclo estructurado en marcha.
 */
export function generateOffSeasonSession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  date: Date = new Date(),
): DailySession {
  const dateIso = toLocalIsoDate(date);
  const dayPlan = getDayPlan(getWeekdayIndex(date), profile.trainingDaysPerWeek);

  if (!dayPlan.isTrainingDay) {
    return { date: dateIso, mesocycleWeek: 0, isRestDay: true, blocks: [] };
  }

  const recentIds = getRecentMovementIds(history);
  const avoidedPatterns = getAvoidedPatterns(profile.painFlags, dateIso);
  const wodRampActive = isWodRampActive(profile.intensityRamp, date);
  const blocks = buildMaintenanceStyleBlocks(dayPlan, history, recentIds, isMaintenanceRecoveryDay(), avoidedPatterns, wodRampActive);

  return { date: dateIso, mesocycleWeek: 0, isRestDay: false, blocks };
}

export type SessionOverrideType = 'recovery' | 'random';

const SESSION_OVERRIDE_LABEL: Record<SessionOverrideType, string> = {
  recovery: 'Recuperación (elegida)',
  random: 'WOD libre (elegido)',
};

/**
 * Sustituye deliberadamente la sesion de hoy por recuperacion o un WOD variado sin cargas de PR,
 * sea cual sea el dia real (dentro o fuera de macrociclo) — para cuando el atleta no tiene el dia
 * para lo programado y prefiere elegir. No reescribe la periodizacion: es solo el contenido de hoy.
 */
export function generateOverrideSession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  date: Date,
  type: SessionOverrideType,
): DailySession {
  const dateIso = toLocalIsoDate(date);
  const dayPlan = getDayPlan(getWeekdayIndex(date), profile.trainingDaysPerWeek);

  if (!dayPlan.isTrainingDay) {
    return { date: dateIso, mesocycleWeek: 0, isRestDay: true, blocks: [] };
  }

  const recentIds = getRecentMovementIds(history);
  const avoidedPatterns = getAvoidedPatterns(profile.painFlags, dateIso);
  const wodRampActive = isWodRampActive(profile.intensityRamp, date);
  // Determinista igual que `generateSessionForDate` — el tipo de override entra en la semilla para
  // que "propia" y "recuperación" del mismo día no salgan idénticas.
  const blocks = withSeededRng(`ovr:${type}:${dateIso}`, () =>
    buildMaintenanceStyleBlocks(dayPlan, history, recentIds, type === 'recovery', avoidedPatterns, wodRampActive),
  );

  return {
    date: dateIso,
    mesocycleWeek: 0,
    isRestDay: false,
    blocks,
    swapLabel: SESSION_OVERRIDE_LABEL[type],
  };
}

/**
 * Sesion de un dia bajo un StrengthProgram activo (ver [[getActiveStrengthProgram]]): un unico
 * levantamiento por dia de entreno (que levantamiento y con que esquema depende de la metodologia —
 * ver `resolveStrengthProgramDay`), sin wod/oly/skill/accessory salvo que el atleta los añada aparte
 * con `buildStrengthProgramWodAddition`. La autorregulacion (ACWR + RPE reciente) se sigue aplicando
 * igual que en el resto del motor — un programa de fuerza pura no es excusa para dejar de escuchar
 * al atleta.
 */
export function generateStrengthProgramSession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  program: StrengthProgram,
  date: Date = new Date(),
): DailySession {
  const dateIso = toLocalIsoDate(date);
  const dayPlan = getDayPlan(getWeekdayIndex(date), profile.trainingDaysPerWeek);

  if (!dayPlan.isTrainingDay) {
    return { date: dateIso, mesocycleWeek: 0, isRestDay: true, blocks: [] };
  }

  const acwrResult = computeAcwr(history, date);
  const rpeAutoreg = getRpeAutoregFactor(history, date);
  const readiness = getReadinessFactor(getReadinessCheckForDate(profile.readinessLog, dateIso));
  const strengthRampFactor = getRampFactor(profile.intensityRamp, 'strength', date);
  const autoregFactor = combineAutoregFactors(getAutoregFactor(acwrResult.zone), rpeAutoreg.factor, readiness.factor) * strengthRampFactor;
  const rampNote = strengthRampFactor < 1 ? ' Rampa de vuelta activa — carga reducida a propósito mientras coges ritmo de nuevo.' : '';
  const autoregNote = [getAutoregNote(acwrResult.zone, acwrResult.coldStart), rpeAutoreg.note, readiness.note].filter(Boolean).join(' ');

  // El ciclo de halterofilia prescribe varios levantamientos por dia (familia snatch, familia
  // clean/jerk, tiron, sentadilla), no uno solo — vive en su propio resolver en vez de forzarlo
  // dentro de `resolveStrengthProgramDay`, pensado para un unico levantamiento por dia.
  if (program.method === 'haltero') {
    const halteroDay = resolveHalteroDay(program, dayPlan, profile.prs, autoregFactor, date);
    if (!halteroDay) return generateOffSeasonSession(profile, history, date);

    const halteroBlocks: SessionBlockResult[] = halteroDay.lifts.map((lift) => ({
      block: lift.block,
      movementId: lift.movementId,
      sets: lift.sets,
      reps: lift.reps,
      loadKg: lift.loadKg,
      format: lift.format,
      notes: `${lift.notes}${rampNote}${autoregNote ? ` ${autoregNote}` : ''}`,
    }));
    const primaryPattern = getMovementById(halteroDay.lifts[0].movementId)!.pattern;
    const recentIdsHaltero = getRecentMovementIds(history);
    const warmupHaltero = buildWarmupBlock(primaryPattern, recentIdsHaltero);
    const cooldownHaltero = buildCooldownBlock(primaryPattern, recentIdsHaltero);

    return {
      date: dateIso,
      mesocycleWeek: 0,
      isRestDay: false,
      blocks: [...warmupHaltero, ...halteroBlocks, ...cooldownHaltero],
      strengthProgramLabel: `Ciclo Halterofilia · Semana ${halteroDay.weekNumber}/${HALTERO_TOTAL_WEEKS}`,
    };
  }

  const day = resolveStrengthProgramDay(
    program,
    dayPlan,
    profile.prs,
    autoregFactor,
    date,
    profile.trainingDaysPerWeek,
    getAvoidedPatterns(profile.painFlags, dateIso),
    profile.variantPrs,
  );
  if (!day) {
    // No hay levantamiento disponible para el rol de hoy (p.ej. Conjugado sin ningun lift de tren
    // superior o inferior elegido) o el catalogo no tiene el id esperado — cae a mantenimiento.
    return generateOffSeasonSession(profile, history, date);
  }

  const movement = getMovementById(day.movementId)!;
  const finalNotes = `${day.notes}${rampNote}${autoregNote ? ` ${autoregNote}` : ''}`;
  // "temporada"'s test de max-reps y test de complex se puntuan como WOD (reps o carga), no como
  // fuerza clasica — necesitan el bloque 'wod' para que el panel de completar pida el numero
  // correcto en vez de intentar actualizar un PR. Un complex ademas encadena varios movimientos
  // reales a la MISMA carga en vez de uno solo — cada uno es su propia entrada, en el orden real en
  // que se hacen, igual que ya hace cualquier WOD con una secuencia (ver buildLadderFillerEntries).
  const strengthBlocks: SessionBlockResult[] = day.complexMovementIds
    ? day.complexMovementIds.map((id) => ({
        block: 'wod',
        movementId: id,
        sets: day.sets,
        reps: day.reps,
        loadKg: day.loadKg,
        format: day.format,
        notes: finalNotes,
      }))
    : [
        {
          block: day.scoreAsWod ? 'wod' : 'strength',
          movementId: day.movementId,
          sets: day.sets,
          reps: day.reps,
          loadKg: day.loadKg,
          format: day.format,
          notes: finalNotes,
        },
      ];

  const recentIds = getRecentMovementIds(history);
  const warmupBlock = buildWarmupBlock(movement.pattern, recentIds);
  const cooldownBlock = buildCooldownBlock(movement.pattern, recentIds);

  return {
    date: dateIso,
    mesocycleWeek: 0,
    isRestDay: false,
    blocks: [...warmupBlock, ...strengthBlocks, ...cooldownBlock],
    strengthProgramLabel: day.format,
  };
}

/**
 * Bloque(s) wod opcional para añadir sobre un dia de programa de fuerza ya generado — no sustituye
 * la sesion, se anade encima (ver `Planificacion.tsx`). El caso "trae el WOD real de tu
 * macrociclo pausado" no vive aqui: la UI ya tiene que generarlo para poder mostrar una vista
 * previa antes de confirmar, y llamar dos veces a `generateDailySession` (una para la vista previa,
 * otra al confirmar) podria dar resultados distintos por la aleatoriedad interna del motor — asi
 * que la UI genera una vez y reutiliza ese mismo resultado al confirmar, sin pasar por aqui.
 */
export function buildStrengthProgramWodAddition(
  history: SessionHistoryEntry[],
  type: SessionOverrideType,
  painFlags: PainFlag[] | undefined,
  dateIso: string,
  intensityRamp?: IntensityRamp,
): { blocks: SessionBlockResult[] } {
  const recentIds = getRecentMovementIds(history);
  const avoidedPatterns = getAvoidedPatterns(painFlags, dateIso);
  const wodRampActive = isWodRampActive(intensityRamp, new Date(`${dateIso}T00:00:00`));
  const wodBlocks =
    type === 'recovery' ? buildRecoveryWodBlock(recentIds, avoidedPatterns) : buildMaintenanceWodBlock(recentIds, avoidedPatterns, wodRampActive);
  return { blocks: wodBlocks };
}

/** Punto unico de decision: programa de fuerza pura (si hay uno activo) > macrociclo > mantenimiento. */
export function generateSessionForDate(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  date: Date,
  goals: Goal[],
): DailySession {
  const dateIso = toLocalIsoDate(date);
  const activeProgram = getActiveStrengthProgram(profile.strengthPrograms ?? [], dateIso);
  const activeMacro = getActiveMacrocycle(profile.macrocycles, dateIso);
  // Generación DETERMINISTA: el RNG del motor se siembra con la estructura activa + la fecha, así
  // que el mismo perfil sincronizado produce EXACTAMENTE la misma sesión en cualquier dispositivo y
  // en cada refresco. `withSeededRng` es síncrono y restaura `Math.random` al salir.
  const seedKey = `sess:${activeProgram?.id ?? activeMacro?.id ?? 'off'}:${dateIso}`;
  return withSeededRng(seedKey, () => {
    if (activeProgram) return generateStrengthProgramSession(profile, history, activeProgram, date);
    return activeMacro
      ? generateDailySession(profile, history, activeMacro, date, goals)
      : generateOffSeasonSession(profile, history, date);
  });
}

/**
 * Sesión que daría el macrociclo `macro` en `date` — misma semilla determinista que usaría
 * `generateSessionForDate` si ese macro fuese la estructura activa. La usa la vista previa de
 * "añadir el WOD de mi macro" a un día de programa de fuerza, para que lo que se ve sea lo que se
 * añade.
 */
export function previewMacroSession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  macro: Macrocycle,
  date: Date,
  goals: Goal[],
): DailySession {
  return withSeededRng(`sess:${macro.id}:${toLocalIsoDate(date)}`, () =>
    generateDailySession(profile, history, macro, date, goals),
  );
}

/**
 * True si hay un macrociclo o un programa de fuerza activo esa fecha — la UI lo usa para decidir
 * si auto-generar algo (`generateSessionForDate` siempre devuelve contenido) o esperar a que el
 * atleta elija que hacer (ver el estado "sin macrociclo activo" de Planificacion/WeekStrip/
 * NextWeekPreview). Antes solo miraba el macrociclo, lo que dejaba un programa de fuerza activo
 * sin mostrarse hasta que el atleta lo eligiera manualmente — ahora cualquiera de los dos cuenta.
 */
export function hasActiveTrainingStructure(profile: AthleteProfile, dateIso: string): boolean {
  return Boolean(getActiveStrengthProgram(profile.strengthPrograms ?? [], dateIso) || getActiveMacrocycle(profile.macrocycles, dateIso));
}

/**
 * True si una sesion cacheada quedo huerfana: la genero un plan periodizado (macrociclo -> `mesocycleWeek`
 * 1-4, o programa de fuerza -> `strengthProgramLabel`) pero ya no hay ninguna estructura activa que la
 * gobierne esa fecha — el atleta borro el macro/programa. Seguir sirviendola mostraria un entreno de un
 * plan que ya no existe. Las sesiones propias (`source: 'custom'`), las elegidas a mano (`swapLabel`) y
 * las de mantenimiento (`mesocycleWeek === 0`, sin label) no dependen de ninguna estructura y no se tocan.
 */
export function isCachedSessionOrphaned(session: DailySession, profile: AthleteProfile, dateIso: string): boolean {
  if (session.source === 'custom' || session.swapLabel) return false;
  const periodized = session.mesocycleWeek > 0 || Boolean(session.strengthProgramLabel);
  return periodized && !hasActiveTrainingStructure(profile, dateIso);
}

/**
 * True si una sesion periodizada cacheada la genero una version anterior del motor
 * (`genVersion` < `SESSION_GEN_VERSION`, o ausente = version 0). La UI la descarta y regenera
 * —determinista, misma semilla— para que un cambio del generador se propague a todos los
 * dispositivos en la siguiente apertura sin pasos manuales, y no se queden mostrando dias
 * distintos entre PC y movil. El que llama debe respetar aparte las sesiones ya registradas
 * (esas no se regeneran aunque el sello sea viejo). Sesiones propias (`source: 'custom'`),
 * elegidas a mano (`swapLabel`) y de mantenimiento (no periodizadas) nunca son "viejas".
 */
export function isCachedSessionStale(session: DailySession): boolean {
  if (session.source === 'custom' || session.swapLabel) return false;
  const periodized = session.mesocycleWeek > 0 || Boolean(session.strengthProgramLabel);
  if (!periodized) return false;
  return (session.genVersion ?? 0) < SESSION_GEN_VERSION;
}

export function toHistoryEntry(
  session: DailySession,
  rxOrScaled: RxOrScaled,
  rpe: number,
  durationMin: number,
  wodResult?: WodResult,
  testLoadKg?: number,
): SessionHistoryEntry {
  const wodMovementIds = session.blocks.filter((b) => b.block === 'wod').map((b) => b.movementId);
  return {
    date: session.date,
    mesocycleWeek: session.mesocycleWeek,
    movementIds: session.blocks.map((b) => b.movementId),
    rxOrScaled,
    rpe,
    durationMin,
    wodResult,
    testLoadKg,
    wodMovementIds: wodMovementIds.length > 0 ? wodMovementIds : undefined,
    energySystem: session.energySystem,
  };
}
