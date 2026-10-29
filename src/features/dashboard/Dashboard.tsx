import { useCallback, useMemo, useState } from 'react';
import { Apple, ArrowRight, BarChart3, Flame, Gauge, Scale, Sun, Target } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeWeekCount } from '../../engine/adherence';
import { computeConditioningBalance } from '../../engine/conditioningBalance';
import { getMonthlyStats } from './stats';
import { computeReadinessScore } from '../../engine/readinessScore';
import { computeReadinessLearning } from '../../engine/readinessLearning';
import { dayStrain, strainStatus } from '../../engine/strain';
import { buildStrainTarget, ensureStrainTarget } from '../../engine/strainTarget';
import { estimatePlannedStrain, planFit } from '../../engine/plannedStrain';
import { learnStrain } from '../../engine/strainLearning';
import { getReadinessCheckForDate } from '../../engine/readiness';
import { CheckInSummary } from './CheckInSummary';
import { resolveTodaySession } from './todaySession';
import type { StrainView } from './StrainRing';
import { toLocalIsoDate } from '../../engine/periodization';
import { buildStructureRow, buildGoalRows } from './progressOverview';
import { DayRing, ZONE_COLOR, ZONE_TOKEN, ZONE_WORD, type DashTab, type RingTarget } from './DayRing';
import { DashTabs, DaySelector, dayLabel, ringDayLabel, shiftDay, useDaySwipe } from './DashNav';
import { DayRows, type NutritionSummary } from './DayRows';
import { classifyNutritionDay } from '../../engine/nutritionPlan';
import { extraInputsFor, planFor, trainingHourFor } from '../nutricion/nutritionData';
import { buildPastDayView, buildReadinessSeries, buildTrendPoints } from './pastDay';
import { ReadinessTrendChart } from './WeekCharts';
import { WeekTrendCard } from './WeekTrendCard';
import { HrvChart } from './HrvChart';
import { SleepTab } from './SleepHabits';
import { StrainDetail } from './StrainRing';
import { RecoveryDetail } from './RecoveryCard';
import { LearnedInsights } from './LearnedInsights';
import { AcwrGauge } from './AcwrGauge';
import { ConsistencyDetail } from './ConsistencyDetail';
import { computeYearConsistency } from '../../engine/yearConsistency';
import { TrainingHeatmap } from './TrainingHeatmap';
import { VolumeSummaryModal } from './VolumeSummaryModal';
import { BodyweightCard } from './BodyweightCard';
import { ThemeToggle } from '../shell/ThemeToggle';
import { computeImbalances } from '../../engine/imbalances';
import { AnalysisView } from './AnalysisView';
import { Modal } from '../shell/Modal';
import { NutritionModal } from './NutritionModal';

const MONTH_LABEL = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date());

interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: () => void;
  onNavigateToNutricion: () => void;
  /** Abre la tarjeta de la mañana (hacer o corregir el check-in de hoy). */
  onOpenMorning: () => void;
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos, onNavigateToNutricion, onOpenMorning }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  // Al abrir el Dashboard se fija el objetivo de esfuerzo de hoy (si aún no lo estaba): idempotente.
  const [profile] = useState(() => {
    const current = athleteRepository.getProfile();
    const next = ensureStrainTarget(current, history, toLocalIsoDate(new Date()));
    if (next !== current) athleteRepository.saveProfile(next);
    return next;
  });
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  const [showVolume, setShowVolume] = useState(false);
  const [showBodyweight, setShowBodyweight] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  // Día que se está mirando (hoy por defecto) y pestaña de arriba.
  const [dayIso, setDayIso] = useState(() => toLocalIsoDate(new Date()));
  const [tab, setTab] = useState<DashTab>('resumen');
  // Deslizar el dedo sobre el anillo cambia de día (también están las flechas de arriba).
  const swipe = useDaySwipe((delta) => setDayIso((cur) => shiftDay(cur, delta, toLocalIsoDate(new Date()))));

  const stats = useMemo(() => getMonthlyStats(history, profile.trainingDatesLog ?? []), [history, profile.trainingDatesLog]);
  const acwr = useMemo(() => computeAcwr(history), [history]);
  const acwrTrend = useMemo(() => getAcwrTrend(history), [history]);
  const todayIso = toLocalIsoDate(new Date());
  const structureRow = useMemo(() => buildStructureRow(profile, todayIso), [profile, todayIso]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history), [profile.goals, history]);
  const imbalanceGroups = useMemo(() => computeImbalances(profile.prs, profile.variantPrs, history), [profile.prs, profile.variantPrs, history]);
  const weekCount = useMemo(() => computeWeekCount(profile, history, new Date()), [profile, history]);
  const yearConsistency = useMemo(() => computeYearConsistency(profile, history, new Date()), [profile, history]);
  const conditioningBalance = useMemo(() => computeConditioningBalance(profile, history, new Date()), [profile, history]);

  // --- Métricas del Análisis: solo lo que ya se calcula en algún sitio de la app, ninguna inventada. ---
  const balancedPairs = imbalanceGroups.filter((g) => g.status !== 'faltan-datos');
  const balancedOk = balancedPairs.filter((g) => g.status === 'equilibrado').length;
  // Fuerza relativa: el total de los tres grandes (sentadilla, banca, peso muerto) en veces tu peso corporal.
  const latestBodyweightKg = [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg;
  const strengthTotalKg = profile.prs.backSquat + profile.prs.benchPress + profile.prs.deadlift;
  const strengthRatio = latestBodyweightKg ? strengthTotalKg / latestBodyweightKg : null;
  // Nota de preparación: el check-in más tu carga y cómo te salen las sesiones (ver `computeReadinessScore`).
  const readiness = computeReadinessScore({ readinessLog: profile.readinessLog, history, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: new Date() });
  const readinessLearning = computeReadinessLearning(profile.readinessLog, history);
  const todayStrain = dayStrain(history.find((h) => h.date === todayIso));
  const strainTarget = profile.strainTargets?.[todayIso] ?? buildStrainTarget(profile, history, todayIso);
  const strainState = strainStatus(todayStrain, strainTarget);
  const todaySession = useMemo(() => resolveTodaySession(profile, history, todayIso), [profile, history, todayIso]);
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
  // Los datos de la tendencia (pestaña Esfuerzo): se calculan al dibujarla, para el rango que se pida. Hoy lleva el esfuerzo previsto.
  const plannedToday = strainView.planned?.strain ?? null;
  const buildTrend = useCallback((days: number, offsetDays = 0) => buildTrendPoints(profile, history, dayIso, todayIso, days, plannedToday, offsetDays), [profile, history, dayIso, todayIso, plannedToday]);
  const readinessSeries = useMemo(() => (tab === 'preparacion' ? buildReadinessSeries(profile, history, dayIso, 14) : []), [tab, profile, history, dayIso]);
  const loadKnown = shown.acwr.acwr !== null && !shown.acwr.coldStart;
  const todayReadiness = getReadinessCheckForDate(profile.readinessLog ?? [], todayIso);
  // El check-in se hace en la tarjeta de la mañana (que sale al abrir la app): el Resumen solo guarda una pastilla si se dejó para
  // luego, y lo contestado se ve y se corrige en la pestaña Preparación.

  /** Tocar un número del anillo: esfuerzo y preparación abren su pestaña; la carga, su ventana. */
  function openRingTarget(target: RingTarget) {
    if (target === 'carga') setShowLoad(true);
    else setTab(target);
  }

  const energyAdherencePct =
    conditioningBalance && conditioningBalance.totalPlanned > 0
      ? Math.round((conditioningBalance.totalDone / conditioningBalance.totalPlanned) * 100)
      : null;

  // Lo que enseña la fila "Análisis" del Resumen: fuerza relativa, dominios energéticos y desequilibrios.
  const analysisLabels = [
    energyAdherencePct !== null ? `${energyAdherencePct}%` : '—',
    balancedPairs.length > 0 ? `${balancedOk}/${balancedPairs.length}` : '—',
    strengthRatio !== null ? `${strengthRatio.toFixed(1).replace('.', ',')}×` : '—',
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
          {/* Carga: el icono toma el color de su zona (óptima, alta…) cuando hay datos, y avisa solo cuando importa. */}
          <button
            onClick={() => setShowLoad(true)}
            title={loadKnown ? `Carga · ${ZONE_WORD[shown.acwr.zone]}` : 'Carga'}
            aria-label="Carga"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-all duration-200 hover:border-brand-gold hover:text-brand-gold"
            style={loadKnown ? { borderColor: `rgb(var(${ZONE_TOKEN[shown.acwr.zone]}) / 0.5)`, color: ZONE_COLOR[shown.acwr.zone] } : undefined}
          >
            <Gauge size={17} strokeWidth={2.25} />
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
                  className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[11px] font-bold"
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
              isToday && !todayReadiness ? (
                <div className="flex justify-center">
                  <button
                    onClick={onOpenMorning}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-neutral-200 transition-colors duration-200 hover:bg-white/[0.07]"
                  >
                    <Sun size={15} strokeWidth={2.25} className="text-brand-gold" aria-hidden="true" />
                    Check-in pendiente
                    <ArrowRight size={14} className="text-neutral-500" aria-hidden="true" />
                  </button>
                </div>
              ) : null
            }
            strain={shown.strain}
            readiness={shown.readiness}
            acwr={shown.acwr}
            centerLabel={ringDayLabel(dayIso, todayIso)}
            isToday={isToday}
            onOpenTab={openRingTarget}
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
            analysis={analysisLabels}
            onNavigateToPlanificacion={onNavigateToPlanificacion}
            onNavigateToNutricion={onNavigateToNutricion}
            onOpenAnalysis={() => setAnalysisOpen(true)}
          />
        </>
      )}

      {tab === 'esfuerzo' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <WeekTrendCard build={buildTrend} selectedIso={dayIso} todayIso={todayIso} competitionDays={isToday ? (todaySession?.competition?.daysToEvent ?? null) : null} onSelect={setDayIso} />
          <div className="rounded-2xl bg-white/[0.03] p-5">
            <StrainDetail view={shown.strain} onAdjust={onNavigateToPlanificacion} dayLabel={dayLabel(dayIso, todayIso)} isToday={isToday} />
          </div>
        </div>
      )}
      {tab === 'preparacion' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <ReadinessTrendChart series={readinessSeries} selectedIso={dayIso} onSelect={setDayIso} />
          <HrvChart log={profile.readinessLog ?? []} dayIso={dayIso} />
          <div className="flex flex-col gap-7 rounded-2xl bg-white/[0.03] p-5">
            {isToday && todayReadiness && <CheckInSummary check={todayReadiness} onEdit={onOpenMorning} />}
            <RecoveryDetail readiness={shown.readiness} />
            <LearnedInsights learning={readinessLearning} />
          </div>
        </div>
      )}
      {tab === 'sueno' && (
        <div className="animate-section-in motion-reduce:animate-none">
          <SleepTab log={profile.readinessLog ?? []} dayIso={dayIso} todayIso={todayIso} learning={readinessLearning} onSelect={setDayIso} onOpenMorning={onOpenMorning} />
        </div>
      )}
      {showLoad && (
        <Modal open onClose={() => setShowLoad(false)} title="Carga">
          <AcwrGauge result={shown.acwr} trend={shown.trend} />
        </Modal>
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

      {/*
        Análisis: lo que no hace falta mirar cada día. Vive en una ventana que se abre desde la fila "Análisis" de "Tu día", así el
        Resumen no se alarga. Dentro, los medidores (dominios energéticos, desequilibrios, fuerza) son la puerta a su detalle: solo
        sale la tarjeta del medidor tocado.
      */}
      {analysisOpen && (
        <Modal open onClose={() => setAnalysisOpen(false)} title="Análisis">
          <AnalysisView
            profile={profile}
            history={history}
            imbalanceGroups={imbalanceGroups}
            strengthRatio={strengthRatio}
            energyAdherencePct={energyAdherencePct}
            bodyweightKg={latestBodyweightKg}
            stats={stats}
            todayIso={todayIso}
          />
        </Modal>
      )}    </div>
  );
}
