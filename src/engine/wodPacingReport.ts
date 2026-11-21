import type { SessionHistoryEntry, WodSplitsRecord } from '../data/athlete/types';
import { addDaysIso } from './periodization';
import { movementIdByName } from './wodRead';
import { workGoalFor } from './wodMovements';
import { secondsText } from './wodGhost';

/**
 * El informe de ritmo de tus WODs cronometrados por tramos (los parciales del modo fantasma): cómo repartes el esfuerzo (¿sales fuerte y te
 * hundes, aguantas, o acabas más rápido que empiezas?), qué movimiento se te repite como el que más cede a lo largo del WOD y cómo evolucionan
 * los WODs que has repetido. Solo informa: lo único que puede ofrecer es «Trabajarlo» en un movimiento con objetivo propio. Puro.
 *
 * Solo habla con base: el patrón pide `PACING_MIN_WODS` WODs con al menos `PACING_MIN_ROUNDS` rondas, y un movimiento flojo tiene que serlo en
 * dos WODs distintos. Con menos, dice cuántos faltan.
 */

/** WODs con parciales (y rondas suficientes) que hacen falta para hablar de tu patrón. */
export const PACING_MIN_WODS = 3;
/** Menos rondas que esto no dejan comparar el principio y el final de un WOD. */
export const PACING_MIN_ROUNDS = 4;
/** Las dos últimas rondas son este múltiplo de las dos primeras o más: te hundes. */
export const PACING_FADE = 1.15;
/** Las dos últimas rondas son este múltiplo de las dos primeras o menos: acabas más rápido que empiezas. */
export const PACING_NEGATIVE = 0.95;
/** Un movimiento cede «claro» si sus últimas rondas tardan al menos esto más (en segundos) que las primeras. */
export const PACING_WEAK_SECONDS = 3;
/** Un WOD repetido solo cuenta como cambio si la diferencia de tiempo pasa esto (en segundos). */
export const PACING_TREND_SECONDS = 10;

export type PacingKind = 'cae' | 'aguanta' | 'acelera' | 'mixto';

export interface PacingPattern {
  kind: PacingKind;
  /** Cuántos WODs se miraron y en cuántos te hundiste, aguantaste o aceleraste. */
  wods: number;
  fading: number;
  steady: number;
  negative: number;
  /** Cuánto más lentas son, de media, las dos últimas rondas que las dos primeras (en %; negativo = más rápidas). */
  avgFadePct: number;
}

export interface WeakMovement {
  name: string;
  /** Su id si tiene un objetivo para trabajarlo (gimnásticos, levantamientos); null (Row, Bike, Run…) si solo se puede cuidar el ritmo. */
  movementId: string | null;
  /** En cuántos WODs fue el que más cedió, de cuántos en los que salía. */
  wods: number;
  of: number;
  /** Cuánto más tarda por ronda al final que al principio, de media en los WODs en que cede (segundos). */
  avgSlower: number;
}

export interface RepeatTrend {
  key: string;
  times: number;
  firstDate: string;
  lastDate: string;
  firstTotal: number;
  lastTotal: number;
  /** Último menos primero, en segundos: negativo = ahora más rápido. */
  delta: number;
}

export interface PacingReport {
  /** WODs con parciales en el periodo (cualquier número de rondas). */
  wods: number;
  /** De ellos, los que tienen rondas suficientes para el patrón. */
  analysed: number;
  pattern: PacingPattern | null;
  weak: WeakMovement[];
  trends: RepeatTrend[];
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);

/** Los parciales de las dos fuentes (el perfil y el historial), una vez por fecha y parte. */
export function allSplits(history: SessionHistoryEntry[], ghosts: WodSplitsRecord[]): WodSplitsRecord[] {
  const byId = new Map<string, WodSplitsRecord>();
  for (const r of [...ghosts, ...history.flatMap((h) => h.wodSplits ?? [])]) byId.set(`${r.date}|${r.part}`, r);
  return [...byId.values()];
}

/** Cuántos tramos tiene una vuelta: los movimientos si se cronometró por movimientos (no en un AMRAP, donde cada tramo ya es una ronda). */
function cycleOf(r: WodSplitsRecord): number {
  return r.mode === 'movimiento' && !r.amrap ? Math.max(1, r.labels.length) : 1;
}

/** Los segundos de cada ronda completa. */
function roundsOf(r: WodSplitsRecord): number[] {
  const cycle = cycleOf(r);
  const rounds = Math.floor(r.segments.length / cycle);
  return Array.from({ length: rounds }, (_, i) => r.segments.slice(i * cycle, (i + 1) * cycle).reduce((s, v) => s + v, 0));
}

const usable = (xs: number[]) => xs.length >= PACING_MIN_ROUNDS && xs.every((v) => v > 0);

