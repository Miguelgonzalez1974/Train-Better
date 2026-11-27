import { Fragment, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { X, Check, Minus, Plus, Flame, Dumbbell, Timer, Activity, CircleDot, ArrowRight, NotebookPen } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, PersonalRecords, SessionBlockResult, VariantPersonalRecords, WodScoreType, WorkSetEntry } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { benchmarkWorkouts, getMovementById } from '../../data/movements';
import { localizeWodText } from '../../engine/wodUnits';
import { pctOfMark } from '../../engine/movementProgress';
import type { GhostSummary } from '../../engine/wodGhost';
import type { WodReading } from '../../engine/wodRead';
import type { WodResultForm } from '../../engine/wodScoring';
import type { PartKey, Skips } from '../../engine/sessionParts';
import {
  KG_STEP,
  adjustOnly,
  adjustRow,
  commitOf,
  initialEdit,
  isStraight,
  liftPlanOf,
  markDoneThrough,
  setDone,
  setQuality,
  setRpe,
  setTop,
  topDoneSet,
  topIndex,
  type LiftEdit,
  type LiftPlan,
} from '../../engine/liftSets';
import { clockBus } from '../../lib/clockState';
import { fmtKgValue } from '../../lib/format';
import { useVisibleViewport } from '../../lib/useVisibleViewport';
import { blockOrderOf } from './DaySessionBlocks';
import { groupWodByPart } from './wodPartGroups';
import { WodResultBig } from './WodResultBig';
import { GhostSummaryCard } from './GhostSummaryCard';
import { RexWodReading } from './RexWodReading';
import { RPE_META } from './SessionFeelFields';
import { WodScaleBox, type WodScaleState } from './WodScaleBox';
import { SwapButton } from './SwapMovement';
import { MovementFigureButton } from './MovementFigure';
import type { BlockLog } from './sessionClose';
import { ComplexSwapButton } from './ComplexSwap';
import type { SwapContext } from '../../engine/movementSwap';
import type { ComplexPool } from '../../engine/olyComplexes';

/**
 * Anotar la sesión al acabar, tarjeta a tarjeta: una por cada parte del entreno, a pantalla completa y con un solo botón («Siguiente»). Cada ejercicio
 * de barra enseña un punto por serie con su peso debajo; se elige una serie y se cambia su peso, cómo salió o si no se hizo. El WOD es la única tarjeta
 * con crono y lleva el resultado (puesto desde el reloj si se usó). La última tarjeta recoge el esfuerzo y los minutos totales de la sesión.
 * No se escribe nada hasta «Guardar sesión»: el padre llama a `commitRef` justo antes de registrar, y las series que no se tocaron se anotan como
 * «previstas» (no cuentan como evidencia para el coach).
 */

const THEME: Record<Block | 'end', { bg: string; accent: string; label: string }> = {
  warmup: { bg: '#2a2113', accent: '#ffd166', label: 'Calentamiento' },
  strength: { bg: '#241a14', accent: '#ffb27a', label: 'Fuerza' },
  wod: { bg: '#2a1414', accent: '#ff8a80', label: 'WOD' },
  oly: { bg: '#10261f', accent: '#6ee7b7', label: 'Halterofilia' },
  accessory: { bg: '#1d1a2e', accent: '#b9a7ff', label: 'Accesorio' },
  skill: { bg: '#112428', accent: '#7fe0d4', label: 'Skill' },
  cooldown: { bg: '#161c2a', accent: '#9db4ff', label: 'Vuelta a la calma' },
  end: { bg: '#1f2a12', accent: '#c8f27a', label: 'Cierre' },
};


const BLOCK_ICON = { warmup: Flame, strength: Dumbbell, oly: Dumbbell, wod: Timer, accessory: Activity, skill: CircleDot, cooldown: Flame } as const;

const resolveName = (id: string): string => {
  if (id.startsWith('benchmark:')) {
    const b = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === b)?.name ?? b;
  }
  return getMovementById(id)?.name ?? id;
};

type Indexed = { entry: SessionBlockResult; index: number };

type Card =
  | { kind: 'start'; key: string }
  | { kind: 'list'; key: string; block: Block; entries: Indexed[] }
  | { kind: 'lift'; key: string; block: 'strength' | 'oly'; entry: SessionBlockResult; index: number; plan: LiftPlan; ordinal: number; total: number }
  | { kind: 'wod'; key: string; part: 1 | 2; entries: Indexed[] }
  | { kind: 'end'; key: string };

/** La parte de la sesión por la que se pregunta «qué has hecho» (ver `sessionParts`), si esta tarjeta puede marcarse como no hecha. */
function partKeyOf(card: Card): PartKey | null {
  if (card.kind === 'wod') return card.part === 1 ? 'wod1' : 'wod2';
  if (card.kind === 'list' && (card.block === 'accessory' || card.block === 'skill')) return card.block;
  return null;
}

const kgText = (v: number) => fmtKgValue(v);
const white = '#ffffff';
const soft = 'rgba(255,255,255,0.78)';

function Primary({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-16 w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-center text-[clamp(0.95rem,4.6vw,1.125rem)] font-bold leading-tight transition-transform duration-150 active:scale-[0.98]"
      style={{ background: white, color: '#000' }}
    >
      {children}
    </button>
  );
}

function Round({ onClick, label, children, size = 52 }: { onClick: () => void; label: string; children: React.ReactNode; size?: number }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95" style={{ width: size, height: size, background: 'rgba(255,255,255,0.16)', color: white }}>
      {children}
    </button>
  );
}

