import { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Timer } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession, SessionBlockResult, SetFeel } from '../../data/athlete/types';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { BLOCK_ORDER } from './DaySessionBlocks';
import { PlateCalculator } from './PlateCalculator';
import { SetFeedbackPanel, type LoggedActual } from './SetFeedbackPanel';

/** Sub-set de `adjustableSetBlocks` de Planificacion — lo justo para renderizar el panel de valoración. */
export interface FocusSetFeedback {
  index: number;
  movementName: string;
  prescribed: { kg: number; sets: number; reps: number };
  currentFeel: SetFeel | null;
  logged: LoggedActual | null;
}

interface FocusModeProps {
  session: DailySession;
  setFeedbackByIndex: Map<number, FocusSetFeedback>;
  onSetFeedback: (index: number, feel: SetFeel) => void;
  onLogActual: (index: number, actual: { kg: number; reps: number; rpe: number }) => void;
  onResetSetFeedback: (index: number) => void;
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

function resolveName(id: string): string {
  if (id.startsWith('benchmark:')) {
    const b = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === b)?.name ?? b;
  }
  return getMovementById(id)?.name ?? id;
}

/**
 * Modo entreno enfocado — superpuesto a Planificación (z-30, por debajo del cronómetro flotante
 * z-40 y de los modales z-50, así el atleta conserva el temporizador y la calculadora de discos).
 * Un bloque de la sesión a la vez, números grandes, checklist de series (solo visual en v1 — el
 * registro serie a serie real es una fase posterior). Al terminar el último bloque llama a
 * `onFinish`, que en el padre abre «Marcar como completado».
 */
