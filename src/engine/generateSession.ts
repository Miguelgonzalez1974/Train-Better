import type { BenchmarkWorkout, Movement, MovementPattern } from '../data/movements/types';
import {
  getMovementById,
  getMovementsByBlock,
  getMovementsByTag,
  benchmarkWorkouts,
  strengthMovements,
  olyMovements,
  skillMovements,
} from '../data/movements';
import type {
  AthleteProfile,
  DailySession,
  Goal,
  PersonalRecords,
  RxOrScaled,
  SessionBlockResult,
  SessionHistoryEntry,
  WodResult,
} from '../data/athlete/types';
import { getDayPlan, getMesocycleWeek, getWeekdayIndex, isEmphasisDay, toLocalIsoDate, type DayPlan, type OlyFamily } from './periodization';
import { OLY_WEEK_SCHEMES, roundToNearestPlate, STRENGTH_WEEK_SCHEMES } from './oneRepMaxTables';
import { getRecentMovementIds, pickLeastRecentlyUsed, pickManyVaried, pickVaried, pickVariedWithPreference } from './variability';
import { getGoalProgress } from './goalProgress';
import { dominantWodDomain, generateWodName, getWodDomain, pickSmartBenchmark, WOD_PRESCRIPTION, WOD_TIME_DOMAIN } from './wodDomains';
import { computeAcwr, type AcwrZone } from './loadMetrics';
import { getAutoregFactor, getAutoregNote } from './autoregulation';
import { resolveTrainingWeek, isTaperActive, DELOAD_REASON_NOTE } from './deload';
import { resolveStrengthPRKey } from './prResolution';
import { avoidOlyFamilyRepeat, avoidPatternRepeat } from './movementBalance';

export { OLY_ROOT_PR_MAP, resolveOlyPRKey, resolveStrengthPRKey, STRENGTH_ROOT_PR_MAP } from './prResolution';

const ACCESSORY_COMPLEMENT: Partial<Record<MovementPattern, MovementPattern[]>> = {
  squat: ['hinge', 'lunge'],
  hinge: ['squat', 'core'],
  horizontalPush: ['horizontalPull'],
  verticalPush: ['horizontalPull', 'core'],
};

const ACCESSORY_RATIONALE: Partial<Record<MovementPattern, string>> = {
  squat: 'Refuerza cadera e isquiotibiales para proteger la rodilla en el squat.',
  hinge: 'Equilibrio de tren inferior tras el trabajo de bisagra de hoy.',
  horizontalPush: 'Equilibrio empuje/tirón para proteger el hombro tras el press horizontal.',
  verticalPush: 'Equilibrio empuje/tirón y estabilidad de core tras el press vertical.',
};

type AccessoryMethod = 'straightSets' | 'giantSet' | 'superset';

const ACCESSORY_METHOD_LABEL: Record<AccessoryMethod, string> = {
  straightSets: 'Series independientes',
  giantSet: 'Giant Set',
  superset: 'Superset',
};

const ACCESSORY_METHOD_NOTE: Record<AccessoryMethod, string> = {
  straightSets: 'Completa todas las series de un movimiento antes de pasar al siguiente.',
  giantSet: 'Encadena los movimientos sin descanso entre ellos; descansa solo al terminar la ronda completa.',
  superset: 'Alterna ambos movimientos con el mínimo descanso entre ellos — descansa al completar la pareja.',
};

type WodFormatKind = 'forTime' | 'amrap' | 'emom' | 'interval' | 'ladder' | 'chipper';

const WOD_FORMAT_RATIONALE: Record<WodFormatKind, string> = {
  forTime: 'Estímulo de intensidad — controla el ritmo en las primeras rondas para no colapsar al final.',
  amrap: 'Acumula el máximo de rondas de calidad — no sacrifiques técnica por velocidad.',
  emom: 'Gestiona el descanso dentro del minuto — la técnica manda sobre la velocidad.',
  interval: 'Cada intervalo debe sobrarte descanso — si llegas justo, baja el ritmo en el siguiente.',
  ladder: 'Empieza ligero y controlado: la exigencia real llega en las últimas rondas, no en la primera.',
  chipper: 'Una sola ronda larga — reparte el esfuerzo, no ataques los primeros movimientos como un sprint.',
};

