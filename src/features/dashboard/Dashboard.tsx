import { useCallback, useEffect, useMemo, useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeAdherenceStreak, computeWeekCount } from '../../engine/adherence';
import { computeConditioningBalance } from '../../engine/conditioningBalance';
import { getMonthlyStats } from './stats';
import { computeReadinessScore } from '../../engine/readinessScore';
import { computeReadinessLearning } from '../../engine/readinessLearning';
import { dayStrain, strainStatus } from '../../engine/strain';
import { buildStrainTarget, ensureStrainTarget, withPlannedStrain } from '../../engine/strainTarget';
import { estimatePlannedStrain, planFit } from '../../engine/plannedStrain';
import { learnStrain } from '../../engine/strainLearning';
import { getReadinessCheckForDate } from '../../engine/readiness';
import { dayAdvice } from '../../engine/dayAdvice';
import { getActivePainFlags, PAIN_AREA_LABEL } from '../../engine/painFlags';
import { isRestMarked, withRestMarked, withRestUnmarked } from '../../engine/restDays';
import { describeSkipped } from '../../engine/sessionParts';
import { RexBar } from './RexBar';
import {
  buildRexSuggestions,
  NUTRITION_HOUR,
  NUTRITION_LOW,
  dismissSuggestion,
  loadRexMemory,
  pickRexSuggestion,
  saveRexMemory,
  wasTyped,
  weekRangeText,
  withTyped,
  type RexMemory,
  type RexTarget,
} from './rexDashboard';
import { buildOpenItems } from '../objetivos/openItems';
import { RexWeekly } from './RexWeekly';
import { buildWeeklyReview, withWeekReviewed, type WeeklyReview } from './weeklyReview';
import { applyMacroReview, withMacroWeekReviewed } from '../../engine/macroReview';
import { resolveTodaySession } from './todaySession';
import type { StrainView } from './StrainRing';
import { toLocalIsoDate } from '../../engine/periodization';
import { buildGoalRows } from './progressOverview';
import { DayRing, type DashTab, type RingTarget } from './DayRing';
import { DashTabs, DaySelector, dayLabel, ringDayLabel, shiftDay, useDaySwipe } from './DashNav';
import { DayRows } from './DayRows';
import { nutritionPct, type NutritionSummary } from './nutritionSummary';
import { FormView } from './FormCurve';
import { buildFormModel, formRowNote } from './formModel';
import { classifyNutritionDay } from '../../engine/nutritionPlan';
import { dayTarget, eatenFor } from '../nutricion/nutritionData';
import { buildPastDayView, buildReadinessSeries, buildTrendPoints } from './pastDay';
import { WeekTrendCard } from './WeekTrendCard';
import { SleepTab } from './SleepHabits';
import { StrainDetail } from './StrainRing';
import { PreparationTab } from './PreparationTab';
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


interface DashboardProps {
  onNavigateToPlanificacion: () => void;
  onNavigateToObjetivos: (section?: 'perfil') => void;
  onNavigateToNutricion: () => void;
  /** Abre la tarjeta de la mañana (hacer o corregir el check-in de hoy). */
  onOpenMorning: () => void;
}