/** Lo que hace falta para cambiar un ejercicio ya hecho («hice otro distinto del previsto»): el mismo cambio de movimiento que en la edición de la sesión. */
export interface ReviewSwap {
  ctx: SwapContext;
  complexPool: ComplexPool;
  complexWeek: 1 | 2 | 3 | 4;
  prs: PersonalRecords;
  variantPrs?: VariantPersonalRecords;
  onSwap: (index: number, patch: Partial<SessionBlockResult>) => void;
}

export interface ReviewDeckProps {
  session: DailySession;
  todayWorkLog: WorkSetEntry[];
  skips: Skips;
  onSkip: (key: PartKey, skipped: boolean) => void;
  /** El padre llama a esto justo antes de registrar la sesión: guarda las series tal como están en pantalla. */
  commitRef: MutableRefObject<(() => void) | null>;
  /** Esfuerzo (RPE) que ya se dio hoy de cada levantamiento (por movimiento), para no perderlo; y cómo se guarda el que se da aquí. */
  rpeToday: Record<string, number>;
  onRateLift: (entry: SessionBlockResult, topSet: { kg: number; reps: number }, rpe: number) => void;
  // WOD
  scoreTypes: Record<1 | 2, WodScoreType | null>;
  forms: Record<1 | 2, WodResultForm>;
  onFormChange: (part: 1 | 2, patch: Partial<WodResultForm>) => void;
  clockParts: (1 | 2)[];
  capSeconds: Partial<Record<1 | 2, number>>;
  targets: Partial<Record<1 | 2, string>>;
  wod?: WodScaleState;
  ghostSummaries: Partial<Record<1 | 2, GhostSummary>>;
  wodReadings: Partial<Record<1 | 2, WodReading>>;
  onWorkMovement?: (movementId: string) => boolean;
  /** Cambiar un ejercicio por otro (si se hizo distinto de lo previsto). */
  swap?: ReviewSwap;
  // Cierre
  rpe: number;
  onRpe: (v: number) => void;
  durationMin: number;
  onDuration: (v: number) => void;
  test?: { movementName: string; loadKg: number; onChange: (kg: number) => void };
  onSave: () => void;
  onExit: () => void;
  onOtherThing: () => void;
  /** Tus marcas (1RM): con ellas, junto a los kilos de cada serie sale el % de tu 1RM. Sin ellas no sale. */
  marks?: { prs: PersonalRecords; variantPrs?: VariantPersonalRecords };
  /** Se anotó lo de un ejercicio sin series en el registro (accesorios, calentamiento y vuelta a la calma): el padre lo guarda en la sesión del día. Solo se llama con lo que se tocó. */
  onLogBlock?: (index: number, logged: BlockLog) => void;
  /** Un día pasado que se quedó sin apuntar: se dice cuál al empezar y no hay crono (no se cronometra lo que ya pasó). */
  pastDay?: { label: string };
}

