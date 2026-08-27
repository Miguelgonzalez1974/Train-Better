import { useMemo, useState } from 'react';
import { CalendarCheck, BadgeCheck, Gauge, CalendarRange, CalendarPlus, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { getMonthlyStats } from './stats';
import { computeWeakPoints, computePrTrends, type PrTrendDirection } from '../../engine/weakPoints';
import { toLocalIsoDate } from '../../engine/periodization';
import { buildStructureRow, buildGoalRows } from './progressOverview';
import { AcwrGauge } from './AcwrGauge';
import { WeakPointsCard } from './WeakPointsCard';
import { TrainingHeatmap } from './TrainingHeatmap';
import { NextWeekPreview } from './NextWeekPreview';
import { BodyweightCard } from './BodyweightCard';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { ProgressOverviewCard } from './ProgressOverviewCard';
import { AttentionBanner, buildAttentionItems } from './AttentionBanner';
import { ImbalancesCard } from './ImbalancesCard';
import { computeImbalances } from '../../engine/imbalances';

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
    <div className="flex flex-col rounded-xl border border-brand-orange/25 bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-3.5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-orange/20 text-brand-orange">
          <Icon size={16} strokeWidth={2.25} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-gold">Este mes</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-bold leading-none tracking-tight text-white">{value}</span>
        <span className="text-xs text-neutral-400">días entrenados</span>
      </div>
      {annualValue && (
        <div className="mt-2 flex items-baseline gap-1.5 border-t border-white/5 pt-2">
          <span className="text-[13px] font-bold text-brand-gold">{annualValue}</span>
          <span className="text-[11px] text-neutral-500">días este año</span>
        </div>
      )}
    </div>
  );
}

const RPE_TREND_ICON: Record<PrTrendDirection, typeof TrendingUp> = {
  subida: TrendingUp,
  bajada: TrendingDown,
  estable: Minus,
};

/** Tarjeta compacta secundaria: icono + numero en linea, sin competir con la protagonista. Admite una linea de comparacion opcional (p.ej. RPE del mes frente al de la semana). */
function CompactMetricCard({
  icon: Icon,
  label,
  value,
  comparisonLabel,
  comparisonTrend,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  comparisonLabel?: string;
  comparisonTrend?: PrTrendDirection;
}) {
  const TrendIcon = comparisonTrend ? RPE_TREND_ICON[comparisonTrend] : null;
  return (
    <div className="card flex flex-1 items-center gap-2.5 p-2.5 transition-transform duration-200 hover:-translate-y-0.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-orange/15 text-brand-orange">
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <div className="flex-1">
        <p className="text-[10px] text-neutral-400">{label}</p>
        <p className="text-base font-bold leading-tight text-white">{value}</p>
        {comparisonLabel && (
          <div className="mt-0.5 flex items-center gap-1">
            {TrendIcon && <TrendIcon size={10} strokeWidth={2.75} className="text-neutral-500" />}
            <p className="text-[10px] text-neutral-500">{comparisonLabel}</p>
          </div>
        )}
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
  const acwrTrend = useMemo(() => getAcwrTrend(history), [history]);
  const weakPoints = useMemo(() => computeWeakPoints(history), [history]);
  const prTrends = useMemo(() => computePrTrends(history), [history]);
  const rpeTrend = useMemo(() => {
    if (stats.rpeMedio === null || stats.rpeMedioSemana === null) return null;
    const month = Math.round(stats.rpeMedio * 10) / 10;
    const week = Math.round(stats.rpeMedioSemana * 10) / 10;
    const direction: PrTrendDirection = week > month ? 'subida' : week < month ? 'bajada' : 'estable';
    return { direction, label: `Semana: ${week.toFixed(1)}` };
  }, [stats.rpeMedio, stats.rpeMedioSemana]);
  const todayIso = toLocalIsoDate(new Date());
  const structureRow = useMemo(() => buildStructureRow(profile, todayIso), [profile, todayIso]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history), [profile.goals, history]);
  const attentionItems = useMemo(() => buildAttentionItems(acwr, weakPoints), [acwr, weakPoints]);
  const imbalanceGroups = useMemo(() => computeImbalances(profile.prs, profile.variantPrs, history), [profile.prs, profile.variantPrs, history]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-400 capitalize">{MONTH_LABEL}</p>
          <p className="text-lg font-semibold text-white">Resumen</p>
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

      <AttentionBanner items={attentionItems} />

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
          <CompactMetricCard
            icon={Gauge}
            label="RPE medio"
            value={stats.rpeMedio !== null ? stats.rpeMedio.toFixed(1) : '—'}
            comparisonLabel={rpeTrend?.label}
            comparisonTrend={rpeTrend?.direction}
          />
        </div>
      </div>

      {/*
        Progreso + Desequilibrios emparejados: ninguna de las dos es una tarjeta de referencia
        estatica, ambas resumen "como vas" desde un angulo distinto (tiempo/objetivos vs equilibrio
        entre levantamientos) — emparejarlas evita que Desequilibrios (colapsada por defecto) anada
        una fila propia a ancho completo.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProgressOverviewCard structureRow={structureRow} goalRows={goalRows} />
        <ImbalancesCard groups={imbalanceGroups} />
      </div>

      {/*
        Grid de 2 columnas en pantallas medianas+ (1 sola en movil): PRs y Peso corporal emparejados
        a la misma anchura (ambos son cifras que el atleta sigue dia a dia), y Constancia emparejada
        con el bloque ACWR+Puntos debiles apilado en una sola columna — ambas son senales de
        fatiga/riesgo que se leen mejor una debajo de la otra que una al lado de la otra. Sin
        items-start: cada pareja tiene alturas de contenido distintas (PRs lleva una fila extra de
        Totales que Peso corporal no tiene; el bloque ACWR+Puntos debiles a veces supera a
        Constancia) y con align-items por defecto (stretch) la tarjeta mas corta de cada fila
        estira su propio fondo/borde hasta igualar a la mas alta, en vez de dejar un hueco vacio
        debajo que se lee como un fallo de alineacion.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PersonalRecordsCard prs={profile.prs} trends={prTrends} />

        <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} />

        <TrainingHeatmap
          history={history}
          trainingDaysPerWeek={profile.trainingDaysPerWeek}
          macrocycles={profile.macrocycles}
        />

        <div className="flex flex-col gap-3">
          <AcwrGauge result={acwr} trend={acwrTrend} />
          <WeakPointsCard points={weakPoints} />
        </div>
      </div>
    </div>
  );
}
