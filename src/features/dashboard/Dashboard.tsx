import { useEffect, useMemo, useRef, useState } from 'react';
import { Apple, BarChart3, ChevronDown, Flame, Scale, Target } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeWeekCount } from '../../engine/adherence';
import { computeConditioningBalance } from '../../engine/conditioningBalance';
import { getMonthlyStats } from './stats';
import { computePrTrends } from '../../engine/weakPoints';
import { computeReadinessScore } from '../../engine/readinessScore';
import { computeReadinessLearning } from '../../engine/readinessLearning';
import { dayStrain, strainStatus } from '../../engine/strain';
import { buildStrainTarget, ensureStrainTarget } from '../../engine/strainTarget';
import { estimatePlannedStrain, planFit } from '../../engine/plannedStrain';
import { learnStrain } from '../../engine/strainLearning';
import { getReadinessCheckForDate } from '../../engine/readiness';
import type { ReadinessCheck } from '../../data/athlete/types';
import { ReadinessCheckIn } from '../planificacion/ReadinessCheckIn';
import { refreshTodaySession, resolveTodaySession } from './todaySession';
import type { StrainView } from './StrainRing';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { buildStructureRow, buildGoalRows } from './progressOverview';
import { MetricsGauges, type GaugeSpec, type GaugeTarget } from './MetricsGauges';
import { DayRing, type DashTab } from './DayRing';
import { DashTabs, DaySelector, dayLabel, ringDayLabel, shiftDay, useDaySwipe } from './DashNav';
import { DayRows, type NutritionSummary } from './DayRows';
import { classifyNutritionDay } from '../../engine/nutritionPlan';
import { extraInputsFor, planFor, trainingHourFor } from '../nutricion/nutritionData';
import { buildPastDayView, buildReadinessSeries, buildWeekWindow } from './pastDay';
import { ReadinessTrendChart, WeekEffortChart } from './WeekCharts';
import { StrainDetail } from './StrainRing';
import { RecoveryDetail } from './RecoveryCard';
import { LearnedInsights } from './LearnedInsights';
import { AcwrGauge } from './AcwrGauge';
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

