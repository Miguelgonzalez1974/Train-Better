import { useState } from 'react';
import { Flame, Dumbbell, Zap, Trophy, Layers, Star, Wind, Brain, ArrowLeftRight, type LucideIcon } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import {
  getMovementById,
  getMovementsByBlock,
  benchmarkWorkouts,
  getScalingOptions,
  parseLeadingRepCount,
  type ScalingOption,
} from '../../data/movements';
import type { SessionBlockResult } from '../../data/athlete/types';
import { Modal } from '../shell/Modal';

type Accent = 'orange' | 'gold' | 'neutral';

const ACCENT_CLASSES: Record<Accent, { icon: string; iconBg: string; halo: string; line: string }> = {
  orange: { icon: 'text-brand-orange', iconBg: 'bg-brand-orange/15', halo: 'bg-brand-orange/25', line: 'from-brand-orange/50' },
  gold: { icon: 'text-brand-gold', iconBg: 'bg-brand-gold/15', halo: 'bg-brand-gold/25', line: 'from-brand-gold/50' },
  neutral: { icon: 'text-neutral-400', iconBg: 'bg-white/5', halo: 'bg-white/10', line: 'from-white/20' },
};

const BLOCK_META: Record<Block, { label: string; blurb: string; Icon: LucideIcon; accent: Accent }> = {
  warmup: { label: 'Warm Up', blurb: 'Preparación', Icon: Flame, accent: 'gold' },
  strength: { label: 'Strength', blurb: 'Fuerza máxima', Icon: Dumbbell, accent: 'orange' },
  wod: { label: 'WOD', blurb: 'Condición física', Icon: Zap, accent: 'gold' },
  oly: { label: 'Oly', blurb: 'Técnica olímpica', Icon: Trophy, accent: 'orange' },
  accessory: { label: 'Accesorio', blurb: 'Refuerzo específico', Icon: Layers, accent: 'gold' },
  skill: { label: 'Skill', blurb: 'Habilidad gimnástica', Icon: Star, accent: 'orange' },
  cooldown: { label: 'Cool Down', blurb: 'Recuperación', Icon: Wind, accent: 'neutral' },
};

function StatBox({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-black/20 px-2.5 py-1.5">
      <span className="text-sm font-bold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span className="mb-2 inline-block rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
      {format}
    </span>
  );
}

function CoachNote({ text }: { text: string }) {
  return (
    <div className="mt-2 flex items-start gap-1.5">
      <Brain size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-brand-neon" />
      <p className="text-xs text-neutral-400">{text}</p>
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
        className="flex shrink-0 items-center gap-1 rounded-md border border-brand-border px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
      >
        <ArrowLeftRight size={10} strokeWidth={2.5} />
        Escalar
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

/** Bloque wod cuando el dia toca un WOD de referencia (Fran, Grace...): una tarjeta unica con su formato oficial. */
function BenchmarkWodCard({ entry }: { entry: SessionBlockResult }) {
  const benchmarkId = entry.movementId.replace('benchmark:', '');
  const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
  if (!wod) return null;
  const movementNames = wod.movements.map((id) => getMovementById(id)?.name ?? id).join(', ');

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <p className="text-lg font-bold leading-tight text-white">{wod.name}</p>
      <p className="text-sm text-neutral-300">{wod.format}</p>
      <p className="mt-1 text-xs text-neutral-500">{movementNames}</p>
      <CoachNote text="WOD de referencia: compara tu resultado con intentos anteriores para medir tu progreso real." />
    </div>
  );
}

/** Bloque wod generado a medida: una unica tarjeta con el formato y los movimientos numerados en orden. */
function CustomWodCard({
  entries,
  entryIndices,
  onUpdateEntry,
}: {
  entries: SessionBlockResult[];
  entryIndices?: number[];
  onUpdateEntry?: (index: number, patch: Partial<SessionBlockResult>) => void;
}) {
  const title = entries[0]?.title;
  const format = entries[0]?.format;
  const notes = entries[0]?.notes;

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      {title && <p className="mb-1 text-lg font-bold leading-tight text-white">"{title}"</p>}
      {format && <FormatBadge format={format} />}
      <div className="flex flex-col gap-2.5">
        {entries.map((entry, idx) => {
          const movement = getMovementById(entry.movementId);
          if (!movement) return null;
          return (
            <div key={`${entry.movementId}-${idx}`} className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                  {idx + 1}
                </span>
                <div>
                  <p className="font-semibold leading-tight text-white">{movement.name}</p>
                  {entry.reps && (
                    <p className="text-xs text-neutral-500">
                      {entry.reps} reps{entry.loadKg ? ` @ ${entry.loadKg} kg` : ''}
                    </p>
                  )}
                  {entry.scaledFrom && <p className="mt-0.5 text-[10px] text-brand-gold">Escalado desde {entry.scaledFrom}</p>}
                </div>
              </div>
              {onUpdateEntry && entryIndices && (
                <ScalingPicker entry={entry} index={entryIndices[idx]} onUpdateEntry={onUpdateEntry} />
              )}
            </div>
          );
        })}
      </div>
      {notes && <CoachNote text={notes} />}
    </div>
  );
}

