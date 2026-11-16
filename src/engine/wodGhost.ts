import type { DailySession, SessionHistoryEntry, WodResult, WodScoreType, WodSplitsRecord } from '../data/athlete/types';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { wodMovementsOfSession } from './generateSession';

/**
 * El modo fantasma del reloj de entreno: cronometrar un WOD por tiempo tramo a tramo (por rondas o por movimientos) y correr contra tu
 * mejor marca anterior del mismo WOD, o contra el objetivo del coach si no hay ninguna.
 *
 * Todo lo que no es pintar está aquí, puro: de qué tramos consta el WOD de hoy, qué fantasma toca (parciales reales, solo la marca final a
 * ritmo constante, o el objetivo estimado), cuánto vas por delante o por detrás, el registro que se guarda y el resumen al cerrar.
 */

export type TrackMode = 'ronda' | 'movimiento';

export interface WodTrackInfo {
  /** Qué WOD es (ver `wodKeyOf`): con él se encuentra el fantasma. */
  key: string;
  part: 1 | 2;
  /** Rondas del WOD (1 en un chipper); en una escalera, los escalones. */
  rounds: number;
  /** Nombres de los movimientos de una vuelta, en orden. */
  movements: string[];
  /** Cómo se puede cronometrar: por rondas y/o por movimientos. */
  modes: TrackMode[];
  defaultMode: TrackMode;
  /** Objetivo del coach en segundos, si lo hay: el fantasma «estimado» corre a ese ritmo. */
  targetSeconds: number | null;
}

/** Más tramos que esto no se pueden tocar a mano en pleno WOD. */
export const MAX_TRACK_SEGMENTS = 40;
/** Por debajo de esta diferencia se dice que vas igualado. */
export const EVEN_SECONDS = 2;
/** Un tramo es «tu punto flojo» si pierde al menos esto frente al fantasma. */
export const WEAK_SEGMENT_SECONDS = 5;

/** Los bloques de WOD de una parte: en un día normal todos; en un doble WOD, los de esa parte. */
function partBlocksOf(source: { block: string; wodPart?: 1 | 2 }[], part: 1 | 2) {
  const all = source.filter((b) => b.block === 'wod');
  return all.some((b) => b.wodPart !== undefined) ? all.filter((b) => (b.wodPart ?? 1) === part) : part === 1 ? all : [];
}
const partBlocks = (session: DailySession, part: 1 | 2) => partBlocksOf(session.blocks, part) as DailySession['blocks'];

/**
 * Qué WOD es: el id del benchmark, del catálogo o de la biblioteca; si lo generó el coach, una huella de su formato y sus movimientos (el
 * mismo WOD generado dos veces sale igual solo si coinciden los dos, que es lo que hace falta para compararlos).
 */
export function wodKeyOf(session: DailySession, part: 1 | 2): string | null {
  return wodKeyOfBlocks(session.blocks, part);
}

/** La misma clave a partir de los bloques de un WOD (los de una sesión, o los guardados en el historial). */
export function wodKeyOfBlocks(allBlocks: DailySession['blocks'], part: 1 | 2): string | null {
  const blocks = partBlocksOf(allBlocks, part) as DailySession['blocks'];
  if (blocks.length === 0) return null;
  const bench = blocks.find((b) => b.movementId.startsWith('benchmark:'));
  if (bench) return bench.movementId;
  const cat = blocks.find((b) => b.wodCatalogId)?.wodCatalogId;
  if (cat) return cat;
  const lib = blocks.find((b) => b.wodLibraryId)?.wodLibraryId;
  if (lib) return `lib:${lib}`;
  return `gen:${blocks[0].format ?? ''}|${blocks.map((b) => `${b.movementId}${b.reps ? `x${b.reps}` : ''}`).join(',')}`;
}

/** La misma clave, leída de lo que quedó en el historial (un WOD generado solo se reconoce si se guardaron sus bloques: entradas nuevas). */
export function historyWodKey(entry: SessionHistoryEntry): string | null {
  if (entry.wodCatalogId) return entry.wodCatalogId;
  if (entry.wodLibraryId) return `lib:${entry.wodLibraryId}`;
  const bench = entry.movementIds.find((id) => id.startsWith('benchmark:'));
  if (bench) return bench;
  return entry.wodBlocks && entry.wodBlocks.length > 0 ? wodKeyOfBlocks(entry.wodBlocks, 1) : null;
}

/** Cuántas rondas hay en un formato: «For Time (5 rondas)», «5 Rounds For Time», o una escalera «21-15-9» (3 escalones). */
export function roundsOfFormat(format: string | undefined): number {
  if (!format) return 1;
  const rounds = format.match(/(\d+)\s*(?:rondas?|rounds?)\b/i);
  if (rounds) return Math.max(1, Number(rounds[1]));
  const ladder = format.match(/(?:^|\s)(\d+(?:-\d+)+)/);
  if (ladder) return ladder[1].split('-').length;
  return 1;
}

