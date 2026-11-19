import type { SessionHistoryEntry, WodSplitsRecord } from '../data/athlete/types';
import { trackTotal, type Ghost, type TrackMode, type WodTrackInfo } from './wodGhost';

/**
 * La pauta de ritmo de Rex antes de un WOD por tiempo con rondas: si en tus últimos WODs de las mismas rondas sueles salir fuerte y hundirte
 * al final, propone un ritmo constante algo más tranquilo que tu salida y algo más rápido que tu media, que sirve de fantasma ese día.
 *
 * Solo habla si hay base: al menos dos WODs tuyos con las mismas rondas y parciales, en los que al menos dos acabaron claramente más lentos
 * que empezaron. Y solo propone un ritmo si hay a qué atarlo (tus propias marcas de ese mismo WOD, o el objetivo del coach) y no se aleja
 * de lo que sueles tardar por ronda. Nunca propone ir más rápido de lo que ya sales: el ritmo queda siempre entre tu salida y tu media.
 */

/** Menos rondas que esto no dejan ver un patrón de salida y caída. */
export const PACE_MIN_ROUNDS = 4;
/** WODs tuyos parecidos que hacen falta para opinar. */
export const PACE_MIN_SAMPLES = 2;
/** Cuántos de esos WODs se miran (los más recientes). */
const PACE_SAMPLES = 3;
/** Una marca «se hunde» si las dos últimas rondas son al menos este múltiplo de las dos primeras. */
export const PACE_FADE = 1.15;
/** Si el ritmo al que se ataría la pauta difiere más de esto de lo que sueles tardar, los WODs no son comparables y no se propone. */
const PACE_COMPARABLE = 0.25;
/** Cuánto del camino desde tu media hacia tu salida se recorre para fijar la pauta (0 = tu media, 1 = tu salida). */
const PACE_TOWARD_OPENING = 0.3;
/** La pauta se redondea a este paso, en segundos. */
const PACE_STEP = 5;
/** Una mejora sobre tu mejor marca menor que esto no se cuenta. */
const MIN_GAIN_SECONDS = 10;

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);

/** Los segundos de cada ronda de una marca guardada (suma los movimientos de cada ronda), o null si no tiene `rounds` rondas completas. */
export function roundTimes(record: WodSplitsRecord, rounds: number): number[] | null {
  if (rounds < 1) return null;
  if (record.mode === 'ronda') return record.segments.length === rounds ? record.segments : null;
  const cycle = record.labels.length;
  if (cycle < 1 || record.segments.length !== cycle * rounds) return null;
  return Array.from({ length: rounds }, (_, r) => record.segments.slice(r * cycle, (r + 1) * cycle).reduce((s, v) => s + v, 0));
}

export interface PaceTip {
  rounds: number;
  /** Cuántos WODs tuyos se han mirado. */
  samples: number;
  /** Cómo sueles salir (las dos primeras rondas) y acabar (las dos últimas), en segundos por ronda. */
  opening: number;
  closing: number;
  /** El ritmo que propone Rex, en segundos por ronda. */
  pace: number;
  /** Lo que se tardaría a ese ritmo. */
  projectedTotal: number;
  /** Segundos que mejoraría tu mejor marca de este mismo WOD; null si no hay o la mejora es mínima. */
  vsBest: number | null;
  /** A qué se ata el ritmo: tus marcas de este mismo WOD, o el objetivo del coach. */
  basis: 'marcas' | 'objetivo';
  /** Las rondas del más reciente de esos WODs, para el dibujo. */
  lastRounds: number[];
  lastDate: string;
}

/** La pauta de hoy para un WOD, o null si Rex no tiene nada que decir (sin base, o sin patrón de caída). */
export function paceTip(args: { info: WodTrackInfo; todayIso: string; history: SessionHistoryEntry[]; ghosts: WodSplitsRecord[] }): PaceTip | null {
  const { info, todayIso, history, ghosts } = args;
  const rounds = info.rounds;
  // Un AMRAP no tiene un total de rondas con el que repartir un ritmo: la pauta es de los WODs por tiempo.
  if (info.kind === 'amrap' || rounds < PACE_MIN_ROUNDS) return null;

  const byId = new Map<string, WodSplitsRecord>();
  for (const r of [...ghosts, ...history.flatMap((h) => h.wodSplits ?? [])]) byId.set(`${r.date}|${r.part}`, r);
  const similar = [...byId.values()]
    .filter((r) => r.date < todayIso && !r.capped && !r.amrap)
    .map((record) => ({ record, times: roundTimes(record, rounds) }))
    .filter((s): s is { record: WodSplitsRecord; times: number[] } => s.times !== null && s.times.every((t) => t > 0))
    .sort((a, b) => (a.record.date < b.record.date ? 1 : a.record.date > b.record.date ? -1 : 0))
    .slice(0, PACE_SAMPLES);
  if (similar.length < PACE_MIN_SAMPLES) return null;

  const stats = similar.map((s) => {
    const open = mean(s.times.slice(0, 2));
    const close = mean(s.times.slice(-2));
    return { open, close, avg: mean(s.times), total: s.times.reduce((a, b) => a + b, 0), key: s.record.key };
  });
  if (stats.filter((s) => s.close >= s.open * PACE_FADE).length < PACE_MIN_SAMPLES) return null;

  const openAvg = mean(stats.map((s) => s.open));
  const closeAvg = mean(stats.map((s) => s.close));
  const meanAvg = mean(stats.map((s) => s.avg));

  const sameKey = stats.filter((s) => s.key === info.key);
  const basis: PaceTip['basis'] = sameKey.length > 0 ? 'marcas' : 'objetivo';
  const reference = sameKey.length > 0 ? mean(sameKey.map((s) => s.avg)) : info.targetSeconds && info.targetSeconds > 0 ? info.targetSeconds / rounds : null;
  if (reference === null || Math.abs(reference - meanAvg) / meanAvg > PACE_COMPARABLE) return null;

  const openShare = openAvg / meanAvg;
  // Entre tu media y tu salida, más cerca de la media: un ritmo que ya sabes llevar al principio y que aguantas hasta el final.
  const pace = Math.max(PACE_STEP, Math.round((reference * (1 - PACE_TOWARD_OPENING * (1 - openShare))) / PACE_STEP) * PACE_STEP);
  const projectedTotal = pace * rounds;
  const bestSame = sameKey.length > 0 ? Math.min(...sameKey.map((s) => s.total)) : null;
  const gain = bestSame === null ? null : Math.round(bestSame - projectedTotal);
  return {
    rounds,
    samples: similar.length,
    opening: Math.round(openAvg),
    closing: Math.round(closeAvg),
    pace,
    projectedTotal,
    vsBest: gain !== null && gain >= MIN_GAIN_SECONDS ? gain : null,
    basis,
    lastRounds: similar[0].times,
    lastDate: similar[0].record.date,
  };
}

/** El fantasma de ritmo constante a `paceSeconds` por ronda, repartido en los tramos del modo pedido. */
export function paceGhost(paceSeconds: number, info: WodTrackInfo, mode: TrackMode): Ghost {
  const total = trackTotal(info, mode);
  const totalSeconds = Math.round(paceSeconds * info.rounds);
  return { kind: 'pauta', durations: Array.from({ length: total }, () => totalSeconds / total), totalSeconds, rx: null };
}
