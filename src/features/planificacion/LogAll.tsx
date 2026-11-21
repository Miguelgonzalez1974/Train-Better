import { useMemo, useState, type MutableRefObject, type ReactNode } from 'react';
import { X, Minus, Plus, Layers, NotebookPen } from 'lucide-react';
import type { DailySession, SessionBlockResult, WorkSetEntry } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import { fmtKgValue } from '../../lib/format';
import type { Skips } from '../../engine/sessionParts';
import {
  KG_STEP,
  adjustAll,
  adjustRange,
  adjustRow,
  commitOf,
  cycleQuality,
  initialEdit,
  isChanged,
  isStraight,
  liftPlanOf,
  resetEdit,
  setDone,
  setTop,
  topIndex,
  waveRange,
  type LiftEdit,
  type LiftPlan,
} from '../../engine/liftSets';

/**
 * Anotar la sesión de golpe, al terminar: cada ejercicio de barra como una tarjeta con los pesos ya puestos (los de la sesión prevista) y, debajo,
 * el cierre (resultado del WOD, cómo fue, esfuerzo y minutos) en la misma pantalla. Se toca solo lo que fue distinto: la serie top (las demás se
 * mueven en proporción), todas ±, una serie suelta (las siguientes la siguen), cuántas series se hicieron y cómo salió cada una. No escribe nada
 * hasta «Guardar sesión»: el padre llama a `commitRef` justo antes de cerrar, y entonces las series van al registro (las que no se tocaron, como
 * «previstas»: no cuentan como evidencia para el coach).
 */

const ACCENT = { strength: '#ffb27a', oly: '#6ee7b7' } as const;
const QUALITY_LABEL = { bien: 'Bien', justa: 'Justa', fallada: 'No salió' } as const;

const kgText = (v: number) => fmtKgValue(v);

