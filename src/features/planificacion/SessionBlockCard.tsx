import { Fragment, useState } from 'react';
import { Flame, Dumbbell, Zap, Trophy, Layers, Star, Wind, Brain, ArrowLeftRight, Link2, History, Info, ChevronDown, ChevronRight, Plus, Trash2, Search, Timer, type LucideIcon } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import {
  getMovementById,
  getMovementsByBlock,
  allMovements,
  benchmarkWorkouts,
  getScalingOptions,
  parseLeadingRepCount,
  type ScalingOption,
} from '../../data/movements';
import type { SessionBlockResult } from '../../data/athlete/types';
import { fmtKg, fmtDay } from '../../lib/format';
import { toLocalIsoDate } from '../../engine/periodization';
import { findLastSessionTopSet } from '../../engine/movementProgress';
import { Modal } from '../shell/Modal';
import { LoadStat, type MovementProgressData } from './LoadStat';
import { noteHead } from './noteText';
import { groupWodByPart } from './wodPartGroups';

type Accent = 'orange' | 'gold' | 'neutral';

const ACCENT_CLASSES: Record<Accent, { icon: string; bar: string }> = {
  orange: { icon: 'text-brand-orange', bar: 'bg-brand-orange/50' },
  gold: { icon: 'text-brand-gold', bar: 'bg-brand-gold/45' },
  neutral: { icon: 'text-neutral-400', bar: 'bg-white/15' },
};

/** Catalogo de WOD de referencia ordenado una sola vez (600+ entradas) — para el selector de "cambiar el WOD de hoy por otro benchmark" en modo edicion. */
const sortedBenchmarkWorkouts = [...benchmarkWorkouts].sort((a, b) => a.name.localeCompare(b.name));

const BLOCK_META: Record<Block, { label: string; Icon: LucideIcon; accent: Accent }> = {
  warmup: { label: 'Calentamiento', Icon: Flame, accent: 'gold' },
  strength: { label: 'Fuerza', Icon: Dumbbell, accent: 'orange' },
  wod: { label: 'WOD', Icon: Zap, accent: 'gold' },
  oly: { label: 'Oly', Icon: Trophy, accent: 'orange' },
  accessory: { label: 'Accesorio', Icon: Layers, accent: 'gold' },
  skill: { label: 'Skill', Icon: Star, accent: 'orange' },
  cooldown: { label: 'Vuelta a la calma', Icon: Wind, accent: 'neutral' },
};

/** Jerarquía de nombres de movimiento — una sola escala en toda la tarjeta. */
const NAME_HEADLINE = 'text-lg font-bold leading-tight text-white'; // título de WOD / benchmark
const NAME_MAIN = 'text-base font-bold leading-tight text-white'; // levantamiento de trabajo
const NAME_STEP = 'text-sm font-semibold text-white'; // pasos de lista (calentamiento, accesorio…)

/** Índice de la entrada del complejo cuya carga es la protagonista — la más pesada que no sea el primer técnico ("2-3"). */
function complexHeroIdx(complex: SessionBlockResult[]): number {
  let best = -1;
  let bestKg = -1;
  complex.forEach((e, i) => {
    if (e.reps === '2-3') return;
    if ((e.loadKg ?? 0) > bestKg) {
      bestKg = e.loadKg ?? 0;
      best = i;
    }
  });
  return best;
}

function StatBox({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-black/20 px-2.5 py-1.5">
      <span className="num text-base font-semibold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span className="mb-2 inline-block rounded-md bg-brand-gold/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-gold/90">
      {format}
    </span>
  );
}

/** Lo que se hizo la ultima vez en este movimiento — mismo dato que ya vive en `MovementProgressModal`, pero de un vistazo, sin tocar la carga para abrir el popup. */
function LastTimeHint({ movementId, block, progress }: { movementId: string; block: Block; progress?: MovementProgressData }) {
  if (!progress || (block !== 'strength' && block !== 'oly')) return null;
  const last = findLastSessionTopSet(progress.workLog, movementId, toLocalIsoDate(new Date()));
  if (!last) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-600">
      <History size={11} strokeWidth={2.5} />
      última vez{' '}
      <span className="font-medium text-neutral-400">
        {fmtKg(last.kg)}
        {last.reps > 0 ? ` × ${last.reps}` : ''}
      </span>{' '}
      · {fmtDay(last.date)}
    </p>
  );
}

/** Series encadenadas sin soltar la barra: pastilla junto a series/reps en vez de una frase enterrada en la nota del coach. Su ausencia ya dice "reset entre reps" (default en oly). */
function RepStyleBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-2.5 py-1 text-[11px] font-semibold text-brand-gold"
      title="Toca y sigue: encadena las repeticiones sin soltar la barra"
    >
      <Link2 size={11} strokeWidth={2.5} />
      T&amp;G
    </span>
  );
}

