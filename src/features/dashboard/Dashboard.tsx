import { useEffect, useMemo, useRef, useState } from 'react';
import { Apple, BarChart3, ChevronDown, Scale, Target } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeWeekCount } from '../../engine/adherence';
import { computeConditioningBalance } from '../../engine/conditioningBalance';
import { getMonthlyStats } from './stats';
import { computePrTrends } from '../../engine/weakPoints';
import { computeReadinessScore } from '../../engine/readinessScore';
import { computeReadinessLearning } from '../../engine/readinessLearning';
import { buildTrend, dayStrain, recommendedStrain, strainStatus } from '../../engine/strain';
import { StrainCard } from './StrainCard';
import { TrendCard } from './TrendCard';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { buildStructureRow, buildGoalRows } from './progressOverview';
import { MetricsGauges, type GaugeSpec, type GaugeTarget } from './MetricsGauges';
import { TodayPreviewCard } from './TodayPreviewCard';
import { DayRings } from './DayRings';
import { ConsistencyDetail } from './ConsistencyDetail';
import { computeYearConsistency } from '../../engine/yearConsistency';
import { TrainingHeatmap } from './TrainingHeatmap';
import { VolumeSummaryModal } from './VolumeSummaryModal';
import { BodyweightCard } from './BodyweightCard';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { ThemeToggle } from '../shell/ThemeToggle';
import { ImbalancesCard } from './ImbalancesCard';
import { computeImbalances } from '../../engine/imbalances';
import { ResponseProfileCard } from './ResponseProfileCard';
import { EnergyDomainsCard } from './EnergyDomainsCard';
import { Modal } from '../shell/Modal';
import { NutritionModal } from './NutritionModal';

/** Cómo se llama cada zona de carga (ACWR) en las frases del Dashboard. */
const LOAD_WORD = { baja: 'baja', optima: 'óptima', moderada: 'alta', alta: 'muy alta' } as const;