function Stepper({ value, onMinus, onPlus, label, testId }: { value: string; onMinus: () => void; onPlus: () => void; label: string; testId?: string }) {
  const btn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-border text-neutral-200 transition-colors active:bg-white/10';
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <button onClick={onMinus} aria-label={`Menos ${label}`} className={btn}>
        <Minus size={16} />
      </button>
      <span className="min-w-[4.5rem] text-center text-base font-semibold tabular-nums text-white">{value}</span>
      <button onClick={onPlus} aria-label={`Más ${label}`} className={btn}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function Chip({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors active:bg-white/10">
      {children}
    </button>
  );
}

function LiftEditor({ plan, entry, edit, onChange }: { plan: LiftPlan; entry: SessionBlockResult; edit: LiftEdit; onChange: (next: LiftEdit) => void }) {
  const straight = isStraight(plan);
  const hasLoad = plan.rows.some((r) => r.plannedKg > 0);
  const [open, setOpen] = useState(!straight);
  const title = entry.complex?.name ?? getMovementById(entry.movementId)?.name ?? entry.movementId;
  const accent = ACCENT[plan.blk];
  const top = edit.rows[topIndex(edit.rows)];
  const bump = plan.blk === 'oly' ? KG_STEP : 5;
  const changed = isChanged(edit);
  const planned = straight ? `${plan.rows.length} × ${plan.rows[0].reps}` : `${plan.rows.length} series · ${entry.reps ?? 'rampa'}`;

  const rowView = (i: number) => {
    const r = edit.rows[i];
    const done = i < edit.done;
    return (
      <div key={r.n} className={`flex items-center gap-2 border-t border-white/5 py-2 first:border-t-0 ${done ? '' : 'opacity-40'}`} data-testid="log-row">
        <span className="w-14 shrink-0 text-xs text-neutral-400">Serie {r.n}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-white">
          <span className="whitespace-nowrap">
            {hasLoad ? `${kgText(r.kg)} kg` : 'Peso corporal'} × {r.reps}
          </span>
          {r.kg !== r.plannedKg && <span className="block text-[11px] font-normal text-warn">previsto {kgText(r.plannedKg)}</span>}
        </span>
        {done ? (
          <>
            <button
              onClick={() => onChange(cycleQuality(edit, i))}
              aria-label={`Cómo salió la serie ${r.n}`}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.quality === 'fallada' ? 'bg-bad/15 text-bad' : r.quality === 'justa' ? 'bg-warn/15 text-warn' : 'bg-white/5 text-neutral-400'}`}
            >
              {QUALITY_LABEL[r.quality ?? 'bien']}
            </button>
            {hasLoad && (
              <span className="flex shrink-0 items-center gap-1">
                <button onClick={() => onChange(adjustRow(edit, i, -KG_STEP))} aria-label={`Quitar ${KG_STEP} kg a la serie ${r.n}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-border text-neutral-200 active:bg-white/10">
                  <Minus size={14} />
                </button>
                <button onClick={() => onChange(adjustRow(edit, i, KG_STEP))} aria-label={`Añadir ${KG_STEP} kg a la serie ${r.n}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-border text-neutral-200 active:bg-white/10">
                  <Plus size={14} />
                </button>
              </span>
            )}
          </>
        ) : (
          <span className="shrink-0 text-[11px] text-neutral-500">no hecha</span>
        )}
      </div>
    );
  };

  const waves = plan.waveSize ? Array.from({ length: plan.rows.length / plan.waveSize }, (_, w) => w) : null;

  return (
    <section className="card flex flex-col gap-3 border-white/10 p-3.5" data-testid="log-lift">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 text-base font-semibold text-white">{title}</p>
        <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-400">
          {planned}
          {changed && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">Cambiado</span>}
        </span>
      </div>

      {hasLoad && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-neutral-300">{straight ? 'Peso en todas' : 'Serie top'}</span>
          <Stepper value={`${kgText(top.kg)} kg`} label={straight ? 'peso en todas' : 'peso de la serie top'} onMinus={() => onChange(setTop(edit, top.kg - KG_STEP))} onPlus={() => onChange(setTop(edit, top.kg + KG_STEP))} testId="log-top" />
        </div>
      )}

      {hasLoad && !straight && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-neutral-300">Todas</span>
          <span className="flex gap-1.5">
            <Chip onClick={() => onChange(adjustAll(edit, -bump))} testId="log-all-minus">
              − {kgText(bump)}
            </Chip>
            <Chip onClick={() => onChange(adjustAll(edit, bump))} testId="log-all-plus">
              + {kgText(bump)}
            </Chip>
            <Chip onClick={() => onChange({ ...edit, rows: edit.rows.map((r) => ({ ...r, kg: r.plannedKg, manual: false })) })}>Igual</Chip>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-300">Series hechas</span>
        <Stepper value={`${edit.done} de ${edit.rows.length}`} label="series hechas" onMinus={() => onChange(setDone(edit, edit.done - 1))} onPlus={() => onChange(setDone(edit, edit.done + 1))} testId="log-done" />
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <button onClick={() => setOpen((v) => !v)} className="font-semibold text-neutral-300 underline decoration-dotted" aria-expanded={open} data-testid="log-toggle-rows">
          {open ? 'Ocultar series' : 'Serie a serie'}
        </button>
        {changed && (
          <button onClick={() => onChange(resetEdit(plan))} className="font-semibold text-neutral-400 underline decoration-dotted" data-testid="log-reset">
            Volver a lo previsto
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl bg-white/[0.03] px-3 py-1" style={{ borderLeft: `2px solid ${accent}` }}>
          {waves
            ? waves.map((w) => {
                const idx = waveRange(plan, w);
                return (
                  <div key={w} className="py-1">
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-xs font-semibold text-neutral-400">Ola {w + 1}</p>
                      {hasLoad && (
                        <span className="flex gap-1.5">
                          <Chip onClick={() => onChange(adjustRange(edit, idx, -KG_STEP))}>− {kgText(KG_STEP)}</Chip>
                          <Chip onClick={() => onChange(adjustRange(edit, idx, KG_STEP))}>+ {kgText(KG_STEP)}</Chip>
                        </span>
                      )}
                    </div>
                    {idx.map(rowView)}
                  </div>
                );
              })
            : edit.rows.map((_, i) => rowView(i))}
        </div>
      )}
    </section>
  );
}

export interface LogAllProps {
  session: DailySession;
  todayWorkLog: WorkSetEntry[];
  skips: Skips;
  /** El padre llama a esto justo antes de cerrar la sesión: guarda las series tal como están en pantalla. */
  commitRef: MutableRefObject<(() => void) | null>;
  /** El cierre de la sesión (resultado del WOD, cómo fue, esfuerzo y minutos), en una sola pantalla. */
  closePanel: ReactNode;
  onExit: () => void;
  onSwitchToCards: () => void;
  onOtherThing: () => void;
}

export function LogAll({ session, todayWorkLog, skips, commitRef, closePanel, onExit, onSwitchToCards, onOtherThing }: LogAllProps) {
  const lifts = useMemo(
    () =>
      session.blocks
        .map((entry) => ({ entry, plan: liftPlanOf(entry) }))
        .filter((l): l is { entry: SessionBlockResult; plan: LiftPlan } => l.plan !== null),
    [session],
  );
  const [edits, setEdits] = useState<Record<string, LiftEdit>>(() => Object.fromEntries(lifts.map((l) => [l.plan.mid, initialEdit(l.plan, todayWorkLog)])));
  const others = session.blocks.filter((b) => b.block !== 'wod' && !liftPlanOf(b) && !(b.block === 'strength' || b.block === 'oly'));

  // Lo que se guarda al cerrar: las series hechas (y se borran las que ya no cuentan). Una parte marcada como no hecha no se anota.
  commitRef.current = () => {
    for (const l of lifts) {
      if (skips[l.plan.blk]) continue;
      const edit = edits[l.plan.mid];
      if (!edit) continue;
      const { write, clear } = commitOf(edit);
      for (const w of write) {
        athleteRepository.saveWorkSet({ date: session.date, movementId: l.plan.mid, block: l.plan.blk, setNumber: w.n, kg: w.kg, reps: w.reps, ...(w.quality ? { quality: w.quality } : {}), ...(w.asPlanned ? { asPlanned: true } : {}) });
      }
      for (const n of clear) athleteRepository.clearWorkSet(session.date, l.plan.mid, n);
    }
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-brand-bg" data-testid="log-all">
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 pb-24 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex items-start gap-3">
          <button onClick={onExit} aria-label="Salir sin guardar" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-neutral-300 active:bg-white/20">
            <X size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-white">Anota tu sesión</p>
            <p className="text-xs text-neutral-400">Todo viene como estaba previsto. Toca solo lo que fue distinto.</p>
          </div>
        </div>

        {others.length > 0 && (
          <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-neutral-400" data-testid="log-others">
            Hecho como estaba previsto: {others.map((b) => getMovementById(b.movementId)?.name ?? b.movementId).slice(0, 4).join(', ')}
            {others.length > 4 ? '…' : ''}. Si algo no se hizo, díselo en «Qué has hecho».
          </p>
        )}

        {lifts.map((l) => (
          <LiftEditor key={l.plan.mid} plan={l.plan} entry={l.entry} edit={edits[l.plan.mid]} onChange={(next) => setEdits((prev) => ({ ...prev, [l.plan.mid]: next }))} />
        ))}

        {closePanel}

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pb-2 text-xs">
          <button onClick={onOtherThing} className="flex items-center gap-1.5 font-semibold text-neutral-400 underline decoration-dotted" data-testid="log-other">
            <NotebookPen size={13} /> Hice otra cosa
          </button>
          <button onClick={onSwitchToCards} className="flex items-center gap-1.5 font-semibold text-neutral-400 underline decoration-dotted" data-testid="log-to-cards">
            <Layers size={13} /> Ir serie a serie
          </button>
        </div>
      </div>
    </div>
  );
}
