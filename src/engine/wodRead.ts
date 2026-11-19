import type { WodSplitsRecord } from '../data/athlete/types';
import { allMovements } from '../data/movements';
import { EVEN_SECONDS, WEAK_SEGMENT_SECONDS, secondsText, type Ghost } from './wodGhost';
import { PACE_MIN_ROUNDS, roundTimes } from './wodPace';
import { workGoalFor } from './wodMovements';

/**
 * La lectura de Rex al cerrar un WOD cronometrado por tramos: dónde se hundió el ritmo y qué movimiento pierde más tiempo frente al fantasma.
 * Solo habla si hay algo que decir (un hundimiento, una caída o un movimiento que pierde claro); si no, no hay tarjeta. No cambia nada del
 * plan: lo único que puede ofrecer es «Trabajar» un movimiento que tenga un objetivo propio (ver `workGoalFor`).
 */

/** Una racha de rondas perdidas cuenta como hundimiento a partir de esta pérdida acumulada, en segundos. */
export const SINK_MIN_LOSS = 10;
/** Un movimiento «pierde claro» si cede al menos esto por ronda frente al fantasma. */
export const WEAK_PER_ROUND = 3;
/** Sin fantasma con el que comparar, la caída propia se dice si las dos últimas rondas son este múltiplo de las dos primeras. */
export const FADE_OWN = 1.2;

export interface WodReadingRow {
  name: string;
  /** Segundos por ronda que cede (+) o gana (−) este movimiento frente al fantasma. */
  slowerPerRound: number;
}

export interface WodReading {
  /** «Te hundiste en las rondas 5 a 8…»; null si el ritmo fue limpio. */
  lead: string | null;
  /** Cada movimiento frente al fantasma (solo si se cronometró por movimientos y había con qué comparar). */
  rows: WodReadingRow[];
  /** El movimiento que más cede, si lo hace claro. `movementId` solo si hay un objetivo para trabajarlo (gimnásticos, levantamientos). */
  weak: { name: string; slowerPerRound: number; movementId: string | null } | null;
  /** Una pauta para la próxima vez. */
  tip: string | null;
}

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const mean = (xs: number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);

/** Qué movimiento es por su nombre (los parciales guardan los nombres, no los ids). */
export function movementIdByName(name: string): string | null {
  const n = name.trim().toLowerCase();
  return allMovements.find((m) => m.name.toLowerCase() === n)?.id ?? null;
}

/** Agrupa tramos en rondas de `cycle` movimientos (por rondas, cada tramo ya es una ronda). */
function toRounds(values: number[], cycle: number): number[] {
  const rounds = Math.floor(values.length / cycle);
  return Array.from({ length: rounds }, (_, r) => sum(values.slice(r * cycle, (r + 1) * cycle)));
}

export function readWod(record: WodSplitsRecord, ghost: Ghost | null): WodReading | null {
  // Un AMRAP no tiene un total de rondas: su lectura (ritmo y rondas) va en el resumen del fantasma.
  if (record.amrap) return null;
  const cycle = record.mode === 'movimiento' ? record.labels.length : 1;
  if (cycle < 1) return null;
  const roundsDone = Math.floor(record.segments.length / cycle);
  if (roundsDone < 1) return null;
  const used = record.segments.slice(0, roundsDone * cycle);
  const times = roundTimes({ ...record, segments: used }, roundsDone);
  if (!times) return null;
  const comparable = ghost !== null && ghost.durations.length === record.segments.length;
  const ghostTimes = comparable ? toRounds(ghost!.durations.slice(0, roundsDone * cycle), cycle) : null;
  const deltas = ghostTimes ? ghostTimes.map((g, i) => Math.round(g - times[i])) : null;

  let lead: string | null = null;
  let tip: string | null = null;
  const open = mean(times.slice(0, 2));
  const close = mean(times.slice(-2));
  if (roundsDone >= PACE_MIN_ROUNDS) {
    if (deltas) {
      // Una racha (2 o más rondas seguidas) en la que pierdes: la peor es el hundimiento.
      let best: { from: number; to: number; loss: number } | null = null;
      let from = -1;
      for (let i = 0; i <= deltas.length; i++) {
        const losing = i < deltas.length && deltas[i] < -EVEN_SECONDS;
        if (losing && from < 0) from = i;
        if (!losing && from >= 0) {
          const loss = -sum(deltas.slice(from, i));
          // Un hundimiento es una racha dentro de un WOD que por lo demás fue bien: si pierdes en casi todas las rondas, no es una racha, es el ritmo.
          if (i - from >= 2 && i - from <= deltas.length - 2 && loss >= SINK_MIN_LOSS && (!best || loss > best.loss)) best = { from, to: i - 1, loss };
          from = -1;
        }
      }
      if (best) {
        const after = sum(deltas.slice(best.to + 1));
        lead = `Te hundiste en las rondas ${best.from + 1} a ${best.to + 1}: perdiste ${secondsText(best.loss)} ahí${after >= WEAK_SEGMENT_SECONDS ? ' y recuperaste al final' : ''}.`;
        tip = `La próxima vez guarda algo en las primeras rondas para llegar entero a las rondas ${best.from + 1} a ${best.to + 1}: ahí se te escapa el WOD.`;
      }
    }
    if (!lead && close >= open * FADE_OWN) {
      lead = `Fuiste cayendo: las dos últimas rondas fueron ${secondsText(close - open)} más lentas que las dos primeras.`;
      tip = `La próxima vez abre unos ${Math.min(15, Math.max(3, Math.round((close - open) * 0.3)))} s más tranquilo por ronda al principio, para llegar entero al final.`;
    }
  }

  // Por movimientos, cuánto cede o gana cada uno por ronda frente al fantasma.
  const rows: WodReadingRow[] = [];
  if (record.mode === 'movimiento' && cycle >= 2 && comparable && roundsDone >= 2) {
    for (let j = 0; j < cycle; j++) {
      let diff = 0;
      for (let r = 0; r < roundsDone; r++) diff += ghost!.durations[r * cycle + j] - used[r * cycle + j];
      rows.push({ name: record.labels[j], slowerPerRound: Math.round(-diff / roundsDone) || 0 });
    }
  }
  const worst = rows.reduce<WodReadingRow | null>((w, r) => (!w || r.slowerPerRound > w.slowerPerRound ? r : w), null);
  const weak =
    worst && worst.slowerPerRound >= WEAK_PER_ROUND && worst.slowerPerRound * roundsDone >= WEAK_SEGMENT_SECONDS
      ? { name: worst.name, slowerPerRound: worst.slowerPerRound, movementId: workableId(worst.name) }
      : null;

  if (!lead && !weak) return null;
  return { lead, rows, weak, tip };
}

/** El id del movimiento si hay un objetivo para trabajarlo; null (Row, Bike, Run…) si solo se puede cuidar el ritmo. */
function workableId(name: string): string | null {
  const id = movementIdByName(name);
  return id && workGoalFor(id) ? id : null;
}