/** Veces el peso corporal (total sentadilla + banca + peso muerto) a las que el arco de "Fuerza" llega lleno. */
const STRENGTH_RATIO_FULL = 7;

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: () => void;
  onNavigateToNutricion: () => void;
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos, onNavigateToNutricion }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  // Al abrir el Dashboard se fija el objetivo de esfuerzo de hoy (si aún no lo estaba): idempotente.
  const [profile, setProfile] = useState(() => {
    const current = athleteRepository.getProfile();
    const next = ensureStrainTarget(current, history, toLocalIsoDate(new Date()));
    if (next !== current) athleteRepository.saveProfile(next);
    return next;
  });
  // Sube cada vez que la sesión de hoy se rehace (check-in), para que lo que enseña el Dashboard se relea de la caché.
  const [sessionVersion, setSessionVersion] = useState(0);
  const [checkInDismissed, setCheckInDismissed] = useState(false);
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showVolume, setShowVolume] = useState(false);
  const [showBodyweight, setShowBodyweight] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);
  // Día que se está mirando (hoy por defecto) y pestaña de arriba.
  const [dayIso, setDayIso] = useState(() => toLocalIsoDate(new Date()));
  const [tab, setTab] = useState<DashTab>('resumen');
  // Deslizar el dedo sobre el anillo cambia de día (también están las flechas de arriba).
  const swipe = useDaySwipe((delta) => setDayIso((cur) => shiftDay(cur, delta, toLocalIsoDate(new Date()))));

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
  const strainTarget = profile.strainTargets?.[todayIso] ?? buildStrainTarget(profile, history, todayIso);
  const strainState = strainStatus(todayStrain, strainTarget);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todaySession = useMemo(() => resolveTodaySession(profile, history, todayIso), [profile, history, todayIso, sessionVersion]);
  const strainLearned = useMemo(() => learnStrain(profile, history, todayIso), [profile, history, todayIso]);
  const plannedStrain = useMemo(
    () => (todaySession ? estimatePlannedStrain(todaySession, history, strainLearned.bias) : null),
    [todaySession, history, strainLearned.bias],
  );
  const strainView: StrainView = {
    target: strainTarget,
    planned: plannedStrain,
    fit: plannedStrain ? planFit(plannedStrain, strainTarget) : null,
    real: todayStrain,
    status: strainState,
    learning: strainLearned,
  };
  // El día elegido en el selector: hoy usa lo de hoy (con la sesión prevista); un día pasado se reconstruye con lo que se sabía esa mañana.
  const isToday = dayIso === todayIso;
  const pastView = useMemo(() => (isToday ? null : buildPastDayView(profile, history, dayIso, strainLearned)), [isToday, profile, history, dayIso, strainLearned]);
  const shown = pastView ?? { readiness, acwr, trend: acwrTrend, strain: strainView, entry: history.find((h) => h.date === todayIso) };
  // Nutrición del día elegido: lo apuntado en el diario frente a lo que toca (proteína e hidratos), si hay peso para calcularlo.
  const nutrition = useMemo<NutritionSummary | null>(() => {
    if (!latestBodyweightKg) return null;
    const prefs = profile.nutritionPrefs;
    const dayEntry = history.find((h) => h.date === dayIso);
    const daySession = isToday ? (todaySession ?? athleteRepository.getCachedSession(dayIso)) : profile.sessionCache?.[dayIso];
    const dayType = daySession ? classifyNutritionDay(daySession) : dayEntry ? 'normal' : 'descanso';
    const plan = planFor(prefs, dayIso, dayType, latestBodyweightKg, trainingHourFor(prefs, dayIso));
    const eaten = extraInputsFor(prefs, dayIso);
    // Un día pasado sin nada apuntado no muestra la fila (un 0 % no dice nada).
    if (!isToday && eaten.length === 0) return null;
    return {
      protein: { done: eaten.reduce((s, e) => s + e.protein, 0), target: Math.round((plan.target.proteinG.min + plan.target.proteinG.max) / 2) },
      carbs: { done: eaten.reduce((s, e) => s + e.carbs, 0), target: Math.round((plan.target.carbsG.min + plan.target.carbsG.max) / 2) },
    };
  }, [latestBodyweightKg, profile.nutritionPrefs, profile.sessionCache, history, dayIso, isToday, todaySession]);
  // Datos de las gráficas de las pestañas (solo se calculan al abrirlas).
  const weekPoints = useMemo(
    () => (tab === 'esfuerzo' ? buildWeekWindow(profile, history, dayIso, todayIso, strainView) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, profile, history, dayIso, todayIso, strainView.planned?.strain, strainView.target],
  );
  const readinessSeries = useMemo(() => (tab === 'preparacion' ? buildReadinessSeries(profile, history, dayIso, 14) : []), [tab, profile, history, dayIso]);
  const todayReadiness = getReadinessCheckForDate(profile.readinessLog ?? [], todayIso);
  // El check-in solo tiene sentido si hoy hay sesión por entrenar (o ya hecho, para poder corregirlo).
  const showCheckIn = Boolean(todaySession && !todaySession.isRestDay && (todayReadiness || !checkInDismissed));

  function handleSaveCheckIn(check: ReadinessCheck) {
    athleteRepository.saveReadinessCheck(check);
    // El objetivo provisional se rehace con el check-in y queda fijo; la sesión de hoy se recalcula con la nueva energía.
    const fresh = athleteRepository.getProfile();
    const next = ensureStrainTarget(fresh, history, todayIso);
    if (next !== fresh) athleteRepository.saveProfile(next);
    refreshTodaySession(next, history, todayIso);
    setProfile(athleteRepository.getProfile());
    setSessionVersion((v) => v + 1);
  }
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
          <button
            onClick={() => setShowConsistency(true)}
            title={yearConsistency.pct !== null ? `Constancia · ${yearConsistency.pct} % (${yearConsistency.days} días este año)` : 'Constancia'}
            aria-label="Constancia"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Flame size={17} strokeWidth={2.25} />
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

      {/* Selector de día y pestañas, al estilo Whoop: el día elegido manda sobre todo lo de debajo. */}
      <DaySelector dayIso={dayIso} todayIso={todayIso} onChange={setDayIso} />
      <DashTabs tab={tab} onChange={setTab} />

      {tab === 'resumen' && (
        <>
          {/*
            El estado del día: el check-in (el primer gesto de la mañana: al contestar se fija el objetivo de esfuerzo y se
            rehace la sesión) y los dos anillos, esfuerzo y preparación. Tocar un número abre su pestaña.
          */}
          <div {...swipe} className="touch-pan-y">
          <DayRing
            checkIn={
              isToday && showCheckIn ? (
                <ReadinessCheckIn
                  dateIso={todayIso}
                  log={profile.readinessLog ?? []}
                  existing={todayReadiness}
                  onConfirm={handleSaveCheckIn}
                  onSkip={() => setCheckInDismissed(true)}
                />
              ) : null
            }
            strain={shown.strain}
            readiness={shown.readiness}
            acwr={shown.acwr}
            centerLabel={ringDayLabel(dayIso, todayIso)}
            isToday={isToday}
            onOpenTab={setTab}
            onAdjust={onNavigateToPlanificacion}
          />
          </div>

          {/* Tu día: la sesión (con su esfuerzo en la insignia) y la nutrición, una fila cada una. */}
          <DayRows
            isToday={isToday}
            session={isToday ? todaySession : null}
            entry={shown.entry}
            strain={shown.strain}
            nutrition={nutrition}
            onNavigateToPlanificacion={onNavigateToPlanificacion}
            onNavigateToNutricion={onNavigateToNutricion}
          />
        </>
      )}

      {tab === 'esfuerzo' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <WeekEffortChart points={weekPoints} selectedIso={dayIso} todayIso={todayIso} onSelect={setDayIso} />
          <div className="rounded-2xl bg-white/[0.03] p-5">
            <StrainDetail view={shown.strain} onAdjust={onNavigateToPlanificacion} dayLabel={dayLabel(dayIso, todayIso)} isToday={isToday} />
          </div>
        </div>
      )}
      {tab === 'preparacion' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <ReadinessTrendChart series={readinessSeries} selectedIso={dayIso} onSelect={setDayIso} />
          <div className="flex flex-col gap-7 rounded-2xl bg-white/[0.03] p-5">
            <RecoveryDetail readiness={shown.readiness} />
            <LearnedInsights learning={readinessLearning} />
          </div>
        </div>
      )}
      {tab === 'carga' && (
        <div className="animate-section-in rounded-2xl bg-white/[0.03] p-5 motion-reduce:animate-none">
          <AcwrGauge result={shown.acwr} trend={shown.trend} />
        </div>
      )}

      {showConsistency && (
        <Modal open onClose={() => setShowConsistency(false)} title="Constancia">
          <ConsistencyDetail
            week={weekCount}
            monthDays={stats.diasEntrenados}
            year={yearConsistency}
            calendar={<TrainingHeatmap history={history} trainingDaysPerWeek={profile.trainingDaysPerWeek} macrocycles={profile.macrocycles} />}
          />
        </Modal>
      )}

      {tab === 'resumen' && (
        <>
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
        </>
      )}
    </div>
  );
}
