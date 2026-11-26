import type { AthleteProfile, DailySession, SessionBlockResult, SessionHistoryEntry, SetQuality, SkippedPart, WodSplitsRecord, WorkSetEntry } from '../../data/athlete/types';
import { complexLogId, isComplexLogId } from '../../data/complexes';
import { benchmarkWorkouts, getMovementById, resolveMovementDisplayName } from '../../data/movements';
import { pctOfMark } from '../../engine/movementProgress';
import { sessionProgressionView, type SessionProgressionView } from '../../engine/progression';
import { describeSkipped } from '../../engine/sessionParts';
import { isMeaningfulWodResult } from '../../engine/wodScoring';
import { previousBenchmarkMark, topsBefore } from './sessionCardModel';
import { wodWhat } from './sessionCardWod';

/**
 * Todo lo que enseña la pantalla de un entreno hecho (ver `ActivityScreen`): la fuerza y la halterofilia serie a serie y frente a la última vez,
 * el WOD con su resultado y sus parciales, el accesorio y lo que no se hizo. Manda lo anotado ESE día; la sesión guardada solo completa lo que no
 * se anotó (y en un día antiguo puede no estar ya). Puro.
 */

export interface SetDetail {
  kg: number;
  reps: number;
  quality?: SetQuality;
}

export interface LiftDetail {
  id: string;
  block: 'strength' | 'oly';
  name: string;
  /** Las series anotadas ese día, en orden. Vacío: no se anotaron (se enseña lo previsto). */
  sets: SetDetail[];
  /** Series previstas, si la sesión sigue guardada. */
  planned: number | null;
  /** «4×5 · 60 kg»: lo previsto, para cuando no hay series anotadas. */
  prescription: string | null;
  topKg: number;
  /** % de tu 1RM actual con la serie más pesada. */
  pct: number | null;
  /** La serie más pesada supera todo lo anotado antes. */
  record: boolean;
  /** Kilos de diferencia con la última vez (0 = igual); null la primera vez o sin series. */
  delta: number | null;
  /** El peso más alto de las últimas veces, hasta hoy (para la línea de evolución). */
  trend: number[];
  /** Qué decidió el coach con este resultado. */
  progression: SessionProgressionView | null;
}

export interface WodDetail {
  part: 1 | 2;
  title: string;
  format: string;
  /** «21 Thruster · 40 kg», una línea por movimiento. */
  moves: string[];
  result: string | null;
  rx: boolean;
  /** Tu marca anterior en este mismo WOD con nombre. */
  previous: string | null;
  feel: string | null;
  /** «Pull-Up → Ring Row», «Thruster: 35 kg (Rx 43)». */
  scaled: string[];
  splits: Pick<WodSplitsRecord, 'mode' | 'segments'> | null;
}

export interface ActivityDetail {
  lifts: LiftDetail[];
  wods: WodDetail[];
  accessory: { name: string; text: string }[];
  /** «Sin el WOD, por la molestia.» */
  skipped: string | null;
  /** Lo que apuntaste en un día de «Hice otra cosa». */
  note: string | null;
  /** Cuando no queda nada más: los movimientos del historial. */
  fallback: string[];
}

export interface ActivityDetailInput {
  entry: SessionHistoryEntry;
  session: DailySession | null;
  history: SessionHistoryEntry[];
  profile: AthleteProfile;
  /** El registro de series entero (de aquí salen las comparaciones). */
  workLog: WorkSetEntry[];
}

const TREND_POINTS = 5;
const FEEL_TEXT = { facil: 'Te pareció fácil', justo: 'Te pareció justo', duro: 'Te pareció duro' } as const;

export const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** La cifra de una serie y lo que se lee debajo. Con peso mandan los kilos; sin él (dominadas, fondos), las repeticiones, o que se hizo. */
export function setFigure(s: SetDetail): { value: string; unit: string } {
  const unit = s.reps === 1 ? 'rep' : 'reps';
  if (s.kg > 0) return { value: num(s.kg), unit: s.reps > 0 ? `${s.reps} ${unit}` : 'kg' };
  return s.reps > 0 ? { value: String(s.reps), unit } : { value: '✓', unit: 'hecha' };
}