/** Veces el peso corporal (total sentadilla + banca + peso muerto) a las que el arco de "Fuerza" llega lleno. */
const STRENGTH_RATIO_FULL = 7;

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: () => void;
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  const [profile] = useState(() => athleteRepository.getProfile());
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showVolume, setShowVolume] = useState(false);
  const [showBodyweight, setShowBodyweight] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Cada gauge abre (o cierra, si ya estaba abierta) su propia tarjeta de detalle — sin un "Más
  // detalle" intermedio que bucear. El de carga expande el gauge completo de ACWR ahí mismo; el
  // resto revela su tarjeta justo debajo de la fila de gauges.
  const [energyOpen, setEnergyOpen] = useState(false);
  const [imbalancesOpen, setImbalancesOpen] = useState(false);
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<GaugeTarget | null>(null);

  const energyRef = useRef<HTMLDivElement>(null);
  const imbalancesRef = useRef<HTMLDivElement>(null);
  const strengthRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => getMonthlyStats(history, profile.trainingDatesLog ?? []), [history, profile.trainingDatesLog]);
  const acwr = useMemo(() => computeAcwr(history), [history]);
  const acwrTrend = useMemo(() => getAcwrTrend(history), [history]);
  const prTrends = useMemo(() => computePrTrends(history), [history]);
  const todayIso = toLocalIsoDate(new Date());
  const structureRow = useMemo(() => buildStructureRow(profile, todayIso), [profile, todayIso]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history), [profile.goals, history]);
  const imbalanceGroups = useMemo(() => computeImbalances(profile.prs, profile.variantPrs, history), [profile.prs, profile.variantPrs, history]);
  const weekCount = useMemo(() => computeWeekCount(profile, history, new Date()), [profile, history]);
  const yearConsistency = useMemo(() => computeYearConsistency(profile, history, new Date()), [profile, history]);
  const conditioningBalance = useMemo(() => computeConditioningBalance(profile, history, new Date()), [profile, history]);

  // Alterna la tarjeta (abre si estaba cerrada, cierra si ya estaba abierta) y solo desplaza la
  // vista cuando se abre — cerrarla no necesita mover nada.
  function toggleAndMaybeScroll(current: boolean, setOpen: (v: boolean) => void, target: GaugeTarget) {
    const next = !current;
    setOpen(next);
    if (next) setScrollTarget(target);
  }

  function jumpTo(target: GaugeTarget) {
    switch (target) {
      case 'energy':
        return toggleAndMaybeScroll(energyOpen, setEnergyOpen, target);
      case 'imbalances':
        return toggleAndMaybeScroll(imbalancesOpen, setImbalancesOpen, target);
      case 'strength':
        return toggleAndMaybeScroll(strengthOpen, setStrengthOpen, target);
    }
  }

  useEffect(() => {
    if (!scrollTarget) return;
    const refs: Partial<Record<GaugeTarget, React.RefObject<HTMLDivElement>>> = {
      energy: energyRef,
      imbalances: imbalancesRef,
      strength: strengthRef,
    };
    const frame = requestAnimationFrame(() => {
      refs[scrollTarget]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget]);

  // --- Los 6 gauges: solo métricas que ya se calculan en algún sitio de la app, ninguna inventada. ---
  const balancedPairs = imbalanceGroups.filter((g) => g.status !== 'faltan-datos');
  const balancedOk = balancedPairs.filter((g) => g.status === 'equilibrado').length;
  // Fuerza relativa: el total de los tres grandes (sentadilla, banca, peso muerto) en veces tu peso corporal. El arco llega
  // lleno en `STRENGTH_RATIO_FULL` veces (en torno al nivel de un levantador muy fuerte).
  const latestBodyweightKg = [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg;
  const strengthTotalKg = profile.prs.backSquat + profile.prs.benchPress + profile.prs.deadlift;
  const strengthRatio = latestBodyweightKg ? strengthTotalKg / latestBodyweightKg : null;
  // Nota de preparación: el check-in más tu carga y cómo te salen las sesiones (ver `computeReadinessScore`).
  const readiness = computeReadinessScore({ readinessLog: profile.readinessLog, history, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: new Date() });
  const readinessLearning = computeReadinessLearning(profile.readinessLog, history);
  const todayStrain = dayStrain(history.find((h) => h.date === todayIso));
  const strainRange = recommendedStrain(readiness.total, acwr.acwr !== null && !acwr.coldStart ? acwr.zone : null);
  const strainState = strainStatus(todayStrain, strainRange);
  const energyAdherencePct =
    conditioningBalance && conditioningBalance.totalPlanned > 0
      ? Math.round((conditioningBalance.totalDone / conditioningBalance.totalPlanned) * 100)
      : null;

  const analysisGauges: GaugeSpec[] = [
    {
      label: 'Dominios energéticos',
      valueLabel: energyAdherencePct !== null ? `${energyAdherencePct}%` : '—',
      fraction: (energyAdherencePct ?? 0) / 100,
      strokeClass: energyAdherencePct !== null ? 'stroke-white' : 'stroke-neutral-600',
      target: 'energy',
    },
    {
      label: 'Desequilibrios',
      valueLabel: balancedPairs.length > 0 ? `${balancedOk}/${balancedPairs.length}` : '—',
      fraction: balancedPairs.length > 0 ? balancedOk / balancedPairs.length : 0,
      strokeClass: balancedPairs.length > 0 ? 'stroke-white' : 'stroke-neutral-600',
      target: 'imbalances',
    },
    {
      label: 'Fuerza (× peso)',
      valueLabel: strengthRatio !== null ? `${strengthRatio.toFixed(1).replace('.', ',')}×` : '—',
      fraction: strengthRatio !== null ? strengthRatio / STRENGTH_RATIO_FULL : 0,
      strokeClass: strengthRatio !== null ? 'stroke-white' : 'stroke-neutral-600',
      target: 'strength',
    },
  ];

  const hasStructure = Boolean(structureRow) || goalRows.length > 0;
  const goalsLabel = `${goalRows.length} ${goalRows.length === 1 ? 'objetivo activo' : 'objetivos activos'}`;
  const StructureIcon = structureRow?.Icon ?? Target;
  const structureColor = structureRow?.color ?? '#d4af37';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-400 capitalize">{MONTH_LABEL}</p>
          <p className="text-lg font-semibold text-white">Resumen</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <ThemeToggle className="h-10 w-10" />
          <button
            onClick={() => setShowBodyweight(true)}
            title="Peso corporal"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Scale size={17} strokeWidth={2.25} />
          </button>
          <button
            onClick={() => setShowNutrition(true)}
            title="Nutrición deportiva"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Apple size={17} strokeWidth={2.25} />
          </button>
          <button
            onClick={() => setShowVolume(true)}
            title="Volumen por día"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <BarChart3 size={17} strokeWidth={2.25} />
          </button>
          {hasStructure && (
            <button
              onClick={onNavigateToObjetivos}
              title={
                structureRow
                  ? `${structureRow.label} · ${structureRow.sublabel}${goalRows.length > 0 ? ` · ${goalsLabel}` : ''}`
                  : goalsLabel
              }
              className="relative flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
              style={{ borderColor: `${structureColor}66`, color: structureColor }}
            >
              <StructureIcon size={17} strokeWidth={2.25} />
              {goalRows.length > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ background: structureColor, color: '#171310' }}
                >
                  {goalRows.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
      {showVolume && <VolumeSummaryModal onClose={() => setShowVolume(false)} />}
      {showNutrition && (
        <NutritionModal
          profile={profile}
          history={history}
          bodyweightLog={bodyweightLog}
          onClose={() => setShowNutrition(false)}
          onOpenBodyweight={() => {
            setShowNutrition(false);
            setShowBodyweight(true);
          }}
        />
      )}
      {showBodyweight && (
        <Modal open onClose={() => setShowBodyweight(false)} title="Peso corporal">
          <BodyweightCard log={bodyweightLog} onChange={setBodyweightLog} embedded />
        </Modal>
      )}

      {/*
        El titular: que toca hoy, en una linea, sin tener que entrar a Planificacion para saberlo.
      */}
      <TodayPreviewCard profile={profile} history={history} onNavigateToPlanificacion={onNavigateToPlanificacion} />

      {/* Los tres números del día: plan, preparación (cuánto aguantas hoy, con la carga ya descontada) y constancia. */}
      <DayRings
        structureRow={hasStructure ? structureRow : null}
        goalRows={goalRows}
        readiness={readiness}
        learning={readinessLearning}
        acwr={acwr}
        trend={acwrTrend}
        yearConsistency={yearConsistency}
        consistencyDetail={
          <ConsistencyDetail
            week={weekCount}
            monthDays={stats.diasEntrenados}
            year={yearConsistency}
            calendar={<TrainingHeatmap history={history} trainingDaysPerWeek={profile.trainingDaysPerWeek} macrocycles={profile.macrocycles} />}
          />
        }
        onNavigateToObjetivos={onNavigateToObjetivos}
      />

      {/* Esfuerzo de hoy frente al rango que recomienda el coach, y la tendencia de esfuerzo y preparación. */}
      <StrainCard
        strain={todayStrain}
        range={strainRange}
        status={strainState}
        readiness={readiness.total}
        loadWord={acwr.acwr !== null && !acwr.coldStart ? LOAD_WORD[acwr.zone] : null}
      />
      <TrendCard series={(days) => buildTrend(history, profile.readinessLog, todayIso, days)} />

      {/*
        Análisis: lo que no hace falta mirar cada día, plegado por defecto. Los gauges (dominios energéticos,
        desequilibrios, fuerza) son la puerta directa a su detalle; debajo solo sale la tarjeta cuyo gauge se ha tocado.
      */}
      <button
        onClick={() => setAnalysisOpen((v) => !v)}
        className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
      >
        {analysisOpen ? 'Ocultar análisis' : 'Ver análisis'}
        <ChevronDown size={14} className={`transition-transform duration-200 ${analysisOpen ? 'rotate-180' : ''}`} />
      </button>
      {analysisOpen && <MetricsGauges row1={analysisGauges} row2={[]} onJumpTo={jumpTo} />}

      {energyOpen && (
        <div ref={energyRef}>
          <EnergyDomainsCard profile={profile} history={history} collapsed={false} onToggleCollapsed={() => setEnergyOpen(false)} />
        </div>
      )}

      {imbalancesOpen && (
        <div ref={imbalancesRef}>
          <ImbalancesCard groups={imbalanceGroups} collapsed={false} onToggleCollapsed={() => setImbalancesOpen(false)} />
        </div>
      )}

      {strengthOpen && (
        <div ref={strengthRef}>
          <PersonalRecordsCard
            prs={profile.prs}
            trends={prTrends}
            prLog={profile.prLog ?? []}
            macroStartIso={getActiveMacrocycle(profile.macrocycles, todayIso)?.startDate}
            bodyweightKg={latestBodyweightKg}
          />
        </div>
      )}

      {/* Lo que no encaja en un gauge (no es "N de M"): totales del mes, tal cual, en una línea. */}
      {analysisOpen && stats.diasEntrenados > 0 && (
        <p className="px-1 text-center text-[11px] text-neutral-500">
          <span className="num font-semibold text-neutral-300">{stats.diasEntrenados}</span> días entrenados este mes
          {stats.diasEsteAnio > 0 && (
            <>
              {' '}
              (<span className="num">{stats.diasEsteAnio}</span> en el año)
            </>
          )}
          {' · '}
          <span className="num font-semibold text-neutral-300">
            {stats.diasRx}/{stats.diasEntrenados}
          </span>{' '}
          Rx
          {stats.rpeMedio !== null && (
            <>
              {' · RPE medio '}
              <span className="num font-semibold text-neutral-300">{stats.rpeMedio.toFixed(1)}</span>
            </>
          )}
        </p>
      )}

      {/*
        Perfil de respuesta se queda siempre visible, sin gauge propio — es una actividad continua
        del coach (calibrando cómo respondes), no un "N de M" puntual. Ya colapsa sola a una frase
        (ver ResponseProfileCard), así que no pesa aunque esté siempre aquí.
      */}
      {analysisOpen && (
        <ResponseProfileCard
          history={history}
          prLog={profile.prLog ?? []}
          setFeedbackLog={profile.setFeedbackLog ?? []}
          bodyweightLog={profile.bodyweightLog ?? []}
          workLog={profile.workLog ?? []}
          prs={profile.prs}
        />
      )}
    </div>
  );
}
