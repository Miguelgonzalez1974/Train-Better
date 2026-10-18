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