const COOLDOWN_BY_PATTERN: Partial<Record<MovementPattern, string[]>> = {
  squat: ['hamstring-stretch', 'hip-flexor-stretch', 'breathing-recovery'],
  hinge: ['hamstring-stretch', 'hip-flexor-stretch', 'breathing-recovery'],
  verticalPush: ['shoulder-stretch', 'static-stretch-upper-body', 'breathing-recovery'],
  horizontalPush: ['shoulder-stretch', 'static-stretch-upper-body', 'breathing-recovery'],
};

type StrengthSchemeStyle = 'straightSets' | 'ascendingLadder' | 'tempoWork' | 'volumeSets';

const STRENGTH_SCHEME_LABEL: Record<StrengthSchemeStyle, string> = {
  straightSets: 'Series rectas',
  ascendingLadder: 'Rampa ascendente',
  tempoWork: 'Tempo controlado',
  volumeSets: 'Volumen de acumulación',
};

const STRENGTH_SCHEME_NOTE: Record<StrengthSchemeStyle, string> = {
  straightSets: '',
  ascendingLadder: 'Las primeras series son de aproximación — sube la carga en cada una hasta la serie final, la que de verdad cuenta.',
  tempoWork: 'Controla 3 segundos en la fase excéntrica y pausa 1 segundo abajo en cada repetición — hoy manda el control, no la velocidad.',
  volumeSets: 'Serie de volumen a intensidad moderada para construir base de trabajo — prioriza completar todas las repeticiones sin fallar.',
};

/** Un coach no entrena la fuerza siempre igual: rota el estilo de la sesion en vez de series rectas todos los dias. */
function pickStrengthSchemeStyle(week: 1 | 2 | 3 | 4): StrengthSchemeStyle {
  if (week === 4) return Math.random() < 0.5 ? 'straightSets' : 'volumeSets';
  const roll = Math.random();
  if (roll < 0.4) return 'straightSets';
  if (roll < 0.65) return 'ascendingLadder';
  if (roll < 0.85) return 'tempoWork';
  return 'volumeSets';
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
  const roll = Math.random();
  if (roll < 0.175) return 'strength';
  if (roll < 0.35) return 'oly';
  return null;
}

function resolveStrengthPR(movement: Movement, prs: PersonalRecords): number {
  const key = resolveStrengthPRKey(movement);
  return key ? prs[key] : prs.backSquat;
}

function resolveOlyPR(movement: Movement, prs: PersonalRecords, family: OlyFamily): number {
  if (movement.id === 'clean-and-jerk' || movement.id.includes('jerk')) return prs.cleanAndJerk;
  return family === 'snatch' ? prs.snatch : prs.clean;
}

interface GoalPreference {
  movementId?: string;
  preferChance: number;
  /** Progreso (0-1) del objetivo hacia su fecha, usado para intensificar gradualmente el sesgo. */
  progress: number;
}

function goalPreference(
  goal: Goal | null,
  appliesTo: (movement: Movement) => boolean,
  history: SessionHistoryEntry[],
): GoalPreference {
  if (!goal || !goal.movementId) return { preferChance: 0, progress: 0 };
  const movement = getMovementById(goal.movementId);
  if (!movement || !appliesTo(movement)) return { preferChance: 0, progress: 0 };

  const progress = getGoalProgress(goal, history);
  const base = goal.emphasis === 'intensivo' ? 0.9 : 0.6;
  const ramped = goal.emphasis === 'intensivo' ? 0.95 : 0.75;
  return { movementId: goal.movementId, preferChance: base + (ramped - base) * progress, progress };
}

/** A partir del ultimo tercio antes de la fecha del objetivo, un enfasis "moderado" empieza a comportarse como "intensivo". */
function actsIntensive(goal: Goal, progress: number): boolean {
  return goal.emphasis === 'intensivo' || progress > 0.66;
}

