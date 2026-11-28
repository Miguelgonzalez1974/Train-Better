import type { AthleteProfile, DailySession, Goal, PersonalRecords, SessionHistoryEntry } from '../../data/athlete/types';
import { benchmarkWorkouts } from '../../data/movements';
import { computeAthleteDiagnosis } from '../../engine/athleteDiagnosis';
import { goalPrKey } from '../../engine/goalTarget';
import type { LevelSnapshot } from '../../engine/levelCategories';
import { isLiftStep, isNoProbeSession, isProbeDay, nextSteps, recentLevelUp, type NextStep, type StepKey } from '../../engine/levelNextStep';
import { computeReferenceLevel, timeText, ZONES, type ReferenceLevel } from '../../engine/levelReference';
import { nextTestOfSameKind, testName, testSlotOf, upcomingTests } from '../../engine/levelTestPlan';
import { addDaysIso, isoDiffDays } from '../../engine/periodization';
import { LOW_UNTIL } from '../../engine/readinessScore';
import { parseTimeSeconds } from '../../engine/wodGhost';
import { wodResultsOf } from '../../engine/wodScoring';
import { MARK_LIFTS } from './rexMarks';
import { agoText } from './sessionCardModel';
import { wodWhat } from './sessionCardWod';

/**
 * «Tu nivel»: la tarjeta del Resumen (tu escalón frente a otros, lo que toca mejorar, tu peso, el salto que tienes más cerca, el próximo test y tu
 * último récord) y las listas de su pantalla. Todo sale de datos que ya existen. Puro: lo pintan `LevelSummaryCard` y `LevelScreen`.
 */

const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

export interface LevelCardStep {
  /** `today`: hoy puedes intentarlo; `hold`: ahora no toca probar; `done`: acabas de subir de escalón. */
  tone: 'normal' | 'today' | 'hold' | 'done';
  /** Un test de tiempo (Fran, 5 km) y no un levantamiento. */
  timed: boolean;
  title: string;
  text: string;
}

export interface LevelCardModel {
  /** Tu nivel (0-100); null con menos de tres categorías. */
  overall: number | null;
  /** Cambio en 3 meses. */
  delta: number | null;
  filled: number;
  total: number;
  /** Tu escalón frente a hombres de tu edad y peso: el de conjunto o, con menos de tres categorías medidas, el de tu mejor una. */
  stairs: { zone: number | null; value: string; label: string };
  improve: { value: string; label: string };
  /** Tu último peso apuntado. */
  weightKg: number | null;
  step: LevelCardStep | null;
  test: { text: string; when: string } | null;
  line: { text: string; icon: 'trophy' | 'info' };
}

/** El último récord: la marca apuntada más reciente que supera todas las anteriores de su levantamiento (la primera de cada uno es el punto de partida). */
export function latestRecord(profile: AthleteProfile): { key: string; label: string; kg: number; date: string } | null {
  const best = new Map<string, number>();
  let last: { key: string; label: string; kg: number; date: string } | null = null;
  for (const e of [...(profile.prLog ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
    const previous = best.get(e.key);
    if (previous !== undefined && e.kg > previous) {
      const label = MARK_LIFTS.find((l) => l.key === e.key)?.label ?? e.key;
      if (!last || e.date >= last.date) last = { key: e.key, label, kg: e.kg, date: e.date };
    }
    best.set(e.key, Math.max(previous ?? 0, e.kg));
  }
  return last;
}

const STEP_NAME: Record<StepKey, string> = {
  backSquat: 'Sentadilla',
  deadlift: 'Peso muerto',
  benchPress: 'Press banca',
  snatch: 'Snatch',
  cleanAndJerk: 'C&J',
  fran: 'Fran',
  run5k: '5 km',
};
/** El mismo nombre en mitad de una frase. */
const midName = (key: StepKey) => (key === 'cleanAndJerk' || key === 'fran' ? STEP_NAME[key] : STEP_NAME[key].toLowerCase());

const weekday = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'long' }).format(new Date(`${iso}T12:00:00`));
const shortMonth = (iso: string) => new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace('.', '');
/** «lunes 30» si cae en las próximas dos semanas; más allá, con el mes. */
const dayText = (iso: string, todayIso: string) => `${weekday(iso)} ${Number(iso.slice(8, 10))}${isoDiffDays(todayIso, iso) > 14 ? ` ${shortMonth(iso)}` : ''}`;

/** Con cuántos días por delante se mira qué día toca el levantamiento (menos de una semana, para que el nombre del día no se repita). */
const LOOK_AHEAD_DAYS = 6;

export interface LevelCardInput {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  level: LevelSnapshot;
  todayIso: string;
  /** La sesión de hoy, hecha o por hacer; null si no hay. */
  todayPlan: DailySession | null;
  /** La sesión prevista de un día que viene. */
  sessionOn: (dateIso: string) => DailySession | null;
  /** Tu preparación de hoy (0-100), si se sabe. */
  readiness: number | null;
}

