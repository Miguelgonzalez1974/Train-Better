import { useMemo, useState } from 'react';
import { CalendarCheck, BadgeCheck, Gauge, CalendarRange, ArrowRight } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr } from '../../engine/loadMetrics';
import { getMonthlyStats } from './stats';
import { computeWeakPoints } from './weakPoints';
import { AcwrGauge } from './AcwrGauge';
import { WeakPointsCard } from './WeakPointsCard';
import { TrainingHeatmap } from './TrainingHeatmap';

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex flex-col gap-2 p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-xs text-neutral-400">{label}</p>
    </div>
  );
}

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
}

export function Dashboard({ onNavigateToPlanificacion }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  const [profile] = useState(() => athleteRepository.getProfile());
  const stats = useMemo(() => getMonthlyStats(history), [history]);
  const acwr = useMemo(() => computeAcwr(history), [history]);
  const weakPoints = useMemo(() => computeWeakPoints(history), [history]);
  const recent = useMemo(() => [...history].reverse().slice(0, 5), [history]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400 capitalize">{MONTH_LABEL}</p>
          <p className="text-lg font-semibold text-white">Tu progreso</p>
        </div>
        <button
          onClick={onNavigateToPlanificacion}
          className="flex items-center gap-2 rounded-lg bg-brand-orange px-3.5 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
        >
          <CalendarRange size={16} strokeWidth={2.25} />
          Entrenamiento de hoy
          <ArrowRight size={16} strokeWidth={2.25} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard icon={CalendarCheck} label="Días entrenados este mes" value={String(stats.diasEntrenados)} />
        <MetricCard
          icon={BadgeCheck}
          label="Días Rx"
          value={stats.diasEntrenados > 0 ? `${stats.diasRx} / ${stats.diasEntrenados}` : '—'}
        />
        <MetricCard icon={Gauge} label="RPE medio" value={stats.rpeMedio !== null ? stats.rpeMedio.toFixed(1) : '—'} />
      </div>

      <TrainingHeatmap history={history} trainingDaysPerWeek={profile.trainingDaysPerWeek} />

      <AcwrGauge result={acwr} />

      <WeakPointsCard points={weakPoints} />

      <section className="card p-4">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Últimas sesiones</p>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no has completado ninguna sesión.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((entry) => (
              <div
                key={entry.date}
                className="flex items-center justify-between rounded-xl bg-brand-surfaceMuted/80 px-3 py-2 text-sm transition-colors duration-200 hover:bg-brand-surfaceMuted"
              >
                <span className="text-neutral-300">{entry.date}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                      entry.rxOrScaled === 'rx' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/10 text-neutral-300'
                    }`}
                  >
                    {entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}
                  </span>
                  <span className="text-neutral-500">RPE {entry.rpe}</span>
                  {entry.wodResult && (
                    <span className="rounded-md bg-brand-orange/15 px-2 py-0.5 text-xs font-semibold text-brand-orange">
                      WOD: {entry.wodResult.value}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
