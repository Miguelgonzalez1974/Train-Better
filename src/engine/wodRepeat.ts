import type { AthleteProfile, DailySession, SessionBlockResult, SessionHistoryEntry, WodResult, WodSplitsRecord } from '../data/athlete/types';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { serveCatalogWodBlocks } from './generateSession';
import { getWodCatalog } from './wodCatalog';
import { historyWodKey, parseTimeSeconds } from './wodGhost';

/**
 * Repetir un WOD que ya hiciste, para correr contra tu marca de entonces (el fantasma real: ver `engine/wodGhost.ts`). Lista los WODs del
 * historial que se pueden volver a poner: los de las entradas que guardaron sus bloques (también los que generó el coach) y los de
 * programación real o de la biblioteca, que se reconstruyen por su id aunque la entrada sea anterior. Y los pone en una sesión.
 */

export interface RepeatableWod {
  /** Qué WOD es (ver `wodKeyOf`): con él se encuentra el fantasma. */
  key: string;
  title: string;
  /** Formato y movimientos, en una línea. */
  summary: string;
  blocks: SessionBlockResult[];
  /** Cuántas veces lo has hecho y la última. */
  times: number;
  lastDate: string;
  /** Tu mejor marca: el mejor tiempo si es por tiempo, y si no, el último resultado. */
  best: { text: string; date: string } | null;
  /** Hay parciales por tramo de alguna vez: el fantasma corre con tus tiempos reales, no a ritmo constante. */
  withSplits: boolean;
}

const MAX_LISTED = 30;

/** Los bloques de un WOD guardados, o reconstruidos desde el catálogo si la entrada es anterior a guardarlos. null si no se pueden recuperar. */
function blocksOfEntry(entry: SessionHistoryEntry, profile: AthleteProfile): SessionBlockResult[] | null {
  if (entry.wodBlocks && entry.wodBlocks.length > 0) return entry.wodBlocks;
  if (entry.wodCatalogIds && entry.wodCatalogIds.length > 1) return null; // un doble WOD sin bloques guardados: no se sabe cuál es cuál
  const bench = entry.movementIds.find((id) => id.startsWith('benchmark:'));
  const id = entry.wodCatalogId ?? (entry.wodLibraryId ? `lib:${entry.wodLibraryId}` : bench ? `bm:${bench.replace('benchmark:', '')}` : undefined);
  return id ? serveCatalogWodBlocks(id, profile) : null;
}

function titleOf(blocks: SessionBlockResult[]): string {
  const bench = blocks.find((b) => b.movementId.startsWith('benchmark:'));
  if (bench) {
    const id = bench.movementId.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === id)?.name ?? getWodCatalog().find((w) => w.id === bench.wodCatalogId)?.name ?? id;
  }
  const title = blocks.find((b) => b.title)?.title;
  if (title) return title.replace(/^"|"$/g, '');
  const names = blocks.slice(0, 2).map((b) => getMovementById(b.movementId)?.name ?? b.movementId);
  return names.join(' y ') + (blocks.length > 2 ? '…' : '');
}

function summaryOf(blocks: SessionBlockResult[]): string {
  const bench = blocks.find((b) => b.movementId.startsWith('benchmark:'));
  if (bench) return bench.format?.replace(/^For Time:?\s*/i, 'For time · ') ?? '';
  const names = blocks.slice(0, 4).map((b) => getMovementById(b.movementId)?.name ?? b.movementId);
  const format = blocks[0]?.format?.replace(/\s*—\s*WOD real.*$/i, '');
  return [format, names.join(', ') + (blocks.length > 4 ? '…' : '')].filter(Boolean).join(' · ');
}

function bestOf(entries: SessionHistoryEntry[]): { text: string; date: string } | null {
  let bestTime: { text: string; date: string; seconds: number } | null = null;
  let latest: { text: string; date: string } | null = null;
  for (const e of entries) {
    const r: WodResult | undefined = e.wodResult;
    if (!r || !r.value) continue;
    if (!latest || e.date > latest.date) latest = { text: r.value, date: e.date };
    if (r.scoreType === 'time' && !r.capped) {
      const s = parseTimeSeconds(r.value);
      if (s !== null && (!bestTime || s < bestTime.seconds)) bestTime = { text: r.value, date: e.date, seconds: s };
    }
  }
  return bestTime ? { text: bestTime.text, date: bestTime.date } : latest;
}

/** Los WODs que se pueden repetir, los que tienen parciales primero y luego los más recientes. */
export function listRepeatableWods(history: SessionHistoryEntry[], profile: AthleteProfile, ghosts: WodSplitsRecord[] = profile.wodGhosts ?? []): RepeatableWod[] {
  const groups = new Map<string, SessionHistoryEntry[]>();
  for (const e of [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
    const key = historyWodKey(e);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const splitKeys = new Set<string>();
  for (const r of [...ghosts, ...history.flatMap((h) => h.wodSplits ?? [])]) if (!r.capped) splitKeys.add(r.key);

  const out: RepeatableWod[] = [];
  for (const [key, entries] of groups) {
    const latestWithBlocks = entries.find((e) => e.wodBlocks && e.wodBlocks.length > 0) ?? entries[0];
    const blocks = blocksOfEntry(latestWithBlocks, profile);
    if (!blocks || blocks.length === 0) continue;
    out.push({
      key,
      title: titleOf(blocks),
      summary: summaryOf(blocks),
      blocks,
      times: entries.length,
      lastDate: entries[0].date,
      best: bestOf(entries),
      withSplits: splitKeys.has(key),
    });
  }
  out.sort((a, b) => (a.withSplits !== b.withSplits ? (a.withSplits ? -1 : 1) : a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));
  return out.slice(0, MAX_LISTED);
}

/**
 * La sesión con el WOD cambiado por el que se repite: los bloques de WOD de la sesión se sustituyen (en el mismo sitio) por los del WOD
 * elegido. Queda marcada como editada, para que el coach no la regenere por su cuenta.
 */
export function applyRepeatedWod(session: DailySession, blocks: SessionBlockResult[]): DailySession {
  const firstWod = session.blocks.findIndex((b) => b.block === 'wod');
  const others = session.blocks.filter((b) => b.block !== 'wod');
  const insertAt = firstWod < 0 ? others.length : session.blocks.slice(0, firstWod).filter((b) => b.block !== 'wod').length;
  return {
    ...session,
    blocks: [...others.slice(0, insertAt), ...blocks.map((b) => ({ ...b })), ...others.slice(insertAt)],
    editedByAthlete: true,
  };
}