export function Dashboard({ onNavigateToPlanificacion, onNavigateToObjetivos, onNavigateToNutricion, onOpenMorning }: DashboardProps) {
  const [history] = useState(() => athleteRepository.getHistory());
  // Al abrir el Dashboard se fija el objetivo de esfuerzo de hoy (si aún no lo estaba): idempotente.
  const [profile, setProfile] = useState(() => {
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
  const [formOpen, setFormOpen] = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  /** La revisión abierta: se guarda aquí porque al darla por vista deja de existir como pendiente y la conversación no debe cerrarse sola. */
  const [showWeekly, setShowWeekly] = useState<WeeklyReview | null>(null);
  // Día que se está mirando (hoy por defecto) y pestaña de arriba.
  const [dayIso, setDayIso] = useState(() => toLocalIsoDate(new Date()));
  const [tab, setTab] = useState<DashTab>('resumen');
  // Deslizar el dedo sobre el anillo cambia de día (también están las flechas de arriba).
  const swipe = useDaySwipe((delta) => setDayIso((cur) => shiftDay(cur, delta, toLocalIsoDate(new Date()))));

  const stats = useMemo(() => getMonthlyStats(history, profile.trainingDatesLog ?? []), [history, profile.trainingDatesLog]);
  const acwr = useMemo(() => computeAcwr(history), [history]);
  const acwrTrend = useMemo(() => getAcwrTrend(history), [history]);
  const todayIso = toLocalIsoDate(new Date());
  const formModel = useMemo(() => buildFormModel(profile, history, todayIso), [profile, history, todayIso]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history), [profile.goals, history]);
  const imbalanceGroups = useMemo(() => computeImbalances(profile.prs, profile.variantPrs, history), [profile.prs, profile.variantPrs, history]);
  const weekCount = useMemo(() => computeWeekCount(profile, history, new Date()), [profile, history]);
  const yearConsistency = useMemo(() => computeYearConsistency(profile, history, new Date()), [profile, history]);
  const conditioningBalance = useMemo(() => computeConditioningBalance(profile, history, new Date()), [profile, history]);
  // La revisión de la semana pasada con Rex (de lunes a miércoles, hasta darla por vista).
  const weeklyReview = useMemo(() => buildWeeklyReview(profile, history, new Date()), [profile, history]);

  // --- Métricas del Análisis: solo lo que ya se calcula en algún sitio de la app, ninguna inventada. ---
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
  // Antes de entrenar se anota el esfuerzo previsto en el objetivo de hoy (lo último que se vio, tras el check-in y los ajustes): al cerrar
  // el día sirve para contar "partías con X y has hecho Y". Una vez entrenado ya no se toca.
  const plannedNow = plannedStrain?.strain ?? null;
  useEffect(() => {
    if (todayStrain !== null) return;
    const current = athleteRepository.getProfile();
    const next = withPlannedStrain(current, todayIso, plannedNow);
    if (next === current) return;
    athleteRepository.saveProfile(next);
    setProfile((prev) => ({ ...prev, strainTargets: next.strainTargets }));
  }, [todayStrain, todayIso, plannedNow]);
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
  // Con qué se partió el día elegido (previsto anotado y la preparación de esa mañana), para el balance al cerrarlo. Un día pasado ya se
  // enseña con la preparación de esa mañana, así que solo hoy se compara.
  const dayStart = { planned: profile.strainTargets?.[dayIso]?.planned ?? null, prep: isToday ? profile.strainTargets?.[dayIso]?.readiness ?? null : null };
  // Nutrición del día elegido: lo apuntado en el diario frente a lo que toca (proteína e hidratos), si hay peso para calcularlo.
  const nutrition = useMemo<NutritionSummary | null>(() => {
    if (!latestBodyweightKg) return null;
    const prefs = profile.nutritionPrefs;
    const dayEntry = history.find((h) => h.date === dayIso);
    const daySession = isToday ? (todaySession ?? athleteRepository.getCachedSession(dayIso)) : profile.sessionCache?.[dayIso];
    const dayType = daySession ? classifyNutritionDay(daySession) : dayEntry ? 'normal' : 'descanso';
    const target = dayTarget(dayType, latestBodyweightKg);
    const eaten = eatenFor(prefs, dayIso);
    // Un día pasado sin nada apuntado no muestra la fila (un 0 % no dice nada).
    if (!isToday && eaten.count === 0) return null;
    return { protein: { done: eaten.protein, target: target.protein }, carbs: { done: eaten.carbs, target: target.carbs } };
  }, [latestBodyweightKg, profile.nutritionPrefs, profile.sessionCache, history, dayIso, isToday, todaySession]);
  const nutritionPercent = nutrition ? nutritionPct(nutrition) : null;
  // Datos de las gráficas de las pestañas (solo se calculan al abrirlas).
  // Los datos de la tendencia (pestaña Esfuerzo): se calculan al dibujarla, para el rango que se pida. Hoy lleva el esfuerzo previsto.
  const plannedToday = strainView.planned?.strain ?? null;
  const buildTrend = useCallback((days: number, offsetDays = 0) => buildTrendPoints(profile, history, dayIso, todayIso, days, plannedToday, offsetDays), [profile, history, dayIso, todayIso, plannedToday]);
  const readinessSeries = useMemo(() => (tab === 'preparacion' ? buildReadinessSeries(profile, history, dayIso, 14) : []), [tab, profile, history, dayIso]);
  const reviewPending = Boolean(profile.emphasisPlan?.review && !profile.emphasisPlan.review.seen && profile.emphasisPlan.review.entries.some((e) => e.decision !== 'esperar'));
  const todayReadiness = getReadinessCheckForDate(profile.readinessLog ?? [], todayIso);
  // Descanso elegido ("Hoy descanso"): se guarda en el perfil y se ve en el consejo, en la cinta de la semana y en el cumplimiento.
  const restMarked = isRestMarked(profile.restDates, todayIso);
  function toggleRest() {
    const current = athleteRepository.getProfile();
    const next = restMarked ? withRestUnmarked(current, todayIso) : withRestMarked(current, todayIso);
    athleteRepository.saveProfile(next);
    setProfile(next);
  }
  // La revisión de las 4 semanas: al abrir el aviso deja de salir y se lleva a Objetivos → Perfil, donde se da por vista.
  function openEmphasisReview() {
    const current = athleteRepository.getProfile();
    if (current.emphasisPlan?.review && !current.emphasisPlan.review.noticed) {
      const next = { ...current, emphasisPlan: { ...current.emphasisPlan, review: { ...current.emphasisPlan.review, noticed: true } } };
      athleteRepository.saveProfile(next);
      setProfile(next);
    }
    onNavigateToObjetivos('perfil');
  }
  // El consejo de hoy: lee lo mismo que los anillos y el semáforo del coach, así que nunca los contradice.
  const advice = dayAdvice({
    restMarked,
    session: todaySession,
    hasCheckIn: Boolean(todayReadiness),
    prep: readiness.total,
    level: readiness.level,
    loadZone: acwr.acwr !== null && !acwr.coldStart ? acwr.zone : null,
    hrvLow: todayReadiness?.hrvVs === 'bajo' || readiness.hrv.hrPenalty > 0,
    painAreas: getActivePainFlags(profile.painFlags, todayIso).map((f) => f.area),
    fit: strainView.planned && strainView.fit ? { kind: strainView.fit.fit, planned: strainView.planned.strain, diff: strainView.fit.diff } : null,
    target: strainTarget,
  });
  // Lo que enseña la ventana de Análisis: cumplimiento de los dominios energéticos.
  const energyAdherencePct =
    conditioningBalance && conditioningBalance.totalPlanned > 0
      ? Math.round((conditioningBalance.totalDone / conditioningBalance.totalPlanned) * 100)
      : null;

  // Rex, arriba del todo: qué toca ahora y atajos a los módulos. Lee lo mismo que el resto del Dashboard.
  const goalsBehind = useMemo(() => buildOpenItems(profile, history, todayIso).objetivos.filter((i) => i.chip.tone === 'warn').length, [profile, history, todayIso]);
  const lastWeightDate = bodyweightLog.reduce<string | null>((best, e) => (best === null || e.date > best ? e.date : best), null);
  const daysSinceWeight = lastWeightDate === null ? null : Math.max(0, Math.round((new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${lastWeightDate}T00:00:00`).getTime()) / 86_400_000));
  const streak = useMemo(() => computeAdherenceStreak(profile, history, todayIso), [profile, history, todayIso]);
  const emphasisReviewNew = Boolean(
    profile.emphasisPlan?.review && !profile.emphasisPlan.review.seen && !profile.emphasisPlan.review.noticed && profile.emphasisPlan.review.entries.some((e) => e.decision !== 'esperar'),
  );
  const rexList = buildRexSuggestions({
    // Mirando un día pasado, Rex habla de ese día y no de hoy.
    viewDay: isToday
      ? null
      : {
          iso: dayIso,
          label: dayIso === shiftDay(todayIso, -1, todayIso) ? 'Ayer' : `El ${ringDayLabel(dayIso, todayIso)}`,
          trained: Boolean(shown.entry),
          rested: isRestMarked(profile.restDates, dayIso),
          strain: shown.strain.real,
          low: shown.strain.target?.low ?? null,
          high: shown.strain.target?.high ?? null,
        },
    hour: new Date().getHours(),
    isToday,
    hasCheckIn: Boolean(todayReadiness),
    trainedToday: history.some((h) => h.date === todayIso),
    hasSessionToday: todaySession !== null && !todaySession.isRestDay,
    restMarked,
    weeklyReviewRange: weeklyReview ? weekRangeText(weeklyReview.from, weeklyReview.to) : null,
    emphasisReviewPending: emphasisReviewNew,
    nutritionPercent: isToday ? nutritionPercent : null,
    streak,
    goalsBehind,
    painLabels: getActivePainFlags(profile.painFlags, todayIso).map((f) => PAIN_AREA_LABEL[f.area]),
    daysSinceWeight,
  });
  const [rexMemory, setRexMemory] = useState<RexMemory>(() => loadRexMemory(typeof window !== 'undefined' ? window.localStorage : null));
  const rexPick = pickRexSuggestion(rexList, rexMemory, todayIso);
  function updateRexMemory(change: (m: RexMemory) => RexMemory) {
    setRexMemory((prev) => {
      const next = change(prev);
      if (next !== prev) saveRexMemory(typeof window !== 'undefined' ? window.localStorage : null, next);
      return next;
    });
  }
  const rexBadges: Partial<Record<RexTarget, string>> = {
    ...(yearConsistency.pct !== null ? { constancia: `${yearConsistency.pct} %` } : {}),
    ...(goalRows.length > 0 ? { objetivos: String(goalRows.length) } : {}),
    ...(nutritionPercent !== null ? { nutricion: `${nutritionPercent} %` } : {}),
  };
  // Un punto en «Más» (y en el módulo) cuando algo pide mirar: revisión sin ver o nutrición floja por la tarde.
  const nutritionLow = isToday && nutritionPercent !== null && nutritionPercent < NUTRITION_LOW && new Date().getHours() >= NUTRITION_HOUR;
  const rexDots: RexTarget[] = [...(reviewPending ? (['perfil'] as RexTarget[]) : []), ...(nutritionLow ? (['nutricion'] as RexTarget[]) : [])];
  function runRexTarget(target: RexTarget) {
    switch (target) {
      case 'checkin':
        return onOpenMorning();
      case 'semana':
        return weeklyReview && setShowWeekly(weeklyReview);
      case 'revision-enfasis':
        return openEmphasisReview();
      case 'constancia':
        return setShowConsistency(true);
      case 'volumen':
        return setShowVolume(true);
      case 'analisis':
        return setAnalysisOpen(true);
      case 'perfil':
        return onNavigateToObjetivos('perfil');
      case 'objetivos':
        return onNavigateToObjetivos();
      case 'nutricion':
        return setShowNutrition(true);
      case 'peso':
        return setShowBodyweight(true);
      case 'forma':
        return setFormOpen(true);
      case 'planificacion':
        return onNavigateToPlanificacion();
      case 'hoy':
        return setDayIso(todayIso);
    }
  }

  /** Tocar un número del anillo: esfuerzo y preparación abren su pestaña; la carga, su ventana. */
  function openRingTarget(target: RingTarget) {
    if (target === 'carga') setShowLoad(true);
    else setTab(target);
  }


  return (
    <div className="flex flex-col gap-4">
      {/* Rex, siempre arriba: te dice lo que toca ahora con atajos, y en «Más» están los módulos que antes eran botones sueltos. */}
      <RexBar
        suggestion={rexPick.current}
        waiting={rexPick.waiting}
        typedAlready={wasTyped(rexMemory, rexPick.current.id, todayIso)}
        badges={rexBadges}
        dots={rexDots}
        extra={<ThemeToggle label className="!h-auto !w-full justify-start gap-2 px-3 py-2" />}
        onAction={runRexTarget}
        onDismiss={() => updateRexMemory((m) => dismissSuggestion(m, rexPick.current.id, todayIso))}
        onTyped={() => updateRexMemory((m) => withTyped(m, rexPick.current.id, todayIso))}
      />
      {showVolume && <VolumeSummaryModal onClose={() => setShowVolume(false)} />}
      {showNutrition && (
        <NutritionModal
          history={history}
          deloadToday={Boolean(todaySession?.deloadReason)}
          bodyweightLog={bodyweightLog}
          progress={nutrition}
          dayLabel={dayLabel(dayIso, todayIso)}
          onOpenNutricion={() => {
            setShowNutrition(false);
            onNavigateToNutricion();
          }}
          onClose={() => setShowNutrition(false)}
          onOpenBodyweight={() => {
            setShowNutrition(false);
            setShowBodyweight(true);
          }}
        />
      )}
      {showWeekly && (
        <Modal open onClose={() => setShowWeekly(null)} title="Revisión semanal">
          <RexWeekly
            review={showWeekly}
            onAccept={() => {
              if (!showWeekly.suggestion) return;
              const next = applyMacroReview(athleteRepository.getProfile(), showWeekly.suggestion, todayIso);
              athleteRepository.saveProfile(next);
              setProfile(next);
            }}
            onDismiss={() => {
              if (!showWeekly.suggestion) return;
              const next = withMacroWeekReviewed(athleteRepository.getProfile(), showWeekly.suggestion.reviewKey);
              athleteRepository.saveProfile(next);
              setProfile(next);
            }}
            onDone={() => {
              const next = withWeekReviewed(athleteRepository.getProfile(), showWeekly.weekKey);
              athleteRepository.saveProfile(next);
              setProfile(next);
            }}
            onOpenEmphasis={() => {
              setShowWeekly(null);
              openEmphasisReview();
            }}
            onGoPlanificacion={() => {
              setShowWeekly(null);
              onNavigateToPlanificacion();
            }}
            onClose={() => setShowWeekly(null)}
          />
        </Modal>
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
            advice={advice}
            rest={isToday && todayStrain === null && (restMarked || (todaySession !== null && !todaySession.isRestDay)) ? { marked: restMarked, onToggle: toggleRest } : undefined}
            strain={shown.strain}
            start={dayStart}
            notDone={describeSkipped(shown.entry?.skipped)}
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
            form={isToday && formModel.plan.sessions > 0 ? formModel.plan : null}
            formNote={formRowNote(formModel)}
            onOpenForm={() => setFormOpen(true)}
            onNavigateToPlanificacion={onNavigateToPlanificacion}
          />
        </>
      )}

      {tab === 'esfuerzo' && (
        <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
          <WeekTrendCard build={buildTrend} selectedIso={dayIso} todayIso={todayIso} competitionDays={isToday ? (todaySession?.competition?.daysToEvent ?? null) : null} onSelect={setDayIso} />
          <StrainDetail view={shown.strain} onAdjust={onNavigateToPlanificacion} dayLabel={dayLabel(dayIso, todayIso)} isToday={isToday} />
        </div>
      )}
      {tab === 'preparacion' && (
        <PreparationTab
          readiness={shown.readiness}
          series={readinessSeries}
          dayIso={dayIso}
          isToday={isToday}
          log={profile.readinessLog ?? []}
          todayCheck={todayReadiness}
          learning={readinessLearning}
          onSelect={setDayIso}
          onOpenMorning={onOpenMorning}
        />
      )}
      {tab === 'sueno' && (
        <div className="animate-section-in motion-reduce:animate-none">
          <SleepTab log={profile.readinessLog ?? []} dayIso={dayIso} todayIso={todayIso} learning={readinessLearning} onSelect={setDayIso} onOpenMorning={onOpenMorning} />
        </div>
      )}
      {formOpen && (
        <Modal open onClose={() => setFormOpen(false)} title="Tu forma">
          <FormView
            model={formModel}
            onOpenMorning={() => {
              setFormOpen(false);
              onOpenMorning();
            }}
            onOpenSleep={() => {
              setFormOpen(false);
              setTab('sueno');
            }}
          />
        </Modal>
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
