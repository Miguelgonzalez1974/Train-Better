import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Timer, Minus, Plus, ChartSpline, ArrowRight, Undo2, Flag } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { SessionBlockResult, SetFeel, SetQuality } from '../../data/athlete/types';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { complexLogId } from '../../data/complexes';
import { loadUnitLabel } from '../../data/movements/loadUnits';
import { parseWorkingReps, SET_FEEL_LABEL } from '../../engine/setFeedback';
import { adjustRemainingSets } from '../../engine/setAdjust';
import { clockText, prescribedRestSeconds, restLabel } from '../../engine/restPrescription';
import { localizeWodText } from '../../engine/wodUnits';
import { clockBus } from '../../lib/clockState';
import { fmtKgValue } from '../../lib/format';
import { useVisibleViewport } from '../../lib/useVisibleViewport';
import { resolveLiftPrKey } from '../../engine/movementProgress';
import { noteHead } from './noteText';
import { groupWodByPart } from './wodPartGroups';
import { BLOCK_ORDER } from './DaySessionBlocks';
import { MovementProgressModal } from './MovementProgressModal';
import { RpeCheckIn } from './RpeCheckIn';
import { SwapButton } from './SwapMovement';
import { ComplexSwapButton } from './ComplexSwap';
import { WodCategoryPill } from './WodCategoryPill';
import type { FocusModeProps } from './FocusMode';

/**
 * Entreno en tarjetas (a prueba): la sesión como una fila horizontal de tarjetas, una por parte (o por ejercicio de barra).
 * Se desliza o se toca el botón grande; el descanso solo aparece donde el entreno lo prescribe (fuerza y halterofilia, ver
 * `engine/restPrescription.ts`) y nunca entre partes. Escribe exactamente lo mismo que el modo enfocado (mismas funciones del
 * padre), así que el coach recoge los mismos datos. Convive con `FocusMode`: para volver al de siempre basta no abrir este.
 */

type Indexed = { entry: SessionBlockResult; index: number };

type Card =
  | { kind: 'checklist'; key: string; block: Block; entries: Indexed[] }
  | { kind: 'lift'; key: string; block: 'strength' | 'oly'; prep: Indexed[]; item: Indexed; ordinal: number; total: number }
  | { kind: 'wod'; key: string; part: 1 | 2 | null; entries: Indexed[] }
  | { kind: 'end'; key: string };

interface Theme {
  bg: string;
  accent: string;
  label: string;
}

/** Colores en línea (no del tema) para que la tarjeta se vea igual de oscura y viva en tema claro y oscuro. */
const THEME: Record<Block | 'rest' | 'end', Theme> = {
  warmup: { bg: '#2a2113', accent: '#ffd166', label: 'Calentamiento' },
  strength: { bg: '#241a14', accent: '#ffb27a', label: 'Fuerza' },
  wod: { bg: '#2a1414', accent: '#ff8a80', label: 'WOD' },
  oly: { bg: '#10261f', accent: '#6ee7b7', label: 'Halterofilia' },
  accessory: { bg: '#1d1a2e', accent: '#b9a7ff', label: 'Accesorio' },
  skill: { bg: '#112428', accent: '#7fe0d4', label: 'Skill' },
  cooldown: { bg: '#161c2a', accent: '#9db4ff', label: 'Vuelta a la calma' },
  rest: { bg: '#0f2430', accent: '#7fd1e6', label: 'Descanso' },
  end: { bg: '#1f2a12', accent: '#c8f27a', label: 'Cierre' },
};

const QUALITY: { value: SetQuality | undefined; label: string; color: string }[] = [
  { value: undefined, label: 'Bien', color: '#7ee0a0' },
  { value: 'justa', label: 'Justa', color: '#ffd166' },
  { value: 'fallada', label: 'No salió', color: '#ff8a80' },
];

function resolveName(id: string): string {
  if (id.startsWith('benchmark:')) {
    const b = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === b)?.name ?? b;
  }
  return getMovementById(id)?.name ?? id;
}

function NoteLine({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { head, hasMore } = noteHead(text);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-white/60">
      {open ? text : head}
      {hasMore && (
        <button onClick={() => setOpen((o) => !o)} className="ml-1.5 text-xs font-semibold text-white/80 underline decoration-dotted">
          {open ? 'menos' : 'ver más'}
        </button>
      )}
    </p>
  );
}

