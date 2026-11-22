import type { ReadinessCheck } from '../data/athlete/types';
import { readinessAxisScores, scoreCheck } from './readiness';

/**
 * Lectura de "cómo estás llegando a entrenar" para el Dashboard, derivada del check-in diario ("¿Cómo llegas hoy?":
 * sueño, agujetas, estrés y motivación). Compara la última semana con tu propia media de las semanas anteriores:
 * no hay una referencia universal de "buen sueño", pero sí de si llevas días llegando peor que de costumbre.
 * Puramente derivada y orientativa — el motor ya usa el check-in de hoy para ajustar la carga (ver `readiness.ts`);
 * esto solo enseña la tendencia.
 */

export type RecoveryAxisKey = 'sleep' | 'soreness' | 'stress' | 'motivation';

export const RECOVERY_AXIS_LABEL: Record<RecoveryAxisKey, string> = {
  sleep: 'Sueño',
  soreness: 'Agujetas',
  stress: 'Estrés',
  motivation: 'Motivación',
};

export interface RecoveryAxis {
  key: RecoveryAxisKey;
  label: string;
  /** Media de la semana, de -1 (mal) a 1 (bien). */
  score: number;
}

export type RecoveryLevel = 'alta' | 'normal' | 'baja';

export interface RecoverySummary {
  /** Check-ins de los últimos 7 días (hoy incluido). */
  checks: number;
  /** 0-100, media de los check-ins de la última semana. Null con menos de `MIN_CHECKS`. */
  score: number | null;
  /** 0-100, media de las 4 semanas anteriores. Null con muy pocos check-ins para comparar. */
  baseline: number | null;
  /** score - baseline, en puntos. */
  delta: number | null;
  level: RecoveryLevel | null;
  axes: RecoveryAxis[];
  /** El eje que más te baja esta semana, si de verdad va flojo. */
  weakest: RecoveryAxis | null;
  /** Los últimos 7 días, del más antiguo a hoy; null en los que no hubo check-in. */
  days: { date: string; score: number | null }[];
}

const MIN_CHECKS = 2;
const MIN_BASELINE_CHECKS = 3;
const HIGH_FROM = 65;
const LOW_UNTIL = 40;
const WEAK_AXIS_BELOW = -0.2;

const toPct = (sum: number) => Math.round(((sum + 4) / 8) * 100);

/** La nota de un solo check-in, de 0 a 100. */
export const checkPct = (check: ReadinessCheck): number => toPct(scoreCheck(check));

/**
 * Cuánto pesa cada día de la última semana si se da más peso a lo reciente (hoy, ayer, anteayer…): el check-in de hoy cuenta la mitad y cada día
 * hacia atrás, menos. Si faltan días, los que hay se reparten el peso. Es la alternativa a la media simple de 7 días (cada día 1/7).
 */
export const RECENCY_WEIGHTS = [0.5, 0.25, 0.12, 0.06, 0.03, 0.02, 0.02] as const;

function dayDiff(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeRecoverySummary(log: ReadinessCheck[] | undefined, todayIso: string, opts: { recency?: boolean } = {}): RecoverySummary {
  const entries = log ?? [];
  const age = (c: ReadinessCheck) => dayDiff(c.date, todayIso);
  const week = entries.filter((c) => age(c) >= 0 && age(c) <= 6);
  const before = entries.filter((c) => age(c) >= 7 && age(c) <= 34);

  const avg = (list: ReadinessCheck[]) => (list.length === 0 ? null : toPct(list.reduce((s, c) => s + scoreCheck(c), 0) / list.length));
  // Con la opción recency, hoy pesa más que hace seis días: media ponderada por lo reciente de los días que hay.
  const recentAvg = (list: ReadinessCheck[]) => {
    const weights = list.map((c) => RECENCY_WEIGHTS[age(c)] ?? 0);
    const total = weights.reduce((s, w) => s + w, 0);
    return total === 0 ? null : toPct(list.reduce((s, c, i) => s + scoreCheck(c) * weights[i], 0) / total);
  };

  const score = week.length >= MIN_CHECKS ? (opts.recency ? recentAvg(week) : avg(week)) : null;
  const baseline = before.length >= MIN_BASELINE_CHECKS ? avg(before) : null;
  const delta = score !== null && baseline !== null ? score - baseline : null;
  const level: RecoveryLevel | null = score === null ? null : score >= HIGH_FROM ? 'alta' : score <= LOW_UNTIL ? 'baja' : 'normal';

  let axes: RecoveryAxis[] = [];
  if (week.length >= MIN_CHECKS) {
    const sums: Record<RecoveryAxisKey, number> = { sleep: 0, soreness: 0, stress: 0, motivation: 0 };
    for (const c of week) {
      const s = readinessAxisScores(c);
      for (const key of Object.keys(sums) as RecoveryAxisKey[]) sums[key] += s[key];
    }
    axes = (Object.keys(sums) as RecoveryAxisKey[]).map((key) => ({ key, label: RECOVERY_AXIS_LABEL[key], score: sums[key] / week.length }));
  }
  const lowest = axes.length > 0 ? [...axes].sort((a, b) => a.score - b.score)[0] : null;
  const weakest = lowest && lowest.score <= WEAK_AXIS_BELOW ? lowest : null;

  const byDate = new Map(entries.map((c) => [c.date, c]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(todayIso, i - 6);
    const check = byDate.get(date);
    return { date, score: check ? toPct(scoreCheck(check)) : null };
  });

  return { checks: week.length, score, baseline, delta, level, axes, weakest, days };
}