const nameOf = (id: string) => resolveMovementDisplayName(id);

/** El nombre de un levantamiento anotado: un complejo propio solo se llama por su nombre mientras la sesión sigue guardada. */
const liftName = (id: string, session: DailySession | null) => session?.blocks.find((b) => b.complex && complexLogId(b.complex.id) === id)?.complex?.name ?? nameOf(id);

const logIdOf = (b: SessionBlockResult) => (b.complex ? complexLogId(b.complex.id) : b.movementId);

function prescriptionOf(b: SessionBlockResult): string | null {
  const scheme = b.sets ? `${b.sets}×${b.reps ?? ''}`.replace(/×$/, ' series') : (b.reps ?? '');
  return [scheme, b.loadKg ? `${num(b.loadKg)} kg` : null].filter(Boolean).join(' · ') || null;
}

function liftsOf({ entry, session, profile, workLog }: ActivityDetailInput): LiftDetail[] {
  const date = entry.date;
  const skipped = new Set((entry.skipped ?? []).map((p) => p.block));
  const blocks = session && session.source !== 'custom' ? session.blocks : [];
  const day = workLog.filter((s) => s.date === date && Boolean(s.movementId));
  const out: LiftDetail[] = [];

  for (const block of ['strength', 'oly'] as const) {
    const planned = blocks.filter((b) => b.block === block);
    const logged = [...new Set(day.filter((s) => s.block === block).map((s) => s.movementId))];
    // Primero lo que estaba en la sesión, en su orden; detrás, lo anotado que no estaba (un cambio de ejercicio).
    const order = (id: string) => {
      const i = planned.findIndex((b) => logIdOf(b) === id);
      return i < 0 ? planned.length : i;
    };
    logged.sort((a, b) => order(a) - order(b));
    // Sin ninguna serie anotada, queda el levantamiento principal tal como estaba previsto (en oly, el último de la parte principal).
    if (logged.length === 0 && !skipped.has(block)) {
      const mains = planned.filter((b) => !b.subgroup);
      const main = block === 'oly' ? (mains.find((b) => b.complex) ?? mains[mains.length - 1]) : mains[0];
      if (main) logged.push(logIdOf(main));
    }

    for (const id of logged) {
      const sets = day
        .filter((s) => s.block === block && s.movementId === id)
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => ({ kg: s.kg, reps: s.reps, ...(s.quality ? { quality: s.quality } : {}) }));
      const plan = planned.find((b) => logIdOf(b) === id);
      const topKg = sets.reduce((m, s) => (s.quality === 'fallada' ? m : Math.max(m, s.kg)), 0);
      const before = topsBefore(workLog, id, date);
      const last = before[before.length - 1];
      const best = before.reduce((m, t) => Math.max(m, t.kg), 0);
      const movementId = plan?.movementId ?? id;
      out.push({
        id,
        block,
        name: liftName(id, session),
        sets,
        planned: plan?.sets ?? null,
        prescription: plan ? prescriptionOf(plan) : null,
        topKg,
        pct: isComplexLogId(id) ? null : pctOfMark(getMovementById(id), topKg, profile.prs, profile.variantPrs),
        record: before.length > 0 && topKg > best,
        delta: last && topKg > 0 ? Math.round((topKg - last.kg) * 100) / 100 : null,
        trend: topKg > 0 ? [...before.slice(-(TREND_POINTS - 1)).map((t) => t.kg), topKg] : [],
        progression: sessionProgressionView(profile.progressionLog, profile.prLog, profile.progressionSettings, date, movementId),
      });
    }
  }
  return out;
}

