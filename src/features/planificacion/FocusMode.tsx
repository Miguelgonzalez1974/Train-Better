import { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Timer, Minus, Plus, ChartSpline } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult, SetFeel, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { loadUnitLabel } from '../../data/movements/loadUnits';
import { parseWorkingReps, SET_FEEL_LABEL } from '../../engine/setFeedback';
import { adjustRemainingSets } from '../../engine/setAdjust';
import { localizeWodText } from '../../engine/wodUnits';
import { fmtKgValue } from '../../lib/format';
import { useVisibleViewport } from '../../lib/useVisibleViewport';
import { resolveLiftPrKey } from '../../engine/movementProgress';
import { noteHead } from './noteText';
import { groupWodByPart } from './wodPartGroups';
import { BLOCK_ORDER } from './DaySessionBlocks';
import { MovementProgressModal } from './MovementProgressModal';
import type { MovementProgressData } from './LoadStat';
import { RpeCheckIn } from './RpeCheckIn';

/** Sub-set de `adjustableSetBlocks` de Planificacion — lo justo para renderizar el check-in de RPE. */
export interface FocusSetFeedback {
  index: number;
  movementName: string;
  topSet: { kg: number; reps: number };
  loggedRpe: number | null;
  estimated1rm?: number;
}

interface FocusModeProps {
  session: DailySession;
  setFeedbackByIndex: Map<number, FocusSetFeedback>;
  onRateSet: (index: number, rpe: number) => void;
  /** Series de trabajo ya registradas hoy (fuerza/oly) — la fuente de verdad de qué está marcado. */
  todayWorkLog: WorkSetEntry[];
  /** Datos del atleta para el popup de progresión del movimiento (tocar la carga de un levantamiento). */
  progress: MovementProgressData;
  onLogWorkSet: (movementId: string, block: 'strength' | 'oly', setNumber: number, kg: number, reps: number) => void;
  onClearWorkSet: (movementId: string, setNumber: number) => void;
  /** Si hoy se puede subir la carga (no en día ámbar ni con una molestia activa): un "me sobró" solo sube con esto. */
  canRaise: boolean;
  /** Cómo fue la primera serie de un levantamiento (índice de su bloque): se guarda para calibrar al coach. */
  onFeel: (index: number, feel: SetFeel) => void;
  onExit: () => void;
  onFinish: () => void;
}

type Indexed = { entry: SessionBlockResult; index: number };

const BLOCK_LABEL: Record<Block, string> = {
  warmup: 'Warm Up',
  strength: 'Fuerza',
  wod: 'WOD',
  oly: 'Oly',
  accessory: 'Accesorio',
  skill: 'Skill',
  cooldown: 'Cooldown',
};
const BLOCK_ACCENT: Record<Block, string> = {
  warmup: 'text-brand-gold',
  strength: 'text-brand-gold',
  wod: 'text-brand-orange',
  oly: 'text-brand-gold',
  accessory: 'text-neutral-400',
  skill: 'text-brand-neon',
  cooldown: 'text-neutral-400',
};

/** Nota del coach en el modo enfocado: primera frase + "ver más" para el resto. */
function FocusNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { head, hasMore } = noteHead(text);
  return (
    <span className="mt-1 block whitespace-pre-line text-sm leading-relaxed text-neutral-400">
      {open ? text : head}
      {hasMore && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-1.5 align-baseline text-xs font-semibold text-neutral-300 transition-colors hover:text-brand-gold"
        >
          {open ? 'menos' : 'ver más'}
        </button>
      )}
    </span>
  );
}

function resolveName(id: string): string {
  if (id.startsWith('benchmark:')) {
    const b = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === b)?.name ?? b;
  }
  return getMovementById(id)?.name ?? id;
}

/**
 * Modo entreno enfocado — superpuesto a Planificación (z-30, por debajo del cronómetro flotante
 * z-40 y de los modales z-50, así el atleta conserva el temporizador y el popup de progresión del
 * movimiento). Un bloque de la sesión a la vez, números grandes, checklist de series (solo visual en
 * v1 — el registro serie a serie real es una fase posterior). Al terminar el último bloque llama a
 * `onFinish`, que en el padre abre «Marcar como completado».
 */
