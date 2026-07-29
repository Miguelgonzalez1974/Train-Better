import { CalendarDays } from 'lucide-react';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import type { SessionHistoryEntry } from '../../data/athlete/types';

const WEEKS = 12;
/** RPE por debajo de este umbral se trata como recuperacion activa, no como entreno "duro". */
const RECOVERY_RPE_THRESHOLD = 3;

type CellKind = 'future' | 'rest' | 'trained' | 'recovery' | 'missed' | 'offSeason';

interface DayCell {
  iso: string;
  rpe: number | null;
  kind: CellKind;
}

function trainedBucketClass(rpe: number): string {
  if (rpe <= 6) return 'bg-brand-orange/40';
  if (rpe <= 8) return 'bg-brand-orange/70';
  return 'bg-brand-orange';
}

const CELL_CLASS: Record<Exclude<CellKind, 'trained' | 'future'>, string> = {
  rest: 'bg-sky-500/15',
  recovery: 'bg-emerald-500/50',
  missed: 'border border-red-500/40 bg-transparent',
  offSeason: 'bg-white/[0.04]',
};

const KIND_TITLE: Record<CellKind, string> = {
  future: '',
  rest: 'Descanso programado',
  recovery: 'Recuperación activa',
  trained: 'Entrenamiento',
  missed: 'Día de entreno no registrado',
  offSeason: 'Fase de mantenimiento (fuera del macrociclo) — entreno ligero opcional',
};

interface TrainingHeatmapProps {
  history: SessionHistoryEntry[];
  trainingDaysPerWeek: 3 | 4 | 5 | 6;
  mesocycleStartDate: string;
}

export function TrainingHeatmap({ history, trainingDaysPerWeek, mesocycleStartDate }: TrainingHeatmapProps) {
  const today = new Date();
  const todayIso = toLocalIsoDate(today);
  const currentMonday = new Date(today);
  currentMonday.setDate(currentMonday.getDate() - getWeekdayIndex(today));

  const startMonday = new Date(currentMonday);
  startMonday.setDate(startMonday.getDate() - (WEEKS - 1) * 7);

  const historyByDate = new Map(history.map((h) => [h.date, h]));

  const columns: DayCell[][] = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(startMonday);
      date.setDate(date.getDate() + w * 7 + d);
      const iso = toLocalIsoDate(date);

      if (iso > todayIso) return { iso, rpe: null, kind: 'future' as CellKind };

      const entry = historyByDate.get(iso);
      if (entry) {
        const kind: CellKind = entry.rpe <= RECOVERY_RPE_THRESHOLD ? 'recovery' : 'trained';
        return { iso, rpe: entry.rpe, kind };
      }

      if (iso < mesocycleStartDate) return { iso, rpe: null, kind: 'offSeason' as CellKind };

      const isTrainingDay = getDayPlan(d, trainingDaysPerWeek).isTrainingDay;
      return { iso, rpe: null, kind: isTrainingDay ? ('missed' as CellKind) : ('rest' as CellKind) };
    }),
  );

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
          <CalendarDays size={18} strokeWidth={2.25} />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white">Constancia</p>
          <p className="text-xs text-neutral-500">Últimas {WEEKS} semanas</p>
        </div>
      </div>

      <div className="mt-4 flex gap-[3px] overflow-x-auto pb-1">
        {columns.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.iso}
                title={cell.kind === 'future' ? undefined : `${cell.iso} · ${KIND_TITLE[cell.kind]}${cell.rpe !== null ? ` (RPE ${cell.rpe})` : ''}`}
                className={`h-3 w-3 rounded-sm transition-transform duration-150 hover:scale-125 ${
                  cell.kind === 'future'
                    ? 'bg-transparent'
                    : cell.kind === 'trained'
                      ? trainedBucketClass(cell.rpe!)
                      : CELL_CLASS[cell.kind]
                }`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-sky-500/15" /> Descanso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-500/50" /> Recuperación
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-red-500/40" /> No registrado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-white/[0.04]" /> Mantenimiento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand-orange/40" />
          <span className="h-3 w-3 rounded-sm bg-brand-orange/70" />
          <span className="h-3 w-3 rounded-sm bg-brand-orange" /> Entreno (según esfuerzo)
        </span>
      </div>
    </section>
  );
}