/** Lo que frena ese levantamiento según el diagnóstico (las proporciones entre tus marcas); si no destaca nada, lo que tienes hoy. */
function stepReason(profile: AthleteProfile, history: SessionHistoryEntry[], step: NextStep, today: Date): string {
  const areas = computeAthleteDiagnosis({ profile, history, today }).areas;
  const lagging = (key: 'fuerza' | 'halterofilia') => {
    const weakest = areas.find((a) => a.key === key)?.weakest;
    return weakest && weakest.tone !== 'good' ? weakest.id : null;
  };
  if (step.key === 'cleanAndJerk' && lagging('halterofilia') === 'jerk') return `Te frena el jerk (clean ${num(profile.prs.clean)})`;
  if (step.key === 'cleanAndJerk' && lagging('halterofilia') === 'clean') return 'Te frena el tirón del clean';
  if (step.key === 'snatch' && lagging('halterofilia') === 'snatch') return 'Tu snatch va por detrás del C&J';
  if ((step.key === 'deadlift' || step.key === 'benchPress') && lagging('fuerza') === step.key) return 'Va por detrás de tu sentadilla';
  return `Ahora tienes ${step.kind === 'kg' ? `${num(step.current)} kg` : timeText(step.current)}`;
}

/** Cómo se pide un salto en pocas palabras: «C&J 72,5 kg» o «Fran en 8:08». */
const askText = (step: NextStep) => (step.kind === 'kg' ? `${midName(step.key)} ${num(step.target)} kg` : `${midName(step.key)} en ${timeText(step.target)}`);

function buildStep(input: LevelCardInput, reference: ReferenceLevel, today: Date): LevelCardStep | null {
  const { profile, history, todayIso, todayPlan, sessionOn, readiness } = input;
  const step = nextSteps(reference)[0];
  const up = recentLevelUp(profile, history, today, todayIso);
  if (up) {
    return {
      tone: 'done',
      timed: false,
      title: `${up.zoneName} en ${midName(up.key)} conseguido`,
      text: step ? `Siguiente: ${askText(step)} para ${step.zoneName}` : 'Sigue así',
    };
  }
  if (!step) return null;
  const name = STEP_NAME[step.key];
  const trained = history.some((h) => h.date === todayIso);

  if (!isLiftStep(step.key)) {
    const goal = `${timeText(step.target)} o menos`;
    if (!trained && todayPlan?.levelTest?.key === step.key) {
      return { tone: 'today', timed: true, title: `Hoy toca ${midName(step.key)}: ${goal} es ${step.zoneName}`, text: 'Apunta el tiempo tal cual salga' };
    }
    const planned = upcomingTests(profile, history, todayIso, 3).find((t) => t.key === step.key && t.date > todayIso && isoDiffDays(todayIso, t.date) <= 14);
    return {
      tone: 'normal',
      timed: true,
      title: `${name}: ${goal} y pasas a ${step.zoneName}`,
      text: [stepReason(profile, history, step, today), planned ? `toca el ${dayText(planned.date, todayIso)}` : ''].filter(Boolean).join(' · '),
    };
  }

  const short = `${name}: a ${num(step.gap)} kg de ${step.zoneName}`;
  if (todayPlan && isNoProbeSession(todayPlan) && !isProbeDay(todayPlan, step.key)) return { tone: 'hold', timed: false, title: short, text: 'Esta semana no toca probar marca' };
  if (!trained && todayPlan && isProbeDay(todayPlan, step.key)) {
    if (readiness !== null && readiness <= LOW_UNTIL) return { tone: 'hold', timed: false, title: short, text: 'Hoy llegas con poca energía: sin pruebas' };
    return { tone: 'today', timed: false, title: `Hoy toca ${midName(step.key)}: ${num(step.target)} kg es ${step.zoneName}`, text: 'Pruébalo solo si las series salen limpias' };
  }
  let when = '';
  for (let d = 1; d <= LOOK_AHEAD_DAYS && !when; d++) {
    const iso = addDaysIso(todayIso, d);
    const session = sessionOn(iso);
    if (session && isProbeDay(session, step.key)) when = d === 1 ? 'toca mañana' : `toca el ${weekday(iso)}`;
  }
  return {
    tone: 'normal',
    timed: false,
    title: `${name}: ${num(step.target)} kg y pasas a ${step.zoneName}`,
    text: [stepReason(profile, history, step, today), when].filter(Boolean).join(' · '),
  };
}