export function FocusMode({
  session,
  setFeedbackByIndex,
  onRateSet,
  todayWorkLog,
  progress,
  onLogWorkSet,
  onClearWorkSet,
  canRaise,
  onFeel,
  onExit,
  onFinish,
}: FocusModeProps) {
  // Un paso por bloque; el WOD de un dia de doble WOD se parte en dos pasos (parte 1 y parte 2), cada uno
  // con sus movimientos, para que el atleta los haga y cronometre por separado.
  const groups = useMemo(
    () =>
      BLOCK_ORDER.flatMap((block): { block: Block; part: 1 | 2 | null; entries: Indexed[] }[] => {
        const entries = session.blocks.map((entry, index) => ({ entry, index })).filter((e) => e.entry.block === block);
        if (entries.length === 0) return [];
        if (block !== 'wod') return [{ block, part: null, entries }];
        return groupWodByPart(
          entries.map((e) => e.entry),
          entries.map((e) => e.index),
        ).map((g) => ({ block, part: g.part, entries: g.entries.map((entry, k) => ({ entry, index: g.indices![k] })) }));
      }),
    [session],
  );

  const [step, setStep] = useState(0);
  const [doneSets, setDoneSets] = useState<Record<string, boolean>>({});
  const [progressTarget, setProgressTarget] = useState<{ movementId: string; targetKg: number } | null>(null);
  const liftHasPr = (movementId: string) => {
    const m = getMovementById(movementId);
    return Boolean(m && resolveLiftPrKey(m));
  };
  // Carga en curso por serie de fuerza/oly (clave `${movementId}:${setNumber}`) antes de fijarla al
  // marcar la serie. Si no hay valor en curso se usa el ya registrado, y si no, lo prescrito.
  const [perSetKg, setPerSetKg] = useState<Record<string, number>>({});
  // Cómo fue la primera serie de cada levantamiento (por movimiento): ajusta el peso sugerido de las que quedan.
  const [feelByMovement, setFeelByMovement] = useState<Record<string, SetFeel>>({});
  const loggedKg = (movementId: string, n: number) =>
    todayWorkLog.find((e) => e.movementId === movementId && e.setNumber === n)?.kg;
  const setIsDone = (movementId: string, n: number) =>
    todayWorkLog.some((e) => e.movementId === movementId && e.setNumber === n);
  const kgFor = (movementId: string, n: number, prescribed: number) =>
    perSetKg[`${movementId}:${n}`] ?? loggedKg(movementId, n) ?? prescribed;

  // La capa ocupa lo que se VE (no la ventana "layout", que en el móvil puede ser mayor que la pantalla).
  const visible = useVisibleViewport();

  if (groups.length === 0) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-brand-bg p-6 text-center" style={visible ?? undefined}>
        <p className="text-neutral-300">No hay bloques que mostrar en esta sesión.</p>
        <button onClick={onExit} className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black">
          Salir
        </button>
      </div>
    );
  }

  const i = Math.min(step, groups.length - 1);
  const group = groups[i];
  const isLast = i >= groups.length - 1;
  const toggleSet = (key: string) => setDoneSets((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderChecklist = (entries: Indexed[]) => {
    // Agrupa por subgrupo si lo hay; si no, por `format` (Superserie A / Core...) para que el bloque
    // de accesorio conserve su estructura en el modo entreno.
    const bySub: { sub: string | undefined; items: Indexed[] }[] = [];
    for (const e of entries) {
      const key = e.entry.subgroup ?? e.entry.format;
      const last = bySub[bySub.length - 1];
      if (last && last.sub === key) last.items.push(e);
      else bySub.push({ sub: key, items: [e] });
    }
    return (
      <div className="flex flex-col gap-4">
        {bySub.map((grp, gi) => (
          <div key={gi} className="flex flex-col gap-2">
            {grp.sub && <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{grp.sub}</p>}
            {grp.items.map((e) => {
              const key = `${i}:${e.index}:0`;
              const on = doneSets[key];
              return (
                <button
                  key={e.index}
                  onClick={() => toggleSet(key)}
                  className="flex items-start gap-3 rounded-xl bg-brand-surfaceMuted/60 p-3.5 text-left transition-colors hover:bg-brand-surfaceMuted active:bg-brand-surfaceMuted"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      on ? 'bg-brand-neon text-black' : 'border border-brand-border text-neutral-500'
                    }`}
                  >
                    {on ? <Check size={20} strokeWidth={3} /> : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`text-lg font-semibold leading-snug ${on ? 'text-neutral-500 line-through' : 'text-white'}`}>
                        {resolveName(e.entry.movementId)}
                      </span>
                      {e.entry.reps && <span className="text-base font-medium text-neutral-300">{e.entry.reps}</span>}
                      {e.entry.loadKg ? (
                        <span className="text-base font-medium text-neutral-300">
                          · {e.entry.loadKg} {loadUnitLabel(e.entry.movementId, e.entry.block)}
                        </span>
                      ) : null}
                    </span>
                    {e.entry.notes && (
                      <span className="mt-1 block text-sm leading-relaxed text-neutral-400">{noteHead(e.entry.notes).head}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderLifting = (entries: Indexed[]) => {
    const prep = entries.filter((e) => e.entry.subgroup);
    const work = entries.filter((e) => !e.entry.subgroup);
    return (
      <div className="flex flex-col gap-5">
        {prep.length > 0 && (
          <div className="rounded-xl bg-brand-surfaceMuted/70 p-3.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold">{prep[0].entry.subgroup}</p>
            <ul className="flex flex-col gap-2 text-base text-neutral-200">
              {prep.map((e) => (
                <li key={e.index} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-[8rem] flex-1">{resolveName(e.entry.movementId)}</span>
                  <span className="ml-auto max-w-full text-right text-neutral-400 [overflow-wrap:anywhere]">
                    {e.entry.reps}
                    {e.entry.loadKg ? ` · ${e.entry.loadKg} kg` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {work.map((e, wi) => {
          const b = e.entry;
          const sets = b.sets ?? 0;
          // Formatos de oly de serie única (single del día, EMOM): una sola fila de registro para
          // guardar el peso realmente movido, con el mismo camino a `workLog` que el stepper.
          const singleLog = Boolean(b.logAsSingle) && sets <= 1;
          const rowCount = singleLog ? 1 : sets;
          const fb = setFeedbackByIndex.get(e.index);
          return (
            <div key={e.index} className="flex flex-col gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  {work.length > 1 && <span className="text-xs font-bold text-neutral-500">{String.fromCharCode(65 + wi)}</span>}
                  <h2 className="text-3xl font-semibold leading-tight text-white">{resolveName(b.movementId)}</h2>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {b.loadKg ? (
                    liftHasPr(b.movementId) ? (
                      <button
                        onClick={() => setProgressTarget({ movementId: b.movementId, targetKg: b.loadKg ?? 0 })}
                        className="flex flex-wrap items-baseline gap-x-1.5 text-brand-gold"
                      >
                        <span className="text-6xl font-bold leading-none">{b.loadKg}</span>
                        <span className="text-xl font-semibold">kg</span>
                        <span className="ml-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
                          <ChartSpline size={11} strokeWidth={2.25} />
                          progresión
                        </span>
                      </button>
                    ) : (
                      <span className="flex flex-wrap items-baseline gap-x-1.5 text-brand-gold">
                        <span className="text-6xl font-bold leading-none">{b.loadKg}</span>
                        <span className="text-xl font-semibold">kg</span>
                      </span>
                    )
                  ) : null}
                  <span className="text-xl font-semibold text-neutral-300">
                    {b.sets ? `${b.sets} × ${b.reps}` : b.reps}
                    {b.tempo ? ` · tempo ${b.tempo}` : ''}
                  </span>
                </div>
              </div>
              {(sets > 1 || singleLog) &&
                (() => {
                  const mid = b.movementId;
                  const blk = b.block === 'oly' ? 'oly' : 'strength';
                  const reps = parseWorkingReps(b.reps ?? '') ?? 0;
                  const prescribed = b.loadKg ?? 0;
                  const bump = (n: number, delta: number) => {
                    const next = Math.max(0, Math.round((kgFor(mid, n, prescribed) + delta) * 4) / 4);
                    setPerSetKg((p) => ({ ...p, [`${mid}:${n}`]: next }));
                    if (setIsDone(mid, n)) onLogWorkSet(mid, blk, n, next, reps);
                  };
                  // Tras la primera serie: cómo ha ido ajusta el peso de las que quedan (sugerencia: los +/- siguen mandando).
                  const showFeel = !singleLog && rowCount >= 2 && prescribed > 0 && setIsDone(mid, 1);
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
                  return (
                    <>
                    <div className="flex flex-col gap-2">
                      {Array.from({ length: rowCount }, (_, s) => {
                        const n = s + 1;
                        const on = setIsDone(mid, n);
                        const kg = kgFor(mid, n, prescribed);
                        return (
                          <div
                            key={n}
                            className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2.5 py-2 ${on ? 'bg-brand-neon/10' : 'bg-brand-surfaceMuted/50'}`}
                          >
                            <button
                              onClick={() => (on ? onClearWorkSet(mid, n) : onLogWorkSet(mid, blk, n, kg, reps))}
                              aria-label={`Serie ${n}${on ? ' hecha' : ''}`}
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold transition-colors ${
                                on ? 'bg-brand-neon text-black' : 'border border-brand-border text-neutral-400'
                              }`}
                            >
                              {on ? <Check size={22} strokeWidth={3} /> : n}
                            </button>
                            {singleLog && <span className="shrink-0 text-sm text-neutral-400">Top</span>}
                            {prescribed > 0 && (
                              <div className="flex min-w-[9.5rem] flex-1 items-center gap-1">
                                <button
                                  onClick={() => bump(n, -2.5)}
                                  aria-label="Menos peso"
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 hover:bg-white/15 active:bg-white/20"
                                >
                                  <Minus size={20} strokeWidth={2.75} />
                                </button>
                                {liftHasPr(mid) ? (
                                  <button
                                    onClick={() => setProgressTarget({ movementId: mid, targetKg: kg })}
                                    className="min-w-0 flex-1 whitespace-nowrap text-center text-[clamp(1rem,5.6vw,1.5rem)] font-bold text-brand-gold"
                                  >
                                    {kg}
                                    <span className="hidden text-sm font-medium text-neutral-400 min-[340px]:inline"> kg</span>
                                  </button>
                                ) : (
                                  <span className="min-w-0 flex-1 whitespace-nowrap text-center text-[clamp(1rem,5.6vw,1.5rem)] font-bold text-brand-gold">
                                    {kg}
                                    <span className="hidden text-sm font-medium text-neutral-400 min-[340px]:inline"> kg</span>
                                  </span>
                                )}
                                <button
                                  onClick={() => bump(n, 2.5)}
                                  aria-label="Más peso"
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 hover:bg-white/15 active:bg-white/20"
                                >
                                  <Plus size={20} strokeWidth={2.75} />
                                </button>
                              </div>
                            )}
                            {reps > 0 && <span className="ml-auto shrink-0 whitespace-nowrap text-lg font-semibold text-neutral-300">× {reps}</span>}
                          </div>
                        );
                      })}
                    </div>
                    {showFeel && (
                      <div className="rounded-xl bg-white/[0.04] p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">¿Cómo ha ido la primera?</p>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cómo ha ido la primera serie">
                          {(Object.keys(SET_FEEL_LABEL) as SetFeel[]).map((feel) => (
                            <button
                              key={feel}
                              role="radio"
                              aria-checked={picked === feel}
                              onClick={() => pickFeel(feel)}
                              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${
                                picked === feel ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                              }`}
                            >
                              {SET_FEEL_LABEL[feel]}
                            </button>
                          ))}
                        </div>
                        {adjustment && <p className="mt-2 text-xs leading-snug text-neutral-300">{adjustment.message}</p>}
                      </div>
                    )}
                    </>
                  );
                })()}
              {b.notes && <FocusNote text={b.notes} />}
              {fb && (
                <RpeCheckIn
                  large
                  movementName={fb.movementName}
                  topSet={fb.topSet}
                  loggedRpe={fb.loggedRpe}
                  estimated1rm={fb.estimated1rm}
                  onRate={(rpe) => onRateSet(fb.index, rpe)}
                />
              )}
            </div>
          );
        })}
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Timer size={14} strokeWidth={2.25} /> Descansa entre series con el cronómetro (abajo a la derecha).
        </p>
      </div>
    );
  };

  const wodTimerHint = (
    <p className="flex items-center gap-1.5 text-xs text-neutral-500">
      <Timer size={14} strokeWidth={2.25} /> Cronometra el WOD con el reloj de entreno (abajo a la derecha).
    </p>
  );

  const renderWod = (entries: Indexed[]) => {
    const first = entries[0].entry;
    if (first.movementId.startsWith('benchmark:')) {
      const wod = benchmarkWorkouts.find((w) => w.id === first.movementId.replace('benchmark:', ''));
      return (
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-semibold leading-tight text-white">{wod?.name ?? 'Benchmark'}</h2>
          {(first.format || wod?.format) && <p className="text-lg font-semibold leading-snug text-brand-orange">{localizeWodText((first.format || wod?.format) as string)}</p>}
          {wod && wod.movements.length > 0 && (
            <p className="text-base leading-relaxed text-neutral-200">
              {wod.movements
                .map((m) => {
                  const kg = first.benchmarkLoads?.[m];
                  return `${resolveName(first.benchmarkSwaps?.[m] ?? m)}${kg ? ` (tu carga ${fmtKgValue(kg)} kg)` : ''}`;
                })
                .join(' · ')}
            </p>
          )}
          {first.notes && <FocusNote text={first.notes} />}
          {wodTimerHint}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {first.title && <h2 className="text-3xl font-semibold leading-tight text-white">{first.title}</h2>}
        {first.format && <p className="text-lg font-semibold leading-snug text-brand-orange">{first.format}</p>}
        <ul className="flex flex-col divide-y divide-white/5">
          {entries.map((e) => (
            <li key={e.index} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-3">
              <span className="min-w-[8rem] flex-1 text-lg font-medium text-white">
                {resolveName(e.entry.movementId)}
                {e.entry.scaledFrom ? <span className="ml-1.5 text-xs text-neutral-400">← {e.entry.scaledFrom}</span> : null}
              </span>
              <span className="ml-auto max-w-full text-right text-base font-semibold text-neutral-200 [overflow-wrap:anywhere]">
                {e.entry.reps}
                {e.entry.loadKg ? ` · ${e.entry.loadKg} ${loadUnitLabel(e.entry.movementId, e.entry.block)}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {first.notes && <FocusNote text={first.notes} />}
        {wodTimerHint}
      </div>
    );
  };

  const body =
    group.block === 'strength' || group.block === 'oly'
      ? renderLifting(group.entries)
      : group.block === 'wod'
        ? renderWod(group.entries)
        : renderChecklist(group.entries);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-brand-bg" style={visible ?? undefined}>
      <div className="flex items-center gap-3 border-b border-brand-border/70 px-4 py-3">
        <button
          onClick={onExit}
          aria-label="Salir del modo entreno"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition-colors hover:bg-white/10"
        >
          <X size={18} />
        </button>
        <div className="flex flex-1 gap-1">
          {groups.map((g, gi) => (
            <span
              key={`${g.block}-${g.part ?? 0}`}
              className={`h-1.5 flex-1 rounded-full ${gi < i ? 'bg-brand-neon' : gi === i ? 'bg-brand-gold' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-40 pt-6">
        <p className={`text-sm font-bold uppercase tracking-[0.14em] ${BLOCK_ACCENT[group.block]}`}>
          {BLOCK_LABEL[group.block]}
          {group.part ? ` · Parte ${group.part} de 2` : ''}
        </p>
        {group.part === 2 && (
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-300">
            <Timer size={13} strokeWidth={2.5} /> Descansa 5-10 min antes de empezar la parte 2.
          </p>
        )}
        <div className="mt-4">{body}</div>
      </div>

      <div className="border-t border-brand-border/70 bg-brand-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={i === 0}
            aria-label="Bloque anterior"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="flex-1 whitespace-nowrap text-center text-xs font-medium text-neutral-500" aria-label={`Bloque ${i + 1} de ${groups.length}`}>
            {i + 1} / {groups.length}
          </span>
          {isLast ? (
            <button onClick={onFinish} className="flex-[1.4] rounded-full bg-brand-neon px-4 py-3 text-sm font-bold text-black">
              Terminar sesión
            </button>
          ) : (
            <button
              onClick={() => setStep((v) => Math.min(groups.length - 1, v + 1))}
              className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-brand-orange px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-brand-orange-dark"
            >
              Siguiente <ChevronRight size={17} strokeWidth={2.5} />
            </button>
          )}
        </div>
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