/**
 * Nota del coach: por defecto solo la primera frase (la accionable), el resto detrás de "ver más".
 * Sube densidad sin perder el porqué — ver la pasada de limpieza de 2026-09-01.
 */
function CoachNote({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { head, hasMore } = noteHead(text);
  return (
    <div className="mt-2 flex items-start gap-1.5">
      <Brain size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
      <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-400">
        {open ? text : head}
        {hasMore && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="ml-1.5 whitespace-nowrap align-baseline text-[11px] font-semibold text-neutral-500 transition-colors hover:text-brand-gold"
          >
            {open ? 'menos' : 'ver más'}
          </button>
        )}
      </p>
    </div>
  );
}

/** "cómo se hace" plegable — la descripción del movimiento no ocupa sitio hasta que se pide. */
function StandardHint({ standard, className = '' }: { standard?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!standard) return null;
  return (
    <div className={className}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 transition-colors hover:text-neutral-400"
      >
        <Info size={9} strokeWidth={2.75} />
        {open ? 'ocultar' : 'cómo se hace'}
      </button>
      {open && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{standard}</p>}
    </div>
  );
}

/** Convierte una opcion de escalado elegida en el patch a aplicar sobre el bloque — misma logica tanto si viene con reps fijas, con proporcion, o sin ninguna (se mantienen las reps de hoy). */
function buildScalingPatch(entry: SessionBlockResult, option: ScalingOption): Partial<SessionBlockResult> {
  const originalMovement = getMovementById(entry.movementId);
  const patch: Partial<SessionBlockResult> = {
    movementId: option.movementId,
    scaledFrom: originalMovement?.name ?? entry.movementId,
  };
  if (option.reps) {
    patch.reps = option.reps;
  } else if (option.perRepRatio) {
    const originalReps = parseLeadingRepCount(entry.reps);
    if (originalReps) patch.reps = String(Math.round(originalReps * option.perRepRatio));
  }
  return patch;
}

