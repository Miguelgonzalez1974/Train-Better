import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  BadgeCheck,
  Gauge,
  CalendarRange,
  BarChart3,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  LayoutList,
  Brain,
} from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { getMonthlyStats } from './stats';
import { computeWeakPoints, computePrTrends, type PrTrendDirection } from '../../engine/weakPoints';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { buildStructureRow, buildGoalRows } from './progressOverview';
import { AcwrGauge } from './AcwrGauge';
import { WeakPointsCard } from './WeakPointsCard';
import { TrainingHeatmap } from './TrainingHeatmap';
import { VolumeSummaryModal } from './VolumeSummaryModal';
import { BodyweightCard } from './BodyweightCard';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { ProgressOverviewCard } from './ProgressOverviewCard';
import { AttentionBanner, buildAttentionItems } from './AttentionBanner';
import { ThemeToggle } from '../shell/ThemeToggle';
import { ImbalancesCard } from './ImbalancesCard';
import { computeImbalances } from '../../engine/imbalances';
import { ResponseProfileCard } from './ResponseProfileCard';
import { EnergyDomainsCard } from './EnergyDomainsCard';

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

const RPE_TREND_ICON: Record<PrTrendDirection, typeof TrendingUp> = {
  subida: TrendingUp,
  bajada: TrendingDown,
  estable: Minus,
};

/**
 * Constancia del mes, adherencia Rx y esfuerzo medio en una sola tarjeta de 3 cifras — antes eran
 * 3 tarjetas separadas ("Este mes" + 2 compactas) que en móvil se apilaban una debajo de otra sin
 * aportar más que esto: un borde en vez de tres, mismo contenido.
 */
