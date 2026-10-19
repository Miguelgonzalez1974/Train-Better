import type { HabitTag, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { HABIT_CONDITION, HABIT_LABEL, HABIT_ORDER } from './habits';
import { readinessAxisScores } from './readiness';
import { RECOVERY_AXIS_LABEL, type RecoveryAxisKey } from './recovery';

/**
 * Etapa 1 de "la nota aprende de ti": cruza cada check-in con cómo te salió la sesión de ese mismo día (RPE) y
 * enseña qué te afecta de verdad — p. ej. "cuando duermes mal, tus sesiones te cuestan +1,2 de RPE". Es solo
 * lectura: NO cambia la nota ni la carga. Si más adelante se aplican pesos aprendidos, saldrán de aquí.
 * Correlación, no causa: el RPE también depende de lo duro que fuese el día programado.
 */

export type LearnedFactorKey = RecoveryAxisKey | 'sleepHours' | 'hrv' | `habit:${HabitTag}`;

export interface LearnedInsight {
  key: LearnedFactorKey;
  label: string;
  /** Cuándo se cumple, en segunda persona: "duermes mal". */
  condition: string;
  /** Sesiones con ese factor en contra y sin él. */
  nBad: number;
  nOk: number;
  rpeBad: number;
  rpeOk: number;
  /** rpeBad - rpeOk: cuánto más te cuestan las sesiones con ese factor en contra. */
  delta: number;
}

export interface ReadinessLearning {
  /** Sesiones que tienen check-in del mismo día. */
  pairs: number;
  /** Mínimo de sesiones emparejadas antes de enseñar nada. */
  needed: number;
  ready: boolean;
  /** Factores con datos suficientes, del que más pesa al que menos. */
  insights: LearnedInsight[];
}

export const LEARNING_MIN_PAIRS = 12;
const MIN_GROUP = 3;
const SHORT_SLEEP_HOURS = 6.5;

const CONDITION: Record<RecoveryAxisKey | 'sleepHours' | 'hrv', string> = {
  hrv: 'tu HRV cae por debajo de tu rango',
  sleep: 'duermes mal',
  soreness: 'llegas con agujetas altas',
  stress: 'vas con estrés alto',
  motivation: 'vas con poca motivación',
  sleepHours: `duermes menos de ${String(SHORT_SLEEP_HOURS).replace('.', ',')} h`,
};

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A partir de cuánto (en puntos de RPE) un factor en contra cuenta DOBLE para ti, y por debajo de cuánto "apenas te afecta" y no cuenta. */
export const LEARNED_HIGH_DELTA = 1;
export const LEARNED_LOW_DELTA = 0.3;
const LEARNED_SHIFT_MAX = 2;

export interface LearnedShiftLine {
  key: LearnedFactorKey;
  /** `doble`: en tus datos te cuesta mucho y hoy cuenta doble; `neutro`: apenas te afecta y hoy no cuenta en contra. */
  kind: 'doble' | 'neutro';
  text: string;
}

export interface LearnedShift {
  /** Ajuste a la puntuación del check-in (-2…2): se guarda en `ReadinessCheck.learnedShift`. */
  shift: number;
  lines: LearnedShiftLine[];
}

const fmtDelta = (d: number) => `${d > 0 ? '+' : ''}${String(d).replace('.', ',')}`;

/**
 * Pesos aprendidos de ti: cuando hay datos suficientes, un factor en contra de HOY que en tu historial te sube mucho el esfuerzo
 * de las sesiones (≥ 1 de RPE) cuenta doble, y uno que apenas te afecta (≤ 0,3) no se cuenta en contra. Así el ajuste de carga
 * del check-in deja de ser el mismo para todos. Solo mira los factores que hoy están en contra, y solo con datos suficientes.
 */
export function learnedScoreShift(check: ReadinessCheck, learning: ReadinessLearning): LearnedShift {
  const none: LearnedShift = { shift: 0, lines: [] };
  if (!learning.ready) return none;
  const axes = readinessAxisScores(check);
  const adverse: LearnedFactorKey[] = (['sleep', 'soreness', 'stress', 'motivation'] as RecoveryAxisKey[]).filter((k) => axes[k] <= -1);
  if (check.hrvVs === 'bajo') adverse.push('hrv');

  let shift = 0;
  const lines: LearnedShiftLine[] = [];
  for (const key of adverse) {
    const insight = learning.insights.find((i) => i.key === key);
    if (!insight) continue;
    if (insight.delta >= LEARNED_HIGH_DELTA) {
      shift -= 1;
      lines.push({ key, kind: 'doble', text: `${insight.label} pesa doble hoy: en tus datos, cuando ${insight.condition}, tus sesiones te cuestan ${fmtDelta(insight.delta)} de RPE` });
    } else if (insight.delta <= LEARNED_LOW_DELTA) {
      shift += 1;
      lines.push({ key, kind: 'neutro', text: `${insight.label}: en tus datos apenas te afecta (${fmtDelta(insight.delta)} de RPE), así que hoy no lo cuento en contra` });
    }
  }
  return { shift: Math.max(-LEARNED_SHIFT_MAX, Math.min(LEARNED_SHIFT_MAX, shift)), lines };
}

export function computeReadinessLearning(log: ReadinessCheck[] | undefined, history: SessionHistoryEntry[]): ReadinessLearning {
  const checkByDate = new Map((log ?? []).map((c) => [c.date, c]));
  // Una entrada por día (la última), con RPE válido.
  const rpeByDate = new Map<string, number>();
  for (const h of history) if (h.rpe >= 1 && h.rpe <= 10) rpeByDate.set(h.date, h.rpe);

  const pairs: { check: ReadinessCheck; rpe: number }[] = [];
  for (const [date, rpe] of rpeByDate) {
    const check = checkByDate.get(date);
    if (check) pairs.push({ check, rpe });
  }

  const result: ReadinessLearning = { pairs: pairs.length, needed: LEARNING_MIN_PAIRS, ready: pairs.length >= LEARNING_MIN_PAIRS, insights: [] };
  if (!result.ready) return result;

  const split = (key: LearnedFactorKey, isBad: (p: { check: ReadinessCheck }) => boolean | null) => {
    const bad: number[] = [];
    const ok: number[] = [];
    for (const p of pairs) {
      const flag = isBad(p);
      if (flag === null) continue;
      (flag ? bad : ok).push(p.rpe);
    }
    if (bad.length < MIN_GROUP || ok.length < MIN_GROUP) return;
    const rpeBad = mean(bad);
    const rpeOk = mean(ok);
    const habit = key.startsWith('habit:') ? (key.slice(6) as HabitTag) : null;
    result.insights.push({
      key,
      label: habit ? HABIT_LABEL[habit] : key === 'sleepHours' ? 'Horas de sueño' : key === 'hrv' ? 'HRV' : RECOVERY_AXIS_LABEL[key as RecoveryAxisKey],
      condition: habit ? HABIT_CONDITION[habit] : CONDITION[key as RecoveryAxisKey | 'sleepHours' | 'hrv'],
      nBad: bad.length,
      nOk: ok.length,
      rpeBad: round1(rpeBad),
      rpeOk: round1(rpeOk),
      delta: round1(rpeBad - rpeOk),
    });
  };

  for (const key of ['sleep', 'soreness', 'stress', 'motivation'] as RecoveryAxisKey[]) {
    split(key, (p) => readinessAxisScores(p.check)[key] <= -1);
  }
  split('sleepHours', (p) => (p.check.sleepHours === undefined ? null : p.check.sleepHours < SHORT_SLEEP_HOURS));
  // HRV: solo cuentan los días con rango (`hrvVs`): por debajo de tu rango frente a dentro o por encima.
  split('hrv', (p) => (p.check.hrvVs === undefined ? null : p.check.hrvVs === 'bajo'));
  // Hábitos: solo cuentan los días en que los anotaste (ausente = no sé; vacío = ninguno).
  for (const tag of HABIT_ORDER) {
    split(`habit:${tag}`, (p) => (p.check.habits === undefined ? null : p.check.habits.includes(tag)));
  }

  result.insights.sort((a, b) => b.delta - a.delta);
  return result;
}
