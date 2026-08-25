import { useMemo, useState } from 'react';
import { CalendarCheck, BadgeCheck, Gauge, CalendarRange, CalendarPlus, ArrowRight } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr } from '../../engine/loadMetrics';
import { getMonthlyStats } from './stats';
import { computeWeakPoints, computePrTrends } from '../../engine/weakPoints';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { buildMacroPlan } from '../../engine/macroPlan';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { AcwrGauge } from './AcwrGauge';
import { WeakPointsCard } from './WeakPointsCard';
import { TrainingHeatmap } from './TrainingHeatmap';
import { NextWeekPreview } from './NextWeekPreview';
import { BodyweightCard } from './BodyweightCard';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { GoalsProgressCard } from './GoalsProgressCard';

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

/** Tarjeta protagonista del mes: numero grande + dato anual como contexto secundario debajo. */
function HeroMetricCard({
  icon: Icon,
  value,
  annualValue,
}: {
  icon: typeof CalendarCheck;
  value: string;
  annualValue: string | null;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-brand-orange/25 bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-orange/20 text-brand-orange">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-gold">Este mes</p>
      </div>
      <p className="text-[34px] font-bold leading-none tracking-tight text-white">{value}</p>
      <p className="mt-1.5 text-xs text-neutral-400">días entrenados</p>
      {annualValue && (
        <div className="mt-2.5 flex items-baseline gap-1.5 border-t border-white/5 pt-2.5">
          <span className="text-[15px] font-bold text-brand-gold">{annualValue}</span>
          <span className="text-[11px] text-neutral-500">días este año</span>
        </div>
      )}
    </div>
  );
}

/** Tarjeta compacta secundaria: icono + numero en linea, sin competir con la protagonista. */
function CompactMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex flex-1 items-center gap-2.5 p-2.5 transition-transform duration-200 hover:-translate-y-0.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-orange/15 text-brand-orange">
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <div className="flex-1">
        <p className="text-[10px] text-neutral-400">{label}</p>
        <p className="text-base font-bold leading-tight text-white">{value}</p>
      </div>
    </div>
  );
}

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
}

export function Dashboard({ onNavigateToPlanificacion }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  const [profile] = useState(() => athleteRepository.getProfile());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showNextWeek, setShowNextWeek] = useState(false);
  const stats = useMemo(() => getMonthlyStats(history, profile.trainingDatesLog ?? []), [history, profile.trainingDatesLog]);
  const acwr = useMemo(() => computeAcwr(history), [history]);
  const weakPoints = useMemo(() => computeWeakPoints(history), [history]);
  const prTrends = useMemo(() => computePrTrends(history), [history]);
  const macroPlan = useMemo(() => {
    const active = getActiveMacrocycle(profile.macrocycles, toLocalIsoDate(new Date()));
    return active ? buildMacroPlan(active, profile.prs) : null;
  }, [profile.macrocycles, profile.prs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-400 capitalize">{MONTH_LABEL}</p>
          <p className="text-lg font-semibold text-white">Tu progreso</p>
          {macroPlan && (
            <p className="mt-0.5 text-xs font-medium text-brand-gold">
              Semana {macroPlan.currentWeek} de {macroPlan.totalWeeks} · {MESOCYCLE_PHASE[macroPlan.currentPhaseIndex]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNextWeek(true)}
            title="Programar próxima semana"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <CalendarPlus size={17} strokeWidth={2.25} />
          </button>
          <button
            onClick={onNavigateToPlanificacion}
            className="flex items-center gap-2 rounded-lg bg-brand-orange px-3.5 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
          >
            <CalendarRange size={16} strokeWidth={2.25} />
            Entrenamiento de hoy
            <ArrowRight size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {showNextWeek && <NextWeekPreview onClose={() => setShowNextWeek(false)} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
        <HeroMetricCard
          icon={CalendarCheck}
          value={String(stats.diasEntrenados)}
          annualValue={stats.diasEsteAnio > 0 ? String(stats.diasEsteAnio) : null}
        />
        <div className="flex flex-col gap-2.5">
          <CompactMetricCard
            icon={BadgeCheck}
            label="Días Rx"
            value={stats.diasEntrenados > 0 ? `${stats.diasRx} / ${stats.diasEntrenados}` : '—'}
          />
          <CompactMetricCard icon={Gauge} label="RPE medio" value={stats.rpeMedio !== null ? stats.rpeMedio.toFixed(1) : '—'} />
        </div>
      </div>

      <GoalsProgressCard goals={profile.goals} history={history} />

      <PersonalRecordsCard prs={profile.prs} trends={prTrends} />

      <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} />

      <TrainingHeatmap
        history={history}
        trainingDaysPerWeek={profile.trainingDaysPerWeek}
        macrocycles={profile.macrocycles}
      />

      <AcwrGauge result={acwr} />

      <WeakPointsCard points={weakPoints} />
    </div>
  );
}
