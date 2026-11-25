import type { AthleteProfile, Goal, PersonalRecords, SessionHistoryEntry } from '../../data/athlete/types';
import { benchmarkWorkouts } from '../../data/movements';
import { goalPrKey } from '../../engine/goalTarget';
import type { LevelSnapshot } from '../../engine/levelCategories';
import { buildStrengthEvolution } from '../../engine/strengthEvolution';
import { parseTimeSeconds } from '../../engine/wodGhost';
import { wodResultsOf } from '../../engine/wodScoring';
import { PR_ROWS } from './prRows';
import { MARK_LIFTS } from './rexMarks';
import { agoText } from './sessionCardModel';
import { wodWhat } from './sessionCardWod';

/**
 * «Tu nivel»: la tarjeta del Resumen (tu número, lo que más sube, lo que toca mejorar, tu peso y tu último récord) y las listas de su pantalla.
 * Todo sale de datos que ya existen. Puro: lo pintan `LevelSummaryCard` y `LevelScreen`.
 */

const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

export interface LevelCardModel {
  /** Tu nivel (0-100); null con menos de tres categorías. */
  overall: number | null;
  /** Cambio en 3 meses. */
  delta: number | null;
  filled: number;
  total: number;
  figures: { value: string; label: string }[];
  line: { text: string; icon: 'trophy' | 'info' };
}

/** Nombre corto de un levantamiento para una etiqueta estrecha. */
const SHORT_LIFT: Record<string, string> = {
  backSquat: 'sentadilla',
  frontSquat: 'front squat',
  deadlift: 'peso muerto',
  benchPress: 'banca',
  strictPress: 'strict press',
  snatch: 'snatch',
  clean: 'clean',
  cleanAndJerk: 'clean & jerk',
};

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

export function buildLevelCard({ profile, level, todayIso }: { profile: AthleteProfile; level: LevelSnapshot; todayIso: string }): LevelCardModel {
  // Lo que más ha subido en 8 semanas, con la misma cuenta que su fila en «Marcas».
  const risers = PR_ROWS.map(({ key }) => ({
    key,
    delta: buildStrengthEvolution(key, profile.prs, profile.prLog ?? [], profile.setFeedbackLog ?? [], profile.workLog ?? [], todayIso, '8s').prDeltaKg,
  }))
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const top = risers[0];
  const rise = top ? { value: `+${num(top.delta)} kg`, label: `sube más: ${SHORT_LIFT[top.key] ?? top.key}` } : { value: '—', label: 'sin subidas en 8 semanas' };

  const scored = level.categories.filter((c) => c.score !== null);
  const weak = scored.length >= 2 ? scored.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a)) : null;
  const improve = weak ? { value: weak.label, label: `a mejorar · ${weak.score}` } : { value: '—', label: 'a mejorar' };

  const weight = [...(profile.bodyweightLog ?? [])].sort((a, b) => a.date.localeCompare(b.date)).pop();
  const body = weight ? { value: `${num(weight.kg)} kg`, label: 'tu peso' } : { value: '—', label: 'apunta tu peso' };

  const record = latestRecord(profile);
  const missing = level.categories.length - level.filled;
  const line: LevelCardModel['line'] = record
    ? { icon: 'trophy', text: `Último récord: ${record.label} ${num(record.kg)} kg · ${record.date >= todayIso ? 'hoy' : agoText(record.date, todayIso)}` }
    : { icon: 'info', text: missing > 0 ? `Faltan ${missing} ${missing === 1 ? 'categoría' : 'categorías'} por medir` : 'Aún sin récords nuevos' };

  return { overall: level.overall, delta: level.delta, filled: level.filled, total: level.categories.length, figures: [rise, improve, body], line };
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