function buildStrengthBlock(
  dayPlan: DayPlan,
  week: 1 | 2 | 3 | 4,
  prs: PersonalRecords,
  recentIds: Set<string>,
  goal: Goal | null,
  acwrZone: AcwrZone,
  acwrColdStart: boolean,
  isTestDay: boolean,
  history: SessionHistoryEntry[],
): SessionBlockResult[] {
  const autoregFactor = getAutoregFactor(acwrZone);
  const autoregNote = getAutoregNote(acwrZone, acwrColdStart);
  const isStrengthGoal = goal?.type === 'elevar-fuerza' || goal?.type === 'subir-pr';
  const pref = isStrengthGoal
    ? goalPreference(goal, (m) => strengthMovements.some((s) => s.id === m.id), history)
    : { preferChance: 0, progress: 0 };

  let pattern = dayPlan.strengthPattern;
  if (pref.movementId && goal && actsIntensive(goal, pref.progress) && isEmphasisDay(dayPlan.trainingDayIndex)) {
    pattern = getMovementById(pref.movementId)!.pattern;
  }
  // Se aplica siempre, no solo cuando el objetivo fuerza el patron: el ciclo natural de la semana
  // tambien puede coincidir con lo entrenado el dia anterior (p.ej. entre semanas).
  pattern = avoidPatternRepeat(pattern, history);

  const candidates = getMovementsByBlock('strength').filter((m) => m.pattern === pattern);
  const movement = pickVariedWithPreference(candidates, recentIds, pref.movementId, pref.preferChance);
  if (!movement) return [];

  const currentPR = resolveStrengthPR(movement, prs);
  const goalTag = pref.movementId && movement.id === pref.movementId ? ' Prioridad por tu objetivo activo.' : '';

  if (isTestDay) {
    const testLoadKg = roundToNearestPlate(currentPR);
    return [
      {
        block: 'strength',
        movementId: movement.id,
        format: 'Test 1RM',
        reps: '1',
        loadKg: testLoadKg,
        notes: `Día de test de fuerza máxima — calienta con series de aproximación y busca un nuevo máximo a 1 repetición. Tu referencia de hoy es ${testLoadKg} kg.${goalTag}`,
      },
    ];
  }

  const scheme = STRENGTH_WEEK_SCHEMES[week];
  const style = pickStrengthSchemeStyle(week);
  const styleNote = STRENGTH_SCHEME_NOTE[style];
  const notes = `${scheme.coachNote}${styleNote ? ` ${styleNote}` : ''}${goalTag}${autoregNote ? ` ${autoregNote}` : ''}`;

  if (style === 'ascendingLadder') {
    const topPercent = Math.min(scheme.percent + 0.08, 0.92);
    return [
      {
        block: 'strength',
        movementId: movement.id,
        format: STRENGTH_SCHEME_LABEL.ascendingLadder,
        sets: 3,
        reps: '5-3-1',
        loadKg: roundToNearestPlate(currentPR * topPercent * autoregFactor),
        notes,
      },
    ];
  }

  if (style === 'tempoWork') {
    return [
      {
        block: 'strength',
        movementId: movement.id,
        format: STRENGTH_SCHEME_LABEL.tempoWork,
        sets: scheme.sets,
        reps: `${scheme.reps} (tempo 3-1-1)`,
        loadKg: roundToNearestPlate(currentPR * scheme.percent * autoregFactor),
        notes,
      },
    ];
  }

  if (style === 'volumeSets') {
    const volumePercent = Math.max(scheme.percent - 0.12, 0.45);
    return [
      {
        block: 'strength',
        movementId: movement.id,
        format: STRENGTH_SCHEME_LABEL.volumeSets,
        sets: scheme.sets + 1,
        reps: String(scheme.reps + 4),
        loadKg: roundToNearestPlate(currentPR * volumePercent * autoregFactor),
        notes,
      },
    ];
  }

  const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor);
  return [{ block: 'strength', movementId: movement.id, sets: scheme.sets, reps: String(scheme.reps), loadKg, notes }];
}