export function FocusMode({
  session,
  setFeedbackByIndex,
  onSetFeedback,
  onLogActual,
  onResetSetFeedback,
  onExit,
  onFinish,
}: FocusModeProps) {
  const groups = useMemo(
    () =>
      BLOCK_ORDER.map((block) => ({
        block,
        entries: session.blocks.map((entry, index) => ({ entry, index })).filter((e) => e.entry.block === block),
      })).filter((g) => g.entries.length > 0),
    [session],
  );

  const [step, setStep] = useState(0);
  const [doneSets, setDoneSets] = useState<Record<string, boolean>>({});
  const [plateTarget, setPlateTarget] = useState<number | null>(null);

  if (groups.length === 0) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-brand-bg p-6 text-center">
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
    const bySub: { sub: string | undefined; items: Indexed[] }[] = [];
    for (const e of entries) {
      const last = bySub[bySub.length - 1];
      if (last && last.sub === e.entry.subgroup) last.items.push(e);
      else bySub.push({ sub: e.entry.subgroup, items: [e] });
    }
    return (
      <div className="flex flex-col gap-4">
        {bySub.map((grp, gi) => (
          <div key={gi} className="flex flex-col gap-2">
            {grp.sub && <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{grp.sub}</p>}
            {grp.items.map((e) => {
              const key = `${i}:${e.index}:0`;
              const on = doneSets[key];
              return (
                <button
                  key={e.index}
                  onClick={() => toggleSet(key)}
                  className="flex items-start gap-3 rounded-xl bg-brand-surfaceMuted/60 p-3 text-left transition-colors hover:bg-brand-surfaceMuted"
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      on ? 'bg-brand-neon text-black' : 'border border-brand-border text-neutral-500'
                    }`}
                  >
                    {on ? <Check size={13} strokeWidth={3} /> : ''}
                  </span>
                  <span className="flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`font-semibold ${on ? 'text-neutral-500 line-through' : 'text-white'}`}>
                        {resolveName(e.entry.movementId)}
                      </span>
                      {e.entry.reps && <span className="text-xs text-neutral-500">{e.entry.reps}</span>}
                      {e.entry.loadKg ? <span className="text-xs text-neutral-500">· {e.entry.loadKg} kg</span> : null}
                    </span>
                    {e.entry.notes && <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">{e.entry.notes}</span>}
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
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-gold/80">{prep[0].entry.subgroup}</p>
            <ul className="flex flex-col gap-1.5 text-sm text-neutral-300">
              {prep.map((e) => (
                <li key={e.index} className="flex justify-between gap-3">
                  <span>{resolveName(e.entry.movementId)}</span>
                  <span className="shrink-0 text-neutral-500">
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
          const fb = setFeedbackByIndex.get(e.index);
          return (
            <div key={e.index} className="flex flex-col gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  {work.length > 1 && <span className="text-xs font-bold text-neutral-500">{String.fromCharCode(65 + wi)}</span>}
                  <h2 className="text-2xl font-semibold leading-tight text-white">{resolveName(b.movementId)}</h2>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {b.loadKg ? (
                    <button onClick={() => setPlateTarget(b.loadKg ?? null)} className="flex items-baseline gap-1.5 text-brand-gold">
                      <span className="text-4xl font-bold leading-none">{b.loadKg}</span>
                      <span className="text-sm">kg</span>
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-neutral-500">discos</span>
                    </button>
                  ) : null}
                  <span className="text-sm text-neutral-400">
                    {b.sets ? `${b.sets} × ${b.reps}` : b.reps}
                    {b.tempo ? ` · tempo ${b.tempo}` : ''}
                  </span>
                </div>
              </div>
              {sets > 1 && (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: sets }, (_, s) => {
                    const key = `${i}:${e.index}:${s}`;
                    const on = doneSets[key];
                    return (
                      <button
                        key={s}
                        onClick={() => toggleSet(key)}
                        aria-label={`Serie ${s + 1}${on ? ' hecha' : ''}`}
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                          on ? 'bg-brand-neon text-black' : 'border border-brand-border text-neutral-400 hover:border-brand-gold hover:text-brand-gold'
                        }`}
                      >
                        {on ? <Check size={15} strokeWidth={3} /> : s + 1}
                      </button>
                    );
                  })}
                </div>
              )}
              {b.notes && <p className="text-xs leading-relaxed text-neutral-500">{b.notes}</p>}
              {fb && (
                <SetFeedbackPanel
                  movementName={fb.movementName}
                  prescribed={fb.prescribed}
                  currentFeel={fb.currentFeel}
                  logged={fb.logged}
                  onPick={(feel) => onSetFeedback(fb.index, feel)}
                  onLogActual={(a) => onLogActual(fb.index, a)}
                  onReset={() => onResetSetFeedback(fb.index)}
                />
              )}
            </div>
          );
        })}
        <p className="flex items-center gap-1.5 text-[11px] text-neutral-600">
          <Timer size={12} strokeWidth={2.25} /> Descansa entre series con el cronómetro (abajo a la derecha).
        </p>
      </div>
    );
  };

  const renderWod = (entries: Indexed[]) => {
    const first = entries[0].entry;
    if (first.movementId.startsWith('benchmark:')) {
      const wod = benchmarkWorkouts.find((w) => w.id === first.movementId.replace('benchmark:', ''));
      return (
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold leading-tight text-white">{wod?.name ?? 'Benchmark'}</h2>
          {(first.format || wod?.format) && <p className="text-sm font-semibold text-brand-orange">{first.format || wod?.format}</p>}
          {wod && wod.movements.length > 0 && (
            <p className="text-sm text-neutral-300">
              {wod.movements.map((m) => resolveName(m)).join(' · ')}
            </p>
          )}
          {first.notes && <p className="text-xs leading-relaxed text-neutral-500">{first.notes}</p>}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {first.title && <h2 className="text-2xl font-semibold leading-tight text-white">{first.title}</h2>}
        {first.format && <p className="text-sm font-semibold text-brand-orange">{first.format}</p>}
        <ul className="flex flex-col divide-y divide-white/5">
          {entries.map((e) => (
            <li key={e.index} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-base text-white">
                {resolveName(e.entry.movementId)}
                {e.entry.scaledFrom ? <span className="ml-1.5 text-[10px] text-neutral-500">← {e.entry.scaledFrom}</span> : null}
              </span>
              <span className="shrink-0 text-sm text-neutral-400">
                {e.entry.reps}
                {e.entry.loadKg ? ` · ${e.entry.loadKg} kg` : ''}
              </span>
            </li>
          ))}
        </ul>
        {first.notes && <p className="text-xs leading-relaxed text-neutral-500">{first.notes}</p>}
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
    <div className="fixed inset-0 z-30 flex flex-col bg-brand-bg">
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
              key={g.block}
              className={`h-1.5 flex-1 rounded-full ${gi < i ? 'bg-brand-neon' : gi === i ? 'bg-brand-gold' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-40 pt-6">
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${BLOCK_ACCENT[group.block]}`}>{BLOCK_LABEL[group.block]}</p>
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
          <span className="flex-1 text-center text-xs font-medium text-neutral-500">
            Bloque {i + 1} de {groups.length}
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

      {plateTarget != null && <PlateCalculator targetKg={plateTarget} open onClose={() => setPlateTarget(null)} />}
    </div>
  );
}
