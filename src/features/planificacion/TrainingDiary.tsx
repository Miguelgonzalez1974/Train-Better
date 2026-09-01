import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { SessionHistoryEntry } from '../../data/athlete/types';
import { resolveMovementDisplayName } from '../../data/movements';
import { getWeekdayIndex } from '../../engine/periodization';
import { getMonthlyStats } from '../dashboard/stats';
import { Modal } from '../shell/Modal';

interface TrainingDiaryProps {
  history: SessionHistoryEntry[];
  trainingDatesLog: string[];
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

function DiaryRow({ entry, onDelete }: { entry: SessionHistoryEntry; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const date = parseIso(entry.date);
  const names = movementSummary(entry);
  const preview = names.slice(0, 4).join(' · ') + (names.length > 4 ? ` +${names.length - 4}` : '');

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
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                entry.rxOrScaled === 'rx' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/10 text-neutral-300'
              }`}
            >
              {entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}
            </span>
            <span className="text-[11px] text-neutral-500">RPE {entry.rpe}</span>
            {entry.wodResult && (
              <span className="rounded-md bg-brand-orange/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-orange">
                {entry.wodResult.value}
              </span>
            )}
          </div>
          {!open && <p className="mt-1 truncate text-xs text-neutral-500">{preview}</p>}
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-white/5 px-3 pb-3 pt-2.5 pl-[38px]">
          {names.length > 0 && <p className="text-xs leading-relaxed text-neutral-300">{names.join(' · ')}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
            {entry.mesocycleWeek > 0 && <span>Semana {entry.mesocycleWeek} de mesociclo</span>}
            <span>{entry.durationMin} min</span>
            {entry.energySystem && <span>{ENERGY_LABEL[entry.energySystem]}</span>}
            {entry.testLoadKg != null && entry.testLoadKg > 0 && <span>Test: {entry.testLoadKg} kg</span>}
          </div>
          <button
            onClick={() => {
              if (window.confirm(`¿Borrar la sesión del ${entry.date}? Esto no se puede deshacer.`)) onDelete();
            }}
            className="flex items-center gap-1.5 self-start rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 transition-colors duration-200 hover:border-red-500/60 hover:bg-red-500/20"
          >
            <Trash2 size={12} />
            Borrar
          </button>
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
export function TrainingDiary({ history, trainingDatesLog, onDeleteEntry, onClose }: TrainingDiaryProps) {
  const stats = useMemo(() => getMonthlyStats(history, trainingDatesLog), [history, trainingDatesLog]);

  const weeks = useMemo(() => {
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const groups: { monday: string; entries: SessionHistoryEntry[] }[] = [];
    for (const entry of sorted) {
      const monday = weekMondayIso(entry.date);
      const last = groups[groups.length - 1];
      if (last && last.monday === monday) last.entries.push(entry);
      else groups.push({ monday, entries: [entry] });
    }
    return groups;
  }, [history]);

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
            <p className="mt-1 text-[10px] text-neutral-500">{s.label}</p>
          </div>
        ))}
      </div>
      {rxPct != null && <p className="mb-3 text-[11px] text-neutral-500">{rxPct}% de las sesiones de este mes a Rx.</p>}

      {weeks.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">Aún no has registrado ninguna sesión.</p>
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
              {week.entries.map((entry) => (
                <DiaryRow key={entry.date} entry={entry} onDelete={() => onDeleteEntry(entry.date)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
