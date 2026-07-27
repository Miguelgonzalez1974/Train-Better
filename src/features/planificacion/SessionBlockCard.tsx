import { Flame, Dumbbell, Zap, Trophy, Layers, Star, Wind, Brain, type LucideIcon } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import type { SessionBlockResult } from '../../data/athlete/types';

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
function CustomWodCard({ entries }: { entries: SessionBlockResult[] }) {
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
            <div key={`${entry.movementId}-${idx}`} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-neutral-300">
                {idx + 1}
              </span>
              <div>
                <p className="font-semibold leading-tight text-white">{movement.name}</p>
                {entry.reps && <p className="text-xs text-neutral-500">{entry.reps} reps</p>}
              </div>
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

/** Bloque oly con complejo (primer tecnico + levantamiento principal): una tarjeta con pasos A/B, no dos sueltas. */
function OlyComplexCard({ entries }: { entries: SessionBlockResult[] }) {
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

              {(entry.sets || entry.reps || entry.loadKg) && (
                <div className="ml-7 mt-1.5 flex flex-wrap gap-1.5">
                  {entry.sets && <StatBox value={entry.sets} label="series" />}
                  {entry.reps && <StatBox value={entry.reps} label="reps" />}
                  {entry.loadKg && <StatBox value={`${entry.loadKg}`} label="kg" />}
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

      {(entry.sets || entry.reps || entry.loadKg) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.sets && <StatBox value={entry.sets} label="series" />}
          {entry.reps && <StatBox value={entry.reps} label="reps" />}
          {entry.loadKg && <StatBox value={`${entry.loadKg}`} label="kg" />}
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

interface SessionBlockCardProps {
  block: Block;
  results: SessionBlockResult[];
  isLast: boolean;
}

export function SessionBlockCard({ block, results, isLast }: SessionBlockCardProps) {
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

        {block === 'wod' ? (
          isBenchmarkWod ? (
            <BenchmarkWodCard entry={results[0]} />
          ) : (
            <CustomWodCard entries={results} />
          )
        ) : block === 'cooldown' ? (
          <CooldownRoutineCard entries={results} />
        ) : block === 'warmup' ? (
          <WarmupRoutineCard entries={results} />
        ) : block === 'oly' && results.length > 1 ? (
          <OlyComplexCard entries={results} />
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