function buildOlyBlock(
  dayPlan: DayPlan,
  week: 1 | 2 | 3 | 4,
  prs: PersonalRecords,
  recentIds: Set<string>,
  goal: Goal | null,
  acwrZone: AcwrZone,
  acwrColdStart: boolean,
  isTestDay: boolean,
  history: SessionHistoryEntry[],
): SessionBlockResult[] {
  const autoregFactor = getAutoregFactor(acwrZone);
  const autoregNote = getAutoregNote(acwrZone, acwrColdStart);
  const isOlyGoal = goal?.type === 'mejorar-potencia' || goal?.type === 'subir-pr';
  const pref = isOlyGoal
    ? goalPreference(goal, (m) => olyMovements.some((o) => o.id === m.id), history)
    : { preferChance: 0, progress: 0 };

  let family = dayPlan.olyFamily;
  if (pref.movementId && goal && actsIntensive(goal, pref.progress) && isEmphasisDay(dayPlan.trainingDayIndex)) {
    family = pref.movementId.includes('snatch') ? 'snatch' : 'clean';
  }
  // Se aplica siempre, no solo cuando el objetivo fuerza la familia: el ciclo natural tambien
  // puede coincidir con lo entrenado el dia anterior (p.ej. entre semanas en calendarios de 3 dias).
  family = avoidOlyFamilyRepeat(family, history);

  const fullLiftIds = family === 'snatch' ? ['snatch'] : ['clean-and-jerk', 'clean'];
  let candidates = getMovementsByBlock('oly').filter((m) =>
    family === 'snatch' ? m.id.includes('snatch') : m.id.includes('clean') || m.id.includes('jerk'),
  );

  const isEarlyWeek = week <= 2;
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
  if (!movement) return [];

  if (isTestDay && fullLiftIds.includes(movement.id)) {
    const testLoadKg = roundToNearestPlate(resolveOlyPR(movement, prs, family));
    const goalTag = pref.movementId && movement.id === pref.movementId ? ' Prioridad por tu objetivo activo.' : '';
    const liftLabel = family === 'snatch' ? 'snatch' : 'clean & jerk';
    return [
      {
        block: 'oly',
        movementId: movement.id,
        format: 'Test 1RM',
        reps: '1',
        loadKg: testLoadKg,
        notes: `Día de test de máximo en ${liftLabel} — calienta con series de aproximación técnica y busca un nuevo máximo a 1 repetición. Tu referencia de hoy es ${testLoadKg} kg.${goalTag}`,
      },
    ];
  }

  const scheme = OLY_WEEK_SCHEMES[week];
  const loadKg = roundToNearestPlate(resolveOlyPR(movement, prs, family) * scheme.percent * autoregFactor);
  const baseNote =
    (pref.movementId && movement.id === pref.movementId
      ? `${scheme.coachNote} Prioridad por tu objetivo activo.`
      : scheme.coachNote) + (autoregNote ? ` ${autoregNote}` : '');

  // Semana pico: siempre series rectas (consolidar tecnica al maximo esfuerzo). Resto de semanas: variabilidad de formato.
  // EMOM es un estilo del levantamiento principal, no reemplaza el complejo de 2 movimientos (primer + principal).
  const canUseEmom = week !== 3;
  const useEmom = canUseEmom && Math.random() < 0.3;

  let mainEntry: SessionBlockResult;
  if (useEmom) {
    const emomMinutes = [8, 10, 12][Math.floor(Math.random() * 3)];
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

  // Complejo real de oly: un primer tecnico (hang, muscle, pull, balance...) antes del levantamiento
  // principal, no un movimiento aislado — asi se entrena de verdad en programacion profesional.
  const familyPool = getMovementsByBlock('oly').filter((m) =>
    family === 'snatch' ? m.id.includes('snatch') : m.id.includes('clean') || m.id.includes('jerk'),
  );
  const primerCandidates = familyPool.filter((m) => m.id !== movement.id && m.progressionOf);
  const primerMovement = pickVaried(primerCandidates, recentIds);
  if (!primerMovement) return [mainEntry];

  const primerLoadKg = roundToNearestPlate(resolveOlyPR(primerMovement, prs, family) * scheme.percent * 0.75 * autoregFactor);
  const primerEntry: SessionBlockResult = {
    block: 'oly',
    movementId: primerMovement.id,
    sets: scheme.sets,
    reps: '2-3',
    loadKg: primerLoadKg,
    notes: `Primer técnico antes del levantamiento principal — prioriza posición, no peso.${autoregNote ? ` ${autoregNote}` : ''}`,
  };

  return [primerEntry, mainEntry];
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

function buildWodBlock(
  dayPlan: DayPlan,
  week: 1 | 2 | 3 | 4,
  trainingDaysPerWeek: 3 | 4 | 5 | 6,
  recentIds: Set<string>,
  excludePatterns: Set<MovementPattern>,
  goal: Goal | null,
  isTaper: boolean,
  history: SessionHistoryEntry[],
): SessionBlockResult[] {
  const recentBenchmarkIds = new Set(
    [...recentIds].filter((id) => id.startsWith('benchmark:')).map((id) => id.replace('benchmark:', '')),
  );

  const isCompeticionGoal = goal?.type === 'preparar-competicion';
  const competicionProgress = isCompeticionGoal ? getGoalProgress(goal!, history) : 0;
  // En taper no se fuerza testeo extra: un coach real no busca fatiga nueva a dias de competir.
  const forceBenchmarkByGoal =
    !isTaper &&
    isCompeticionGoal &&
    (competicionProgress > 0.8 ||
      ((goal!.emphasis === 'intensivo' || competicionProgress > 0.4) && isEmphasisDay(dayPlan.trainingDayIndex)));

  // En semana pico se testea mas: un segundo dia de benchmark a mitad de la semana de entreno.
  const isPeakWeekExtraBenchmark = week === 3 && dayPlan.trainingDayIndex === Math.floor(trainingDaysPerWeek / 2);

  if (dayPlan.trainingDayIndex === 0 || isPeakWeekExtraBenchmark || forceBenchmarkByGoal) {
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

  const timeDomain = WOD_TIME_DOMAIN[week];
  const isPeakWeek = week === 3;

  // Semana pico: formatos cortos e intensos, sin chipper largo ni escalera de acumulacion de volumen.
  const isChipperDay = !isPeakWeek && Math.random() < 0.15;
  const regularFormats: { label: string; kind: WodFormatKind }[] = [
    { label: `For Time (${timeDomain.rounds} rondas)`, kind: 'forTime' },
    { label: `AMRAP ${timeDomain.amrapMin} min`, kind: 'amrap' },
    { label: `EMOM ${timeDomain.emomMin} min (movimientos alternos)`, kind: 'emom' },
    { label: `Cada 3:00 x ${timeDomain.rounds} rondas`, kind: 'interval' },
    ...(isPeakWeek ? [] : [{ label: `Escalera ascendente · ${timeDomain.rounds} rondas (+3 reps/ronda)`, kind: 'ladder' as WodFormatKind }]),
  ];
  const chosenFormat = isChipperDay
    ? { label: 'Chipper — 1 ronda completa', kind: 'chipper' as WodFormatKind }
    : regularFormats[Math.floor(Math.random() * regularFormats.length)];

  const movementCount = chosenFormat.kind === 'chipper' ? 5 : 3;

  const isResistenciaGoal = goal?.type === 'elevar-resistencia';
  const resistenciaProgress = isResistenciaGoal ? getGoalProgress(goal!, history) : 0;
  let monoTarget = 1;
  if (isResistenciaGoal) {
    const emphasisTarget = goal!.emphasis === 'intensivo' ? 2 : 1;
    const progressTarget = resistenciaProgress > 0.5 ? 2 : 1;
    monoTarget = Math.max(emphasisTarget, progressTarget);
  }

  // Trifecta clasica de CrossFit: 1 gimnastico + 1 con carga + 1 monoestructural cuando es posible.
  const gymnasticsPool = pool.filter((m) => getWodDomain(m.id) === 'gymnastics');
  const weightedPool = pool.filter((m) => getWodDomain(m.id) === 'weighted');
  const monoPool = pool.filter((m) => getWodDomain(m.id) === 'monostructural');
  const domainCycle = [weightedPool, gymnasticsPool, monoPool];

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

  pickFrom(gymnasticsPool);
  for (let i = 0; i < monoTarget && picks.length < movementCount; i++) pickFrom(monoPool);
  while (picks.length < movementCount) pickFrom(domainCycle[picks.length % domainCycle.length]);

  const title = generateWodName();

  return picks.map((m) => ({
    block: 'wod',
    movementId: m.id,
    reps: WOD_PRESCRIPTION[m.id] ?? '12-15',
    format: chosenFormat.label,
    title,
    notes: WOD_FORMAT_RATIONALE[chosenFormat.kind],
  }));
}

function buildAccessoryBlock(strengthPattern: MovementPattern, recentIds: Set<string>): SessionBlockResult[] {
  const complementPatterns = ACCESSORY_COMPLEMENT[strengthPattern] ?? [];
  const filtered = getMovementsByBlock('accessory').filter((m) => complementPatterns.includes(m.pattern));
  const pool = filtered.length > 0 ? filtered : getMovementsByBlock('accessory');
  const baseRationale = ACCESSORY_RATIONALE[strengthPattern] ?? 'Hipertrofia / accesorio complementario a la sesión de hoy.';

  // Un coach no repite siempre la misma metodologia: la mayoria de dias son series independientes,
  // pero con variabilidad entra el giant set (estilo "Body Armor") o el superset.
  const roll = Math.random();
  const method: AccessoryMethod = roll < 0.6 ? 'straightSets' : roll < 0.85 ? 'giantSet' : 'superset';
  const notes = `${baseRationale} ${ACCESSORY_METHOD_NOTE[method]}`;

  if (method === 'giantSet') {
    const unilateralPool = pool.filter((m) => m.tags.includes('unilateral'));
    const unilateral = pickVaried(unilateralPool.length > 0 ? unilateralPool : pool, recentIds);
    const restPool = pool.filter((m) => m.id !== unilateral?.id);
    const rest = pickManyVaried(restPool, 2, new Set([...recentIds, ...(unilateral ? [unilateral.id] : [])]));
    const picks = unilateral ? [unilateral, ...rest] : pickManyVaried(pool, 3, recentIds);
    return picks.map((m) => ({ block: 'accessory', movementId: m.id, sets: 3, reps: '8-12', format: ACCESSORY_METHOD_LABEL.giantSet, notes }));
  }

  const picks = pickManyVaried(pool, 2, recentIds);
  const reps = method === 'superset' ? '10-12' : '8-12';
  const format = method === 'superset' ? ACCESSORY_METHOD_LABEL.superset : undefined;
  return picks.map((m) => ({ block: 'accessory', movementId: m.id, sets: 3, reps, format, notes }));
}

function buildSkillBlock(history: SessionHistoryEntry[], goal: Goal | null): SessionBlockResult[] {
  const candidates = getMovementsByBlock('skill');
  const isSkillGoal = goal?.type === 'mejorar-gimnasticos' || goal?.type === 'subir-pr';
  const pref = isSkillGoal
    ? goalPreference(goal, (m) => skillMovements.some((s) => s.id === m.id), history)
    : { preferChance: 0, progress: 0 };

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

function buildWarmupBlock(strengthPattern: MovementPattern, includeOly = true): SessionBlockResult[] {
  const wodIds = ['general-aerobic-warmup', 'joint-mobility-flow'];
  const specific = getMovementsByTag(`especifico-${strengthPattern}`)[0];
  if (specific) wodIds.push(specific.id);

  const olyIds = ['barbell-warmup-complex', 'pvc-pass-through'];

  const toEntries = (ids: string[], subgroup: string, notes: string): SessionBlockResult[] =>
    [...new Set(ids)]
      .map((id) => getMovementById(id))
      .filter((m): m is Movement => Boolean(m))
      .map((m) => ({ block: 'warmup', movementId: m.id, subgroup, notes }));

  return [
    ...toEntries(wodIds, 'Para el WOD', 'Activa el patrón de movimiento de hoy antes de cargar peso.'),
    ...(includeOly
      ? toEntries(olyIds, 'Para Oly', 'Prepara posición y movilidad de hombro antes de tocar la barra de trabajo.')
      : []),
  ];
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

function buildRecoveryWodBlock(recentIds: Set<string>): SessionBlockResult[] {
  const pool = RECOVERY_CARDIO_IDS.map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m));
  const picks = pickManyVaried(pool, 2, recentIds);
  if (picks.length === 0) return [];

  const totalMinutes = 45 + Math.floor(Math.random() * 4) * 5; // 45 / 50 / 55 / 60
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

function buildRecoverySkillBlock(recentIds: Set<string>): SessionBlockResult[] {
  const pool = RECOVERY_SKILL_IDS.map((id) => getMovementById(id)).filter((m): m is Movement => Boolean(m));
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
  return Math.random() < 0.25;
}

function buildMaintenanceWodBlock(recentIds: Set<string>): SessionBlockResult[] {
  const pool = getMovementsByBlock('wod');
  const timeDomain = WOD_TIME_DOMAIN[2];

  const regularFormats: { label: string; kind: WodFormatKind }[] = [
    { label: `For Time (${timeDomain.rounds} rondas)`, kind: 'forTime' },
    { label: `AMRAP ${timeDomain.amrapMin} min`, kind: 'amrap' },
    { label: `EMOM ${timeDomain.emomMin} min (movimientos alternos)`, kind: 'emom' },
    { label: `Cada 3:00 x ${timeDomain.rounds} rondas`, kind: 'interval' },
  ];
  const chosenFormat = regularFormats[Math.floor(Math.random() * regularFormats.length)];

  // Misma trifecta clasica que en el macrociclo completo: 1 gimnastico + 1 con carga + 1 monoestructural.
  const gymnasticsPool = pool.filter((m) => getWodDomain(m.id) === 'gymnastics');
  const weightedPool = pool.filter((m) => getWodDomain(m.id) === 'weighted');
  const monoPool = pool.filter((m) => getWodDomain(m.id) === 'monostructural');
  const domainOrder = [gymnasticsPool, weightedPool, monoPool];

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

  const title = generateWodName();
  return picks.map((m) => ({
    block: 'wod',
    movementId: m.id,
    reps: WOD_PRESCRIPTION[m.id] ?? '12-15',
    format: chosenFormat.label,
    title,
    notes: WOD_FORMAT_RATIONALE[chosenFormat.kind],
  }));
}

function buildCooldownBlock(strengthPattern: MovementPattern): SessionBlockResult[] {
  const ids = COOLDOWN_BY_PATTERN[strengthPattern] ?? ['static-stretch-lower-body', 'static-stretch-upper-body', 'breathing-recovery'];
  return ids
    .map((id) => getMovementById(id))
    .filter((m): m is Movement => Boolean(m))
    .map((m) => ({ block: 'cooldown', movementId: m.id }));
}

export function generateDailySession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  date: Date = new Date(),
  goal: Goal | null = null,
): DailySession {
  const calendarWeek = getMesocycleWeek(profile.mesocycleStartDate, date);
  const weekdayIndex = getWeekdayIndex(date);
  const dayPlan = getDayPlan(weekdayIndex, profile.trainingDaysPerWeek);
  const dateIso = toLocalIsoDate(date);

  if (!dayPlan.isTrainingDay) {
    return { date: dateIso, mesocycleWeek: calendarWeek, isRestDay: true, blocks: [] };
  }

  const recentIds = getRecentMovementIds(history);

  if (dayPlan.isRecoveryDay) {
    const warmupBlock = buildWarmupBlock(dayPlan.strengthPattern, false);
    const recoveryWodBlock = buildRecoveryWodBlock(recentIds);
    const recoverySkillBlock = buildRecoverySkillBlock(recentIds);
    const cooldownBlock = buildCooldownBlock(dayPlan.strengthPattern);

    return {
      date: dateIso,
      mesocycleWeek: calendarWeek,
      isRestDay: false,
      blocks: [...warmupBlock, ...recoveryWodBlock, ...recoverySkillBlock, ...cooldownBlock],
    };
  }

  const acwrResult = computeAcwr(history, date);
  const acwrZone = acwrResult.zone;
  const { week, reason: deloadReason } = resolveTrainingWeek(calendarWeek, acwrZone, goal, date);
  const isTaper = isTaperActive(goal, date);
  const testDayFocus = resolveTestDayFocus(week);
  const strengthBlock = buildStrengthBlock(
    dayPlan,
    week,
    profile.prs,
    recentIds,
    goal,
    acwrZone,
    acwrResult.coldStart,
    testDayFocus === 'strength',
    history,
  );
  const olyBlock = buildOlyBlock(dayPlan, week, profile.prs, recentIds, goal, acwrZone, acwrResult.coldStart, testDayFocus === 'oly', history);
  const wodBlock = buildWodBlock(
    dayPlan,
    week,
    profile.trainingDaysPerWeek,
    recentIds,
    new Set([dayPlan.strengthPattern]),
    goal,
    isTaper,
    history,
  );
  const accessoryBlock = buildAccessoryBlock(dayPlan.strengthPattern, recentIds);
  const skillBlock = buildSkillBlock(history, goal);
  const warmupBlock = buildWarmupBlock(dayPlan.strengthPattern);
  const cooldownBlock = buildCooldownBlock(dayPlan.strengthPattern);

  return {
    date: dateIso,
    mesocycleWeek: week,
    isRestDay: false,
    blocks: [...warmupBlock, ...strengthBlock, ...wodBlock, ...olyBlock, ...accessoryBlock, ...skillBlock, ...cooldownBlock],
    deloadReason,
    deloadNote: deloadReason ? DELOAD_REASON_NOTE[deloadReason] : undefined,
  };
}

/** Bloques de una sesion "estilo mantenimiento": sin cargas de PR ni periodizacion, con o sin recuperacion. */
function buildMaintenanceStyleBlocks(
  dayPlan: DayPlan,
  history: SessionHistoryEntry[],
  recentIds: Set<string>,
  isRecovery: boolean,
): SessionBlockResult[] {
  const warmupBlock = buildWarmupBlock(dayPlan.strengthPattern, false);
  const wodBlock = isRecovery ? buildRecoveryWodBlock(recentIds) : buildMaintenanceWodBlock(recentIds);
  const skillBlock = isRecovery ? buildRecoverySkillBlock(recentIds) : buildSkillBlock(history, null);
  const cooldownBlock = buildCooldownBlock(dayPlan.strengthPattern);
  return [...warmupBlock, ...wodBlock, ...skillBlock, ...cooldownBlock];
}

/**
 * Sesion de mantenimiento para dias fuera de un macrociclo activo (antes de mesocycleStartDate):
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
  const blocks = buildMaintenanceStyleBlocks(dayPlan, history, recentIds, isMaintenanceRecoveryDay());

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
  const blocks = buildMaintenanceStyleBlocks(dayPlan, history, recentIds, type === 'recovery');

  return {
    date: dateIso,
    mesocycleWeek: 0,
    isRestDay: false,
    blocks,
    swapLabel: SESSION_OVERRIDE_LABEL[type],
  };
}

/** Punto unico de decision: mantenimiento antes del inicio del macrociclo, programacion completa despues. */
export function generateSessionForDate(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  date: Date,
  goal: Goal | null,
): DailySession {
  return toLocalIsoDate(date) < profile.mesocycleStartDate
    ? generateOffSeasonSession(profile, history, date)
    : generateDailySession(profile, history, date, goal);
}

export function toHistoryEntry(
  session: DailySession,
  rxOrScaled: RxOrScaled,
  rpe: number,
  durationMin: number,
  wodResult?: WodResult,
  testLoadKg?: number,
): SessionHistoryEntry {
  return {
    date: session.date,
    mesocycleWeek: session.mesocycleWeek,
    movementIds: session.blocks.map((b) => b.movementId),
    rxOrScaled,
    rpe,
    durationMin,
    wodResult,
    testLoadKg,
  };
}