export function trackTotal(info: Pick<WodTrackInfo, 'rounds' | 'movements'>, mode: TrackMode): number {
  return mode === 'ronda' ? info.rounds : info.movements.length * info.rounds;
}

/** Los nombres de los tramos de una vuelta: los movimientos; por rondas, ninguno (cada tramo es una ronda). */
export function trackLabels(info: Pick<WodTrackInfo, 'movements'>, mode: TrackMode): string[] {
  return mode === 'movimiento' ? info.movements : [];
}

/**
 * De qué tramos consta el WOD de hoy, o null si no se puede cronometrar por tramos (no es por tiempo, o no hay dos rondas ni dos
 * movimientos que separar). Solo los WODs por tiempo: un AMRAP se cuenta en rondas completas, no en tramos.
 */
export function wodTrackInfo(session: DailySession, part: 1 | 2, scoreType: WodScoreType | null): WodTrackInfo | null {
  if (scoreType !== 'time') return null;
  const key = wodKeyOf(session, part);
  if (!key) return null;
  const blocks = partBlocks(session, part);
  const bench = blocks.find((b) => b.movementId.startsWith('benchmark:'));
  const benchmark = bench ? benchmarkWorkouts.find((w) => w.id === bench.movementId.slice('benchmark:'.length)) : undefined;
  const rounds = roundsOfFormat(benchmark?.format ?? blocks[0]?.format);
  const movements = wodMovementsOfSession(session)
    .filter((m) => m.part === part)
    .map((m) => getMovementById(m.movementId)?.name)
    .filter((n): n is string => Boolean(n));

  const modes: TrackMode[] = [];
  if (rounds >= 2 && rounds <= MAX_TRACK_SEGMENTS) modes.push('ronda');
  if (movements.length >= 2 && movements.length * rounds <= MAX_TRACK_SEGMENTS) modes.push('movimiento');
  if (modes.length === 0) return null;

  const target = blocks.find((b) => b.wodTarget && b.wodTarget.unit === 'seconds' && b.wodTarget.high > 0)?.wodTarget;
  return {
    key,
    part,
    rounds,
    movements,
    modes,
    defaultMode: rounds >= 2 ? 'ronda' : 'movimiento',
    targetSeconds: target ? Math.round((target.low + target.high) / 2) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// El fantasma
// ---------------------------------------------------------------------------------------------

export interface Ghost {
  /**
   * parciales: una marca tuya con sus tramos reales; marca: solo el tiempo final, a ritmo constante; estimado: el objetivo del coach, a ritmo
   * constante; pauta: el ritmo que propone Rex (ver `engine/wodPace.ts`), constante.
   */
  kind: 'parciales' | 'marca' | 'estimado' | 'pauta';
  date?: string;
  /** Lo que tarda el fantasma en cada tramo, en segundos. */
  durations: number[];
  totalSeconds: number;
  /** Se hizo Rx (true), escalado (false) o no se sabe (null). */
  rx: boolean | null;
}

/** «12:40» o «1:02:03» → segundos; null si no es un tiempo. */
export function parseTimeSeconds(value: string): number | null {
  const m = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const even = (total: number, n: number) => Array.from({ length: n }, () => total / n);

/** Los parciales de una marca pasados al modo pedido; null si no se pueden (más tramos de los que hay, o de otra forma). */
function durationsFor(record: WodSplitsRecord, info: WodTrackInfo, mode: TrackMode): number[] | null {
  const total = trackTotal(info, mode);
  if (record.mode === mode) return record.segments.length === total ? record.segments : null;
  // Una marca por movimientos también sirve por rondas: se suman los movimientos de cada ronda.
  if (record.mode === 'movimiento' && mode === 'ronda' && record.labels.length > 0 && record.segments.length === record.labels.length * info.rounds) {
    return Array.from({ length: info.rounds }, (_, r) => sum(record.segments.slice(r * record.labels.length, (r + 1) * record.labels.length)));
  }
  return null;
}

/**
 * El fantasma de hoy: tu mejor marca anterior de este WOD con parciales (la más rápida de las que no acabaron en el cap); si no hay
 * parciales, tu mejor tiempo final repartido a ritmo constante; si tampoco, el objetivo del coach a ritmo constante. null si no hay nada.
 */
export function pickGhost(args: {
  info: WodTrackInfo;
  mode: TrackMode;
  todayIso: string;
  history: SessionHistoryEntry[];
  ghosts: WodSplitsRecord[];
}): Ghost | null {
  const { info, mode, todayIso, history, ghosts } = args;
  const total = trackTotal(info, mode);

  const byId = new Map<string, WodSplitsRecord>();
  for (const r of [...ghosts, ...history.flatMap((h) => h.wodSplits ?? [])]) byId.set(`${r.date}|${r.part}`, r);
  let best: { durations: number[]; record: WodSplitsRecord } | null = null;
  for (const r of byId.values()) {
    if (r.key !== info.key || r.date >= todayIso || r.capped) continue;
    const durations = durationsFor(r, info, mode);
    if (!durations || sum(durations) <= 0) continue;
    if (!best || sum(durations) < sum(best.durations)) best = { durations, record: r };
  }
  if (best) return { kind: 'parciales', date: best.record.date, durations: best.durations, totalSeconds: Math.round(sum(best.durations)), rx: best.record.rx };

  let mark: { seconds: number; date: string; rx: boolean } | null = null;
  for (const h of history) {
    if (h.date >= todayIso || historyWodKey(h) !== info.key) continue;
    const result: WodResult | undefined = info.part === 2 ? h.wodResult2 : h.wodResult;
    if (!result || result.scoreType !== 'time' || result.capped) continue;
    const seconds = parseTimeSeconds(result.value);
    if (seconds === null || seconds <= 0) continue;
    if (!mark || seconds < mark.seconds) mark = { seconds, date: h.date, rx: h.rxOrScaled === 'rx' };
  }
  if (mark) return { kind: 'marca', date: mark.date, durations: even(mark.seconds, total), totalSeconds: mark.seconds, rx: mark.rx };

  if (info.targetSeconds && info.targetSeconds > 0) return { kind: 'estimado', durations: even(info.targetSeconds, total), totalSeconds: info.targetSeconds, rx: null };
  return null;
}

/** El momento (segundos desde el inicio) en el que el fantasma cierra cada tramo. */
export function cumulative(durations: number[]): number[] {
  let acc = 0;
  return durations.map((d) => (acc += d));
}

/** Dónde va el fantasma a los `elapsed` segundos: el tramo en el que está y qué parte de él lleva (0-1). */
export function ghostPosition(durations: number[], elapsed: number): { index: number; frac: number; finished: boolean } {
  const cum = cumulative(durations);
  if (cum.length === 0) return { index: 0, frac: 0, finished: true };
  const index = cum.findIndex((c) => elapsed < c);
  if (index === -1) return { index: durations.length - 1, frac: 1, finished: true };
  const start = index === 0 ? 0 : cum[index - 1];
  return { index, frac: durations[index] > 0 ? (elapsed - start) / durations[index] : 0, finished: false };
}

/**
 * Cuánto vas por delante (+) o por detrás (−) del fantasma, en segundos. `marks` son los segundos en que cerraste cada tramo. Con el último
 * tramo cerrado sabes tu diferencia exacta; mientras el fantasma ya haya cerrado el tramo que tú sigues haciendo, la diferencia es al menos
 * esa espera.
 */
export function liveDelta(durations: number[], marks: number[], elapsed: number): number {
  if (durations.length === 0) return 0;
  const cum = cumulative(durations);
  const k = Math.min(marks.length, durations.length);
  const last = k > 0 ? cum[k - 1] - marks[k - 1] : 0;
  if (k >= durations.length) return last;
  return elapsed > cum[k] ? Math.min(last, cum[k] - elapsed) : last;
}

// ---------------------------------------------------------------------------------------------
// Lo que se guarda y el resumen
// ---------------------------------------------------------------------------------------------

/** Los segundos de cada tramo a partir de los instantes en que se cerraron. */
export function marksToSegments(marks: number[]): number[] {
  return marks.map((m, i) => Math.max(0, Math.round(m - (i === 0 ? 0 : marks[i - 1]))));
}

/** El registro que se guarda al cerrar la sesión; null si no se cerró ningún tramo. */
export function buildSplitsRecord(args: {
  date: string;
  info: WodTrackInfo;
  mode: TrackMode;
  marks: number[];
  totalSeconds: number;
  rx: boolean;
  capped?: boolean;
}): WodSplitsRecord | null {
  const { date, info, mode, marks, totalSeconds, rx, capped } = args;
  if (marks.length === 0) return null;
  const total = trackTotal(info, mode);
  const used = marks.slice(0, total);
  return {
    date,
    part: info.part,
    key: info.key,
    mode,
    labels: trackLabels(info, mode),
    segments: marksToSegments(used),
    totalSeconds: Math.round(totalSeconds),
    rx,
    ...(capped || used.length < total ? { capped: true } : {}),
  };
}

export interface GhostSummaryRow {
  label: string;
  seconds: number;
  /** Segundos que ganas (+) o pierdes (−) a ese tramo del fantasma; null sin fantasma. */
  delta: number | null;
}

export interface GhostSummary {
  rows: GhostSummaryRow[];
  ghost: { kind: Ghost['kind']; date?: string; totalSeconds: number } | null;
  /** Diferencia total con el fantasma (+ = lo has batido); null si no se puede comparar (sin fantasma o sin acabar). */
  totalDelta: number | null;
  outcome: 'gana' | 'pierde' | 'empata' | null;
  /** Una frase del coach: dónde ganaste y dónde perdiste. */
  insight: string | null;
  /** Aviso cuando la comparación no es limpia (uno Rx y el otro escalado). */
  note: string | null;
}

function rowLabel(record: WodSplitsRecord, i: number): string {
  if (record.mode === 'ronda') return `Ronda ${i + 1}`;
  const cycle = record.labels.length;
  const name = record.labels[i % cycle] ?? `Tramo ${i + 1}`;
  const rounds = Math.ceil(record.segments.length / cycle);
  return rounds > 1 ? `${name} · R${Math.floor(i / cycle) + 1}` : name;
}

/** Lo que se enseña al cerrar: cada tramo con su diferencia, el total frente al fantasma y una lectura del coach. */
export function summarizeGhost(record: WodSplitsRecord, ghost: Ghost | null): GhostSummary {
  const comparable = ghost !== null && ghost.durations.length === record.segments.length;
  const rows: GhostSummaryRow[] = record.segments.map((s, i) => ({
    label: rowLabel(record, i),
    seconds: s,
    delta: comparable ? Math.round(ghost!.durations[i] - s) : null,
  }));
  const finished = !record.capped;
  const totalDelta = ghost && finished ? Math.round(ghost.totalSeconds - record.totalSeconds) : null;
  const outcome = totalDelta === null ? null : Math.abs(totalDelta) <= EVEN_SECONDS ? 'empata' : totalDelta > 0 ? 'gana' : 'pierde';

  // Por movimientos, el mismo movimiento de todas las rondas se junta: «tu punto flojo fueron los pull-ups» y no «el tramo 7».
  const groups = new Map<string, { delta: number; seconds: number }>();
  rows.forEach((r, i) => {
    const key = record.mode === 'movimiento' ? record.labels[i % record.labels.length] : r.label;
    const g = groups.get(key) ?? { delta: 0, seconds: 0 };
    g.delta += r.delta ?? 0;
    g.seconds += r.seconds;
    groups.set(key, g);
  });
  let insight: string | null = null;
  if (comparable) {
    const list = [...groups.entries()];
    const worst = list.reduce((w, e) => (e[1].delta < w[1].delta ? e : w), list[0]);
    const bestOne = list.reduce((b, e) => (e[1].delta > b[1].delta ? e : b), list[0]);
    if (worst && worst[1].delta <= -WEAK_SEGMENT_SECONDS) {
      insight = `Tu punto flojo: ${worst[0]} (${secondsText(worst[1].delta)} más lento que el fantasma).`;
      if (bestOne && bestOne[1].delta >= WEAK_SEGMENT_SECONDS && bestOne[0] !== worst[0]) insight += ` Lo mejor: ${bestOne[0]} (${secondsText(bestOne[1].delta)} más rápido).`;
    } else if (bestOne && bestOne[1].delta >= WEAK_SEGMENT_SECONDS) {
      insight = `Ganaste en casi todo; lo mejor fue ${bestOne[0]} (${secondsText(bestOne[1].delta)} más rápido).`;
    }
  } else if (rows.length >= 2) {
    // Sin fantasma con el que comparar: al menos, el tramo en el que más tardaste frente a tu media.
    const list = [...groups.entries()];
    const slowest = list.reduce((s, e) => (e[1].seconds > s[1].seconds ? e : s), list[0]);
    if (slowest && list.length >= 2) insight = `El tramo que más te costó: ${slowest[0]}.`;
  }

  let note: string | null = null;
  if (ghost && ghost.rx !== null && ghost.rx !== record.rx) {
    note = record.rx ? 'El fantasma fue escalado y hoy lo hiciste Rx: la comparación no es limpia.' : 'Hoy escalaste y el fantasma fue Rx: la comparación no es limpia.';
  }
  return { rows, ghost: ghost ? { kind: ghost.kind, date: ghost.date, totalSeconds: ghost.totalSeconds } : null, totalDelta, outcome, insight, note };
}

/** «11 s», «1:05». */
export function secondsText(s: number): string {
  const v = Math.abs(Math.round(s));
  return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v} s`;
}

/** «11 s por delante», «6 s por detrás», «igualado». */
export function deltaText(delta: number): string {
  if (Math.abs(delta) <= EVEN_SECONDS) return 'igualado';
  return `${secondsText(delta)} ${delta > 0 ? 'por delante' : 'por detrás'}`;
}
