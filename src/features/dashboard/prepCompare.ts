import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { withCompanionLoad } from '../../engine/companionLoad';
import { checkPct } from '../../engine/recovery';
import { computeReadinessScore } from '../../engine/readinessScore';

/**
 * Para probar el reparto de pesos de la preparación con tus propios días: cada día con check-in, tu nota ahora (media simple de la semana), la que
 * saldría dando más peso a lo reciente y la del propio check-in de ese día. Solo informa: no cambia ninguna nota ni nada del coach.
 */

export interface PrepCompareRow {
  iso: string;
  /** La nota del check-in de ese día solo (0-100). */
  check: number;
  /** La preparación como se calcula hoy (media simple de 7 días). */
  now: number | null;
  /** La preparación dando más peso a lo reciente. */
  recency: number | null;
}

const isoMinus = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Los días con check-in de las dos últimas semanas (más reciente primero), con las dos preparaciones lado a lado. */
export function buildPrepCompare(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string, days = 14): PrepCompareRow[] {
  const loadHistory = withCompanionLoad(history, profile.companionLog);
  const rows: PrepCompareRow[] = [];
  for (let back = 0; back < days; back++) {
    const iso = isoMinus(todayIso, back);
    const check = (profile.readinessLog ?? []).find((c) => c.date === iso);
    if (!check) continue;
    const input = {
      readinessLog: profile.readinessLog,
      hrvHistory: profile.hrvHistory,
      history: loadHistory.filter((h) => h.date < iso),
      setFeedbackLog: profile.setFeedbackLog,
      painFlags: profile.painFlags,
      today: new Date(`${iso}T12:00:00`),
    };
    rows.push({ iso, check: checkPct(check), now: computeReadinessScore(input).total, recency: computeReadinessScore({ ...input, recency: true }).total });
  }
  return rows;
}

export interface PrepCompareSummary {
  /** Cuántos días se pudieron comparar y cuánto se mueve la nota de media (en puntos). */
  days: number;
  avgShift: number;
  /** El día en que más cambia. */
  biggest: { iso: string; from: number; to: number } | null;
}

export function summarizePrepCompare(rows: PrepCompareRow[]): PrepCompareSummary {
  const both = rows.filter((r): r is PrepCompareRow & { now: number; recency: number } => r.now !== null && r.recency !== null);
  if (both.length === 0) return { days: 0, avgShift: 0, biggest: null };
  const biggest = both.reduce((b, r) => (Math.abs(r.recency - r.now) > Math.abs(b.recency - b.now) ? r : b), both[0]);
  return {
    days: both.length,
    avgShift: Math.round((both.reduce((s, r) => s + Math.abs(r.recency - r.now), 0) / both.length) * 10) / 10,
    biggest: biggest.recency === biggest.now ? null : { iso: biggest.iso, from: biggest.now, to: biggest.recency },
  };
}
