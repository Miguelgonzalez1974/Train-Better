import { useCallback, useEffect, useMemo, useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeAdherenceStreak, computeWeekCount } from '../../engine/adherence';
import { getMonthlyStats } from './stats';
import { computeReadinessScore } from '../../engine/readinessScore';
import { computeReadinessLearning } from '../../engine/readinessLearning';
import { dayStrain, strainStatus } from '../../engine/strain';
import { buildStrainTarget, ensureStrainTarget, withPlannedStrain } from '../../engine/strainTarget';
import { acceptedCompanionLoad, companionTrainedDates, withCompanionLoad } from '../../engine/companionLoad';
import { generateCompanionSession } from '../../engine/generateSession';
import { estimatePlannedStrain, planFit } from '../../engine/plannedStrain';
import { learnStrain } from '../../engine/strainLearning';
import { getReadinessCheckForDate } from '../../engine/readiness';
import { dayAdvice } from '../../engine/dayAdvice';
import { getActivePainFlags, PAIN_AREA_LABEL } from '../../engine/painFlags';
import { isRestMarked, withRestMarked, withRestUnmarked } from '../../engine/restDays';
import { describeSkipped } from '../../engine/sessionParts';
import { RexCorner } from './RexCorner';
import {
  buildRexSuggestions,
  NUTRITION_HOUR,
  NUTRITION_LOW,
  dismissSuggestion,
  loadRexMemory,
  dockStats,
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
import { LevelCard } from './LevelCard';
import { applyGoalAdjustment, buildWeeklyReview, withWeekReviewed, type WeeklyReview } from './weeklyReview';
import { applyMacroReview, withMacroWeekReviewed } from '../../engine/macroReview';
import { resolveTodaySession } from './todaySession';
import type { StrainView } from './StrainRing';
import { isoDiffDays, toLocalIsoDate } from '../../engine/periodization';
import { buildGoalRows } from './progressOverview';
import { BalanceBox, DayRing, type DashTab } from './DayRing';
import { explainDone, explainEffort, explainLoad, explainObjective, explainPlanned, explainReadiness, type ExplainAction } from '../../engine/explainNumbers';
import { dayBalance } from '../../engine/dayBalance';
import { macroChip } from './dayHeader';
import { dayAnswer, type AskAnswer } from './rexAsk';
import { routeAsk } from './rexAskRouter';
import { describeDayForAsk } from './rexAskDay';
import { markRingHintSeen, ringHintSeen } from '../../lib/ringHint';
import { DashTabs, DayHeader, DaySelector, dayLabel, ringDayLabel, shiftDay, useDaySwipe } from './DashNav';
import { DayRows } from './DayRows';
import { DaySummaryModal } from './DaySummaryModal';
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
import { VolumeContent } from './VolumeSummaryModal';
import { BodyweightCard } from './BodyweightCard';
import { ThemeToggle } from '../shell/ThemeToggle';
import { computeImbalances } from '../../engine/imbalances';
import { AnalysisView, type AnalysisTab } from './AnalysisView';
import { MarksScreen } from './MarksScreen';
import { REX_HINTS } from './rexHints';
import type { AthleteProfile } from '../../data/athlete/types';
import type { MarkKey } from './rexMarks';
import { competitionToClose, nextCompetitionGoal } from '../../engine/postCompetition';
import { handoff } from '../../lib/handoff';
import { resetUpcomingSessions } from '../../lib/sessionCacheReset';
import { addSubirPrGoal } from './rexAnalysis';
import { Movilidad } from '../movilidad/Movilidad';
import { weeklyMobilityMinutes } from '../../engine/mobility';
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
    const next = ensureStrainTarget(current, withCompanionLoad(history, current.companionLog), toLocalIsoDate(new Date()));
    if (next !== current) athleteRepository.saveProfile(next);
    return next;
  });
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  // «Constancia y volumen»: una sola ventana con dos pestañas (antes eran dos botones de «Más» que miraban el historial).
  const [trainingView, setTrainingView] = useState<'constancia' | 'volumen' | null>(null);
  const [showBodyweight, setShowBodyweight] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  // Lo que otra pantalla deja dicho al llegar: «Mi perfil» abre el Análisis en su pestaña Perfil; «Mis marcas» abre esa pantalla (con un levantamiento desplegado si viene).
  const [handed] = useState<string | null>(() => handoff.peek('analisis-tab'));
  const handedMarks = handed === 'marcas' || handed?.startsWith('marcas:') ? { key: (handed.split(':')[1] as MarkKey | undefined) ?? null } : null;
  const [analysisStart, setAnalysisStart] = useState<AnalysisTab>('perfil');
  const [analysisOpen, setAnalysisOpen] = useState(handed === 'perfil');
  const [marks, setMarks] = useState<{ key: MarkKey | null } | null>(handedMarks);
  useEffect(() => {
    handoff.take('analisis-tab');
  }, []);
  const [formOpen, setFormOpen] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [showMobility, setShowMobility] = useState(false);
  /** «Lo que hiciste»: la sesión del macro y la del programa de fuerza del día elegido. */
  const [showDone, setShowDone] = useState(false);
  /** La revisión abierta: se guarda aquí porque al darla por vista deja de existir como pendiente y la conversación no debe cerrarse sola. */
  const [showWeekly, setShowWeekly] = useState<WeeklyReview | null>(null);
  // Día que se está mirando (hoy por defecto) y pestaña de arriba.
  const [dayIso, setDayIso] = useState(() => toLocalIsoDate(new Date()));
  const [tab, setTab] = useState<DashTab>('resumen');
  // Rex avisa de que los aros se tocan (globo de la esquina + latido de los aros) hasta el primer toque; no vuelve.
  const [ringHintPending, setRingHintPending] = useState(() => !ringHintSeen(typeof window !== 'undefined' ? window.localStorage : null));
  const markRingHint = () => {
    setRingHintPending(false);
    markRingHintSeen(typeof window !== 'undefined' ? window.localStorage : null);
  };
  // Deslizar el dedo sobre el anillo cambia de día (también están las flechas de arriba).
  const swipe = useDaySwipe((delta) => setDayIso((cur) => shiftDay(cur, delta, toLocalIsoDate(new Date()))));

  // Los días en que solo hiciste el programa de fuerza también cuentan como entrenados (calendario y días del año).
  const trainedDates = useMemo(() => [...new Set([...(profile.trainingDatesLog ?? []), ...companionTrainedDates(profile)])], [profile.trainingDatesLog, profile.companionLog]);
  const stats = useMemo(() => getMonthlyStats(history, trainedDates), [history, trainedDates]);
  // La carga y el esfuerzo cuentan también el programa de fuerza que convive con el macro (Texas): ver `engine/companionLoad.ts`. Lo que aprende el coach de tus aciertos sigue con el historial del macro solo.
  const loadHistory = useMemo(() => withCompanionLoad(history, profile.companionLog), [history, profile.companionLog]);
  const acwr = useMemo(() => computeAcwr(loadHistory), [loadHistory]);
  const acwrTrend = useMemo(() => getAcwrTrend(loadHistory), [loadHistory]);
  const todayIso = toLocalIsoDate(new Date());
  const formModel = useMemo(() => buildFormModel(profile, loadHistory, todayIso), [profile, loadHistory, todayIso]);
  const goalRows = useMemo(() => buildGoalRows(profile.goals, history, profile.prs), [profile.goals, history, profile.prs]);
  const imbalanceGroups = useMemo(() => computeImbalances(profile.prs, profile.variantPrs, history), [profile.prs, profile.variantPrs, history]);
  const weekCount = useMemo(() => computeWeekCount(profile, history, new Date()), [profile, history]);
  const yearConsistency = useMemo(() => computeYearConsistency(profile, history, new Date()), [profile, history]);
  // La revisión de la semana pasada con Rex (de lunes a miércoles, hasta darla por vista).
  const weeklyReview = useMemo(() => buildWeeklyReview(profile, history, new Date()), [profile, history]);
  // «Tu semana» en «Más»: la última semana completa, a cualquier hora, la hayas repasado ya o no.
  const anytimeReview = useMemo(() => buildWeeklyReview(profile, history, new Date(), { anytime: true }), [profile, history]);

  // --- Métricas del Análisis: solo lo que ya se calcula en algún sitio de la app, ninguna inventada. ---
  // Fuerza relativa: el total de los tres grandes (sentadilla, banca, peso muerto) en veces tu peso corporal.
  const latestBodyweightKg = [...bodyweightLog].sort((a, b) => a.date.localeCompare(b.date)).pop()?.kg;
  const strengthTotalKg = profile.prs.backSquat + profile.prs.benchPress + profile.prs.deadlift;
  const strengthRatio = latestBodyweightKg ? strengthTotalKg / latestBodyweightKg : null;
  // Nota de preparación: el check-in más tu carga y cómo te salen las sesiones (ver `computeReadinessScore`).
  const readiness = computeReadinessScore({ readinessLog: profile.readinessLog, history: loadHistory, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: new Date() });
  const readinessLearning = computeReadinessLearning(profile.readinessLog, history);
  const todayStrain = dayStrain(loadHistory.find((h) => h.date === todayIso));
  const strainTarget = profile.strainTargets?.[todayIso] ?? buildStrainTarget(profile, loadHistory, todayIso);
  const strainState = strainStatus(todayStrain, strainTarget);
  const todaySession = useMemo(() => resolveTodaySession(profile, history, todayIso), [profile, history, todayIso]);
  const strainLearned = useMemo(() => learnStrain(profile, history, todayIso), [profile, history, todayIso]);
  // La sesión del programa que has aceptado hacer hoy se suma al esfuerzo previsto (el anillo y el aviso de «se pasa» cuentan con ella).
  const companionExtra = useMemo(() => acceptedCompanionLoad(profile, todayIso, (p) => generateCompanionSession(profile, history, p, todayIso, { neutral: true })), [profile, history, todayIso]);
  const plannedStrain = useMemo(
    () => (todaySession ? estimatePlannedStrain(todaySession, history, strainLearned.bias, companionExtra) : null),
    [todaySession, history, strainLearned.bias, companionExtra],
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
  // Las sesiones del programa de fuerza que convive con el macro, hechas o saltadas el día elegido.
  const dayCompanion = (profile.companionLog ?? []).filter((e) => e.date === dayIso);
  const pastView = useMemo(() => (isToday ? null : buildPastDayView(profile, loadHistory, dayIso, strainLearned)), [isToday, profile, loadHistory, dayIso, strainLearned]);
  const shown = pastView ?? { readiness, acwr, trend: acwrTrend, strain: strainView, entry: loadHistory.find((h) => h.date === todayIso) };
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
  const buildTrend = useCallback((days: number, offsetDays = 0) => buildTrendPoints(profile, loadHistory, dayIso, todayIso, days, plannedToday, offsetDays), [profile, loadHistory, dayIso, todayIso, plannedToday]);
  const readinessSeries = useMemo(() => (tab === 'preparacion' ? buildReadinessSeries(profile, loadHistory, dayIso, 14) : []), [tab, profile, loadHistory, dayIso]);
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
    withProgram: companionExtra !== null,
  });

  // Rex, arriba del todo: qué toca ahora y atajos a los módulos. Lee lo mismo que el resto del Dashboard.
  const goalsBehind = useMemo(() => buildOpenItems(profile, history, todayIso).objetivos.filter((i) => i.chip.tone === 'warn').length, [profile, history, todayIso]);
  const lastWeightDate = bodyweightLog.reduce<string | null>((best, e) => (best === null || e.date > best ? e.date : best), null);
  const daysSinceWeight = lastWeightDate === null ? null : Math.max(0, Math.round((new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${lastWeightDate}T00:00:00`).getTime()) / 86_400_000));
  const streak = useMemo(() => computeAdherenceStreak(profile, history, todayIso), [profile, history, todayIso]);
  const emphasisReviewNew = Boolean(
    profile.emphasisPlan?.review && !profile.emphasisPlan.review.seen && !profile.emphasisPlan.review.noticed && profile.emphasisPlan.review.entries.some((e) => e.decision !== 'esperar'),
  );
  // Se puede marcar hoy como descanso mientras haya sesión que descansar (o ya esté marcado) y no se haya entrenado.
  const canRest = isToday && todayStrain === null && (restMarked || (todaySession !== null && !todaySession.isRestDay));
  // El balance del día cerrado (previsto frente a hecho): Rex lo resume en una frase y el detalle se abre aparte.
  const dayBalanceNow = isToday
    ? dayBalance({ planned: dayStart.planned, real: shown.strain.real, target: shown.strain.target, status: shown.strain.status, isToday, prepMorning: dayStart.prep, prepNow: shown.readiness.total })
    : null;
  const provisionalNext = nextCompetitionGoal(profile.goals, todayIso);
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
    trainedToday: todayStrain !== null,
    hasSessionToday: todaySession !== null && !todaySession.isRestDay,
    restMarked,
    canRest,
    advice: isToday && todayStrain === null ? { lead: advice.lead, reason: advice.reason, tone: advice.tone, overTarget: strainView.fit?.fit === 'se-pasa' } : null,
    closing:
      isToday && todayStrain !== null
        ? {
            real: todayStrain,
            low: strainTarget.low,
            high: strainTarget.high,
            planned: dayStart.planned,
            status: strainState,
            notDone: describeSkipped(shown.entry?.skipped),
            hasDetail: dayBalanceNow !== null,
          }
        : null,
    weeklyReviewRange: weeklyReview ? weekRangeText(weeklyReview.from, weeklyReview.to) : null,
    competitionClosedDaysAgo: competitionToClose(profile.goals, todayIso)?.daysSince ?? null,
    provisionalCompetition: provisionalNext?.provisional
      ? { days: isoDiffDays(todayIso, provisionalNext.targetDate), dateText: new Date(`${provisionalNext.targetDate}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '') }
      : null,
    emphasisReviewPending: emphasisReviewNew,
    nutritionPercent: isToday ? nutritionPercent : null,
    streak,
    goalsBehind,
    painLabels: getActivePainFlags(profile.painFlags, todayIso).map((f) => PAIN_AREA_LABEL[f.area]),
    daysSinceWeight,
  });
  const [rexMemory, setRexMemory] = useState<RexMemory>(() => loadRexMemory(typeof window !== 'undefined' ? window.localStorage : null));
  // Pasar a «la otra cosa» que Rex tiene que contar sin apartar la actual; se reinicia al cambiar de día.
  const [rexCursor, setRexCursor] = useState(0);
  useEffect(() => setRexCursor(0), [dayIso]);
  const rexPick = pickRexSuggestion(rexList, rexMemory, todayIso, rexCursor);
  // El globo fijo de Rex en el Dashboard: su frase del momento (estado del día y qué hacer), las cifras del objetivo y, mientras no hayas tocado
  // ningún aro, la pista de que se pueden tocar. Se pliega con la flechita, pero siempre está.
  const rexDockStats = dockStats({
    low: shown.strain.target?.low ?? null,
    high: shown.strain.target?.high ?? null,
    real: shown.strain.real,
    planned: isToday ? (dayStart.planned ?? shown.strain.planned?.strain ?? null) : null,
    // Si la frase de Rex ya dice el rango del objetivo, no se repite en la línea de cifras.
    skipTarget: shown.strain.target ? rexPick.current.text.includes(`${shown.strain.target.low}–${shown.strain.target.high}`) : false,
  });
  function updateRexMemory(change: (m: RexMemory) => RexMemory) {
    setRexMemory((prev) => {
      const next = change(prev);
      if (next !== prev) saveRexMemory(typeof window !== 'undefined' ? window.localStorage : null, next);
      return next;
    });
  }
  /** La semana que «Tu semana» abre: la pendiente (lunes a miércoles) o, si no, la última completa. */
  const reviewable = weeklyReview ?? anytimeReview;
  const rexBadges: Partial<Record<RexTarget, string>> = {
    ...(yearConsistency.pct !== null ? { constancia: `${yearConsistency.pct} %` } : {}),
    ...(goalRows.length > 0 ? { objetivos: String(goalRows.length) } : {}),
    ...(nutritionPercent !== null ? { nutricion: `${nutritionPercent} %` } : {}),
    ...(reviewable ? { semana: `${reviewable.sessions.done} de ${reviewable.sessions.planned}` } : {}),
    ...(weeklyMobilityMinutes(profile, todayIso) > 0 ? { movilidad: `${weeklyMobilityMinutes(profile, todayIso)} min` } : {}),
  };
  // Un punto en «Más» (y en el módulo) cuando algo pide mirar: revisión sin ver o nutrición floja por la tarde.
  const nutritionLow = isToday && nutritionPercent !== null && nutritionPercent < NUTRITION_LOW && new Date().getHours() >= NUTRITION_HOUR;
  const rexDots: RexTarget[] = [
    ...(nutritionLow ? (['nutricion'] as RexTarget[]) : []),
    ...(weeklyReview ? (['semana'] as RexTarget[]) : []),
  ];
  function runRexTarget(target: RexTarget) {
    switch (target) {
      case 'checkin':
        return onOpenMorning();
      case 'semana':
        // Si hay una revisión pendiente (lunes a miércoles) se abre esa; si no, la última semana completa.
        return reviewable && setShowWeekly(reviewable);
      case 'revision-enfasis':
        return openEmphasisReview();
      case 'constancia':
        return setTrainingView('constancia');
      case 'volumen':
        return setTrainingView('volumen');
      // El Análisis abre en el Perfil (la rueda y las áreas); «Mi perfil» ya no es un botón aparte, pero «perfil» en la caja lleva al mismo sitio.
      case 'analisis':
      case 'perfil':
        setAnalysisStart('perfil');
        return setAnalysisOpen(true);
      case 'marcas':
        return setMarks({ key: null });
      case 'objetivos':
        return onNavigateToObjetivos();
      case 'competicion-fecha':
        // Objetivos abre el asistente de Rex en la pregunta de la fecha de la competición.
        handoff.put('objetivos-asistente', 'fecha-competicion');
        return onNavigateToObjetivos();
      case 'competicion-cierre':
        // Objetivos abre directamente el asistente de Rex en el cierre de la competición.
        handoff.put('objetivos-asistente', 'competicion');
        return onNavigateToObjetivos();
      case 'nutricion':
        return setShowNutrition(true);
      case 'peso':
        return setShowBodyweight(true);
      case 'forma':
        return setFormOpen(true);
      case 'preparacion':
        return setTab('preparacion');
      case 'planificacion':
        return onNavigateToPlanificacion();
      case 'hoy':
        return setDayIso(todayIso);
      case 'descanso':
        return toggleRest();
      case 'detalle-dia':
        return setShowDayDetail(true);
      case 'movilidad':
        return setShowMobility(true);
    }
  }

  /** «Pregúntale a Rex»: lo que cuenta de cada número del anillo (con el desglose real), y a dónde lleva cada botón de su globo. */
  const explanations = {
    preparacion: explainReadiness(shown.readiness),
    carga: explainLoad(shown.acwr, shown.readiness.loadPenalty),
    realizado: explainDone({
      real: shown.strain.real,
      planned: dayStart.planned ?? shown.strain.planned?.strain ?? null,
      target: shown.strain.target,
      status: shown.strain.status,
      rpe: shown.entry?.rpe,
      minutes: shown.entry?.durationMin,
    }),
    esfuerzo: explainEffort({
      real: shown.strain.real,
      planned: dayStart.planned ?? shown.strain.planned?.strain ?? null,
      target: shown.strain.target,
      status: shown.strain.status,
    }),
    previsto: explainPlanned(shown.strain.planned, shown.strain.target, shown.strain.fit),
    objetivo: explainObjective(shown.strain.target),
  };
  function runExplainAction(action: ExplainAction) {
    if (action === 'ver-preparacion') setTab('preparacion');
    else if (action === 'ver-esfuerzo') setTab('esfuerzo');
    else if (action === 'ver-carga') setShowLoad(true);
    else if (action === 'recovery') setShowMobility(true);
    else onNavigateToPlanificacion();
  }

  /** Guardar las marcas editadas (desde «Mis marcas»): una marca distinta cambia los pesos, así que las sesiones ya generadas se recalculan al abrirlas. */
  function saveMarks(patch: Pick<AthleteProfile, 'prs' | 'variantPrs'>) {
    athleteRepository.saveProfile({ ...athleteRepository.getProfile(), ...patch });
    resetUpcomingSessions(todayIso);
    setProfile(athleteRepository.getProfile());
  }

  /** «Pregúntale a Rex»: el reparto común de `rexAskRouter.ts`, con lo que el Dashboard hace por su cuenta (qué toca, cómo estás, abrir un módulo). */
  function askRex(text: string): AskAnswer | 'close' {
    return routeAsk(text, 'dashboard', {
      todayIso,
      onWeightLogged: () => setBodyweightLog(athleteRepository.getBodyweightLog()),
      onMarkSaved: () => setProfile(athleteRepository.getProfile()),
      onWeekChanged: () => setProfile(athleteRepository.getProfile()),
      openMarks: (key) => setMarks({ key }),
      missing: () => (nutrition ? { protein: Math.max(0, nutrition.protein.target - nutrition.protein.done), carbs: Math.max(0, nutrition.carbs.target - nutrition.carbs.done) } : null),
      local: {
        dia: (intent) => dayAnswer(intent.label, describeDayForAsk({ offset: intent.offset, todayIso, profile, history, todaySession, todayStrain, bias: strainLearned.bias })),
        estado: () => {
          const prep = explanations.preparacion;
          const effort = explanations.esfuerzo;
          const tone = prep.tone === 'good' || prep.tone === 'mid' || prep.tone === 'bad' || prep.tone === 'info' ? prep.tone : 'info';
          return { lead: prep.lead, tone, text: `${shown.readiness.total !== null ? `Preparación ${shown.readiness.total} sobre 100. ` : ''}${effort.text}`, actions: [{ label: 'Ver la preparación', target: 'preparacion' }] };
        },
        modulo: (intent) => {
          runRexTarget(intent.target);
          return 'close';
        },
      },
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-44">
      {/* Rex, abajo a la derecha y siempre a la vista: dice el estado del día y qué hacer, y su botón RexLab abre el lab con atajos y módulos. */}
      <RexCorner
        speak={false}
        ask={askRex}
        hints={REX_HINTS.dashboard}
        dock={{ stats: rexDockStats, tip: ringHintPending && tab === 'resumen' ? 'Toca un aro o un número para ver de dónde sale.' : null }}
        suggestion={rexPick.current}
        waiting={rexPick.waiting}
        typedAlready={wasTyped(rexMemory, rexPick.current.id, todayIso)}
        badges={rexBadges}
        dots={rexDots}
        hide={reviewable ? [] : ['semana']}
        extra={<ThemeToggle label className="!h-auto !w-full justify-start gap-2 px-3 py-2" />}
        onAction={runRexTarget}
        onDismiss={() => updateRexMemory((m) => dismissSuggestion(m, rexPick.current.id, todayIso))}
        onNext={() => setRexCursor((c) => c + 1)}
        onTyped={() => updateRexMemory((m) => withTyped(m, rexPick.current.id, todayIso))}
      />
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
            onAdjustGoal={(goalId, patch) => {
              const next = applyGoalAdjustment(athleteRepository.getProfile(), goalId, patch);
              athleteRepository.saveProfile(next);
              // La meta cambia la prioridad del levantamiento: las sesiones ya preparadas se vuelven a generar.
              resetUpcomingSessions(todayIso);
              setProfile(athleteRepository.getProfile());
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
      <DayHeader dayIso={dayIso} macro={macroChip(profile.macrocycles, todayIso, todaySession?.competition?.daysToEvent ?? null)} onOpenMacro={() => onNavigateToObjetivos()} />
      <DaySelector dayIso={dayIso} todayIso={todayIso} onChange={setDayIso} />
      <DashTabs tab={tab} onChange={setTab} />

      {tab === 'resumen' && (
        <>
          {/*
            El estado del día: el check-in (el primer gesto de la mañana: al contestar se fija el objetivo de esfuerzo y se
            rehace la sesión) y los dos anillos, esfuerzo y preparación. Tocar un número le pregunta a Rex de dónde sale.
          */}
          <div {...swipe} className="touch-pan-y">
          <DayRing
            strain={shown.strain}
            start={dayStart}
            notDone={describeSkipped(shown.entry?.skipped)}
            readiness={shown.readiness}
            acwr={shown.acwr}
            centerLabel={ringDayLabel(dayIso, todayIso)}
            isToday={isToday}
            explanations={explanations}
            onExplainAction={runExplainAction}
            hintPending={ringHintPending}
            onHintSeen={markRingHint}
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
            companionDone={dayCompanion}
            onOpenDone={() => setShowDone(true)}
            onNavigateToPlanificacion={onNavigateToPlanificacion}
            // Tu nivel: una fila más de «Tu día» que se abre con el radar del perfil; solo hoy y con datos de tres áreas.
            extra={
              isToday ? (
                <LevelCard
                  profile={profile}
                  history={history}
                  onOpen={() => {
                    setAnalysisStart('perfil');
                    setAnalysisOpen(true);
                  }}
                />
              ) : null
            }
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
      {showMobility && (
        <Modal open onClose={() => setShowMobility(false)} title="Recovery">
          <Movilidad
            profile={profile}
            todayIso={todayIso}
            session={todaySession}
            trainedToday={todayStrain !== null}
            onProfileChange={(next) => {
              athleteRepository.saveProfile(next);
              setProfile(next);
            }}
            onClose={() => setShowMobility(false)}
          />
        </Modal>
      )}
      {showDayDetail && dayBalanceNow && (
        <Modal open onClose={() => setShowDayDetail(false)} title="Cómo ha ido el día">
          <BalanceBox balance={dayBalanceNow} target={shown.strain.target} isToday notDone={describeSkipped(shown.entry?.skipped)} />
        </Modal>
      )}
      {showDone && (
        <DaySummaryModal
          open
          onClose={() => setShowDone(false)}
          dayLabel={dayLabel(dayIso, todayIso)}
          // La sesión del macro tal como se registró, sin la carga del programa sumada (esa sale debajo, en su propio bloque).
          entry={history.find((h) => h.date === dayIso)}
          session={isToday ? athleteRepository.getCachedSession(dayIso) : (profile.sessionCache?.[dayIso] ?? null)}
          workLog={athleteRepository.getWorkLog()}
          companion={dayCompanion}
          onOpenPlan={isToday ? () => {
            setShowDone(false);
            onNavigateToPlanificacion();
          } : undefined}
        />
      )}
      {showLoad && (
        <Modal open onClose={() => setShowLoad(false)} title="Carga">
          <AcwrGauge result={shown.acwr} trend={shown.trend} />
        </Modal>
      )}

      {trainingView && (
        <Modal open onClose={() => setTrainingView(null)} title="Constancia y volumen">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.05] p-1" role="tablist" aria-label="Constancia y volumen">
            {(['constancia', 'volumen'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={trainingView === v}
                onClick={() => setTrainingView(v)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${trainingView === v ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                {v === 'constancia' ? 'Constancia' : 'Volumen por día'}
              </button>
            ))}
          </div>
          {trainingView === 'constancia' ? (
            <ConsistencyDetail
              week={weekCount}
              monthDays={stats.diasEntrenados}
              year={yearConsistency}
              calendar={<TrainingHeatmap history={history} trainingDates={trainedDates} trainingDaysPerWeek={profile.trainingDaysPerWeek} macrocycles={profile.macrocycles} />}
            />
          ) : (
            <VolumeContent />
          )}
        </Modal>
      )}

      {/*
        Análisis: lo que no hace falta mirar cada día. Vive en una ventana que se abre desde la fila "Análisis" de "Tu día", así el
        Resumen no se alarga. Dentro, los medidores (dominios energéticos, desequilibrios, fuerza) son la puerta a su detalle: solo
        sale la tarjeta del medidor tocado.
      */}
      {marks && (
        <MarksScreen
          profile={profile}
          history={history}
          imbalanceGroups={imbalanceGroups}
          strengthRatio={strengthRatio}
          bodyweightKg={latestBodyweightKg}
          todayIso={todayIso}
          initialKey={marks.key}
          onSaveProfile={saveMarks}
          onCreateGoal={(movementId) => {
            const next = addSubirPrGoal(athleteRepository.getProfile(), movementId, todayIso);
            athleteRepository.saveProfile(next);
            setProfile(next);
          }}
          onOpenObjetivos={() => {
            setMarks(null);
            onNavigateToObjetivos();
          }}
          onClose={() => setMarks(null)}
        />
      )}

      {analysisOpen && (
        <Modal open onClose={() => setAnalysisOpen(false)} title="Análisis">
          <AnalysisView
            profile={profile}
            history={history}
            imbalanceGroups={imbalanceGroups}
            strengthRatio={strengthRatio}
            stats={stats}
            todayIso={todayIso}
            initialTab={analysisStart}
            onSaveProfile={(patch) => {
              athleteRepository.saveProfile({ ...athleteRepository.getProfile(), ...patch });
              setProfile(athleteRepository.getProfile());
            }}
            onCreateWorkGoal={(goal) => {
              athleteRepository.saveProfile({ ...athleteRepository.getProfile(), goals: [...athleteRepository.getProfile().goals, goal] });
              // Un objetivo nuevo cambia lo que sale en las sesiones: las ya preparadas se vuelven a generar.
              resetUpcomingSessions(todayIso);
              setProfile(athleteRepository.getProfile());
            }}
            onOpenProgramming={() => {
              setAnalysisOpen(false);
              onNavigateToObjetivos('perfil');
            }}
            onCreateGoal={(movementId) => {
              const next = addSubirPrGoal(athleteRepository.getProfile(), movementId, todayIso);
              athleteRepository.saveProfile(next);
              setProfile(next);
            }}
            onOpenObjetivos={() => {
              setAnalysisOpen(false);
              onNavigateToObjetivos();
            }}
          />
        </Modal>
      )}    </div>
  );
}