export function ReviewDeck(p: ReviewDeckProps) {
  const { session, todayWorkLog, skips, onSkip, commitRef } = p;
  const visible = useVisibleViewport();

  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [{ kind: 'start', key: 'start' }];
    for (const block of blockOrderOf(session)) {
      const entries = session.blocks.map((entry, index) => ({ entry, index })).filter((e) => e.entry.block === block);
      if (entries.length === 0) continue;
      if (block === 'wod') {
        for (const g of groupWodByPart(entries.map((e) => e.entry), entries.map((e) => e.index))) {
          out.push({ kind: 'wod', key: `wod-${g.part ?? 1}`, part: g.part ?? 1, entries: g.entries.map((entry, k) => ({ entry, index: g.indices![k] })) });
        }
      } else if (block === 'strength' || block === 'oly') {
        const lifts = entries.map((e) => ({ entry: e.entry, index: e.index, plan: liftPlanOf(e.entry) })).filter((l): l is { entry: SessionBlockResult; index: number; plan: LiftPlan } => l.plan !== null);
        lifts.forEach((l, i) => out.push({ kind: 'lift', key: `${block}-${l.plan.mid}`, block, entry: l.entry, index: l.index, plan: l.plan, ordinal: i + 1, total: lifts.length }));
        if (lifts.length === 0) out.push({ kind: 'list', key: `${block}-list`, block, entries: entries.filter((e) => !e.entry.subgroup) });
      } else {
        out.push({ kind: 'list', key: `${block}-list`, block, entries });
      }
    }
    out.push({ kind: 'end', key: 'end' });
    return out;
  }, [session]);

  const lifts = useMemo(() => cards.filter((c): c is Extract<Card, { kind: 'lift' }> => c.kind === 'lift'), [cards]);
  const [edits, setEdits] = useState<Record<string, LiftEdit>>(() => Object.fromEntries(lifts.map((l) => [l.plan.mid, initialEdit(l.plan, todayWorkLog, p.rpeToday[l.entry.movementId])])));
  const [selected, setSelected] = useState<Record<string, number>>({});
  /** Lo anotado de cada accesorio (por posición en la sesión): series hechas y peso. Lo que no se toca queda como previsto y no se guarda. */
  const [acc, setAccState] = useState<Record<number, { sets: number; kg?: number }>>({});
  const [accOpen, setAccOpen] = useState<number | null>(null);
  /** Los ejercicios del calentamiento y de la vuelta a la calma desmarcados (por posición en la sesión). Todos vienen hechos. */
  const [undone, setUndone] = useState<Set<number>>(() => new Set(session.blocks.flatMap((b, i) => (b.notDone ? [i] : []))));
  const markList = (indices: number[], done: boolean) =>
    setUndone((prev) => {
      const next = new Set(prev);
      for (const i of indices) if (done) next.delete(i);
      else next.add(i);
      return next;
    });
  const accOf = (e: SessionBlockResult, index: number) => {
    const total = e.sets && e.sets >= 1 ? Math.min(8, e.sets) : 1;
    const t = acc[index];
    return { total, sets: t?.sets ?? total, kg: t?.kg ?? e.loadKg };
  };
  const setAcc = (index: number, patch: { sets?: number; kg?: number }) => {
    const base = accOf(session.blocks[index], index);
    setAccState((prev) => ({ ...prev, [index]: { sets: patch.sets ?? base.sets, kg: patch.kg ?? base.kg } }));
  };

  // Una parte entera sin ninguna serie hecha cuenta como no hecha (y vuelve a contar si se hace alguna).
  useEffect(() => {
    for (const blk of ['strength', 'oly'] as const) {
      const ofKind = lifts.filter((l) => l.block === blk);
      if (ofKind.length === 0) continue;
      const none = ofKind.every((l) => (edits[l.plan.mid]?.done ?? 1) === 0);
      if (none !== Boolean(skips[blk])) onSkip(blk, none);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits]);

  commitRef.current = () => {
    session.blocks.forEach((entry, index) => {
      if ((entry.block === 'warmup' || entry.block === 'cooldown') && undone.has(index) !== Boolean(entry.notDone)) p.onLogBlock?.(index, { notDone: undone.has(index) });
    });
    if (!skips.accessory) {
      session.blocks.forEach((entry, index) => {
        const t = acc[index];
        if (entry.block === 'accessory' && t) p.onLogBlock?.(index, { sets: t.sets, ...(t.kg !== undefined && (entry.loadKg ?? 0) > 0 ? { kg: t.kg } : {}) });
      });
    }
    for (const l of lifts) {
      if (skips[l.block]) continue;
      const edit = edits[l.plan.mid] ?? initialEdit(l.plan, todayWorkLog, p.rpeToday[l.entry.movementId]);
      const { write, clear } = commitOf(edit);
      for (const w of write) {
        athleteRepository.saveWorkSet({ date: session.date, movementId: l.plan.mid, block: l.plan.blk, setNumber: w.n, kg: w.kg, reps: w.reps, ...(w.quality ? { quality: w.quality } : {}), ...(w.asPlanned ? { asPlanned: true } : {}) });
      }
      for (const n of clear) athleteRepository.clearWorkSet(session.date, l.plan.mid, n);
      // El esfuerzo del ejercicio (de la serie más pesada hecha) calibra al coach y estima el 1RM.
      const top = topDoneSet(edit);
      if (edit.rpe !== undefined && top && !l.entry.complex) p.onRateLift(l.entry, { kg: top.kg, reps: top.reps }, edit.rpe);
    }
  };

  const [cur, setCur] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const goTo = (i: number) => {
    const el = trackRef.current?.children[Math.max(0, Math.min(cards.length - 1, i))] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  const onScroll = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const t = trackRef.current;
      if (!t) return;
      const mid = t.scrollLeft + t.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      Array.from(t.children).forEach((c, i) => {
        const el = c as HTMLElement;
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setCur(best);
    });
  };

  const cardTheme = (c: Card) => (c.kind === 'start' || c.kind === 'end' ? THEME.end : c.kind === 'wod' ? THEME.wod : c.kind === 'lift' ? THEME[c.block] : THEME[c.block]);

  const header = (label: string, accent: string, Icon: typeof Flame, sub?: string) => (
    <div className="px-5 pt-5">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
        <Icon size={15} strokeWidth={2.6} aria-hidden /> {label}
        {sub && <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold normal-case tracking-normal" style={{ background: 'rgba(255,255,255,0.16)', color: white }}>{sub}</span>}
      </p>
    </div>
  );

  // ───────── Inicio ─────────
  const renderStart = () => {
    const tiles = cards.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== 'start' && c.kind !== 'end');
    return (
      <>
        {header('Tu sesión', THEME.end.accent, NotebookPen)}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3">
          <h2 className="text-[clamp(1.5rem,8vw,1.9rem)] font-extrabold leading-tight text-white">Anota lo que hiciste</h2>
          {p.pastDay && <p className="mt-1 text-base font-bold" style={{ color: THEME.end.accent }} data-testid="review-day">{p.pastDay.label}</p>}
          <p className="mt-1 text-sm" style={{ color: soft }}>Una tarjeta por parte. Toca una para ir directo a ella.</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="review-tiles">
            {tiles.map(({ c, i }) => {
              const th = cardTheme(c);
              const block: Block = c.kind === 'wod' ? 'wod' : c.kind === 'lift' || c.kind === 'list' ? c.block : 'warmup';
              const Icon = BLOCK_ICON[block];
              const title = c.kind === 'lift' ? (c.entry.complex?.name ?? resolveName(c.entry.movementId)) : c.kind === 'wod' ? (c.part === 2 || p.scoreTypes[2] ? `WOD · parte ${c.part}` : 'WOD') : th.label;
              return (
                <button key={c.key} onClick={() => goTo(i)} className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-transform active:scale-[0.97]" style={{ background: `${th.accent}26`, color: th.accent }}>
                  <Icon size={26} strokeWidth={2.3} aria-hidden />
                  <span className="text-sm font-bold leading-tight" style={{ color: white }}>{title}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <Primary onClick={() => goTo(1)} testId="review-start">
            Comenzar <ArrowRight size={20} strokeWidth={2.75} />
          </Primary>
          <button onClick={p.onOtherThing} className="self-center text-xs font-semibold underline decoration-dotted" style={{ color: soft }} data-testid="review-other">
            Hice otra cosa
          </button>
        </div>
      </>
    );
  };

  // ───────── Calentamiento y partes sin series ─────────
  const renderList = (c: Extract<Card, { kind: 'list' }>, i: number) => {
    const th = THEME[c.block];
    const Icon = BLOCK_ICON[c.block];
    const key = partKeyOf(c);
    const skipped = key ? Boolean(skips[key]) : false;
    return (
      <>
        {header(th.label, th.accent, Icon)}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-6 pb-3 pt-6">
          <Icon size={72} strokeWidth={1.8} style={{ color: th.accent }} aria-hidden />
          <ul className="flex w-full flex-col gap-1.5 text-center">
            {c.entries.map((e) => (
              <li key={e.index} className={skipped ? 'opacity-50' : ''}>
                <p className="text-xl font-bold leading-snug text-white">{resolveName(e.entry.movementId)}</p>
                <p className="text-sm font-semibold" style={{ color: th.accent }}>
                  {e.entry.reps}
                  {e.entry.loadKg ? ` · ${fmtKgValue(e.entry.loadKg)} kg` : ''}
                </p>
              </li>
            ))}
          </ul>
          {skipped && <p className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.16)', color: white }}>Marcado como no hecho</p>}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <Primary onClick={() => goTo(i + 1)} testId="review-next">
            Siguiente <ArrowRight size={20} strokeWidth={2.75} />
          </Primary>
          {key && (
            <button onClick={() => onSkip(key, !skipped)} className="self-center text-xs font-semibold underline decoration-dotted" style={{ color: soft }}>
              {skipped ? 'Sí lo hice' : 'No lo hice'}
            </button>
          )}
        </div>
      </>
    );
  };

  // ───────── Calentamiento y vuelta a la calma: un check por ejercicio ─────────
  const renderChecklist = (c: Extract<Card, { kind: 'list' }>, i: number) => {
    const th = THEME[c.block];
    const indices = c.entries.map((e) => e.index);
    const done = indices.filter((index) => !undone.has(index)).length;
    return (
      <>
        {header(th.label, th.accent, BLOCK_ICON[c.block], `${done} de ${indices.length}`)}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-5 pb-3 pt-3" data-testid="review-checklist">
          {c.entries.map((e, k) => {
            const on = !undone.has(e.index);
            const name = resolveName(e.entry.movementId);
            const group = e.entry.subgroup && e.entry.subgroup !== c.entries[k - 1]?.entry.subgroup ? e.entry.subgroup : null;
            const dose = [e.entry.sets && e.entry.reps ? `${e.entry.sets} × ${e.entry.reps}` : e.entry.reps, e.entry.loadKg ? `${fmtKgValue(e.entry.loadKg)} kg` : null].filter(Boolean).join(' · ');
            return (
              <Fragment key={e.index}>
                {group && (
                  <p className="mt-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] first:mt-0" style={{ color: soft }}>
                    {group}
                  </p>
                )}
                <div className="flex shrink-0 items-center gap-2 rounded-2xl px-2.5" style={on ? { background: 'rgba(255,255,255,0.08)' } : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}>
                  {/* El muñeco (si ya está dibujado) va aparte de la fila: tocarlo lo abre grande, no marca ni desmarca. */}
                  <MovementFigureButton movementId={e.entry.movementId} name={name} />
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => markList([e.index], !on)} className="flex min-h-[3.5rem] min-w-0 flex-1 items-center gap-3 py-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-snug" style={{ color: on ? white : 'rgba(255,255,255,0.55)' }}>
                        {name}
                      </span>
                      {dose && (
                        <span className="block text-xs font-semibold" style={{ color: on ? th.accent : 'rgba(255,255,255,0.5)' }}>
                          {dose}
                        </span>
                      )}
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={on ? { background: th.accent, color: '#14100c' } : { border: '2px solid rgba(255,255,255,0.4)' }}>
                      {on && <Check size={18} strokeWidth={3.2} aria-hidden />}
                    </span>
                  </button>
                </div>
              </Fragment>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <Primary onClick={() => goTo(i + 1)} testId="review-next">
            Siguiente <ArrowRight size={20} strokeWidth={2.75} />
          </Primary>
          <button onClick={() => markList(indices, done === 0)} className="self-center text-xs font-semibold underline decoration-dotted" style={{ color: soft }} data-testid="review-none">
            {done === 0 ? 'Sí lo hice' : 'No lo hice'}
          </button>
        </div>
      </>
    );
  };

  // ───────── Ejercicio de barra ─────────
  const renderLift = (c: Extract<Card, { kind: 'lift' }>, i: number) => {
    const th = THEME[c.block];
    // Si se cambió el ejercicio, el nuevo parte de lo previsto para él (su peso ya viene recalculado).
    const edit = edits[c.plan.mid] ?? initialEdit(c.plan, todayWorkLog, p.rpeToday[c.entry.movementId]);
    const rows = edit.rows;
    const straight = isStraight(c.plan);
    const hasLoad = c.plan.rows.some((r) => r.plannedKg > 0);
    /** La fila abierta (con sus kilos, su porcentaje y «No salió»); -1 = ninguna. */
    const open = selected[c.plan.mid] ?? -1;
    const top = topIndex(rows);
    const title = c.entry.complex?.name ?? resolveName(c.entry.movementId);
    const movement = c.entry.complex ? undefined : getMovementById(c.entry.movementId);
    const pctOf = (kg: number): number | null => (p.marks && hasLoad ? pctOfMark(movement, kg, p.marks.prs, p.marks.variantPrs) : null);
    // Con series ya anotadas de este movimiento (una corrección) no se cambia: el registro quedaría con otro nombre.
    const swapLocked = todayWorkLog.some((w) => w.movementId === c.plan.mid);
    const patch = (next: LiftEdit) => setEdits((prev) => ({ ...prev, [c.plan.mid]: next }));
    const setOpen = (idx: number) => setSelected((s) => ({ ...s, [c.plan.mid]: idx }));
    const bump = (idx: number, delta: number) => {
      const base = markDoneThrough(edit, idx);
      patch(straight ? adjustRow(base, idx, delta) : !straight && idx === top ? setTop(base, rows[idx].kg + delta) : adjustOnly(base, idx, delta));
    };
    // El círculo: marca la serie como hecha (y las anteriores, porque se hacen en orden); si es la última hecha, la desmarca; en otra ya hecha, la abre.
    const toggleDone = (idx: number) => {
      if (idx >= edit.done) patch(markDoneThrough(edit, idx));
      else if (idx === edit.done - 1) patch(setDone(edit, idx));
      else setOpen(idx);
    };
    // Tocar la fila o sus kilos: la abre (y la da por hecha si no lo estaba) para ajustar el peso.
    const toggleOpen = (idx: number) => {
      if (idx >= edit.done) patch(markDoneThrough(edit, idx));
      setOpen(open === idx ? -1 : idx);
    };
    // «No salió» en la serie más pesada hecha: el esfuerzo del ejercicio salta a 10 (se puede cambiar).
    const toggleFail = (idx: number) => {
      const failed = rows[idx].quality === 'fallada';
      let next = setQuality(edit, idx, failed ? undefined : 'fallada');
      const t = topDoneSet(next);
      if (!failed && hasLoad && !c.entry.complex && t && t.index === idx) next = setRpe(next, 10);
      patch(next);
    };
    const hintOf = (idx: number) => (!hasLoad ? 'peso corporal' : straight ? 'las siguientes se ajustan igual' : idx === top ? 'las demás se mueven en proporción' : 'solo esta serie');
    const plannedPct = pctOf(c.plan.rows[0].plannedKg);
    const planned = straight
      ? `${rows.length} × ${rows[0].reps}${hasLoad ? ` · ${kgText(rows[0].plannedKg)} kg` : ''}${plannedPct !== null ? ` · ${plannedPct} % de tu 1RM` : ''}`
      : `Previsto ${c.plan.rows.map((r) => kgText(r.plannedKg)).join(' · ')} kg`;

    const rowView = (idx: number) => {
      const r = rows[idx];
      const done = idx < edit.done;
      const isOpen = open === idx;
      const failed = r.quality === 'fallada';
      const colour = failed ? '#ff8a80' : r.quality === 'justa' ? '#ffd166' : th.accent;
      const pct = pctOf(r.kg);
      const prevPct = pctOf(r.plannedKg);
      return (
        <div key={r.n} className="rounded-2xl" style={{ background: isOpen ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)', outline: isOpen ? '1.5px solid rgba(255,255,255,0.55)' : 'none' }} data-testid="review-row">
          <div className="flex items-center gap-3 px-3 py-2">
            <button
              onClick={() => toggleDone(idx)}
              aria-label={`Serie ${r.n}${done ? (failed ? ', no salió' : `, hecha, ${kgText(r.kg)} kilos`) : ', sin hacer'}`}
              aria-pressed={done}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold"
              style={done ? { background: colour, color: '#000' } : { border: '2px solid rgba(255,255,255,0.4)', color: white }}
              data-testid="review-dot"
            >
              {done ? failed ? <X size={18} strokeWidth={3} aria-hidden /> : <Check size={18} strokeWidth={3} aria-hidden /> : r.n}
            </button>
            <button onClick={() => toggleOpen(idx)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold text-white">
                Serie {r.n}
                {!straight && idx === top && <span style={{ color: th.accent }}> · top</span>}
              </span>
              <span className="block text-xs" style={{ color: soft }}>
                {failed ? 'No salió' : done ? `${r.reps} ${r.reps === 1 ? 'rep' : 'reps'}` : 'sin hacer'}
              </span>
            </button>
            <button
              onClick={() => toggleOpen(idx)}
              className="shrink-0 rounded-xl px-3 py-1.5 text-base font-extrabold tabular-nums"
              style={{ background: 'rgba(255,255,255,0.1)', color: done && hasLoad && r.kg !== r.plannedKg ? '#ffd166' : white, opacity: done ? 1 : 0.6 }}
            >
              {hasLoad ? `${kgText(r.kg)} kg` : '× ' + r.reps}
            </button>
          </div>
          {isOpen && (
            <div className="flex flex-col items-center gap-2 px-3 pb-3 pt-1" data-testid="review-row-open">
              {hasLoad && (
                <>
                  <div className="flex items-center gap-4">
                    <Round onClick={() => bump(idx, -KG_STEP)} label={`Quitar ${KG_STEP} kilos`} size={46}>
                      <Minus size={24} strokeWidth={3} />
                    </Round>
                    <p className="min-w-[6.5rem] text-center text-[clamp(2.4rem,13vw,3.2rem)] font-black leading-none tabular-nums" style={{ color: th.accent }} data-testid="review-kg">
                      {kgText(r.kg)}
                    </p>
                    <Round onClick={() => bump(idx, KG_STEP)} label={`Añadir ${KG_STEP} kilos`} size={46}>
                      <Plus size={24} strokeWidth={3} />
                    </Round>
                  </div>
                  {pct !== null && (
                    <p className="text-sm font-bold" style={{ color: th.accent }} data-testid="review-pct">
                      {pct} % de tu 1RM
                      {prevPct !== null && prevPct !== pct && <span className="font-medium" style={{ color: soft }}> · previsto {prevPct} %</span>}
                    </p>
                  )}
                </>
              )}
              <p className="text-xs" style={{ color: soft }}>{hintOf(idx)}</p>
              <div className="flex items-center gap-2">
                <button aria-pressed={failed} onClick={() => toggleFail(idx)} className="rounded-full px-5 py-2 text-sm font-bold" style={failed ? { background: '#ff8a80', color: '#000' } : { background: 'rgba(255,255,255,0.16)', color: white }} data-testid="review-fail">
                  No salió
                </button>
                <button onClick={() => patch(setDone(edit, idx))} className="rounded-full px-4 py-2 text-xs font-semibold underline decoration-dotted" style={{ color: soft }} data-testid="review-notdone">
                  No la hice
                </button>
              </div>
            </div>
          )}
        </div>
      );
    };
    const waves = c.plan.waveSize ? Array.from({ length: rows.length / c.plan.waveSize }, (_, w) => w) : null;

    return (
      <>
        {header(th.label, th.accent, Dumbbell, c.total > 1 ? `${c.ordinal} de ${c.total}` : undefined)}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[clamp(1.5rem,8vw,1.9rem)] font-extrabold leading-tight text-white [overflow-wrap:anywhere]">{title}</h2>
            {p.swap &&
              (c.entry.complex ? (
                <ComplexSwapButton entry={c.entry} index={c.index} pool={p.swap.complexPool} week={p.swap.complexWeek} prs={p.swap.prs} variantPrs={p.swap.variantPrs} disabled={swapLocked} onSwap={p.swap.onSwap} />
              ) : (
                <SwapButton entry={c.entry} index={c.index} ctx={p.swap.ctx} disabled={swapLocked} onSwap={p.swap.onSwap} />
              ))}
          </div>
          <p className="mt-0.5 text-sm" style={{ color: soft }}>
            {planned}
            {p.swap && !swapLocked && <span> · ¿Hiciste otro ejercicio? Cámbialo con la flecha</span>}
          </p>

          <div className="mt-4 flex flex-col gap-2" data-testid="review-sets">
            {waves
              ? waves.map((w) => (
                  <div key={w} className="flex flex-col gap-2">
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: soft }}>Ola {w + 1}</p>
                    {rows.map((_, idx) => idx).filter((idx) => Math.floor(idx / c.plan.waveSize!) === w).map(rowView)}
                  </div>
                ))
              : rows.map((_, idx) => rowView(idx))}
          </div>

          {hasLoad && !c.entry.complex && edit.done > 0 && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.18)' }} data-testid="review-lift-rpe">
              <p className="text-center text-sm font-bold text-white">¿Cómo de dura fue la serie más pesada?</p>
              <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Esfuerzo de la serie más pesada">
                {[6, 7, 8, 9, 10].map((n) => {
                  const on = edit.rpe === n;
                  return (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={on}
                      onClick={() => patch(setRpe(edit, on ? undefined : n))}
                      className="flex h-12 items-center justify-center rounded-xl text-lg font-extrabold transition-transform active:scale-95"
                      style={{ background: RPE_META[n].color, color: '#000', outline: on ? '3px solid #fff' : 'none', outlineOffset: 2, opacity: on || edit.rpe === undefined ? 1 : 0.55 }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {edit.rpe !== undefined && (
                <p className="mt-2 text-center text-sm font-bold" style={{ color: RPE_META[edit.rpe].color }}>
                  {RPE_META[edit.rpe].label}
                  <span className="font-medium" style={{ color: soft }}> · {RPE_META[edit.rpe].hint}</span>
                </p>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 pt-1">
          <Primary onClick={() => goTo(i + 1)} testId="review-next">
            Siguiente <ArrowRight size={20} strokeWidth={2.75} />
          </Primary>
        </div>
      </>
    );
  };

  // ───────── Accesorios: una fila por ejercicio, con sus series y el peso ─────────
  const renderAccessory = (c: Extract<Card, { kind: 'list' }>, i: number) => {
    const th = THEME.accessory;
    const key = partKeyOf(c)!;
    const skipped = Boolean(skips[key]);
    const rowsAcc = c.entries.map((e) => ({ ...e, a: accOf(e.entry, e.index) }));
    return (
      <>
        {header(th.label, th.accent, Activity)}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3" data-testid="review-accessory">
          <h2 className="text-[clamp(1.5rem,8vw,1.9rem)] font-extrabold leading-tight text-white">{c.entries.length === 1 ? '1 ejercicio' : `${c.entries.length} ejercicios`}</h2>
          <p className="mt-0.5 text-sm" style={{ color: soft }}>Toca cada serie que hiciste. El peso, si lleva, se toca.</p>
          {skipped ? (
            <p className="mt-6 rounded-full px-3 py-2 text-center text-xs font-bold" style={{ background: 'rgba(255,255,255,0.16)', color: white }}>Marcado como no hecho</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {rowsAcc.map(({ entry, index, a }) => {
                const total = a.total;
                const withLoad = (entry.loadKg ?? 0) > 0;
                const isOpen = accOpen === index;
                return (
                  <div key={index} className="rounded-2xl" style={{ background: isOpen ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)', outline: isOpen ? '1.5px solid rgba(255,255,255,0.55)' : 'none' }} data-testid="review-acc-row">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug text-white [overflow-wrap:anywhere]">{resolveName(entry.movementId)}</p>
                        <p className="text-xs" style={{ color: soft }}>{entry.sets ? `${entry.sets} × ${entry.reps ?? ''}`.trim() : (entry.reps ?? '')}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {Array.from({ length: total }, (_, k) => {
                            const doneK = k < a.sets;
                            return (
                              <button
                                key={k}
                                onClick={() => setAcc(index, { sets: a.sets === k + 1 ? k : k + 1 })}
                                aria-label={total === 1 ? (doneK ? 'Hecho' : 'Sin hacer') : `Serie ${k + 1}${doneK ? ' hecha' : ' sin hacer'}`}
                                aria-pressed={doneK}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold"
                                style={doneK ? { background: th.accent, color: '#000' } : { border: '1.5px solid rgba(255,255,255,0.4)', color: white }}
                                data-testid="review-acc-set"
                              >
                                {doneK ? <Check size={14} strokeWidth={3} aria-hidden /> : total === 1 ? '' : k + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {withLoad ? (
                        <button onClick={() => setAccOpen(isOpen ? null : index)} aria-expanded={isOpen} className="shrink-0 rounded-xl px-3 py-1.5 text-base font-extrabold tabular-nums" style={{ background: 'rgba(255,255,255,0.1)', color: a.kg !== entry.loadKg ? '#ffd166' : white }}>
                          {kgText(a.kg ?? 0)} kg
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>sin peso</span>
                      )}
                    </div>
                    {isOpen && withLoad && (
                      <div className="flex items-center justify-center gap-4 px-3 pb-3">
                        <Round onClick={() => setAcc(index, { kg: Math.max(0, (a.kg ?? 0) - KG_STEP) })} label={`Quitar ${KG_STEP} kilos`} size={46}>
                          <Minus size={24} strokeWidth={3} />
                        </Round>
                        <p className="min-w-[6.5rem] text-center text-[clamp(2.2rem,12vw,3rem)] font-black leading-none tabular-nums" style={{ color: th.accent }}>{kgText(a.kg ?? 0)}</p>
                        <Round onClick={() => setAcc(index, { kg: (a.kg ?? 0) + KG_STEP })} label={`Añadir ${KG_STEP} kilos`} size={46}>
                          <Plus size={24} strokeWidth={3} />
                        </Round>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <Primary onClick={() => goTo(i + 1)} testId="review-next">
            Siguiente <ArrowRight size={20} strokeWidth={2.75} />
          </Primary>
          <button onClick={() => onSkip(key, !skipped)} className="self-center text-xs font-semibold underline decoration-dotted" style={{ color: soft }}>
            {skipped ? 'Sí lo hice' : 'No he hecho ninguno'}
          </button>
        </div>
      </>
    );
  };

  // ───────── WOD ─────────
  const renderWod = (c: Extract<Card, { kind: 'wod' }>, i: number) => {
    const th = THEME.wod;
    const first = c.entries[0].entry;
    const isBench = first.movementId.startsWith('benchmark:');
    const benchWod = isBench ? benchmarkWorkouts.find((w) => w.id === first.movementId.replace('benchmark:', '')) : undefined;
    const format = isBench ? ((first.format || benchWod?.format) as string | undefined) : first.format;
    const key = partKeyOf(c)!;
    const skipped = Boolean(skips[key]);
    const score = p.scoreTypes[c.part];
    return (
      <>
        {header(th.label, th.accent, Timer, p.scoreTypes[2] ? `parte ${c.part} de 2` : undefined)}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[clamp(1.5rem,8vw,1.9rem)] font-extrabold leading-tight text-white [overflow-wrap:anywhere]">{isBench ? (benchWod?.name ?? 'Benchmark') : (first.title ?? 'WOD')}</h2>
            {!p.pastDay && (
              <button onClick={() => clockBus.open('workout')} aria-label="Abrir el crono" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full active:scale-95" style={{ background: 'rgba(255,255,255,0.18)', color: white }} data-testid="review-clock">
                <Timer size={22} strokeWidth={2.6} aria-hidden />
              </button>
            )}
          </div>
          {format && <p className="mt-0.5 text-base font-bold" style={{ color: th.accent }}>{localizeWodText(format)}</p>}
          {p.targets[c.part] && <p className="text-xs" style={{ color: soft }}>Objetivo del coach: {p.targets[c.part]}</p>}

          {skipped ? (
            <p className="mt-6 rounded-2xl px-4 py-5 text-center text-sm font-bold" style={{ background: 'rgba(255,255,255,0.12)', color: white }}>WOD marcado como no hecho</p>
          ) : (
            <>
              {score && (
                <div className="mt-4 rounded-2xl p-3.5" style={{ background: 'rgba(255,255,255,0.08)' }} data-testid="review-wod-result">
                  <p className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
                    Resultado
                    {p.clockParts.includes(c.part) && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'rgba(155,231,178,0.2)', color: '#9be7b2' }}>
                        <Timer size={11} aria-hidden /> del crono
                      </span>
                    )}
                  </p>
                  <WodResultBig scoreType={score} form={p.forms[c.part]} onChange={(patch) => p.onFormChange(c.part, patch)} capSeconds={p.capSeconds[c.part]} accent={th.accent} />
                </div>
              )}
              {p.ghostSummaries[c.part] && (
                <div className="mt-3 flex flex-col gap-2">
                  <GhostSummaryCard summary={p.wodReadings[c.part] ? { ...p.ghostSummaries[c.part]!, insight: null } : p.ghostSummaries[c.part]!} />
                  {p.wodReadings[c.part] && <RexWodReading reading={p.wodReadings[c.part]!} onWork={p.onWorkMovement} />}
                </div>
              )}
              {p.wod && <WodScaleBox wod={p.wod} part={c.part} accent={th.accent} />}
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <Primary onClick={() => goTo(i + 1)} testId="review-next">
            Siguiente <ArrowRight size={20} strokeWidth={2.75} />
          </Primary>
          <button onClick={() => onSkip(key, !skipped)} className="self-center text-xs font-semibold underline decoration-dotted" style={{ color: soft }}>
            {skipped ? 'Sí lo hice' : 'No lo hice'}
          </button>
        </div>
      </>
    );
  };

  // ───────── Cierre ─────────
  const renderEnd = () => {
    const th = THEME.end;
    const meta = RPE_META[p.rpe] ?? RPE_META[7];
    const step = (d: number) => p.onDuration(Math.max(10, Math.min(240, p.durationMin + d)));
    return (
      <>
        {header('Cierre', th.accent, NotebookPen)}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3">
          <h2 className="text-[clamp(1.4rem,7.5vw,1.75rem)] font-extrabold leading-tight text-white">¿Cómo lo has sentido?</h2>
          <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Esfuerzo percibido (RPE)" data-testid="review-rpe">
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => {
              const color = RPE_META[n].color;
              const on = p.rpe === n;
              return (
                <button key={n} role="radio" aria-checked={on} onClick={() => p.onRpe(n)} className="flex h-12 items-center justify-center rounded-xl text-lg font-extrabold transition-transform active:scale-95" style={{ background: color, color: '#000', outline: on ? '3px solid #fff' : 'none', outlineOffset: 2, opacity: on ? 1 : 0.62 }}>
                  {n}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-sm font-bold" style={{ color: meta.color }}>
            {meta.label}
            <span className="font-medium" style={{ color: soft }}> · {meta.hint}</span>
          </p>

          <div className="mt-5 flex flex-col items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: th.accent }}>Duración total de la sesión</p>
            <div className="flex items-center gap-4">
              <Round onClick={() => step(-5)} label="Menos tiempo">
                <Minus size={26} strokeWidth={3} />
              </Round>
              <p className="min-w-[7rem] text-center text-[clamp(3rem,16vw,4rem)] font-black leading-none tabular-nums text-white" data-testid="review-minutes">
                {p.durationMin}
                <span className="ml-1 text-lg font-bold" style={{ color: soft }}>min</span>
              </p>
              <Round onClick={() => step(5)} label="Más tiempo">
                <Plus size={26} strokeWidth={3} />
              </Round>
            </div>
            <div className="flex gap-2">
              {[-10, -5, 5, 10].map((d) => (
                <button key={d} onClick={() => step(d)} className="rounded-full px-3.5 py-2 text-sm font-bold" style={{ background: 'rgba(255,255,255,0.16)', color: white }}>
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
          </div>

          {p.test && (
            <div className="mt-5 rounded-2xl p-3.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <p className="mb-2 text-sm font-bold text-white">Test 1RM · {p.test.movementName}</p>
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={2.5} inputMode="decimal" value={p.test.loadKg} onChange={(e) => p.test!.onChange(Number(e.target.value))} className="w-24 rounded-lg px-2 py-1.5 text-center text-base font-bold" style={{ background: 'rgba(0,0,0,0.4)', color: white, border: '1px solid rgba(255,255,255,0.3)' }} aria-label="Kilos levantados en el test" />
                <span className="text-sm" style={{ color: soft }}>kg levantados</span>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 pt-1">
          <Primary onClick={p.onSave} testId="review-save">
            Guardar sesión
          </Primary>
        </div>
      </>
    );
  };

  return (
    <div className="force-dark fixed inset-0 z-30 flex flex-col text-white" style={{ background: '#0b0b0e', ...(visible ?? {}) }} data-testid="review-deck">
      <div className="flex items-center gap-3 px-4 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={p.onExit} aria-label="Salir sin guardar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-white/20" style={{ background: 'rgba(255,255,255,0.16)', color: white }}>
          <X size={19} />
        </button>
        <div className="flex flex-1 gap-1" role="tablist" aria-label="Partes del entreno">
          {cards.map((c, ci) => (
            <button key={c.key} role="tab" aria-selected={ci === cur} aria-label={`Ir a la tarjeta ${ci + 1}`} onClick={() => goTo(ci)} className="flex h-6 flex-1 items-center">
              <span className="h-1.5 w-full rounded-full transition-colors" style={{ background: ci === cur ? '#fff' : ci < cur ? cardTheme(c).accent : 'rgba(255,255,255,0.22)' }} />
            </button>
          ))}
        </div>
      </div>
      <div ref={trackRef} onScroll={onScroll} className="flex min-h-0 flex-1 snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto overflow-y-hidden px-3.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((c, ci) => {
          const th = cardTheme(c);
          return (
            <section key={c.key} data-testid="review-card" data-kind={c.kind} aria-label={`Tarjeta ${ci + 1} de ${cards.length}`} className="flex h-full min-h-0 w-[calc(100%-28px)] shrink-0 snap-center flex-col overflow-hidden rounded-[30px] border" style={{ background: `linear-gradient(165deg, ${th.bg} 0%, #101014 100%)`, borderColor: `${th.accent}55` }}>
              {c.kind === 'start' && renderStart()}
              {c.kind === 'list' && (c.block === 'accessory' ? renderAccessory(c, ci) : c.block === 'warmup' || c.block === 'cooldown' ? renderChecklist(c, ci) : renderList(c, ci))}
              {c.kind === 'lift' && renderLift(c, ci)}
              {c.kind === 'wod' && renderWod(c, ci)}
              {c.kind === 'end' && renderEnd()}
            </section>
          );
        })}
      </div>
    </div>
  );
}