/** Bloque warm up: 2 mini-rutinas cortas (WOD / Oly) en una sola tarjeta, no una pila de ejercicios. */
function WarmupRoutineCard({ entries }: { entries: SessionBlockResult[] }) {
  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <div className="flex flex-col gap-3">
        {groupBySubgroup(entries).map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'border-t border-white/5 pt-3' : ''}>
            {group.subgroup && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-gold/80">{group.subgroup}</p>
            )}
            <div className="flex flex-col gap-2">
              {group.items.map((entry, idx) => {
                const movement = getMovementById(entry.movementId);
                if (!movement) return null;
                return (
                  <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{movement.name}</p>
                      <p className="text-xs text-neutral-500">{movement.standard}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {group.items[0]?.notes && <CoachNote text={group.items[0].notes} />}
          </div>
        ))}
      </div>
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
                <p className="font-semibold text-white">{movement.name}</p>
                <p className="text-xs text-neutral-500">{movement.standard}</p>
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
function ComplexCard({ entries }: { entries: SessionBlockResult[] }) {
  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <div className="flex flex-col gap-3">
        {entries.map((entry, idx) => {
          const movement = getMovementById(entry.movementId);
          if (!movement) return null;
          return (
            <div key={`${entry.movementId}-${idx}`} className={idx > 0 ? 'border-t border-white/5 pt-3' : ''}>
              <div className="flex items-baseline gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                  {String.fromCharCode(65 + idx)}
                </span>
                <p className="font-bold leading-tight text-white">{movement.name}</p>
              </div>

              {(entry.sets || entry.reps || entry.loadKg || entry.tempo) && (
                <div className="ml-7 mt-1.5 flex flex-wrap gap-1.5">
                  {entry.sets && <StatBox value={entry.sets} label="series" />}
                  {entry.reps && <StatBox value={entry.reps} label="reps" />}
                  {entry.loadKg && <StatBox value={`${entry.loadKg}`} label="kg" />}
                  {entry.tempo && <StatBox value={entry.tempo} label="tempo" />}
                </div>
              )}

              {entry.notes && <div className="ml-7">{<CoachNote text={entry.notes} />}</div>}
              <p className="ml-7 mt-1.5 text-xs text-neutral-600">{movement.standard}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bloque accesorio en giant set/superset: una tarjeta con los movimientos agrupados y la metodologia una sola vez. */
function AccessoryGroupCard({ entries }: { entries: SessionBlockResult[] }) {
  const format = entries[0]?.format;
  const notes = entries[0]?.notes;

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      {format && <FormatBadge format={format} />}
      <div className="flex flex-col gap-2.5">
        {entries.map((entry, idx) => {
          const movement = getMovementById(entry.movementId);
          if (!movement) return null;
          return (
            <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                {idx + 1}
              </span>
              <div>
                <p className="font-semibold leading-tight text-white">{movement.name}</p>
                {(entry.sets || entry.reps) && (
                  <p className="text-xs text-neutral-500">
                    {entry.sets && `${entry.sets} series`}
                    {entry.sets && entry.reps && ' · '}
                    {entry.reps && `${entry.reps} reps`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {notes && <CoachNote text={notes} />}
    </div>
  );
}

function EntryRow({ entry }: { entry: SessionBlockResult }) {
  const movement = getMovementById(entry.movementId);
  if (!movement) return null;

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 p-3.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      {entry.format && <FormatBadge format={entry.format} />}
      <p className="text-lg font-bold leading-tight text-white">{movement.name}</p>

      {(entry.sets || entry.reps || entry.loadKg || entry.tempo) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.sets && <StatBox value={entry.sets} label="series" />}
          {entry.reps && <StatBox value={entry.reps} label="reps" />}
          {entry.loadKg && <StatBox value={`${entry.loadKg}`} label="kg" />}
          {entry.tempo && <StatBox value={entry.tempo} label="tempo" />}
        </div>
      )}

      {entry.notes && <CoachNote text={entry.notes} />}
      <p className="mt-2 text-xs text-neutral-600">{movement.standard}</p>
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

/** Modo edicion: sustituye las tarjetas visuales por una lista uniforme con select de movimiento + inputs de series/reps/kg. */
function EditableBlockEntries({
  block,
  entries,
  entryIndices,
  onUpdateEntry,
}: {
  block: Block;
  entries: SessionBlockResult[];
  entryIndices: number[];
  onUpdateEntry: (index: number, patch: Partial<SessionBlockResult>) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((entry, i) => {
        const index = entryIndices[i];
        if (entry.movementId.startsWith('benchmark:')) {
          const benchmarkId = entry.movementId.replace('benchmark:', '');
          const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
          return (
            <div key={index} className="rounded-xl bg-brand-surfaceMuted/80 p-3">
              <p className="font-semibold text-white">{wod?.name ?? benchmarkId}</p>
              <p className="mt-1 text-xs text-neutral-500">Los WOD de referencia no se editan — usa Regenerar para otro.</p>
            </div>
          );
        }

        const currentMovement = getMovementById(entry.movementId);
        const pool = getMovementsByBlock(block);
        const samePattern = currentMovement ? pool.filter((m) => m.pattern === currentMovement.pattern) : [];
        const options = samePattern.length >= 2 ? samePattern : pool;
        const hasCurrentInOptions = options.some((m) => m.id === entry.movementId);

        return (
          <div key={index} className="flex flex-col gap-2 rounded-xl bg-brand-surfaceMuted/80 p-3">
            <select
              value={entry.movementId}
              onChange={(e) => onUpdateEntry(index, { movementId: e.target.value })}
              className={`${editInputClass} text-left`}
            >
              {!hasCurrentInOptions && currentMovement && <option value={entry.movementId}>{currentMovement.name}</option>}
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
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
          </div>
        );
      })}
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
}

export function SessionBlockCard({ block, results, isLast, entryIndices, editable, onUpdateEntry }: SessionBlockCardProps) {
  if (results.length === 0) return null;
  const { label, blurb, Icon, accent } = BLOCK_META[block];
  const accentClasses = ACCENT_CLASSES[accent];
  const isBenchmarkWod = block === 'wod' && results[0].movementId.startsWith('benchmark:');

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accentClasses.iconBg}`}>
          <span className={`absolute inset-0 rounded-2xl ${accentClasses.halo} blur-md`} />
          <Icon size={19} strokeWidth={2.25} className={`relative ${accentClasses.icon}`} />
        </span>
        {!isLast && <div className={`mt-2 w-0.5 flex-1 bg-gradient-to-b ${accentClasses.line} to-transparent`} />}
      </div>

      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-white">{label}</span>
          <span className="text-xs text-neutral-500">· {blurb}</span>
        </div>

        {editable && onUpdateEntry && entryIndices ? (
          <EditableBlockEntries block={block} entries={results} entryIndices={entryIndices} onUpdateEntry={onUpdateEntry} />
        ) : block === 'wod' ? (
          isBenchmarkWod ? (
            <BenchmarkWodCard entry={results[0]} />
          ) : (
            <CustomWodCard entries={results} entryIndices={entryIndices} onUpdateEntry={onUpdateEntry} />
          )
        ) : block === 'cooldown' ? (
          <CooldownRoutineCard entries={results} />
        ) : block === 'warmup' ? (
          <WarmupRoutineCard entries={results} />
        ) : (block === 'oly' || block === 'strength') && results.length > 1 ? (
          <ComplexCard entries={results} />
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
                  <EntryRow key={`${entry.movementId}-${idx}`} entry={entry} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
