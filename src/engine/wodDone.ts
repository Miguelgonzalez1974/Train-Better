import type { DailySession, SessionHistoryEntry, WodResult } from '../data/athlete/types';
import { historyWodKey, parseTimeSeconds, wodKeyOf, EVEN_SECONDS } from './wodGhost';

/**
 * Lo que se enseña al pie del WOD de una sesión ya hecha: el resultado, si fue Rx o escalado y, si es un WOD por tiempo que ya habías hecho,
 * cómo quedó frente a tu mejor marca anterior (tu «fantasma»). Es una lectura del historial: no guarda nada.
 */
export interface WodDoneInfo {
  part: 1 | 2;
  /** El resultado tal como se anotó: «14:30», «8+12», «CAP · 3+7»… */
  value: string;
  capped: boolean;
  rx: boolean;
  /** Es tu mejor tiempo de este WOD (solo por tiempo, terminado y habiéndolo hecho antes). */
  best: boolean;
  /** Frente a tu mejor marca anterior del mismo WOD: segundos de diferencia (+ = más rápido) y de cuándo era. null sin marca anterior o sin tiempo. */
  versus: { delta: number; date: string; outcome: 'gana' | 'pierde' | 'empata' } | null;
}

/** El mejor tiempo (no parado en el cap) de las entradas anteriores a `beforeDate` con la misma clave de WOD. */
function previousBest(history: SessionHistoryEntry[], key: string, beforeDate: string): { seconds: number; date: string } | null {
  let best: { seconds: number; date: string } | null = null;
  for (const h of history) {
    if (h.date >= beforeDate || historyWodKey(h) !== key) continue;
    const r: WodResult | undefined = h.wodResult;
    if (!r || r.scoreType !== 'time' || r.capped) continue;
    const seconds = parseTimeSeconds(r.value);
    if (seconds === null || seconds <= 0) continue;
    if (!best || seconds < best.seconds) best = { seconds, date: h.date };
  }
  return best;
}

/** El pie de cada parte del WOD de una sesión hecha. Vacío si no se anotó ningún resultado. */
export function wodDoneInfos(session: DailySession, entry: SessionHistoryEntry, history: SessionHistoryEntry[]): Partial<Record<1 | 2, WodDoneInfo>> {
  const out: Partial<Record<1 | 2, WodDoneInfo>> = {};
  const parts: [1 | 2, WodResult | undefined][] = [
    [1, entry.wodResult],
    [2, entry.wodResult2],
  ];
  for (const [part, result] of parts) {
    if (!result || !result.value) continue;
    let best = false;
    let versus: WodDoneInfo['versus'] = null;
    // La comparación solo es limpia con la parte 1 (la clave del historial es la de la parte 1) y con un WOD por tiempo terminado.
    const key = part === 1 ? wodKeyOf(session, 1) : null;
    const seconds = result.scoreType === 'time' && !result.capped ? parseTimeSeconds(result.value) : null;
    if (key && seconds !== null) {
      const prev = previousBest(history, key, entry.date);
      if (prev) {
        const delta = Math.round(prev.seconds - seconds);
        best = delta > 0;
        versus = { delta, date: prev.date, outcome: Math.abs(delta) <= EVEN_SECONDS ? 'empata' : delta > 0 ? 'gana' : 'pierde' };
      }
    }
    out[part] = { part, value: result.value, capped: Boolean(result.capped), rx: entry.rxOrScaled === 'rx', best, versus };
  }
  return out;
}