/** El próximo test de nivel; si el coach ya lo va a aplazar, lo dice y da la nueva fecha. */
function buildTestLine({ profile, history, todayIso, todayPlan, sessionOn }: LevelCardInput): LevelCardModel['test'] {
  const next = upcomingTests(profile, history, todayIso, 1)[0];
  if (!next) return null;
  const inDays = isoDiffDays(todayIso, next.date);
  const session = inDays === 0 ? todayPlan : inDays <= 7 ? sessionOn(next.date) : null;
  if (session?.levelTestPostponed) {
    const week = addDaysIso(next.date, 7);
    const retry = testSlotOf(week)?.index === testSlotOf(next.date)?.index ? week : nextTestOfSameKind(next.date);
    return { text: `${testName(next.key)} aplazado`, when: retry ? `nueva fecha: ${dayText(retry, todayIso)}` : '' };
  }
  if (inDays === 0) return { text: `Hoy: test ${testName(next.key)}`, when: '' };
  return {
    text: `Próximo test: ${testName(next.key)} · ${dayText(next.date, todayIso)}`,
    when: inDays === 1 ? 'mañana' : inDays <= 14 ? `en ${inDays} días` : `en ${Math.round(inDays / 7)} semanas`,
  };
}

function buildStairs(reference: ReferenceLevel): LevelCardModel['stairs'] {
  if (reference.overall) return { zone: reference.overall.zone, value: ZONES[reference.overall.zone], label: 'en conjunto' };
  const placed = reference.categories.filter((c) => c.placement !== null);
  if (placed.length > 0) {
    const best = placed.reduce((a, b) => (b.placement!.position > a.placement!.position ? b : a));
    return { zone: best.placement!.zone, value: ZONES[best.placement!.zone], label: best.label.toLowerCase() };
  }
  return { zone: null, value: '—', label: reference.age === null ? 'falta tu año' : reference.bodyweightKg === null ? 'falta tu peso' : 'faltan marcas' };
}

export function buildLevelCard(input: LevelCardInput): LevelCardModel {
  const { profile, history, level, todayIso } = input;
  const today = new Date(`${todayIso}T12:00:00`);
  const reference = computeReferenceLevel({ profile, history, today });

  const scored = level.categories.filter((c) => c.score !== null);
  const weak = scored.length >= 2 ? scored.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a)) : null;
  const improve = weak ? { value: weak.label, label: `a mejorar · ${weak.score}` } : { value: '—', label: 'a mejorar' };

  const record = latestRecord(profile);
  const missing = level.categories.length - level.filled;
  const line: LevelCardModel['line'] = record
    ? { icon: 'trophy', text: `Último récord: ${record.label} ${num(record.kg)} kg · ${record.date >= todayIso ? 'hoy' : agoText(record.date, todayIso)}` }
    : { icon: 'info', text: missing > 0 ? `Faltan ${missing} ${missing === 1 ? 'categoría' : 'categorías'} por medir` : 'Aún sin récords nuevos' };

  return {
    overall: level.overall,
    delta: level.delta,
    filled: level.filled,
    total: level.categories.length,
    stairs: buildStairs(reference),
    improve,
    weightKg: reference.bodyweightKg,
    step: buildStep(input, reference, today),
    test: buildTestLine(input),
    line,
  };
}

/** La meta en kilos de un levantamiento, si tienes un objetivo abierto con ella. */
export function kgGoalFor(goals: Goal[], key: keyof PersonalRecords, todayIso: string): number | null {
  const goal = goals.find((g) => g.targetKg !== undefined && g.targetDate >= todayIso && goalPrKey(g) === key);
  return goal?.targetKg ?? null;
}

export interface RecentWod {
  date: string;
  /** Lo que era: el nombre del clásico o sus movimientos. */
  title: string;
  value: string;
  rx: boolean;
  /** Tu mejor tiempo de ese benchmark, habiéndolo hecho antes. */
  best: boolean;
}

const benchmarkIdOf = (e: SessionHistoryEntry) => e.movementIds?.find((id) => id.startsWith('benchmark:'));

/** Tus últimos resultados de WOD, del más reciente al más antiguo. */
export function recentWods(history: SessionHistoryEntry[], n = 5): RecentWod[] {
  const withResult = history.filter((e) => wodResultsOf(e).length > 0).sort((a, b) => b.date.localeCompare(a.date));
  return withResult.slice(0, n).map((e) => {
    const result = wodResultsOf(e)[0].result;
    const bench = benchmarkIdOf(e);
    const blocks = e.wodBlocks ?? [];
    const title = (blocks.length > 0 ? wodWhat(blocks) : '') || benchmarkWorkouts.find((w) => `benchmark:${w.id}` === bench)?.name || 'WOD';
    const seconds = result.scoreType === 'time' && !result.capped ? parseTimeSeconds(result.value) : null;
    const earlier = bench
      ? history
          .filter((h) => h.date < e.date && benchmarkIdOf(h) === bench && h.wodResult?.scoreType === 'time' && !h.wodResult.capped)
          .map((h) => parseTimeSeconds(h.wodResult!.value))
          .filter((s): s is number => s !== null)
      : [];
    const best = seconds !== null && earlier.length > 0 && seconds < Math.min(...earlier);
    return { date: e.date, title, value: result.value, rx: e.rxOrScaled === 'rx', best };
  });
}