function MonthSummaryCard({
  diasEntrenados,
  diasEsteAnio,
  diasRxLabel,
  rpeLabel,
  rpeTrend,
}: {
  diasEntrenados: string;
  diasEsteAnio: string | null;
  diasRxLabel: string;
  rpeLabel: string;
  rpeTrend: { direction: PrTrendDirection; label: string } | null;
}) {
  const RpeTrendIcon = rpeTrend ? RPE_TREND_ICON[rpeTrend.direction] : null;
  return (
    <div className="card p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-orange/15 text-brand-orange">
          <CalendarCheck size={14} strokeWidth={2.25} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-gold">Este mes</p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/5">
        <div className="pr-2">
          <p className="text-[22px] font-bold leading-none tracking-tight text-white">{diasEntrenados}</p>
          <p className="mt-1 text-[10px] leading-tight text-neutral-400">días entrenados</p>
          {diasEsteAnio && <p className="mt-0.5 text-[10px] font-semibold text-brand-gold">{diasEsteAnio} este año</p>}
        </div>
        <div className="px-2">
          <p className="text-[22px] font-bold leading-none tracking-tight text-white">{diasRxLabel}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-neutral-400">
            <BadgeCheck size={11} strokeWidth={2.5} className="shrink-0" />
            días Rx
          </p>
        </div>
        <div className="pl-2">
          <p className="text-[22px] font-bold leading-none tracking-tight text-white">{rpeLabel}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-neutral-400">
            <Gauge size={11} strokeWidth={2.5} className="shrink-0" />
            RPE medio
          </p>
          {rpeTrend && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
              {RpeTrendIcon && <RpeTrendIcon size={10} strokeWidth={2.75} />}
              {rpeTrend.label}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: () => void;
}

/** Flag booleano recordado por navegador (secciones plegables del Dashboard). */
function usePersistedFlag(key: string): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setValue((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* almacenamiento no disponible — el estado vive solo esta sesión */
      }
      return next;
    });
  return [value, toggle];
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  const [profile] = useState(() => athleteRepository.getProfile());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showVolume, setShowVolume] = useState(false);
  // La sección "Más detalle" arranca plegada — lo esencial (constancia, fase, objetivos, ACWR) queda
  // arriba y el resto (PRs, heatmap, peso, puntos débiles) detrás de un clic. Dentro, el diagnóstico
  // interno del coach (perfil de respuesta, dominios, desequilibrios) vive en su propio plegable.
  const [detailOpen, toggleDetail] = usePersistedFlag('train-better:dashboard-detail-open');
  const [coachOpen, toggleCoach] = usePersistedFlag('train-better:dashboard-coach-open');
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
          <ThemeToggle className="h-10 w-10" />
          <button
            onClick={() => setShowVolume(true)}
            title="Volumen por día"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <BarChart3 size={17} strokeWidth={2.25} />
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

      {showVolume && <VolumeSummaryModal onClose={() => setShowVolume(false)} />}

      <AttentionBanner items={attentionItems} />

      <MonthSummaryCard
        diasEntrenados={String(stats.diasEntrenados)}
        diasEsteAnio={stats.diasEsteAnio > 0 ? String(stats.diasEsteAnio) : null}
        diasRxLabel={stats.diasEntrenados > 0 ? `${stats.diasRx} / ${stats.diasEntrenados}` : '—'}
        rpeLabel={stats.rpeMedio !== null ? stats.rpeMedio.toFixed(1) : '—'}
        rpeTrend={rpeTrend}
      />

      {/*
        Lo esencial, siempre visible: dónde estás en el plan (fase/semana + objetivos) y el estado
        de carga/fatiga. El resto (PRs, constancia, peso, puntos débiles) vive detrás de "Más
        detalle", y el diagnóstico interno del coach, un nivel más abajo — el Dashboard no debe ser
        un muro nada más abrirlo.
      */}
      <ProgressOverviewCard structureRow={structureRow} goalRows={goalRows} onNavigateToObjetivos={onNavigateToObjetivos} />

      <AcwrGauge result={acwr} trend={acwrTrend} />

      <div className="flex flex-col gap-4">
        <button
          onClick={toggleDetail}
          className="flex items-center justify-between rounded-xl border border-brand-border/70 bg-brand-surface/40 px-4 py-3 text-left transition-colors duration-200 hover:border-brand-gold/40"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <LayoutList size={15} strokeWidth={2.25} className="text-neutral-500" />
            {detailOpen ? 'Ocultar detalle' : 'Más detalle'}
          </span>
          <span className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="hidden sm:inline">PRs · constancia · peso · puntos débiles</span>
            {detailOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {detailOpen && (
          <>
            {/*
              Lo que el atleta mira y acciona: PRs, constancia, peso corporal y puntos débiles.
              Emparejadas por altura natural (PRs y constancia son las más altas); items-start para
              no estirar ninguna a la del vecino.
            */}
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <PersonalRecordsCard
                prs={profile.prs}
                trends={prTrends}
                prLog={profile.prLog ?? []}
                macroStartIso={getActiveMacrocycle(profile.macrocycles, todayIso)?.startDate}
              />

              <TrainingHeatmap
                history={history}
                trainingDaysPerWeek={profile.trainingDaysPerWeek}
                macrocycles={profile.macrocycles}
              />
            </div>

            <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} />

            <WeakPointsCard points={weakPoints} />

            {/*
              "Análisis del coach": lo que el motor usa para individualizar, no lo que el atleta
              acciona a diario — perfil de respuesta (RPE fiable / ritmo por lift / recuperación),
              reparto por sistema energético, y desequilibrios entre lifts. En su propio plegable
              para que "Más detalle" no siga siendo un muro. Cada tarjeta ya devuelve null sin datos.
            */}
            <div className="flex flex-col gap-4">
              <button
                onClick={toggleCoach}
                className="flex items-center justify-between rounded-xl border border-brand-border/70 bg-brand-surface/40 px-4 py-3 text-left transition-colors duration-200 hover:border-brand-gold/40"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <Brain size={15} strokeWidth={2.25} className="text-neutral-500" />
                  {coachOpen ? 'Ocultar análisis del coach' : 'Análisis del coach'}
                </span>
                <span className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="hidden sm:inline">perfil de respuesta · dominios · desequilibrios</span>
                  {coachOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {coachOpen && (
                <>
                  <ResponseProfileCard
                    history={history}
                    prLog={profile.prLog ?? []}
                    setFeedbackLog={profile.setFeedbackLog ?? []}
                    bodyweightLog={profile.bodyweightLog ?? []}
                    workLog={profile.workLog ?? []}
                    prs={profile.prs}
                  />
                  <EnergyDomainsCard profile={profile} history={history} />
                  <ImbalancesCard groups={imbalanceGroups} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
