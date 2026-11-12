import { useMemo } from 'react';
import { Dumbbell } from 'lucide-react';
import type { CompanionLogEntry, DailySession, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { summarizeCompanionEntry } from '../../engine/companionSummary';
import { Modal } from '../shell/Modal';
import { buildRecapLines } from '../planificacion/SessionSummaryCard';

const nameOf = (id: string) => getMovementById(id)?.name ?? id;

const pill = 'rounded-md bg-white/5 px-2 py-0.5 text-xs font-semibold text-neutral-400';

/**
 * «Lo que hiciste» de un día: la sesión del macro (los bloques con sus cargas y el resultado del WOD) y, debajo, la sesión del programa de
 * fuerza que convive con el macro, si la hubo. Se abre desde la fila «Sesión completada» del Dashboard, de hoy o de un día pasado. Si la
 * sesión ya no está guardada (solo se recuerdan las últimas semanas), enseña los movimientos que quedan en el historial.
 */
export function DaySummaryModal({
  open,
  onClose,
  dayLabel,
  entry,
  session,
  workLog,
  companion,
  methodOf,
  onOpenPlan,
}: {
  open: boolean;
  onClose: () => void;
  dayLabel: string;
  entry: SessionHistoryEntry | undefined;
  session: DailySession | null;
  workLog: WorkSetEntry[];
  companion: CompanionLogEntry[];
  /** El nombre del método de un programa («Texas Method»), si se conoce: se enseña junto al título de la sección. */
  methodOf?: (programId: string) => string | null;
  /** Ir a Planificación (solo hoy). */
  onOpenPlan?: () => void;
}) {
  const recap = useMemo(() => {
    if (!entry) return [];
    if (session) return buildRecapLines(session, entry, workLog);
    const names = [...new Set(entry.movementIds.map(nameOf))].slice(0, 8);
    return names.length > 0 ? [{ label: 'Hecho', detail: names.join(' · ') }] : [];
  }, [entry, session, workLog]);
  const programs = useMemo(() => companion.map((c) => summarizeCompanionEntry(c, nameOf)), [companion]);
  const methods = [...new Set(companion.map((c) => methodOf?.(c.programId)).filter((m): m is string => Boolean(m)))];

  return (
    <Modal open={open} onClose={onClose} title={`Lo que hiciste · ${dayLabel}`}>
      <div className="flex flex-col gap-4">
        {entry && (
          <section aria-label="Sesión del macro" className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Sesión del macro</p>
              <span className={pill}>{entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}</span>
              <span className={pill}>RPE {entry.rpe}</span>
              <span className={pill}>{entry.durationMin} min</span>
            </div>
            {recap.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {recap.map((line) => (
                  <div key={`${line.label}-${line.detail}`} className="flex items-baseline gap-2 text-sm">
                    <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">{line.label}</span>
                    <span className="text-neutral-200">{line.detail}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No queda guardado el detalle de esta sesión.</p>
            )}
          </section>
        )}

        {programs.length > 0 && (
          <section aria-label="Programa de fuerza" className={`flex flex-col gap-2.5 ${entry ? 'border-t border-white/[0.06] pt-4' : ''}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              <Dumbbell size={13} aria-hidden="true" /> Programa de fuerza{methods.length > 0 ? ` · ${methods.join(', ')}` : ''}
            </p>
            {programs.map((p, i) => (
              <div key={`${p.title}-${i}`} className="rounded-lg bg-white/[0.04] px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{p.title}</p>
                  {p.outcome === 'saltada' ? <span className={pill}>Saltada</span> : p.stats && <span className="text-xs text-neutral-400">{p.stats}</span>}
                </div>
                {p.lines.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-1 text-sm text-neutral-300">
                    {p.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {!entry && programs.length === 0 && <p className="text-sm text-neutral-500">No hay nada registrado este día.</p>}

        {onOpenPlan && (
          <button onClick={onOpenPlan} className="self-start rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/5">
            Ver en Planificación
          </button>
        )}
      </div>
    </Modal>
  );
}