export function pacingReport(args: { history: SessionHistoryEntry[]; ghosts: WodSplitsRecord[]; todayIso: string; weeks: number | null }): PacingReport {
  const { history, ghosts, todayIso, weeks } = args;
  const from = weeks === null ? '0000-00-00' : addDaysIso(todayIso, -weeks * 7);
  const all = allSplits(history, ghosts).filter((r) => r.segments.length > 0);
  const inWindow = all.filter((r) => r.date >= from && r.date <= todayIso);

  // El patrón: dos primeras rondas frente a dos últimas, WOD a WOD.
  const ratios: number[] = [];
  for (const r of inWindow) {
    const rounds = roundsOf(r);
    if (!usable(rounds)) continue;
    ratios.push(mean(rounds.slice(-2)) / mean(rounds.slice(0, 2)));
  }
  let pattern: PacingPattern | null = null;
  if (ratios.length >= PACING_MIN_WODS) {
    const fading = ratios.filter((x) => x >= PACING_FADE).length;
    const negative = ratios.filter((x) => x <= PACING_NEGATIVE).length;
    const steady = ratios.length - fading - negative;
    const share = (n: number) => n / ratios.length >= 0.6;
    pattern = {
      kind: share(fading) ? 'cae' : share(steady) ? 'aguanta' : share(negative) ? 'acelera' : 'mixto',
      wods: ratios.length,
      fading,
      steady,
      negative,
      avgFadePct: Math.round((mean(ratios) - 1) * 100),
    };
  }

  // El movimiento que más cede dentro de cada WOD cronometrado por movimientos, y cuántas veces es el mismo.
  const byName = new Map<string, { flagged: number[]; of: number }>();
  for (const r of inWindow) {
    const cycle = cycleOf(r);
    if (r.mode !== 'movimiento' || r.amrap || cycle < 2) continue;
    const rounds = Math.floor(r.segments.length / cycle);
    if (rounds < PACING_MIN_ROUNDS) continue;
    const slower = r.labels.map((_, j) => {
      const at = (i: number) => r.segments[i * cycle + j];
      return mean([at(rounds - 2), at(rounds - 1)]) - mean([at(0), at(1)]);
    });
    r.labels.forEach((name, j) => {
      const entry = byName.get(name) ?? { flagged: [], of: 0 };
      entry.of += 1;
      byName.set(name, entry);
      if (slower[j] >= PACING_WEAK_SECONDS && slower[j] === Math.max(...slower)) entry.flagged.push(slower[j]);
    });
  }
  const weak = [...byName.entries()]
    .filter(([, e]) => e.flagged.length >= 2)
    .map<WeakMovement>(([name, e]) => {
      const id = movementIdByName(name);
      return { name, movementId: id && workGoalFor(id) ? id : null, wods: e.flagged.length, of: e.of, avgSlower: Math.round(mean(e.flagged)) };
    })
    .sort((a, b) => b.wods - a.wods || b.avgSlower - a.avgSlower)
    .slice(0, 3);

  // Los WODs que has repetido: primera frente a última vez (completas y con los mismos tramos).
  const byKey = new Map<string, WodSplitsRecord[]>();
  for (const r of all) {
    if (r.capped || r.amrap || r.date > todayIso) continue;
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  }
  const trends: RepeatTrend[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.part - b.part));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (sorted.length < 2 || first.segments.length !== last.segments.length || last.date < from) continue;
    const delta = Math.round(last.totalSeconds - first.totalSeconds);
    if (Math.abs(delta) < PACING_TREND_SECONDS) continue;
    trends.push({ key, times: sorted.length, firstDate: first.date, lastDate: last.date, firstTotal: first.totalSeconds, lastTotal: last.totalSeconds, delta });
  }
  trends.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));

  return { wods: inWindow.length, analysed: ratios.length, pattern, weak, trends: trends.slice(0, 3) };
}

/** La frase de tu patrón de ritmo. */
export function patternSentence(p: PacingPattern): string {
  const n = (k: number) => `${k} de ${p.wods}`;
  switch (p.kind) {
    case 'cae':
      return `Sales fuerte y te hundes: en ${n(p.fading)} WODs las dos últimas rondas fueron más lentas que las dos primeras (${p.avgFadePct} % más, de media).`;
    case 'acelera':
      return `Acabas más rápido de lo que empiezas: en ${n(p.negative)} WODs las dos últimas rondas fueron más rápidas. Probablemente sales demasiado cauto.`;
    case 'aguanta':
      return `Repartes bien el esfuerzo: en ${n(p.steady)} WODs el ritmo se mantuvo parecido de principio a fin.`;
    default:
      return `Tu ritmo cambia de un WOD a otro: te hundes en ${p.fading}, aguantas en ${p.steady} y aceleras en ${p.negative} de ${p.wods}.`;
  }
}

/** Qué hacer con ese patrón, en una línea. */
export function patternTip(p: PacingPattern): string | null {
  if (p.kind === 'cae') return 'Abre unos segundos más tranquilo por ronda al principio: llegarás entero a las rondas finales.';
  if (p.kind === 'acelera') return 'Prueba a salir un poco más fuerte: si puedes acabar más rápido, tienes margen al principio.';
  return null;
}

/** Cuánto cede un movimiento, en una línea. */
export function weakSentence(w: WeakMovement): string {
  return `${w.name}: es el que más cede en ${w.wods} de ${w.of} WODs (+${secondsText(w.avgSlower)} por ronda al final).`;
}

/** Cómo ha cambiado un WOD repetido, en una línea. */
export function trendSentence(t: RepeatTrend): string {
  return `${secondsText(t.firstTotal)} → ${secondsText(t.lastTotal)} (${t.delta < 0 ? `${secondsText(t.delta)} más rápido` : `${secondsText(t.delta)} más lento`})`;
}