/** El botón grande de cada tarjeta: píldora blanca, pulgar-friendly. */
function Cta({ onClick, children, testId, tone }: { onClick: () => void; children: React.ReactNode; testId?: string; tone?: 'light' | 'ghost' }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex h-16 w-full items-center justify-center gap-2 rounded-full text-lg font-bold transition-transform duration-150 active:scale-[0.98] ${
        tone === 'ghost' ? 'bg-white/10 text-white' : 'bg-white text-black shadow-lg shadow-black/30'
      }`}
    >
      {children}
    </button>
  );
}

const round4 = (v: number) => Math.max(0, Math.round(v * 4) / 4);

export function TrainCards({
  session,
  setFeedbackByIndex,
  onRateSet,
  todayWorkLog,
  progress,
  onLogWorkSet,
  onSetQuality,
  onClearWorkSet,
  canRaise,
  onFeel,
  painFlags,
  onSwap,
  complexPool,
  complexWeek,
  onExit,
  onFinish,
}: FocusModeProps) {
  const swapCtx = useMemo(() => ({ prs: progress.prs, variantPrs: progress.variantPrs, painFlags, todayIso: session.date }), [progress.prs, progress.variantPrs, painFlags, session.date]);
  const visible = useVisibleViewport();

  // Las tarjetas: calentamiento/accesorio/skill/vuelta a la calma = una lista; fuerza y oly = una por ejercicio de trabajo;
  // el WOD = una por parte (doble WOD); al final, el cierre.
  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    for (const block of BLOCK_ORDER) {
      const entries = session.blocks.map((entry, index) => ({ entry, index })).filter((e) => e.entry.block === block);
      if (entries.length === 0) continue;
      if (block === 'wod') {
        for (const g of groupWodByPart(entries.map((e) => e.entry), entries.map((e) => e.index))) {
          out.push({ kind: 'wod', key: `wod-${g.part ?? 0}`, part: g.part, entries: g.entries.map((entry, k) => ({ entry, index: g.indices![k] })) });
        }
      } else if (block === 'strength' || block === 'oly') {
        const prep = entries.filter((e) => e.entry.subgroup);
        const work = entries.filter((e) => !e.entry.subgroup);
        if (work.length === 0) {
          out.push({ kind: 'checklist', key: `${block}-list`, block, entries });
        } else {
          work.forEach((item, wi) => out.push({ kind: 'lift', key: `${block}-${item.index}`, block, prep: wi === 0 ? prep : [], item, ordinal: wi + 1, total: work.length }));
        }
      } else {
        out.push({ kind: 'checklist', key: `${block}-list`, block, entries });
      }
    }
    out.push({ kind: 'end', key: 'end' });
    return out;
  }, [session]);

  const [cur, setCur] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});
  const [perSetKg, setPerSetKg] = useState<Record<string, number>>({});
  const [feelByMovement, setFeelByMovement] = useState<Record<string, SetFeel>>({});
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [progressTarget, setProgressTarget] = useState<{ movementId: string; targetKg: number } | null>(null);
  /** Ejercicios cuyas series sin marcar ya se resolvieron en el cierre (las hice / no salieron / las salté). */
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  /** El descanso en curso (uno a la vez): hora de fin con reloj de pared, para que siga contando con la app en segundo plano. */
  const [rest, setRest] = useState<{ key: string; movementId: string; next: number; endsAt: number; total: number; notified: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!rest) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [rest]);
  useEffect(() => {
    if (!rest || rest.notified || now < rest.endsAt) return;
    setRest((r) => (r ? { ...r, notified: true } : r));
    try {
      navigator.vibrate?.([220, 90, 220]);
    } catch {
      /* sin vibración */
    }
  }, [now, rest]);

  const loggedKg = (movementId: string, n: number) => todayWorkLog.find((e) => e.movementId === movementId && e.setNumber === n)?.kg;
  const qualityOf = (movementId: string, n: number): SetQuality | undefined => todayWorkLog.find((e) => e.movementId === movementId && e.setNumber === n)?.quality;
  const setIsDone = (movementId: string, n: number) => todayWorkLog.some((e) => e.movementId === movementId && e.setNumber === n);
  const kgFor = (movementId: string, n: number, prescribed: number) => perSetKg[`${movementId}:${n}`] ?? loggedKg(movementId, n) ?? prescribed;
  const hasLoggedSets = (movementId: string) => todayWorkLog.some((w) => w.movementId === movementId);
  const liftHasPr = (movementId: string) => {
    const m = getMovementById(movementId);
    return Boolean(m && resolveLiftPrKey(m));
  };
  const undoSwap = (index: number, entry: SessionBlockResult) => {
    const o = entry.swapOrigin;
    if (!o) return;
    onSwap(index, { movementId: o.movementId, scaledFrom: o.scaledFrom, reps: o.reps, loadKg: o.loadKg, setPlan: o.setPlan, swapOrigin: undefined });
  };

  const goTo = (i: number) => {
    const el = trackRef.current?.children[Math.max(0, Math.min(cards.length - 1, i))] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  // La tarjeta visible sale de la posición del carril (el atleta puede deslizar con el dedo).
  const rafRef = useRef(0);
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
  // Si ya había series anotadas (se vuelve a la sesión a medias), se abre en el primer ejercicio sin terminar.
  useEffect(() => {
    if (todayWorkLog.length === 0) return;
    const idx = cards.findIndex((c) => {
      if (c.kind !== 'lift') return false;
      const b = c.item.entry;
      const mid = b.complex ? complexLogId(b.complex.id) : b.movementId;
      const rows = b.setPlan && b.setPlan.length >= 2 ? b.setPlan.length : b.sets ?? 0;
      return rows >= 1 && !Array.from({ length: rows }, (_, s) => s + 1).every((n) => todayWorkLog.some((e) => e.movementId === mid && e.setNumber === n));
    });
    if (idx > 0) {
      const t = window.setTimeout(() => {
        const el = trackRef.current?.children[idx] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
      }, 60);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────── Piezas de cada tarjeta ─────────

  const header = (theme: Theme, title: string, sub?: string) => (
    <div className="flex items-center justify-between gap-3 px-6 pt-6">
      <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: `${theme.accent}22`, color: theme.accent }}>
        {title}
      </span>
      {sub && <span className="text-xs font-semibold text-white/50">{sub}</span>}
    </div>
  );

  const nextTitle = (i: number): string => {
    const c = cards[i + 1];
    if (!c) return 'Terminar';
    if (c.kind === 'lift') return c.item.entry.complex?.name ?? resolveName(c.item.entry.movementId);
    if (c.kind === 'wod') return 'WOD';
    if (c.kind === 'end') return 'Cierre';
    return THEME[c.block].label;
  };

  const renderChecklist = (card: Extract<Card, { kind: 'checklist' }>, i: number) => {
    const theme = THEME[card.block];
    const bySub: { sub: string | undefined; items: Indexed[] }[] = [];
    for (const e of card.entries) {
      const key = e.entry.subgroup ?? e.entry.format;
      const last = bySub[bySub.length - 1];
      if (last && last.sub === key) last.items.push(e);
      else bySub.push({ sub: key, items: [e] });
    }
    const total = card.entries.length;
    const done = card.entries.filter((e) => doneItems[`${card.key}:${e.index}`]).length;
    const allOn = done === total;
    const setAll = (v: boolean) =>
      setDoneItems((p) => {
        const out = { ...p };
        for (const e of card.entries) out[`${card.key}:${e.index}`] = v;
        return out;
      });
    return (
      <>
        {header(theme, theme.label, `${done} de ${total}`)}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <div className="flex flex-col gap-4">
            {bySub.map((grp, gi) => (
              <div key={gi} className="flex flex-col gap-2">
                {grp.sub && <p className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{grp.sub}</p>}
                {grp.items.map((e) => {
                  const on = doneItems[`${card.key}:${e.index}`];
                  return (
                    <div key={e.index} className="flex items-center gap-2">
                      <button
                        onClick={() => setDoneItems((p) => ({ ...p, [`${card.key}:${e.index}`]: !p[`${card.key}:${e.index}`] }))}
                        data-testid="cards-item"
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl bg-white/[0.06] p-3.5 text-left transition-colors active:bg-white/10"
                      >
                        <span
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                          style={on ? { background: theme.accent, borderColor: theme.accent, color: '#000' } : { borderColor: 'rgba(255,255,255,0.25)' }}
                        >
                          {on && <Check size={18} strokeWidth={3.5} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-lg font-semibold leading-snug ${on ? 'text-white/40 line-through' : 'text-white'}`}>{resolveName(e.entry.movementId)}</span>
                          <span className="block text-sm font-medium" style={{ color: theme.accent }}>
                            {e.entry.reps}
                            {e.entry.loadKg ? ` · ${e.entry.loadKg} ${loadUnitLabel(e.entry.movementId, e.entry.block)}` : ''}
                          </span>
                          {e.entry.notes && <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/50">{noteHead(e.entry.notes).head}</span>}
                          {e.entry.scaledFrom && <span className="mt-0.5 block text-xs text-white/45">← {e.entry.scaledFrom}</span>}
                        </span>
                      </button>
                      {!on && <SwapButton entry={e.entry} index={e.index} ctx={swapCtx} onSwap={onSwap} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          {!allOn && (
            <button onClick={() => setAll(true)} className="self-center text-xs font-semibold text-white/55 underline decoration-dotted">
              Marcar todo como hecho
            </button>
          )}
          <Cta onClick={() => goTo(i + 1)} testId="cards-next">
            {allOn ? 'Listo' : 'Siguiente'} <ArrowRight size={20} strokeWidth={2.75} />
          </Cta>
        </div>
      </>
    );
  };

  const renderLift = (card: Extract<Card, { kind: 'lift' }>, i: number) => {
    const b = card.item.entry;
    const e = card.item;
    const baseTheme = THEME[card.block];
    const sets = b.sets ?? 0;
    const singleLog = Boolean(b.logAsSingle) && sets <= 1;
    const plan = b.setPlan && b.setPlan.length >= 2 ? b.setPlan : undefined;
    const waveSize = plan && b.waveSize && b.waveSize >= 2 && plan.length > b.waveSize && plan.length % b.waveSize === 0 ? b.waveSize : undefined;
    const rowCount = plan ? plan.length : singleLog ? 1 : sets;
    const loggable = Boolean(plan) || sets > 1 || singleLog;
    const mid = b.complex ? complexLogId(b.complex.id) : b.movementId;
    const blk: 'strength' | 'oly' = b.block === 'oly' ? 'oly' : 'strength';
    const workReps = parseWorkingReps(b.reps ?? '') ?? 0;
    const prescribed = b.loadKg ?? 0;
    const repsOf = (n: number) => (plan ? plan[n - 1].reps : workReps);
    const plannedKg = (n: number) => (plan ? plan[n - 1].kg : prescribed);
    const restSecs = prescribedRestSeconds(b);
    const fb = setFeedbackByIndex.get(e.index);
    const title = b.complex?.name ?? resolveName(b.movementId);

    const doneNums = Array.from({ length: rowCount }, (_, s) => s + 1).filter((n) => setIsDone(mid, n));
    const allDone = loggable && doneNums.length === rowCount;
    const firstUndone = Array.from({ length: rowCount }, (_, s) => s + 1).find((n) => !setIsDone(mid, n));
    const sel = selected[card.key] ?? firstUndone ?? rowCount;
    const selDone = setIsDone(mid, sel);

    const swapBtn = b.complex ? (
      <ComplexSwapButton entry={b} index={e.index} pool={complexPool} week={complexWeek} prs={progress.prs} variantPrs={progress.variantPrs} disabled={hasLoggedSets(complexLogId(b.complex.id))} onSwap={onSwap} />
    ) : (
      <SwapButton entry={b} index={e.index} ctx={swapCtx} disabled={hasLoggedSets(b.movementId)} onSwap={onSwap} />
    );

    // Descanso en curso de esta tarjeta.
    const resting = rest && rest.key === card.key ? rest : null;
    const theme = resting ? THEME.rest : baseTheme;

    const bump = (n: number, delta: number) => {
      const next = round4(kgFor(mid, n, plannedKg(n)) + delta);
      setPerSetKg((p) => {
        const out = { ...p, [`${mid}:${n}`]: next };
        // Series rectas: el cambio vale también para las que quedan. En una rampa cada serie lleva su peso.
        if (!plan) for (let k = n + 1; k <= rowCount; k++) if (!setIsDone(mid, k)) out[`${mid}:${k}`] = next;
        return out;
      });
      if (setIsDone(mid, n)) onLogWorkSet(mid, blk, n, next, repsOf(n), qualityOf(mid, n));
    };

    // Cómo ha ido la primera serie: reajusta lo que queda (igual que el modo enfocado).
    const showFeel = !plan && !singleLog && rowCount >= 2 && prescribed > 0 && setIsDone(mid, 1);
    const picked = feelByMovement[mid];
    const adjustment = picked ? adjustRemainingSets({ prescribedKg: prescribed, feel: picked, canRaise, sets: rowCount }) : null;
    const pickFeel = (feel: SetFeel) => {
      setFeelByMovement((prev) => ({ ...prev, [mid]: feel }));
      const next = adjustRemainingSets({ prescribedKg: prescribed, feel, canRaise, sets: rowCount });
      setPerSetKg((prev) => {
        const out = { ...prev };
        for (let n = 2; n <= rowCount; n++) if (!setIsDone(mid, n)) out[`${mid}:${n}`] = next.kg;
        return out;
      });
      onFeel(e.index, feel);
    };
    const feelBlock = showFeel ? (
      <div className="rounded-2xl bg-white/[0.06] p-3.5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">¿Cómo ha ido la primera?</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cómo ha ido la primera serie">
          {(Object.keys(SET_FEEL_LABEL) as SetFeel[]).map((feel) => (
            <button
              key={feel}
              role="radio"
              aria-checked={picked === feel}
              onClick={() => pickFeel(feel)}
              className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${picked === feel ? 'border-white/60 bg-white/15 text-white' : 'border-white/15 text-white/60'}`}
            >
              {SET_FEEL_LABEL[feel]}
            </button>
          ))}
        </div>
        {adjustment && adjustment.message && <p className="mt-2 text-xs leading-snug text-white/65">{adjustment.message}</p>}
      </div>
    ) : null;

    const sub = `${card.ordinal} de ${card.total}${card.total > 1 ? ' ejercicios' : ' ejercicio'}`;

    // ── Vista de descanso ──
    if (resting) {
      const remaining = Math.min(resting.total, Math.max(0, Math.ceil((resting.endsAt - now) / 1000)));
      const over = now >= resting.endsAt;
      const R = 112;
      const C = 2 * Math.PI * R;
      const frac = over ? 1 : Math.min(1, Math.max(0, (resting.endsAt - now) / 1000 / resting.total));
      const nextKg = kgFor(mid, resting.next, plannedKg(resting.next));
      return (
        <>
          {header(theme, 'Descanso', `${title} · serie ${resting.next - 1} hecha`)}
          <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-6 pb-3 pt-5" data-testid="cards-rest">
            <div className="relative flex h-[260px] w-[260px] shrink-0 items-center justify-center">
              <svg width="260" height="260" viewBox="0 0 260 260" className="-rotate-90">
                <circle cx="130" cy="130" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
                <circle
                  cx="130"
                  cy="130"
                  r={R}
                  fill="none"
                  stroke={theme.accent}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - frac)}
                  style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {over ? (
                  <span className="animate-pulse text-4xl font-black text-white">¡A la barra!</span>
                ) : (
                  <>
                    <span className="text-[68px] font-black leading-none tabular-nums text-white">{clockText(remaining)}</span>
                    <span className="mt-1 text-xs font-semibold text-white/55">recomendado {restLabel(resting.total)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="w-full rounded-2xl bg-white/[0.07] px-4 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Siguiente</p>
              <p className="mt-0.5 text-xl font-bold text-white">
                Serie {resting.next} · {nextKg > 0 ? `${fmtKgValue(nextKg)} kg ` : ''}× {repsOf(resting.next) || b.reps}
              </p>
            </div>
            {feelBlock}
          </div>
          <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
            <div className="flex gap-2">
              <button
                onClick={() => setRest((r) => (r ? { ...r, endsAt: Math.max(r.endsAt, Date.now()) + 30000, total: r.total + 30, notified: false } : r))}
                className="h-12 flex-1 rounded-full bg-white/10 text-sm font-bold text-white active:bg-white/20"
              >
                +30 s
              </button>
              <button onClick={() => setRest(null)} className="h-12 flex-1 rounded-full bg-white/10 text-sm font-bold text-white active:bg-white/20" data-testid="cards-rest-skip">
                Saltar descanso
              </button>
            </div>
            {over && (
              <Cta onClick={() => setRest(null)} testId="cards-rest-go">
                Empezar la serie {resting.next}
              </Cta>
            )}
          </div>
        </>
      );
    }

    // ── Vista normal ──
    const markSet = () => {
      const kg = kgFor(mid, sel, plannedKg(sel));
      onLogWorkSet(mid, blk, sel, kg, repsOf(sel));
      const remainingAfter = Array.from({ length: rowCount }, (_, s) => s + 1).filter((n) => n !== sel && !setIsDone(mid, n));
      const nextN = remainingAfter.find((n) => n > sel) ?? remainingAfter[0];
      if (nextN !== undefined) {
        setSelected((p) => ({ ...p, [card.key]: nextN }));
        // Solo hay descanso si el entreno lo prescribe (y queda alguna serie).
        if (restSecs) {
          const t0 = Date.now();
          setNow(t0);
          setRest({ key: card.key, movementId: mid, next: nextN, endsAt: t0 + restSecs * 1000, total: restSecs, notified: false });
        }
      } else {
        setSelected((p) => ({ ...p, [card.key]: sel }));
      }
    };
    const kg = kgFor(mid, sel, plannedKg(sel));
    const reps = repsOf(sel);
    const wavePos = waveSize ? `Ola ${Math.floor((sel - 1) / waveSize) + 1} · ` : '';
    const quality = qualityOf(mid, sel);

    return (
      <>
        {header(theme, theme.label, sub)}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-3 pt-4">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[28px] font-extrabold leading-[1.1] text-white">{title}</h2>
            {swapBtn}
          </div>
          {b.complex && (
            <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Pasos del complejo">
              {b.complex.steps.map((s, si) => (
                <li key={si} className="flex items-center gap-1.5">
                  {si > 0 && <span aria-hidden="true" className="text-white/30">→</span>}
                  <span className="rounded-lg bg-white/10 px-2.5 py-1.5 font-semibold text-white">
                    {resolveName(s.movementId)}
                    <span className="ml-1.5 font-bold" style={{ color: theme.accent }}>×{s.reps}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {b.scaledFrom && (
            <p className="mt-1 flex items-center gap-2 text-sm text-white/55">
              <span>← en lugar de {b.scaledFrom}</span>
              {b.swapOrigin && !hasLoggedSets(b.movementId) && (
                <button onClick={() => undoSwap(e.index, b)} className="font-semibold underline decoration-dotted" style={{ color: theme.accent }}>
                  Deshacer
                </button>
              )}
            </p>
          )}
          <p className="mt-1 text-sm font-semibold text-white/60">
            {b.complex ? `${b.sets} series · ${b.reps}` : plan && waveSize ? `${plan.length / waveSize} olas · ${b.reps}` : plan ? `${plan.length} series · ${plan.map((p) => p.reps).join('-')}` : b.sets ? `${b.sets} × ${b.reps}` : b.reps}
            {b.tempo ? ` · tempo ${b.tempo}` : ''}
            {restSecs && rowCount >= 2 ? ` · descanso ${restLabel(restSecs)}` : ''}
          </p>

          {card.prep.length > 0 && (
            <div className="mt-3 rounded-2xl bg-white/[0.06] p-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.accent }}>{card.prep[0].entry.subgroup}</p>
              <ul className="flex flex-col gap-1 text-sm text-white/80">
                {card.prep.map((p) => (
                  <li key={p.index} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-[7rem] flex-1">{resolveName(p.entry.movementId)}</span>
                    <span className="text-white/55">
                      {p.entry.reps}
                      {p.entry.loadKg ? ` · ${p.entry.loadKg} kg` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loggable ? (
            <div className="mt-4 flex flex-col gap-4">
              {/* Los puntos de las series: tocar uno para verlo o corregirlo. */}
              <div className="flex flex-wrap items-center justify-center gap-2.5" role="tablist" aria-label="Series">
                {Array.from({ length: rowCount }, (_, s) => s + 1).map((n) => {
                  const done = setIsDone(mid, n);
                  const q = qualityOf(mid, n);
                  const isSel = n === sel;
                  const ring = done ? QUALITY.find((o) => o.value === q)?.color ?? theme.accent : theme.accent;
                  return (
                    <button
                      key={n}
                      role="tab"
                      aria-selected={isSel}
                      aria-label={`Serie ${n}${done ? ' hecha' : ''}`}
                      onClick={() => setSelected((p) => ({ ...p, [card.key]: n }))}
                      className="flex h-10 min-w-10 items-center justify-center rounded-full px-1 text-sm font-bold transition-all"
                      style={
                        done
                          ? { background: ring, color: '#000', boxShadow: isSel ? `0 0 0 3px ${theme.bg}, 0 0 0 5px ${ring}` : undefined }
                          : { border: `2px solid ${isSel ? theme.accent : 'rgba(255,255,255,0.22)'}`, color: isSel ? theme.accent : 'rgba(255,255,255,0.6)' }
                      }
                    >
                      {done ? <Check size={18} strokeWidth={3.5} /> : n}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-3xl bg-white/[0.07] px-4 py-5 text-center" data-testid="cards-set">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
                  {wavePos}Serie {sel} de {rowCount}
                  {selDone ? ' · hecha' : ''}
                </p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  {prescribed > 0 || plan ? (
                    <>
                      <button onClick={() => bump(sel, -2.5)} aria-label="Menos peso" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/12 text-white active:bg-white/25" style={{ background: 'rgba(255,255,255,0.12)' }}>
                        <Minus size={22} strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        {liftHasPr(mid) ? (
                          <button onClick={() => setProgressTarget({ movementId: mid, targetKg: kg })} className="block w-full leading-none">
                            <span className="block text-[60px] font-black leading-none tabular-nums" style={{ color: theme.accent }}>{kg > 0 ? fmtKgValue(kg) : '–'}</span>
                            <span className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white/60">
                              kg <ChartSpline size={11} className="text-white/40" />
                            </span>
                          </button>
                        ) : (
                          <span className="block w-full leading-none">
                            <span className="block text-[60px] font-black leading-none tabular-nums" style={{ color: theme.accent }}>{kg > 0 ? fmtKgValue(kg) : '–'}</span>
                            <span className="mt-1 block text-sm font-bold text-white/60">kg</span>
                          </span>
                        )}
                      </div>
                      <button onClick={() => bump(sel, 2.5)} aria-label="Más peso" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white active:bg-white/25" style={{ background: 'rgba(255,255,255,0.12)' }}>
                        <Plus size={22} strokeWidth={3} />
                      </button>
                    </>
                  ) : (
                    <span className="text-5xl font-black text-white">{b.reps}</span>
                  )}
                </div>
                {reps > 0 && !b.complex && <p className="mt-2 text-2xl font-extrabold text-white">× {reps} <span className="text-base font-semibold text-white/50">reps</span></p>}
                {b.complex && <p className="mt-2 text-lg font-bold text-white">{b.reps} <span className="text-sm font-semibold text-white/50">el complejo entero</span></p>}

                {selDone && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">¿Cómo salió?</p>
                    <div className="flex overflow-hidden rounded-2xl border border-white/12" role="radiogroup" aria-label={`Cómo salió la serie ${sel}`} style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
                      {QUALITY.map((o) => {
                        const active = o.value === quality;
                        return (
                          <button
                            key={o.label}
                            role="radio"
                            aria-checked={active}
                            onClick={() => onSetQuality(mid, sel, o.value)}
                            className="flex-1 border-l px-2 py-3 text-sm font-bold transition-colors first:border-l-0"
                            style={{ borderColor: 'rgba(255,255,255,0.14)', background: active ? `${o.color}2a` : 'transparent', color: active ? o.color : 'rgba(255,255,255,0.5)' }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => onClearWorkSet(mid, sel)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/55 underline decoration-dotted">
                      <Undo2 size={13} /> Deshacer la serie {sel}
                    </button>
                  </div>
                )}
              </div>
              {feelBlock}
              {allDone && fb && (
                <RpeCheckIn large movementName={fb.movementName} topSet={fb.topSet} loggedRpe={fb.loggedRpe} estimated1rm={fb.estimated1rm} onRate={(rpe) => onRateSet(fb.index, rpe)} />
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl bg-white/[0.07] px-4 py-6 text-center">
              {b.loadKg ? (
                <p className="leading-none">
                  <span className="text-[60px] font-black tabular-nums" style={{ color: theme.accent }}>{fmtKgValue(b.loadKg)}</span>
                  <span className="ml-1 text-xl font-bold text-white/60">kg</span>
                </p>
              ) : null}
              <p className="mt-2 text-2xl font-extrabold text-white">{b.sets ? `${b.sets} × ${b.reps}` : b.reps}</p>
              <button
                onClick={() => setDoneItems((p) => ({ ...p, [card.key]: !p[card.key] }))}
                className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold"
                style={doneItems[card.key] ? { background: theme.accent, borderColor: theme.accent, color: '#000' } : { borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}
              >
                <Check size={16} strokeWidth={3} /> {doneItems[card.key] ? 'Hecho' : 'Marcar como hecho'}
              </button>
            </div>
          )}
          {b.notes && (
            <div className="mt-4">
              <NoteLine text={b.notes} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          {loggable && !selDone && (
            <Cta onClick={markSet} testId="cards-set-done">
              <Check size={24} strokeWidth={3.5} /> Serie {sel} hecha
            </Cta>
          )}
          {loggable && selDone && !allDone && (
            <Cta onClick={() => setSelected((p) => ({ ...p, [card.key]: firstUndone ?? sel }))} testId="cards-goto-undone">
              Ir a la serie {firstUndone}
            </Cta>
          )}
          {(!loggable || allDone) && (
            <Cta onClick={() => goTo(i + 1)} testId="cards-next">
              {nextTitle(i)} <ArrowRight size={20} strokeWidth={2.75} />
            </Cta>
          )}
          {loggable && !allDone && (
            <button onClick={() => goTo(i + 1)} className="self-center text-xs font-semibold text-white/50 underline decoration-dotted" data-testid="cards-skip">
              Pasar al siguiente
            </button>
          )}
        </div>
      </>
    );
  };

  const renderWod = (card: Extract<Card, { kind: 'wod' }>, i: number) => {
    const theme = THEME.wod;
    const entries = card.entries;
    const first = entries[0].entry;
    const isBench = first.movementId.startsWith('benchmark:');
    const wod = isBench ? benchmarkWorkouts.find((w) => w.id === first.movementId.replace('benchmark:', '')) : undefined;
    const format = isBench ? ((first.format || wod?.format) as string | undefined) : first.format;
    return (
      <>
        {header(theme, card.part ? `WOD · parte ${card.part} de 2` : 'WOD', 'a cronómetro')}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-3 pt-4">
          {card.part === 2 && (
            <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-white/[0.08] px-3 py-2 text-xs font-semibold text-white/80">
              <Timer size={13} strokeWidth={2.5} /> Descansa 5-10 min antes de empezar la parte 2.
            </p>
          )}
          <WodCategoryPill entries={entries.map((e) => e.entry)} part={card.part ?? undefined} />
          <h2 className="text-[28px] font-extrabold leading-[1.1] text-white">{isBench ? wod?.name ?? 'Benchmark' : first.title ?? 'WOD'}</h2>
          {format && <p className="mt-1 text-lg font-bold leading-snug" style={{ color: theme.accent }}>{localizeWodText(format)}</p>}
          <ul className="mt-3 flex flex-col divide-y divide-white/10">
            {isBench && wod
              ? wod.movements.map((m) => {
                  const swapped = first.benchmarkSwaps?.[m];
                  const kgv = first.benchmarkLoads?.[m];
                  const setSwap = (toId: string | undefined) => {
                    const swaps = { ...first.benchmarkSwaps };
                    if (toId) swaps[m] = toId;
                    else delete swaps[m];
                    onSwap(entries[0].index, { benchmarkSwaps: swaps });
                  };
                  return (
                    <li key={m} className="flex items-center gap-2 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold leading-snug text-white">
                          {resolveName(swapped ?? m)}
                          {kgv && !swapped ? <span className="ml-2 text-sm font-normal text-white/60">(tu carga {fmtKgValue(kgv)} kg)</span> : null}
                        </p>
                        {swapped && (
                          <p className="flex items-center gap-2 text-xs text-white/50">
                            <span>← en lugar de {resolveName(m)}</span>
                            <button onClick={() => setSwap(undefined)} className="font-semibold underline decoration-dotted" style={{ color: theme.accent }}>
                              Deshacer
                            </button>
                          </p>
                        )}
                      </div>
                      <SwapButton entry={{ block: 'wod', movementId: swapped ?? m }} index={entries[0].index} ctx={swapCtx} onSwap={(_, patch) => setSwap(patch.movementId)} />
                    </li>
                  );
                })
              : entries.map((e) => (
                  <li key={e.index} className="flex items-center gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold leading-snug text-white">
                        {resolveName(e.entry.movementId)}
                        {e.entry.scaledFrom ? <span className="ml-1.5 text-xs font-normal text-white/50">← {e.entry.scaledFrom}</span> : null}
                        {e.entry.swapOrigin && (
                          <button onClick={() => undoSwap(e.index, e.entry)} className="ml-2 text-xs font-semibold underline decoration-dotted" style={{ color: theme.accent }}>
                            Deshacer
                          </button>
                        )}
                      </p>
                      <p className="text-sm font-semibold" style={{ color: theme.accent }}>
                        {e.entry.reps}
                        {e.entry.loadKg ? ` · ${e.entry.loadKg} ${loadUnitLabel(e.entry.movementId, e.entry.block)}` : ''}
                      </p>
                    </div>
                    <SwapButton entry={e.entry} index={e.index} ctx={swapCtx} onSwap={onSwap} />
                  </li>
                ))}
          </ul>
          {first.notes && (
            <div className="mt-3">
              <NoteLine text={first.notes} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <button
            onClick={() => clockBus.open('workout')}
            data-testid="cards-wod-clock"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold text-black active:scale-[0.98]"
            style={{ background: theme.accent }}
          >
            <Timer size={20} strokeWidth={2.75} /> Abrir el cronómetro del WOD
          </button>
          <Cta onClick={() => goTo(i + 1)} tone="ghost" testId="cards-next">
            WOD hecho · {nextTitle(i)} <ArrowRight size={20} strokeWidth={2.75} />
          </Cta>
        </div>
      </>
    );
  };

  /** Los ejercicios de barra con series previstas sin marcar: el cierre pregunta qué pasó con ellas en vez de dar la sesión por buena. */
  const pendingLifts = () =>
    cards.flatMap((c) => {
      if (c.kind !== 'lift') return [];
      const b = c.item.entry;
      const plan = b.setPlan && b.setPlan.length >= 2 ? b.setPlan : undefined;
      const singleLog = Boolean(b.logAsSingle) && (b.sets ?? 0) <= 1;
      const rowCount = plan ? plan.length : singleLog ? 1 : b.sets ?? 0;
      if (!(plan || (b.sets ?? 0) > 1 || singleLog)) return [];
      const mid = b.complex ? complexLogId(b.complex.id) : b.movementId;
      const blk: 'strength' | 'oly' = b.block === 'oly' ? 'oly' : 'strength';
      const workReps = parseWorkingReps(b.reps ?? '') ?? 0;
      const missing = Array.from({ length: rowCount }, (_, s) => s + 1).filter((n) => !setIsDone(mid, n));
      if (missing.length === 0) return [];
      const repsOf = (n: number) => (plan ? plan[n - 1].reps : workReps);
      const kgOf = (n: number) => kgFor(mid, n, plan ? plan[n - 1].kg : b.loadKg ?? 0);
      return [{ key: c.key, title: b.complex?.name ?? resolveName(b.movementId), mid, blk, missing, rowCount, repsOf, kgOf }];
    });

  const renderEnd = () => {
    const theme = THEME.end;
    const sets = todayWorkLog.length;
    const kgMoved = todayWorkLog.reduce((s, w) => s + w.kg * (w.reps || 0), 0);
    const parts = cards.filter((c) => c.kind !== 'end').length;
    const pending = pendingLifts();
    const hidden = (k: string) => Boolean(dismissed[k]);
    const open = pending.filter((p) => !hidden(p.key));
    return (
      <>
        {header(theme, 'Cierre')}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-6 pb-3 pt-6 text-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ background: `${theme.accent}22`, color: theme.accent }}>
            <Flag size={30} strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-[28px] font-extrabold leading-tight text-white">{open.length === 0 ? '¡Sesión completada!' : 'Antes de cerrar'}</h2>
            <p className="mt-1 text-sm text-white/60">
              {open.length === 0 ? 'Un último paso: apuntar cómo te has sentido.' : 'Hay series sin marcar. Dime qué pasó para que el coach no se confunda.'}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            {[
              { v: String(parts), l: 'partes' },
              { v: String(sets), l: 'series' },
              { v: kgMoved > 0 ? `${Math.round(kgMoved).toLocaleString('es-ES')}` : '–', l: 'kg movidos' },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/[0.07] px-2 py-3">
                <p className="text-2xl font-black tabular-nums text-white">{s.v}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{s.l}</p>
              </div>
            ))}
          </div>
          {open.length > 0 && (
            <div className="flex w-full flex-col gap-2 text-left" data-testid="cards-pending">
              {open.map((p) => (
                <div key={p.key} className="rounded-2xl bg-white/[0.07] p-3.5">
                  <p className="text-base font-bold text-white">{p.title}</p>
                  <p className="text-xs text-white/55">
                    {p.missing.length === 1 ? `Falta la serie ${p.missing[0]}` : `Faltan ${p.missing.length} series (${p.missing.join(', ')})`} de {p.rowCount}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => {
                        p.missing.forEach((n) => onLogWorkSet(p.mid, p.blk, n, p.kgOf(n), p.repsOf(n)));
                        setDismissed((d) => ({ ...d, [p.key]: true }));
                      }}
                      className="rounded-full px-3.5 py-2 text-sm font-bold text-black"
                      style={{ background: theme.accent }}
                      data-testid="cards-pending-did"
                    >
                      Las hice
                    </button>
                    <button
                      onClick={() => {
                        p.missing.forEach((n) => onLogWorkSet(p.mid, p.blk, n, p.kgOf(n), p.repsOf(n), 'fallada'));
                        setDismissed((d) => ({ ...d, [p.key]: true }));
                      }}
                      className="rounded-full border border-white/20 px-3.5 py-2 text-sm font-semibold text-white"
                    >
                      No salieron
                    </button>
                    <button onClick={() => setDismissed((d) => ({ ...d, [p.key]: true }))} className="rounded-full border border-white/20 px-3.5 py-2 text-sm font-semibold text-white/75">
                      Las salté
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 pt-1">
          <Cta onClick={onFinish} testId="cards-finish">
            Terminar sesión <Check size={22} strokeWidth={3.25} />
          </Cta>
        </div>
      </>
    );
  };

  const cardTheme = (c: Card): Theme => {
    if (c.kind === 'end') return THEME.end;
    if (c.kind === 'wod') return THEME.wod;
    if (c.kind === 'lift') {
      const r = rest && rest.key === c.key;
      return r ? THEME.rest : THEME[c.block];
    }
    return THEME[c.block];
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col text-white" style={{ background: '#0b0b0e', ...(visible ?? {}) }} data-testid="train-cards">
      <div className="flex items-center gap-3 px-4 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={onExit} aria-label="Salir del entreno" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20">
          <X size={19} />
        </button>
        <div className="flex flex-1 gap-1" role="tablist" aria-label="Partes del entreno">
          {cards.map((c, ci) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={ci === cur}
              aria-label={`Ir a la tarjeta ${ci + 1}`}
              onClick={() => goTo(ci)}
              className="flex h-6 flex-1 items-center"
            >
              <span className="h-1.5 w-full rounded-full transition-colors" style={{ background: ci === cur ? '#fff' : ci < cur ? cardTheme(c).accent : 'rgba(255,255,255,0.14)' }} />
            </button>
          ))}
        </div>
        <button
          onClick={() => clockBus.open(cards[cur]?.kind === 'wod' ? 'workout' : 'rest')}
          aria-label="Abrir el crono"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20"
        >
          <Timer size={19} strokeWidth={2.4} />
        </button>
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto overflow-y-hidden px-3.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, ci) => {
          const th = cardTheme(c);
          return (
            <section
              key={c.key}
              data-testid="cards-card"
              data-kind={c.kind}
              aria-label={`Tarjeta ${ci + 1} de ${cards.length}`}
              className="flex h-full min-h-0 w-[calc(100%-28px)] shrink-0 snap-center flex-col overflow-hidden rounded-[30px] border transition-[background] duration-500"
              style={{ background: `linear-gradient(165deg, ${th.bg} 0%, #101014 100%)`, borderColor: `${th.accent}33` }}
            >
              {c.kind === 'checklist' && renderChecklist(c, ci)}
              {c.kind === 'lift' && renderLift(c, ci)}
              {c.kind === 'wod' && renderWod(c, ci)}
              {c.kind === 'end' && renderEnd()}
            </section>
          );
        })}
      </div>

      {progressTarget && (
        <MovementProgressModal
          movementId={progressTarget.movementId}
          targetKg={progressTarget.targetKg}
          open
          onClose={() => setProgressTarget(null)}
          prs={progress.prs}
          variantPrs={progress.variantPrs}
          prLog={progress.prLog}
          workLog={progress.workLog}
        />
      )}
    </div>
  );
}
