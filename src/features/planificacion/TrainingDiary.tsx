import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Dumbbell, NotebookPen, Trash2 } from 'lucide-react';
import type { CompanionLogEntry, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { resolveMovementDisplayName } from '../../data/movements';
import { summarizeCompanionEntry, type CompanionSummary } from '../../engine/companionSummary';
import { getWeekdayIndex } from '../../engine/periodization';
import { wodResultsOf } from '../../engine/wodScoring';
import { describeSkipped } from '../../engine/sessionParts';
import { getMonthlyStats } from '../dashboard/stats';
import { Modal } from '../shell/Modal';
import { EmptyState } from '../shell/EmptyState';

interface TrainingDiaryProps {
  history: SessionHistoryEntry[];
  workLog: WorkSetEntry[];
  trainingDatesLog: string[];
  /** Sesiones del programa de fuerza que convive con el macro (hechas o saltadas). */
  companionLog?: CompanionLogEntry[];
  onDeleteEntry: (date: string) => void;
  onClose: () => void;
}

const ENERGY_LABEL: Record<NonNullable<SessionHistoryEntry['energySystem']>, string> = {
  'base-aerobica': 'Base aeróbica',
  umbral: 'Umbral',
  potencia: 'Potencia',
  recuperacion: 'Recuperación',
};

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Lunes (yyyy-mm-dd) de la semana de calendario que contiene `iso`. */
function weekMondayIso(iso: string): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() - getWeekdayIndex(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const weekdayFmt = new Intl.DateTimeFormat('es', { weekday: 'short' });
const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const weekHeaderFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' });

function movementSummary(entry: SessionHistoryEntry): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const id of entry.movementIds) {
    const name = resolveMovementDisplayName(id);
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Un día del diario: la sesión del macro (si la hubo) y las del programa de fuerza que convive con él. */
interface DiaryDay {
  date: string;
  entry?: SessionHistoryEntry;
  programs: CompanionSummary[];
}

const nameOf = (id: string) => resolveMovementDisplayName(id);

function DiaryRow({ day, sets, onDelete }: { day: DiaryDay; sets: WorkSetEntry[]; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const { entry, programs } = day;
  const date = parseIso(day.date);
  const names = entry ? movementSummary(entry) : [];
  const programDone = programs.filter((p) => p.outcome === 'hecha');
  const previewNames = names.length > 0 ? names : programDone.map((p) => p.title);
  const preview = previewNames.slice(0, 4).join(' · ') + (previewNames.length > 4 ? ` +${previewNames.length - 4}` : '') + (entry && programDone.length > 0 ? ' · + programa de fuerza' : '');

  // Series registradas agrupadas por movimiento (registro serie a serie del modo enfocado).
  const setsByMovement = new Map<string, WorkSetEntry[]>();
  for (const s of [...sets].sort((a, b) => a.setNumber - b.setNumber)) {
    const arr = setsByMovement.get(s.movementId) ?? [];
    arr.push(s);
    setsByMovement.set(s.movementId, arr);
  }

  return (
    <div className="rounded-xl bg-brand-surfaceMuted/60">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2.5 p-3 text-left">
        {open ? (
          <ChevronDown size={15} className="mt-0.5 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-neutral-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold capitalize text-white">
              {weekdayFmt.format(date)} {dayFmt.format(date)}
            </span>
            {entry ? (
              <>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                    entry.rxOrScaled === 'rx' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/10 text-neutral-300'
                  }`}
                >
                  {entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}
                </span>
                <span className="text-[11px] text-neutral-500">RPE {entry.rpe}</span>
                {wodResultsOf(entry).map(({ part, result }) => (
                  <span key={part} className="rounded-md bg-brand-orange/15 px-1.5 py-0.5 text-[11px] font-semibold text-brand-orange">
                    {entry.wodResult2 ? `P${part} ` : ''}
                    {result.value}
                  </span>
                ))}
              </>
            ) : (
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-300">Solo programa de fuerza</span>
            )}
          </div>
          {!open && <p className="mt-1 truncate text-xs text-neutral-500">{preview}</p>}
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-white/5 px-3 pb-3 pt-2.5 pl-[38px]">
          {names.length > 0 && <p className="text-xs leading-relaxed text-neutral-300">{names.join(' · ')}</p>}
          {entry && describeSkipped(entry.skipped) && <p className="text-xs font-semibold text-warn">{describeSkipped(entry.skipped)}</p>}
          {setsByMovement.size > 0 && (
            <div className="flex flex-col gap-1">
              {[...setsByMovement.entries()].map(([movementId, ms]) => (
                <p key={movementId} className="text-[11px] text-neutral-400">
                  <span className="text-neutral-300">{resolveMovementDisplayName(movementId)}:</span>{' '}
                  {ms.map((s) => (s.kg > 0 ? `${s.kg}` : '·')).join(' · ')} kg
                  <span className="text-neutral-600"> ({ms.length} series)</span>
                </p>
              ))}
            </div>
          )}
          {entry && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
              {entry.mesocycleWeek > 0 && <span>Semana {entry.mesocycleWeek} de mesociclo</span>}
              <span>{entry.durationMin} min</span>
              {entry.energySystem && <span>{ENERGY_LABEL[entry.energySystem]}</span>}
              {entry.testLoadKg != null && entry.testLoadKg > 0 && <span>Test: {entry.testLoadKg} kg</span>}
            </div>
          )}
          {programs.length > 0 && (
            <div className={`flex flex-col gap-1.5 ${entry ? 'border-t border-white/5 pt-2.5' : ''}`}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <Dumbbell size={12} aria-hidden="true" /> Programa de fuerza
              </p>
              {programs.map((p, i) => (
                <div key={`${p.title}-${i}`} className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{p.title}</p>
                    {p.outcome === 'saltada' ? <span className="text-[11px] text-neutral-500">Saltada</span> : p.stats && <span className="text-[11px] text-neutral-400">{p.stats}</span>}
                  </div>
                  {p.lines.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-300">
                      {p.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {entry && (
            <button
              onClick={() => {
                if (window.confirm(`¿Borrar la sesión del ${entry.date}? Esto no se puede deshacer.`)) onDelete();
              }}
              className="flex items-center gap-1.5 self-start rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-1 text-[11px] font-semibold text-bad transition-colors duration-200 hover:border-bad/60 hover:bg-bad/20"
            >
              <Trash2 size={12} />
              Borrar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Diario de entrenamiento — el historial completo (hasta el tope de `HISTORY_LIMIT` que se
 * sincroniza) como lista navegable en vez de una semana cada vez. Agrupado por semana de
 * calendario, cada sesión se despliega para ver movimientos, dominio energético y duración.
 * Modal, mismo patrón que `NextWeekPreview` / `MacroPlanModal`.
 */
export function TrainingDiary({ history, workLog, trainingDatesLog, companionLog = [], onDeleteEntry, onClose }: TrainingDiaryProps) {
  const stats = useMemo(() => getMonthlyStats(history, trainingDatesLog), [history, trainingDatesLog]);
  const setsByDate = useMemo(() => {
    const map = new Map<string, WorkSetEntry[]>();
    for (const e of workLog) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [workLog]);

  const weeks = useMemo(() => {
    // Un día por fecha: la sesión del macro y/o lo que se hizo (o se saltó) del programa de fuerza ese día.
    const days = new Map<string, DiaryDay>();
    for (const entry of history) days.set(entry.date, { date: entry.date, entry, programs: [] });
    for (const c of [...companionLog].sort((a, b) => a.index - b.index)) {
      const day = days.get(c.date) ?? { date: c.date, programs: [] };
      day.programs.push(summarizeCompanionEntry(c, nameOf));
      days.set(c.date, day);
    }
    const sorted = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
    const groups: { monday: string; entries: DiaryDay[] }[] = [];
    for (const day of sorted) {
      const monday = weekMondayIso(day.date);
      const last = groups[groups.length - 1];
      if (last && last.monday === monday) last.entries.push(day);
      else groups.push({ monday, entries: [day] });
    }
    return groups;
  }, [history, companionLog]);

  const rxPct = stats.diasEntrenados > 0 ? Math.round((stats.diasRx / stats.diasEntrenados) * 100) : null;

  return (
    <Modal open onClose={onClose} title="Diario de entrenamiento">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Registradas', value: String(stats.totalSesiones) },
          { label: 'Este mes', value: String(stats.diasEntrenados) },
          { label: 'RPE medio', value: stats.rpeMedio != null ? stats.rpeMedio.toFixed(1) : '—' },
          { label: 'Días este año', value: String(stats.diasEsteAnio) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-brand-surfaceMuted/80 px-3 py-2">
            <p className="text-lg font-bold leading-none text-white">{s.value}</p>
            <p className="mt-1 text-[11px] text-neutral-500">{s.label}</p>
          </div>
        ))}
      </div>
      {rxPct != null && <p className="mb-3 text-[11px] text-neutral-500">{rxPct}% de las sesiones de este mes a Rx.</p>}

      {weeks.length === 0 ? (
        <EmptyState
          Icon={NotebookPen}
          title="Sin sesiones todavía"
          description="En cuanto completes tu primer entreno desde Planificación, aparecerá aquí — agrupado por semana, con series, dominio energético y duración."
        />
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {weeks.map((week) => (
            <div key={week.monday} className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Semana del {weekHeaderFmt.format(parseIso(week.monday))}
                <span className="ml-1.5 font-normal normal-case text-neutral-600">
                  · {week.entries.length} {week.entries.length === 1 ? 'sesión' : 'sesiones'}
                </span>
              </p>
              {week.entries.map((day) => (
                <DiaryRow
                  key={day.date}
                  day={day}
                  sets={setsByDate.get(day.date) ?? []}
                  onDelete={() => onDeleteEntry(day.date)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