function wodsOf({ entry, session, history, profile }: ActivityDetailInput): WodDetail[] {
  if (session?.source === 'custom') return [];
  const blocks = entry.wodBlocks?.length ? entry.wodBlocks : (session?.blocks.filter((b) => b.block === 'wod') ?? []);
  const skips: SkippedPart[] = (entry.skipped ?? []).filter((p) => p.block === 'wod');
  const parts: (1 | 2)[] = blocks.some((b) => b.wodPart === 2) || entry.wodResult2 ? [1, 2] : [1];
  const splits = [...(entry.wodSplits ?? []), ...(profile.wodGhosts ?? []).filter((g) => g.date === entry.date)];

  return parts.flatMap((part): WodDetail[] => {
    if (skips.some((p) => p.part === undefined || p.part === part || parts.length === 1)) return [];
    const own = parts.length > 1 ? blocks.filter((b) => (b.wodPart ?? 1) === part) : blocks;
    const stored = part === 1 ? entry.wodResult : entry.wodResult2;
    const result = isMeaningfulWodResult(stored) ? stored.value : null;
    if (own.length === 0 && !result) return [];
    const benchId = own[0]?.movementId.startsWith('benchmark:') ? own[0].movementId : null;
    const bench = benchId ? benchmarkWorkouts.find((w) => `benchmark:${w.id}` === benchId) : undefined;
    const title = (own.length > 0 ? wodWhat(own) || own[0].title : null) || bench?.name || 'WOD';
    const moves = bench
      ? []
      : own.map((b) => [[b.reps, nameOf(b.movementId)].filter(Boolean).join(' '), b.loadKg ? `${num(b.loadKg)} kg` : null].filter(Boolean).join(' · '));
    const scaled = (entry.wodScaling ?? [])
      .filter((s) => (s.part ?? 1) === part)
      .map((s) =>
        s.kind === 'movimiento'
          ? `${nameOf(s.movementId)}${s.substituteId ? ` → ${nameOf(s.substituteId)}` : ': cambiado'}`
          : `${nameOf(s.movementId)}: ${s.loadKg ? `${num(s.loadKg)} kg` : 'menos peso'}${s.rxKg ? ` (Rx ${num(s.rxKg)})` : ''}`,
      );
    const split = splits.find((s) => s.date === entry.date && s.part === part && s.segments.length > 1);
    return [
      {
        part,
        title,
        format: own[0]?.format ?? '',
        moves,
        result,
        rx: entry.rxOrScaled === 'rx',
        previous: benchId ? previousBenchmarkMark(history, benchId, entry.date) : null,
        feel: entry.wodFeel ? FEEL_TEXT[entry.wodFeel] : null,
        scaled,
        splits: split ? { mode: split.mode, segments: split.segments } : null,
      },
    ];
  });
}

function accessoryOf({ entry, session }: ActivityDetailInput): ActivityDetail['accessory'] {
  if (!session || session.source === 'custom' || (entry.skipped ?? []).some((p) => p.block === 'accessory')) return [];
  return session.blocks
    .filter((b) => b.block === 'accessory')
    .map((b) => {
      const done = b.loggedSets !== undefined || b.loggedKg !== undefined;
      const sets = b.loggedSets ?? b.sets;
      const kg = b.loggedKg ?? b.loadKg;
      const scheme = done ? (sets ? `${sets} series` : '') : sets ? `${sets}×${b.reps ?? ''}`.replace(/×$/, ' series') : (b.reps ?? '');
      return { name: nameOf(b.movementId), text: [scheme, kg ? `${num(kg)} kg` : null].filter(Boolean).join(' · ') };
    });
}

export function buildActivityDetail(input: ActivityDetailInput): ActivityDetail {
  const { entry, session } = input;
  // Cada parte por separado: un dato guardado raro deja sin su bloque a esa parte, no la pantalla en blanco.
  const safe = <T,>(part: () => T, empty: T): T => {
    try {
      return part();
    } catch (error) {
      console.error('No se pudo leer una parte del entreno:', error);
      return empty;
    }
  };
  const lifts = safe(() => liftsOf(input), []);
  const wods = safe(() => wodsOf(input), []);
  const accessory = safe(() => accessoryOf(input), []);
  const note = session?.source === 'custom' ? session.customNote?.trim() || null : null;
  const empty = lifts.length === 0 && wods.length === 0 && accessory.length === 0 && !note;
  return {
    lifts,
    wods,
    accessory,
    skipped: safe(() => describeSkipped(entry.skipped), null),
    note,
    fallback: empty && session?.source !== 'custom' ? safe(() => [...new Set((entry.movementIds ?? []).map(nameOf))].slice(0, 8), []) : [],
  };
}