/** Boton + selector para cambiar un movimiento del WOD por una alternativa conocida (Mayhem Athlete Scaling Doc) cuando el atleta no puede hacer el prescrito tal cual. */
function ScalingPicker({
  entry,
  index,
  onUpdateEntry,
}: {
  entry: SessionBlockResult;
  index: number;
  onUpdateEntry: (index: number, patch: Partial<SessionBlockResult>) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = getScalingOptions(entry.movementId, entry.reps);
  if (options.length === 0) return null;
  const movement = getMovementById(entry.movementId);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Escalar movimiento"
        aria-label={`Escalar ${movement?.name ?? entry.movementId}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-border text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
      >
        <ArrowLeftRight size={13} strokeWidth={2.5} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Escalar ${movement?.name ?? entry.movementId}`}>
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-xs text-neutral-500">
            Alternativas si hoy no puedes hacer {movement?.name ?? 'este movimiento'} tal cual — mismo estímulo, ajustado a lo que
            tienes.
          </p>
          {options.map((option, i) => {
            const optionMovement = getMovementById(option.movementId);
            const label = option.label ?? `${option.reps ?? ''} ${optionMovement?.name ?? option.movementId}`.trim();
            return (
              <button
                key={i}
                onClick={() => {
                  onUpdateEntry(index, buildScalingPatch(entry, option));
                  setOpen(false);
                }}
                className="rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left text-sm font-medium text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
              >
                {label}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

/** Boton + selector para escalar un movimiento dentro de un WOD de referencia: anota la sustitucion en `benchmarkSwaps` sin tocar el formato oficial del benchmark (el resultado sigue siendo comparable). */
function BenchmarkMovementScalingPicker({
  movementId,
  swappedTo,
  entry,
  index,
  onUpdateEntry,
}: {
  movementId: string;
  swappedTo?: string;
  entry: SessionBlockResult;
  index: number;
  onUpdateEntry: (index: number, patch: Partial<SessionBlockResult>) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = getScalingOptions(movementId);
  if (options.length === 0) return null;
  const movement = getMovementById(movementId);

  function applySwap(toId: string | undefined) {
    const swaps = { ...entry.benchmarkSwaps };
    if (toId) swaps[movementId] = toId;
    else delete swaps[movementId];
    onUpdateEntry(index, { benchmarkSwaps: swaps });
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Escalar movimiento"
        aria-label={`Escalar ${movement?.name ?? movementId}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-border text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
      >
        <Link2 size={13} strokeWidth={2.5} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Escalar ${movement?.name ?? movementId}`}>
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-xs text-neutral-500">
            Alternativas si hoy no puedes hacer {movement?.name ?? 'este movimiento'} tal cual — el formato oficial del benchmark
            no cambia, solo anota qué haces en su lugar.
          </p>
          {options.map((option, i) => {
            const optionMovement = getMovementById(option.movementId);
            const label = option.label ?? `${option.reps ?? ''} ${optionMovement?.name ?? option.movementId}`.trim();
            return (
              <button
                key={i}
                onClick={() => applySwap(option.movementId)}
                className="rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left text-sm font-medium text-neutral-200 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
              >
                {label}
              </button>
            );
          })}
          {swappedTo && (
            <button
              onClick={() => applySwap(undefined)}
              className="mt-1 text-left text-xs font-semibold text-neutral-500 transition-colors hover:text-brand-gold"
            >
              Volver a {movement?.name ?? movementId}
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Bloque wod cuando el dia toca un WOD de referencia (Fran, Grace...): una tarjeta con su formato oficial y un movimiento por fila, cada uno escalable por separado. */
function BenchmarkWodCard({
  entry,
  index,
  onUpdateEntry,
}: {
  entry: SessionBlockResult;
  index?: number;
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
}) {
  const benchmarkId = entry.movementId.replace('benchmark:', '');
  const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
  if (!wod) return null;

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <p className={NAME_HEADLINE}>{wod.name}</p>
      <p className="text-sm text-neutral-300">{wod.format}</p>
      <div className="mt-2 flex flex-col divide-y divide-white/5 border-y border-white/5">
        {wod.movements.map((movementId, idx) => {
          const swappedTo = entry.benchmarkSwaps?.[movementId];
          const displayMovement = getMovementById(swappedTo ?? movementId);
          if (!displayMovement) return null;
          return (
            <div key={`${movementId}-${idx}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-white">{displayMovement.name}</p>
                {swappedTo && (
                  <p className="mt-0.5 text-[10px] text-brand-gold">en vez de {getMovementById(movementId)?.name}</p>
                )}
              </div>
              {onUpdateEntry && index !== undefined && (
                <BenchmarkMovementScalingPicker
                  movementId={movementId}
                  swappedTo={swappedTo}
                  entry={entry}
                  index={index}
                  onUpdateEntry={onUpdateEntry}
                />
              )}
            </div>
          );
        })}
      </div>
      <CoachNote text="WOD de referencia: compara tu resultado con intentos anteriores para medir tu progreso real." />
    </div>
  );
}

/** Etiqueta de una parte de un día de doble WOD ("Parte 1 de 2"). */
function WodPartLabel({ part }: { part: 1 | 2 }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold">Parte {part} de 2</p>
  );
}

/** Descanso indicado entre las dos partes de un día de doble WOD (5-10 min, como en la programación original). */
function WodRestDivider() {
  return (
    <div className="my-3 flex items-center gap-3" role="separator" aria-label="Descanso entre las dos partes">
      <span className="h-px flex-1 bg-white/10" />
      <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-neutral-300">
        <Timer size={12} strokeWidth={2.5} aria-hidden />
        Descansa 5-10 min
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/** Bloque wod generado a medida: una unica tarjeta con el formato y los movimientos numerados en orden. */
function CustomWodCard({
  entries,
  entryIndices,
  onUpdateEntry,
  part,
}: {
  entries: SessionBlockResult[];
  entryIndices?: number[];
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
  /** Parte del día de doble WOD a la que pertenece esta tarjeta; ausente en un día de un solo WOD. */
  part?: 1 | 2 | null;
}) {
  const title = entries[0]?.title;
  const format = entries[0]?.format;
  const notes = entries[0]?.notes;
  const target = entries[0]?.wodTarget;

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      {part ? <WodPartLabel part={part} /> : null}
      {title && <p className={`mb-1 ${NAME_HEADLINE}`}>"{title}"</p>}
      {format && <FormatBadge format={format} />}
      {/* Pizarra: un movimiento por línea, reps y carga alineados a la derecha con cifra tabular. */}
      <div className="flex flex-col divide-y divide-white/5 border-y border-white/5">
        {entries.map((entry, idx) => {
          // Un movimiento que ya no esta en el catalogo se muestra con su id en vez de desaparecer de la lista
          // (antes se saltaba la fila sin avisar y el WOD parecia tener menos movimientos de los que tenia).
          const movement = getMovementById(entry.movementId) ?? { name: entry.movementId };
          return (
            // La fila puede partirse en dos lineas (`flex-wrap`): el nombre ocupa su linea con un ancho minimo y las
            // repeticiones bajan a la de abajo, alineadas a la derecha, cuando no caben juntas. Con una escalera larga
            // ("3-6-9-12-15-12-9-6-3") las reps ocupaban casi toda la fila y el nombre se quedaba sin sitio: "Power
            // Clean" salia con una letra por linea.
            <div key={`${entry.movementId}-${idx}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
              <span className="num w-4 shrink-0 text-[11px] text-neutral-600">{idx + 1}</span>
              <div className="min-w-[8rem] flex-1">
                {/* Sin `truncate`: en el movil "Kettlebell Swing (Russian)" o "Row (remo ergometro)" quedaban cortados con "…" y el atleta no veia que movimiento era. */}
                <p className={`${NAME_STEP} break-words`}>{movement.name}</p>
                {entry.scaledFrom && <p className="mt-0.5 text-[10px] text-brand-gold">Escalado desde {entry.scaledFrom}</p>}
              </div>
              {entry.reps && (
                <span className="num ml-auto max-w-full text-right text-sm text-neutral-300 [overflow-wrap:anywhere]">
                  {entry.reps}
                  {entry.loadKg ? <span className="text-neutral-500"> · {fmtKg(entry.loadKg)}</span> : ''}
                </span>
              )}
              {onUpdateEntry && entryIndices && (
                <ScalingPicker entry={entry} index={entryIndices[idx]} onUpdateEntry={onUpdateEntry} />
              )}
            </div>
          );
        })}
      </div>
      {target?.display && (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-brand-gold">
          <Trophy size={12} strokeWidth={2.5} />
          Objetivo {target.display}
        </p>
      )}
      {notes && <CoachNote text={notes} defaultOpen />}
    </div>
  );
}

/** Etiqueta corta de pestaña para los subgrupos conocidos del calentamiento — cualquier otro subgrupo usa su propio texto tal cual. */
const WARMUP_TAB_LABEL: Record<string, string> = {
  'Específico del WOD': 'Del WOD',
  'Calentamiento de barra': 'Barra',
};

/**
 * Bloque warm up: el calentamiento trae 2-3 mini-rutinas cortas (activación general, específico del
 * WOD y, en días de programa de fuerza con oly, la barra Burgener) como subgrupos separados. En vez
 * de apilarlas todas (tarjeta larga), una pestaña por subgrupo — solo se ve una a la vez.
 */
function WarmupRoutineCard({ entries }: { entries: SessionBlockResult[] }) {
  const groups = groupBySubgroup(entries);
  const [activeIdx, setActiveIdx] = useState(0);
  const active = groups[activeIdx] ?? groups[0];

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      {groups.length > 1 && (
        <div className="mb-3 flex gap-0.5 rounded-lg bg-white/5 p-0.5">
          {groups.map((group, gi) => (
            <button
              key={gi}
              onClick={() => setActiveIdx(gi)}
              className={`flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
                gi === activeIdx ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {(group.subgroup && WARMUP_TAB_LABEL[group.subgroup]) ?? group.subgroup ?? 'Calentamiento'}
            </button>
          ))}
        </div>
      )}
      {active && (
        <div className="flex flex-col gap-2">
          {active.items.map((entry, idx) => {
            const movement = getMovementById(entry.movementId);
            if (!movement) return null;
            return (
              <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                  {idx + 1}
                </span>
                <div>
                  <p className={NAME_STEP}>{movement.name}</p>
                  <StandardHint standard={movement.standard} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {active?.items[0]?.notes && <CoachNote text={active.items[0].notes} />}
    </div>
  );
}

/** Bloque cool down: una sola rutina que se enlaza en orden, no una tarjeta por estiramiento. */
function CooldownRoutineCard({ entries }: { entries: SessionBlockResult[] }) {
  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <p className="mb-3 text-xs text-neutral-500">Enlaza estos pasos en orden, sin prisa, para bajar pulsaciones.</p>
      <div className="flex flex-col gap-3">
        {entries.map((entry, idx) => {
          const movement = getMovementById(entry.movementId);
          if (!movement) return null;
          return (
            <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                {idx + 1}
              </span>
              <div>
                <p className={NAME_STEP}>{movement.name}</p>
                <StandardHint standard={movement.standard} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Bloque con pasos A/B en una sola tarjeta, no dos sueltas: el complejo de oly (primer técnico +
 * levantamiento principal) y la superserie de fuerza (levantamiento principal + A2 antagonista).
 */
function ComplexCard({ entries, progress }: { entries: SessionBlockResult[]; progress?: MovementProgressData }) {
  // Las entradas con `subgroup` (ej. "Calentamiento de barra" del bloque de Oly) son preparación —
  // van plegadas por defecto para que la tarjeta muestre solo el complejo de trabajo (A/B).
  const prep = entries.filter((e) => e.subgroup);
  const complex = entries.filter((e) => !e.subgroup);
  const prepNote = prep.find((e) => e.notes)?.notes;
  const [prepOpen, setPrepOpen] = useState(false);

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <div className="flex flex-col gap-3">
        {prep.length > 0 && (
          <div>
            <button
              onClick={() => setPrepOpen((o) => !o)}
              className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-gold/80"
            >
              {prepOpen ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
              <span className="min-w-0 truncate">{prep[0].subgroup}</span>
              <span className="shrink-0 font-normal normal-case text-neutral-600">· {prep.length}</span>
            </button>
            {prepOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {prep.map((entry, idx) => {
                  const movement = getMovementById(entry.movementId);
                  if (!movement) return null;
                  return (
                    <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={NAME_STEP}>{movement.name}</p>
                          {entry.reps && <span className="text-xs text-neutral-500">{entry.reps}</span>}
                          {entry.loadKg ? (
                            <LoadStat kg={entry.loadKg} movementId={entry.movementId} block={entry.block} progress={progress} />
                          ) : null}
                        </div>
                        <StandardHint standard={movement.standard} />
                      </div>
                    </div>
                  );
                })}
                {prepNote && <CoachNote text={prepNote} />}
              </div>
            )}
          </div>
        )}

        <div className={prep.length > 0 ? 'flex flex-col gap-3 border-t border-white/5 pt-3' : 'flex flex-col gap-3'}>
          {complex.map((entry, idx) => {
            const movement = getMovementById(entry.movementId);
            if (!movement) return null;
            // La carga protagonista: en fuerza es el levantamiento principal (A); en oly, la entrada
            // con más carga que no sea el primer técnico ("2-3").
            const isHero =
              entry.block === 'strength'
                ? idx === 0
                : idx === complexHeroIdx(complex);
            return (
              <div key={`${entry.movementId}-${idx}`} className={idx > 0 ? 'border-t border-white/5 pt-3' : ''}>
                <div className="flex items-baseline gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <p className={NAME_MAIN}>{movement.name}</p>
                </div>
                {entry.format && (
                  <div className="ml-7 mt-1">
                    <FormatBadge format={entry.format} />
                  </div>
                )}

                {(entry.sets || entry.reps || entry.loadKg || entry.tempo) && (
                  <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-1.5">
                    {entry.sets && <StatBox value={entry.sets} label="series" />}
                    {entry.reps && <StatBox value={entry.reps} label="reps" />}
                    {entry.loadKg ? (
                      <LoadStat
                        kg={entry.loadKg}
                        movementId={entry.movementId}
                        block={entry.block}
                        progress={progress}
                        size={isHero ? 'lg' : 'sm'}
                      />
                    ) : null}
                    {entry.tempo && <StatBox value={entry.tempo} label="tempo" />}
                    {entry.repStyle === 'touch-and-go' && <RepStyleBadge />}
                  </div>
                )}
                <div className="ml-7">
                  <LastTimeHint movementId={entry.movementId} block={entry.block} progress={progress} />
                </div>

                {entry.notes && (
                  <div className="ml-7">
                    <CoachNote text={entry.notes} defaultOpen={isHero} />
                  </div>
                )}
                <StandardHint standard={movement.standard} className="ml-7" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Bloque accesorio en giant set/superset: una tarjeta con los movimientos agrupados y la metodologia una sola vez. */
/** Reps "planas" (solo dígitos/comas/guiones) llevan el sufijo "reps"; "30-45 s" o "10-12/lado" van literales. */
function repsLabel(reps: string): string {
  return /^[\d,\-\s]+$/.test(reps) ? `${reps} reps` : reps;
}

function AccessoryGroupCard({ entries }: { entries: SessionBlockResult[] }) {
  // Agrupa por `format` conservando el orden (Superserie A / Superserie B / Core...): un bloque de
  // accesorio con un solo format sigue saliendo como una única tarjeta, igual que antes.
  const groups: { format?: string; notes?: string; items: SessionBlockResult[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.format === entry.format) last.items.push(entry);
    else groups.push({ format: entry.format, notes: entry.notes, items: [entry] });
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, gi) => (
        <div
          key={gi}
          className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted"
        >
          {group.format && <FormatBadge format={group.format} />}
          <div className="flex flex-col gap-2.5">
            {group.items.map((entry, idx) => {
              const movement = getMovementById(entry.movementId);
              if (!movement) return null;
              return (
                <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                    {idx + 1}
                  </span>
                  <div>
                    <p className={NAME_STEP}>{movement.name}</p>
                    {(entry.sets || entry.reps) && (
                      <p className="text-xs text-neutral-500">
                        {entry.sets && `${entry.sets} series`}
                        {entry.sets && entry.reps && ' · '}
                        {entry.reps && repsLabel(entry.reps)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {group.notes && <CoachNote text={group.notes} />}
        </div>
      ))}
    </div>
  );
}

function EntryRow({ entry, progress }: { entry: SessionBlockResult; progress?: MovementProgressData }) {
  const movement = getMovementById(entry.movementId);
  if (!movement) return null;

  const isMainLift = entry.block === 'strength' || entry.block === 'oly';
  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      {entry.format && <FormatBadge format={entry.format} />}
      <p className={NAME_MAIN}>{movement.name}</p>

      {(entry.sets || entry.reps || entry.loadKg || entry.tempo) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {entry.sets && <StatBox value={entry.sets} label="series" />}
          {entry.reps && <StatBox value={entry.reps} label="reps" />}
          {entry.loadKg ? (
            <LoadStat
              kg={entry.loadKg}
              movementId={entry.movementId}
              block={entry.block}
              progress={progress}
              size={isMainLift ? 'lg' : 'sm'}
            />
          ) : null}
          {entry.tempo && <StatBox value={entry.tempo} label="tempo" />}
          {entry.repStyle === 'touch-and-go' && <RepStyleBadge />}
        </div>
      )}
      <LastTimeHint movementId={entry.movementId} block={entry.block} progress={progress} />

      {entry.notes && <CoachNote text={entry.notes} defaultOpen={isMainLift} />}
      <StandardHint standard={movement.standard} />
    </div>
  );
}

interface SubgroupBucket {
  subgroup?: string;
  items: SessionBlockResult[];
}

function groupBySubgroup(results: SessionBlockResult[]): SubgroupBucket[] {
  const groups: SubgroupBucket[] = [];
  for (const entry of results) {
    const last = groups[groups.length - 1];
    if (last && last.subgroup === entry.subgroup) {
      last.items.push(entry);
    } else {
      groups.push({ subgroup: entry.subgroup, items: [entry] });
    }
  }
  return groups;
}

const editInputClass = 'rounded-lg border border-brand-border bg-brand-bg px-2 py-1 text-center text-sm text-white';

const MAX_SEARCH_RESULTS = 20;

/**
 * Buscador de movimiento en modo edicion: busca en TODO el catalogo de la app (`allMovements`), no
 * solo en el bloque actual — al editar a mano el atleta puede querer cualquier sustituto real, no
 * solo uno pensado originalmente para ese bloque. Cada resultado muestra de que bloque(s) viene, para
 * elegir con contexto.
 */
function MovementSearchPicker({ value, onSelect }: { value: string; onSelect: (movementId: string) => void }) {
  const currentMovement = getMovementById(value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = open && query.trim()
    ? allMovements.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, MAX_SEARCH_RESULTS)
    : [];

  return (
    <div className="relative min-w-0 flex-1">
      <div className={`${editInputClass} flex items-center gap-1.5 text-left`}>
        <Search size={13} strokeWidth={2.5} className="shrink-0 text-neutral-500" />
        <input
          type="text"
          value={open ? query : (currentMovement?.name ?? value)}
          onFocus={() => setQuery('')}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
          }}
          onBlur={() => setOpen(false)}
          placeholder="Buscar movimiento…"
          className="min-w-0 flex-1 bg-transparent text-left text-white outline-none"
        />
      </div>
      {results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-brand-border bg-brand-bg shadow-xl">
          {results.map((m) => (
            <button
              key={m.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(m.id);
                setOpen(false);
                setQuery('');
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors duration-200 hover:bg-white/5"
            >
              <span className="text-sm font-medium text-white">{m.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                {m.blocks.map((b) => BLOCK_META[b].label).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Plantilla razonable para un movimiento nuevo dentro de un bloque — copia forma (series/reps/formato/subgrupo) de la fila junto a la que se añade, cambia solo el movimiento. */
function buildNewEntry(block: Block, template: SessionBlockResult | undefined): SessionBlockResult {
  const pool = getMovementsByBlock(block);
  const movementId = pool.find((m) => m.id !== template?.movementId)?.id ?? pool[0]?.id ?? template?.movementId ?? '';
  return {
    block,
    movementId,
    sets: template?.sets,
    reps: template?.reps ?? '10',
    format: template?.format,
    subgroup: template?.subgroup,
  };
}

/** Modo edicion: sustituye las tarjetas visuales por una lista uniforme con select de movimiento + inputs de series/reps/kg/formato, con añadir/quitar movimiento en los bloques que son listas simples. */
function EditableBlockEntries({
  block,
  entries,
  entryIndices,
  onUpdateEntry,
  onAddEntry,
  onRemoveEntry,
}: {
  block: Block;
  entries: SessionBlockResult[];
  entryIndices: number[];
  onUpdateEntry: (index: number, patch: Partial<SessionBlockResult>) => void;
  onAddEntry?: (newEntry: SessionBlockResult, afterIndex: number) => void;
  onRemoveEntry?: (index: number) => void;
}) {
  const isBenchmarkWod = entries.some((e) => e.movementId.startsWith('benchmark:'));
  // Un WOD de referencia es una unidad con nombre propio (formato oficial fijo) — no tiene sentido
  // "añadirle un movimiento". El calentamiento no lo pide (y ahora mismo sus filas ni se ven aqui,
  // ver el subgroup de mas abajo). El resto, complejo de fuerza/oly incluido, son listas: el numero
  // de entradas de ComplexCard/EntryRow ya es dinamico, no asume 2 exactas.
  const canAddRemove = !isBenchmarkWod && block !== 'warmup' && Boolean(onAddEntry) && Boolean(onRemoveEntry);
  const editableEntries = entries.filter((e) => !e.subgroup);
  const lastEntryIndex = entryIndices[entries.length - 1];

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((entry, i) => {
        const index = entryIndices[i];
        // Solo la preparación de barra ("Calentamiento de barra", el Burgener del complejo de oly)
        // no se edita aquí — se edita el complejo de trabajo, no el warm-up. Antes este filtro
        // saltaba CUALQUIER fila con subgrupo, lo que de paso dejaba todo el bloque de calentamiento
        // (que siempre lleva subgrupo: "Activación" / "Específico del WOD") sin poder editarse.
        if (entry.subgroup === 'Calentamiento de barra') return null;
        if (entry.movementId.startsWith('benchmark:')) {
          const benchmarkId = entry.movementId.replace('benchmark:', '');
          const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
          return (
            <div key={index} className="flex flex-col gap-2 rounded-xl bg-brand-surfaceMuted/80 p-3">
              <select
                value={benchmarkId}
                onChange={(e) => onUpdateEntry(index, { movementId: `benchmark:${e.target.value}`, benchmarkSwaps: undefined })}
                className={`${editInputClass} text-left`}
              >
                {!wod && <option value={benchmarkId}>{benchmarkId}</option>}
                {sortedBenchmarkWorkouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {wod?.format && <p className="text-xs text-neutral-500">{wod.format}</p>}
            </div>
          );
        }

        const currentMovement = getMovementById(entry.movementId);

        return (
          <div key={index} className="flex flex-col gap-2 rounded-xl bg-brand-surfaceMuted/80 p-3">
            <div className="flex items-center gap-2">
              <MovementSearchPicker value={entry.movementId} onSelect={(movementId) => onUpdateEntry(index, { movementId })} />
              {canAddRemove && editableEntries.length > 1 && (
                <button
                  onClick={() => onRemoveEntry!(index)}
                  aria-label={`Quitar ${currentMovement?.name ?? 'movimiento'}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors duration-200 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={14} strokeWidth={2.25} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {entry.sets !== undefined && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                  Series
                  <input
                    type="number"
                    min={1}
                    value={entry.sets}
                    onChange={(e) => onUpdateEntry(index, { sets: Number(e.target.value) })}
                    className={`${editInputClass} w-14`}
                  />
                </label>
              )}
              {entry.reps !== undefined && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                  Reps
                  <input
                    type="text"
                    value={entry.reps}
                    onChange={(e) => onUpdateEntry(index, { reps: e.target.value })}
                    className={`${editInputClass} w-20`}
                  />
                </label>
              )}
              {entry.loadKg !== undefined && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                  Kg
                  <input
                    type="number"
                    min={0}
                    step={2.5}
                    value={entry.loadKg}
                    onChange={(e) => onUpdateEntry(index, { loadKg: Number(e.target.value) })}
                    className={`${editInputClass} w-16`}
                  />
                </label>
              )}
              {entry.tempo && <span className="text-xs text-neutral-500">Tempo {entry.tempo}</span>}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-neutral-400">
              Formato
              <input
                type="text"
                value={entry.format ?? ''}
                placeholder="p.ej. 3 rondas · For Time, Tabata 8 rondas..."
                onChange={(e) => onUpdateEntry(index, { format: e.target.value || undefined })}
                className={`${editInputClass} flex-1 text-left`}
              />
            </label>
          </div>
        );
      })}
      {canAddRemove && (
        <button
          onClick={() => onAddEntry!(buildNewEntry(block, entries[entries.length - 1]), lastEntryIndex)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-border py-2 text-xs font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
        >
          <Plus size={14} strokeWidth={2.5} />
          Añadir movimiento
        </button>
      )}
    </div>
  );
}

interface SessionBlockCardProps {
  block: Block;
  results: SessionBlockResult[];
  isLast: boolean;
  entryIndices?: number[];
  editable?: boolean;
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
  /** Añade un movimiento nuevo al bloque, justo despues de `afterIndex` (indice global en session.blocks). No aplica a un WOD de referencia (formato oficial fijo). */
  onAddEntry?: (newEntry: SessionBlockResult, afterIndex: number) => void;
  /** Quita el movimiento en `index` (indice global en session.blocks). */
  onRemoveEntry?: (index: number) => void;
  /** Datos del atleta para el popup de progresión del movimiento (solo lectura fuera del modo edición). */
  progress?: MovementProgressData;
}

export function SessionBlockCard({ block, results, isLast, entryIndices, editable, onUpdateEntry, onAddEntry, onRemoveEntry, progress }: SessionBlockCardProps) {
  if (results.length === 0) return null;
  const { label, Icon, accent } = BLOCK_META[block];
  const accentClasses = ACCENT_CLASSES[accent];
  const isBenchmarkWod = block === 'wod' && results[0].movementId.startsWith('benchmark:');
  // Un dia de doble WOD trae dos partes en el mismo bloque: se pintan como dos tarjetas con el descanso en medio.
  const wodGroups = block === 'wod' ? groupWodByPart(results, entryIndices) : [];

  return (
    <div className={`relative pl-4 ${isLast ? 'pb-0' : 'pb-6'}`}>
      <span className={`absolute bottom-1 left-0 top-0.5 w-[3px] ${accentClasses.bar}`} />

      <div>
        <p className={`mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] ${accentClasses.icon}`}>
          <Icon size={13} strokeWidth={2.5} aria-hidden />
          {label}
        </p>

        {editable && onUpdateEntry && entryIndices ? (
          wodGroups.length > 1 ? (
            // Dia de doble WOD en edicion: cada parte se edita por separado (los movimientos que se anadan o
            // quiten quedan dentro de su parte).
            <div className="flex flex-col">
              {wodGroups.map((g) => (
                <Fragment key={g.part}>
                  {g.part === 2 && <WodRestDivider />}
                  {g.part ? <WodPartLabel part={g.part} /> : null}
                  <EditableBlockEntries
                    block={block}
                    entries={g.entries}
                    entryIndices={g.indices!}
                    onUpdateEntry={onUpdateEntry}
                    onAddEntry={onAddEntry}
                    onRemoveEntry={onRemoveEntry}
                  />
                </Fragment>
              ))}
            </div>
          ) : (
            <EditableBlockEntries
              block={block}
              entries={results}
              entryIndices={entryIndices}
              onUpdateEntry={onUpdateEntry}
              onAddEntry={onAddEntry}
              onRemoveEntry={onRemoveEntry}
            />
          )
        ) : block === 'wod' ? (
          isBenchmarkWod ? (
            <BenchmarkWodCard entry={results[0]} index={entryIndices?.[0]} onUpdateEntry={onUpdateEntry} />
          ) : wodGroups.length > 1 ? (
            <div className="flex flex-col">
              {wodGroups.map((g) => (
                <Fragment key={g.part}>
                  {g.part === 2 && <WodRestDivider />}
                  <CustomWodCard entries={g.entries} entryIndices={g.indices} onUpdateEntry={onUpdateEntry} part={g.part} />
                </Fragment>
              ))}
            </div>
          ) : (
            <CustomWodCard entries={results} entryIndices={entryIndices} onUpdateEntry={onUpdateEntry} />
          )
        ) : block === 'cooldown' ? (
          <CooldownRoutineCard entries={results} />
        ) : block === 'warmup' ? (
          <WarmupRoutineCard entries={results} />
        ) : (block === 'oly' || block === 'strength') && results.length > 1 ? (
          <ComplexCard entries={results} progress={progress} />
        ) : block === 'accessory' && results[0]?.format ? (
          <AccessoryGroupCard entries={results} />
        ) : (
          <div className="flex flex-col gap-3">
            {groupBySubgroup(results).map((group, gi) => (
              <div key={gi} className="flex flex-col gap-2">
                {group.subgroup && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.subgroup}</p>
                )}
                {group.items.map((entry, idx) => (
                  <EntryRow key={`${entry.movementId}-${idx}`} entry={entry} progress={progress} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
