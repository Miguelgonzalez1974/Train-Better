import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { computeAcwr, getAcwrTrend } from '../../engine/loadMetrics';
import { computeAdherenceStreak, computeWeekCount } from '../../engine/adherence';
import { getMonthlyStats } from './stats';
import { loadHistoryFor, readinessAt } from '../../engine/readinessAt';
import { computeReadinessLearning } from '../../engine/readinessLearning';
import { dayStrain, strainStatus } from '../../engine/strain';
import { buildStrainTarget, ensureStrainTarget, withPlannedStrain } from '../../engine/strainTarget';
import { acceptedCompanionLoad, companionTrainedDates, withExtraLoad } from '../../engine/companionLoad';
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
import { MyWeek, type WeekView } from './MyWeek';
import { STRENGTH_METHOD_LABEL } from '../../engine/strengthPrograms';
import { LevelSummaryCard } from './LevelSummaryCard';
import { LevelScreen, type LevelChip } from './LevelScreen';
import { buildLevelCard } from './myLevelModel';
import { computeLevel } from '../../engine/levelCategories';
import { applyGoalAdjustment, buildWeeklyReview, withWeekReviewed, type WeeklyReview } from './weeklyReview';
import { applyMacroReview, withMacroWeekReviewed } from '../../engine/macroReview';
import { resolveTodaySession } from './todaySession';
import type { StrainView } from './StrainRing';
import { isoDiffDays, toLocalIsoDate } from '../../engine/periodization';
import { BalanceBox, DayRing } from './DayRing';
import { explainDone, explainEffort, explainLoad, explainObjective, explainPlanned, explainReadiness, type ExplainId } from '../../engine/explainNumbers';
import { explanationToAnswer, ringQuestion } from './rexRing';
import { dayBalance } from '../../engine/dayBalance';
import { macroChip } from './dayHeader';
import { dayAnswer, type AskAnswer } from './rexAsk';
import { applyWeekPlan, routeAsk, undoWeekChange } from './rexAskRouter';
import { WeekMoveCard } from './WeekMoveCard';
import { weekMoveSuggestion, weekMoveTitle } from './rexWeekMove';
import { shortSessionLabel } from './rexMove';
import { proposeWeekMove, type WeekMoveProposal } from '../../lib/weekCoach';
import { loadWeekMoveMemory, saveWeekMoveMemory, withWeekMoveStatus, type WeekMoveMemory, type WeekMoveStatus } from '../../lib/weekMoveMemory';
import { describeDayForAsk } from './rexAskDay';
import { markRingHintSeen, ringHintSeen } from '../../lib/ringHint';
import { DayHeader, DaySelector, dayLabel, ringDayLabel, shiftDay, useDaySwipe } from './DashNav';
import { DayRows } from './DayRows';
import { buildSessionCard } from './sessionCardModel';
import { DaySummaryModal } from './DaySummaryModal';
import { nutritionPct, type NutritionSummary } from './nutritionSummary';
import { FormView } from './FormCurve';
import { buildFormModel } from './formModel';
import { buildFormCard } from './formCardModel';
import { FormScreen, type FormChip } from './FormScreen';
import { LoadPanel } from './LoadPanel';
import { formToday } from '../../engine/formCurve';
import { wodCategoryNeed } from '../../engine/levelCategories';
import { classifyNutritionDay } from '../../engine/nutritionPlan';
import { dayTarget, eatenFor } from '../nutricion/nutritionData';
import { buildPastDayView, buildReadinessSeries, buildTrendPoints } from './pastDay';
import { WeekTrendCard } from './WeekTrendCard';
import { TrainingDiary } from './TrainingDiary';
import { SleepTab } from './SleepHabits';
import { StrainDetail } from './StrainRing';
import { PreparationTab } from './PreparationTab';
import { ConsistencyDetail } from './ConsistencyDetail';
import { computeYearConsistency } from '../../engine/yearConsistency';
import { TrainingHeatmap } from './TrainingHeatmap';
import { VolumeContent } from './VolumeSummaryModal';
import { ThemeToggle } from '../shell/ThemeToggle';
import { computeImbalances } from '../../engine/imbalances';
import { hrvLogWith } from '../../engine/hrv';
import { REX_HINTS } from './rexHints';
import type { AthleteProfile } from '../../data/athlete/types';
import type { MarkKey } from './rexMarks';
import { competitionToClose, nextCompetitionGoal } from '../../engine/postCompetition';
import { handoff } from '../../lib/handoff';
import { toast } from '../../lib/toast';
import { appNav } from '../../lib/appNav';
import { buildSessionSummaryData, e1rmSuggestionKey, summaryHighlight, type E1rmSuggestion } from '../../engine/sessionSummary';
import { resetUpcomingSessions } from '../../lib/sessionCacheReset';
import { addSubirPrGoal } from './rexAnalysis';
import { Movilidad } from '../movilidad/Movilidad';
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
  const [history, setHistory] = useState(() => athleteRepository.getHistory());
  // Al abrir el Dashboard se fija el objetivo de esfuerzo de hoy (si aún no lo estaba): idempotente.
  const [profile, setProfile] = useState(() => ensureStrainTarget(athleteRepository.getProfile(), history, toLocalIsoDate(new Date())));
  // Se guarda en un efecto, no al pintar: `saveProfile` avisa al indicador de sincronización, que cambia su estado en el acto.
  // Tiene que ir antes del efecto que anota el esfuerzo previsto, porque ese parte del objetivo ya guardado.
  useEffect(() => {
    const current = athleteRepository.getProfile();
    const next = ensureStrainTarget(current, athleteRepository.getHistory(), toLocalIsoDate(new Date()));
    if (next !== current) athleteRepository.saveProfile(next);
  }, []);
  const [bodyweightLog, setBodyweightLog] = useState(() => athleteRepository.getBodyweightLog());
  // «Historial»: una sola ventana con tres pestañas (Diario, Constancia y Volumen). Se abre con la tesela «Historial», con «mi historial» en la caja de Rex o desde otra pantalla.
  const [trainingView, setTrainingView] = useState<'diario' | 'constancia' | 'volumen' | null>(() => {
    const act = handoff.peek('dash-act');
    return act === 'historial' ? 'diario' : act === 'constancia' || act === 'volumen' ? act : null;
  });
  const [showNutrition, setShowNutrition] = useState(false);
  // Lo que otra pantalla deja dicho al llegar: «Mi perfil» abre el Análisis en su pestaña Perfil; «Mis marcas» abre esa pantalla (con un levantamiento desplegado si viene).
  const [handed] = useState<string | null>(() => handoff.peek('analisis-tab'));
  const handedMarks = handed === 'marcas' || handed?.startsWith('marcas:') ? { key: (handed.split(':')[1] as MarkKey | undefined) ?? null } : null;
  /** La pantalla «Tu nivel» abierta por uno de sus apartados (null: cerrada), con el levantamiento que «Marcas» enseña desplegado. */
  const [levelScreen, setLevelScreen] = useState<{ chip: LevelChip; mark: MarkKey | null } | null>(
    handedMarks ? { chip: 'marcas', mark: handedMarks.key } : handed === 'perfil' ? { chip: 'nivel', mark: null } : null,
  );
  const openLevel = (chip: LevelChip, mark: MarkKey | null = null) => setLevelScreen({ chip, mark });
  useEffect(() => {
    handoff.take('analisis-tab');
  }, []);
  /** La pantalla «Tu forma» abierta por uno de sus apartados (null: cerrada). */
  const [formChip, setFormChip] = useState<FormChip | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [showMobility, setShowMobility] = useState(false);
  /** «Lo que hiciste»: la sesión del macro y la del programa de fuerza del día elegido. */
  // Se abre sola cuando Planificación manda aquí a ver el resumen («Ver resumen» de Rex tras cerrar la sesión).
  const [showDone, setShowDone] = useState(() => handoff.peek('dash-act') === 'resumen');
  useEffect(() => {
    handoff.take('dash-act');
  }, []);
  /** La pregunta que se hizo a Rex tocando un aro (con su respuesta): abre el panel de Rex. */
  const [ringAsk, setRingAsk] = useState<{ id: number; question: string; answer: AskAnswer } | null>(null);
  /** Sugerencias de 1RM de hoy que se dijo «Ahora no»: no vuelven a salir en esta visita. */
  const [dismissedE1rm, setDismissedE1rm] = useState<string[]>([]);
  /** «Mi semana» abierta: el botón elegido y la revisión de la pasada, guardada aquí porque al darla por vista deja de existir como pendiente. */
  const [weekWindow, setWeekWindow] = useState<{ view: WeekView; review: WeeklyReview | null } | null>(null);
  // El coach propone mover un día de la semana según tu curva de forma (ver `lib/weekCoach.ts`): la ficha y lo que se hizo ya esta semana.
  // La propuesta abierta se guarda aparte: al aplicarla (o dejarla) deja de salir en Rex, pero la ficha sigue abierta para enseñar «Hecho» y «Deshacer».
  const [openWeekMove, setOpenWeekMove] = useState<WeekMoveProposal | null>(null);
  const [weekMoveMemory, setWeekMoveMemory] = useState<WeekMoveMemory>(() => loadWeekMoveMemory(typeof window !== 'undefined' ? window.localStorage : null));
  // Día que se está mirando (hoy por defecto).
  // Se abre en ese día si Planificación manda aquí a mirar uno ya hecho (la tira de la semana): `dia:yyyy-mm-dd`. Un día futuro o mal escrito no vale.
  const [dayIso, setDayIso] = useState(() => {
    const today = toLocalIsoDate(new Date());
    const act = handoff.peek('dash-act');
    const wanted = act?.startsWith('dia:') ? act.slice(4) : null;
    return wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) && wanted <= today ? wanted : today;
  });
  // Rex avisa de que los aros se tocan (globo de la esquina + latido de los aros) hasta el primer toque; no vuelve.
  const [ringHintPending, setRingHintPending] = useState(() => !ringHintSeen(typeof window !== 'undefined' ? window.localStorage : null));
  const markRingHint = () => {
    setRingHintPending(false);
    markRingHintSeen(typeof window !== 'undefined' ? window.localStorage : null);
  };
  // Deslizar el dedo sobre el anillo cambia de día (también están las flechas de arriba).
  const swipe = useDaySwipe((delta) => setDayIso((cur) => shiftDay(cur, delta, toLocalIsoDate(new Date()))));

  // Los días en que solo hiciste el programa de fuerza también cuentan como entrenados (calendario y días del año).
  const trainedDates = useMemo(() => [...new Set([...(profile.trainingDatesLog ?? []), ...companionTrainedDates(profile)])], [profile.trainingDatesLog, profile.companionLog, profile.workouts]);
  const stats = useMemo(() => getMonthlyStats(history, trainedDates), [history, trainedDates]);
  // La carga y el esfuerzo cuentan también el programa de fuerza que convive con el macro (Texas): ver `engine/companionLoad.ts`. Lo que aprende el coach de tus aciertos sigue con el historial del macro solo.
  const loadHistory = useMemo(() => withExtraLoad(profile, history), [history, profile.companionLog, profile.workouts]);
  // La carga acumulada cuenta todos los días de entreno (también los de solo programa de fuerza), igual que la preparación.
  const engineLoad = useMemo(() => loadHistoryFor(profile, history), [history, profile.companionLog, profile.workouts]);
  const acwr = useMemo(() => computeAcwr(engineLoad), [engineLoad]);
  const acwrTrend = useMemo(() => getAcwrTrend(engineLoad), [engineLoad]);
  const todayIso = toLocalIsoDate(new Date());
  const formModel = useMemo(() => buildFormModel(profile, engineLoad, todayIso), [profile, engineLoad, todayIso]);
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
  const readiness = readinessAt(profile, history, new Date());
  const readinessLearning = computeReadinessLearning(profile.readinessLog, history);
  const todayStrain = dayStrain(loadHistory.find((h) => h.date === todayIso));
  const strainTarget = profile.strainTargets?.[todayIso] ?? buildStrainTarget(profile, loadHistory, todayIso);
  const strainState = strainStatus(todayStrain, strainTarget);
  const todaySession = useMemo(() => resolveTodaySession(profile, history, todayIso), [profile, history, todayIso]);
  // El resumen de la sesión de hoy (ya hecha): lo que decide el coach, el PR, las sugerencias de 1RM y la racha, desde lo guardado.
  const todayEntry = useMemo(() => history.find((h) => h.date === todayIso), [history, todayIso]);
  const todayCached = useMemo(() => (todayEntry ? athleteRepository.getCachedSession(todayIso) : null), [todayEntry, todayIso]);
  const summaryData = useMemo(
    () => (todayEntry && todayCached ? buildSessionSummaryData({ session: todayCached, entry: todayEntry, profile, history, now: new Date() }) : null),
    [todayEntry, todayCached, profile, history],
  );
  const e1rmSuggestions = useMemo(() => (summaryData ? summaryData.e1rmSuggestions.filter((s) => !dismissedE1rm.includes(e1rmSuggestionKey(s))) : []), [summaryData, dismissedE1rm]);
  function confirmE1rm(s: E1rmSuggestion) {
    const next = s.target.kind === 'variant' ? { ...profile, variantPrs: { ...profile.variantPrs, [s.target.key]: s.estimatedKg } } : { ...profile, prs: { ...profile.prs, [s.target.key]: s.estimatedKg } };
    athleteRepository.saveProfile(next);
    setProfile(next);
    // Sin esto, el punto débil y el progreso de un objetivo (que leen testLoadKg del historial y no los PRs) no verían esta subida real.
    athleteRepository.updateHistoryTestLoad(todayIso, s.estimatedKg);
    toast.show(`PR de ${s.movementName} actualizado a ${s.estimatedKg} kg`);
  }
  const dismissE1rm = (s: E1rmSuggestion) => setDismissedE1rm((prev) => [...prev, e1rmSuggestionKey(s)]);
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
  // Datos de las gráficas de «Tu forma» (solo se calculan al abrirla).
  // Los datos de la tendencia (apartado Carga): se calculan al dibujarla, para el rango que se pida. Hoy lleva el esfuerzo previsto.
  const plannedToday = strainView.planned?.strain ?? null;
  const buildTrend = useCallback((days: number, offsetDays = 0) => buildTrendPoints(profile, loadHistory, dayIso, todayIso, days, plannedToday, offsetDays), [profile, loadHistory, dayIso, todayIso, plannedToday]);
  const readinessSeries = useMemo(() => (formChip !== null ? buildReadinessSeries(profile, loadHistory, dayIso, 14) : []), [formChip, profile, loadHistory, dayIso]);
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
  const formNowForAdvice = useMemo(() => formToday(formModel.plan), [formModel]);
  // La categoría de «Tu nivel» que conviene completar (el coach también la tiene en cuenta al elegir el WOD).
  const wodNeed = useMemo(() => wodCategoryNeed(profile, history, todayIso), [profile, history, todayIso]);
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
    energy: isToday && formNowForAdvice ? { state: formNowForAdvice.state, reason: formNowForAdvice.reason } : null,
  });

  // La tarjeta «Tu nivel» (solo cuenta hoy). Si algo de los datos la rompiera al calcularla, no sale en vez de romper el Resumen.
  const levelCard = useMemo(() => {
    try {
      const level = computeLevel({ profile, history });
      return { level, model: buildLevelCard({ profile, level, todayIso }) };
    } catch (error) {
      console.error('La tarjeta Tu nivel no se pudo calcular:', error);
      return null;
    }
  }, [profile, history, todayIso]);

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
  // La propuesta del coach de mover un día fuerte a donde llegas mejor: una por semana (si se aplicó o se dejó para luego, no vuelve a salir).
  const weekMoveProposal = useMemo(() => {
    if (!isToday) return null;
    try {
      const found = proposeWeekMove(profile, history, todayIso, shortSessionLabel);
      return found && !weekMoveMemory[found.weekKey] ? found : null;
    } catch {
      return null;
    }
  }, [isToday, profile, history, todayIso, weekMoveMemory]);
  function markWeekMove(weekKey: string, status: WeekMoveStatus) {
    setWeekMoveMemory((prev) => {
      const next = withWeekMoveStatus(prev, weekKey, status);
      saveWeekMoveMemory(typeof window !== 'undefined' ? window.localStorage : null, next);
      return next;
    });
  }
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
            hasSummary: summaryData !== null,
            highlight: summaryData ? summaryHighlight({ ...summaryData, e1rmSuggestions }) : null,
          }
        : null,
    weeklyReviewRange: weeklyReview ? weekRangeText(weeklyReview.from, weeklyReview.to) : null,
    competitionClosedDaysAgo: competitionToClose(profile.goals, todayIso)?.daysSince ?? null,
    provisionalCompetition: provisionalNext?.provisional
      ? { days: isoDiffDays(todayIso, provisionalNext.targetDate), dateText: new Date(`${provisionalNext.targetDate}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '') }
      : null,
    weekMove: weekMoveProposal ? weekMoveSuggestion(weekMoveProposal, todayIso) : null,
    emphasisReviewPending: emphasisReviewNew,
    levelNeed: wodNeed ? { category: wodNeed.category, reason: wodNeed.reason } : null,
    nutritionPercent: isToday ? nutritionPercent : null,
    nutritionLeft: isToday && nutrition ? { protein: Math.max(0, nutrition.protein.target - nutrition.protein.done), carbs: Math.max(0, nutrition.carbs.target - nutrition.carbs.done) } : null,
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
  /** La semana pasada que se repasa: la pendiente (lunes a miércoles) o, si no, la última completa. */
  const reviewable = weeklyReview ?? anytimeReview;
  /** Abre «Mi semana»: de lunes a miércoles, la pasada si no la has visto; el resto, la actual. */
  const openWeek = () => setWeekWindow({ view: weeklyReview ? 'pasada' : 'actual', review: reviewable });
  // «Mi semana» tocada desde otra pantalla: se llega aquí y se abre.
  const wantsWeek = useRef(handoff.peek('dash-act') === 'semana');
  useEffect(() => {
    if (wantsWeek.current) {
      wantsWeek.current = false;
      openWeek();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Un punto en el botón de Rex cuando algo pide mirar: revisión sin ver o nutrición floja por la tarde.
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
        return openWeek();
      case 'semana-mover':
        return weekMoveProposal && setOpenWeekMove(weekMoveProposal);
      case 'revision-enfasis':
        return openEmphasisReview();
      case 'historial':
        return setTrainingView('diario');
      case 'constancia':
        return setTrainingView('constancia');
      case 'volumen':
        return setTrainingView('volumen');
      // El Análisis abre en el Perfil (la rueda y las áreas); «Mi perfil» ya no es un botón aparte, pero «perfil» en la caja lleva al mismo sitio.
      case 'analisis':
      case 'perfil':
        return openLevel('nivel');
      case 'marcas':
        return openLevel('marcas');
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
      case 'nutri-comida':
      case 'nutri-escanear':
        // Nutrición lo recoge al montarse: enfoca la caja «He comido…» o abre el escáner.
        handoff.put('nutri-act', target === 'nutri-escanear' ? 'scan' : 'comida');
        appNav.goTo('nutricion');
        return;
      case 'peso':
        return openLevel('cuerpo');
      case 'forma':
        return setFormChip('energia');
      case 'preparacion':
        return setFormChip('preparacion');
      case 'esfuerzo':
      case 'carga':
        return setFormChip('carga');
      case 'planificacion':
        return onNavigateToPlanificacion();
      case 'hoy':
        return setDayIso(todayIso);
      case 'descanso':
        return toggleRest();
      case 'detalle-dia':
        return setShowDayDetail(true);
      case 'resumen-sesion':
        return setShowDone(true);
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
  /** Tocar un aro o un número: el panel de Rex se abre con la pregunta ya hecha («¿Por qué mi preparación es 72?») y la explicación con su desglose. */
  function askRing(id: ExplainId) {
    const explanation = explanations[id];
    if (!explanation) return;
    setRingAsk({
      id: Date.now(),
      question: ringQuestion(id, { readiness: shown.readiness.total, real: shown.strain.real, planned: shown.strain.planned?.strain ?? null }),
      answer: explanationToAnswer(explanation),
    });
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
      openMarks: (key) => openLevel('marcas', key),
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
        openWith={ringAsk}
        screen="dashboard"
        tileContext={{
          session: todayStrain !== null ? 'done' : todaySession === null ? 'none' : todaySession.isRestDay ? 'rest' : athleteRepository.getWorkLog().some((e) => e.date === todayIso) ? 'in-progress' : 'pending',
          tired: advice.tone === 'mid' || advice.tone === 'bad',
          pain: (profile.painFlags ?? []).length > 0,
          weekReview: Boolean(weeklyReview),
        }}
        ask={askRex}
        hints={REX_HINTS.dashboard}
        dock={{ stats: rexDockStats, tip: ringHintPending ? 'Toca un aro o un número para ver de dónde sale.' : null }}
        suggestion={rexPick.current}
        waiting={rexPick.waiting}
        typedAlready={wasTyped(rexMemory, rexPick.current.id, todayIso)}
        dots={rexDots}
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
            openLevel('cuerpo');
          }}
        />
      )}
      {openWeekMove && (
        <Modal open onClose={() => setOpenWeekMove(null)} title={weekMoveTitle(openWeekMove)}>
          <WeekMoveCard
            proposal={openWeekMove}
            todayIso={todayIso}
            onApply={() => {
              applyWeekPlan(openWeekMove.weekPlan, 'mover un día por tu forma', { onWeekChanged: () => setProfile(athleteRepository.getProfile()) });
              markWeekMove(openWeekMove.weekKey, 'applied');
            }}
            onLater={() => markWeekMove(openWeekMove.weekKey, 'later')}
            onUndo={() => {
              undoWeekChange({ onWeekChanged: () => setProfile(athleteRepository.getProfile()) });
            }}
            onClose={() => setOpenWeekMove(null)}
          />
        </Modal>
      )}
      {weekWindow && (
        <Modal open onClose={() => setWeekWindow(null)} title="Mi semana">
          <MyWeek
            view={weekWindow.view}
            onView={(view) => setWeekWindow((cur) => (cur ? { ...cur, view } : cur))}
            profile={profile}
            history={history}
            todayIso={todayIso}
            todaySession={todaySession}
            onOpenDay={(iso) => {
              setWeekWindow(null);
              if (iso !== todayIso) handoff.put('plan-act', `dia:${iso}`);
              onNavigateToPlanificacion();
            }}
            review={
              weekWindow.review
                ? {
                    review: weekWindow.review,
                    onAccept: () => {
                      const suggestion = weekWindow.review?.suggestion;
                      if (!suggestion) return;
                      const next = applyMacroReview(athleteRepository.getProfile(), suggestion, todayIso);
                      athleteRepository.saveProfile(next);
                      setProfile(next);
                    },
                    onDismiss: () => {
                      const suggestion = weekWindow.review?.suggestion;
                      if (!suggestion) return;
                      const next = withMacroWeekReviewed(athleteRepository.getProfile(), suggestion.reviewKey);
                      athleteRepository.saveProfile(next);
                      setProfile(next);
                    },
                    onAdjustGoal: (goalId, patch) => {
                      const next = applyGoalAdjustment(athleteRepository.getProfile(), goalId, patch);
                      athleteRepository.saveProfile(next);
                      // La meta cambia la prioridad del levantamiento: las sesiones ya preparadas se vuelven a generar.
                      resetUpcomingSessions(todayIso);
                      setProfile(athleteRepository.getProfile());
                    },
                    onDone: () => {
                      if (!weekWindow.review) return;
                      const next = withWeekReviewed(athleteRepository.getProfile(), weekWindow.review.weekKey);
                      athleteRepository.saveProfile(next);
                      setProfile(next);
                    },
                    onOpenEmphasis: () => {
                      setWeekWindow(null);
                      openEmphasisReview();
                    },
                    onGoPlanificacion: () => {
                      setWeekWindow(null);
                      onNavigateToPlanificacion();
                    },
                    onClose: () => setWeekWindow(null),
                  }
                : null
            }
          />
        </Modal>
      )}

      {/* Selector de día y pestañas, al estilo Whoop: el día elegido manda sobre todo lo de debajo. */}
      <DayHeader dayIso={dayIso} macro={macroChip(profile.macrocycles, todayIso, todaySession?.competition?.daysToEvent ?? null)} onOpenMacro={() => onNavigateToObjetivos()} />
      <DaySelector dayIso={dayIso} todayIso={todayIso} onChange={setDayIso} left={<ThemeToggle round />} />
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
        onAsk={askRing}
        hintPending={ringHintPending}
        onHintSeen={markRingHint}
      />
      </div>

      {/* Tu día: la tarjeta de la sesión (las cifras que importan) y las demás filas. */}
      <DayRows
        isToday={isToday}
        session={isToday ? todaySession : null}
        card={buildSessionCard({ isToday, session: isToday ? todaySession : null, entry: shown.entry, strain: shown.strain, profile, history, workLog: athleteRepository.getWorkLog(), dayIso, companionDone: dayCompanion })}
        formCard={buildFormCard({ model: formModel, acwr: shown.acwr, painFlags: profile.painFlags, dayIso })}
        onOpenForm={() => setFormChip(isToday ? 'energia' : 'preparacion')}
        onOpenDone={() => setShowDone(true)}
        onNavigateToPlanificacion={onNavigateToPlanificacion}
        // Tu nivel: tus mediciones, solo hoy.
        extra={isToday && levelCard ? <LevelSummaryCard model={levelCard.model} level={levelCard.level} onOpen={() => openLevel('nivel')} /> : null}
      />

      {formChip !== null && (
        <Modal open onClose={() => setFormChip(null)} title={isToday ? 'Tu forma' : `Tu forma · ${dayLabel(dayIso, todayIso)}`}>
          <FormScreen chip={formChip} onChip={setFormChip} isToday={isToday}>
            {(chip) =>
              chip === 'energia' ? (
                <FormView
                  model={formModel}
                  onOpenMorning={() => {
                    setFormChip(null);
                    onOpenMorning();
                  }}
                  onOpenSleep={() => setFormChip('sueno')}
                />
              ) : chip === 'preparacion' ? (
                <PreparationTab
                  readiness={shown.readiness}
                  series={readinessSeries}
                  dayIso={dayIso}
                  isToday={isToday}
                  log={hrvLogWith(profile.readinessLog, profile.hrvHistory) ?? []}
                  todayCheck={todayReadiness}
                  learning={readinessLearning}
                  onSelect={setDayIso}
                  onOpenMorning={() => {
                    setFormChip(null);
                    onOpenMorning();
                  }}
                  pain={getActivePainFlags(profile.painFlags, dayIso).map((f) => PAIN_AREA_LABEL[f.area])}
                />
              ) : chip === 'sueno' ? (
                <SleepTab
                  log={profile.readinessLog ?? []}
                  dayIso={dayIso}
                  todayIso={todayIso}
                  learning={readinessLearning}
                  onSelect={setDayIso}
                  onOpenMorning={() => {
                    setFormChip(null);
                    onOpenMorning();
                  }}
                />
              ) : (
                <LoadPanel
                  acwr={shown.acwr}
                  trend={shown.trend}
                  onHistory={() => {
                    setFormChip(null);
                    setTrainingView('diario');
                  }}
                  onConsistency={() => {
                    setFormChip(null);
                    setTrainingView('constancia');
                  }}
                >
                  <StrainDetail
                    view={shown.strain}
                    onAdjust={() => {
                      setFormChip(null);
                      onNavigateToPlanificacion();
                    }}
                    dayLabel={dayLabel(dayIso, todayIso)}
                    isToday={isToday}
                  />
                  <WeekTrendCard build={buildTrend} selectedIso={dayIso} todayIso={todayIso} competitionDays={isToday ? (todaySession?.competition?.daysToEvent ?? null) : null} onSelect={setDayIso} />
                </LoadPanel>
              )
            }
          </FormScreen>
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
          methodOf={(programId) => {
            const m = (profile.strengthPrograms ?? []).find((p) => p.id === programId)?.method;
            return m ? STRENGTH_METHOD_LABEL[m] : null;
          }}
          onOpenPlan={isToday ? () => {
            setShowDone(false);
            onNavigateToPlanificacion();
          } : undefined}
          summary={isToday && summaryData ? { data: summaryData, e1rmSuggestions, onConfirmE1rm: confirmE1rm, onDismissE1rm: dismissE1rm } : undefined}
        />
      )}
      {trainingView && (
        <Modal open onClose={() => setTrainingView(null)} title="Historial">
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.05] p-1" role="tablist" aria-label="Historial">
            {(['diario', 'constancia', 'volumen'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={trainingView === v}
                onClick={() => setTrainingView(v)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${trainingView === v ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                {v === 'diario' ? 'Diario' : v === 'constancia' ? 'Constancia' : 'Volumen'}
              </button>
            ))}
          </div>
          {trainingView === 'diario' ? (
            <TrainingDiary
              history={history}
              workLog={athleteRepository.getWorkLog()}
              trainingDatesLog={profile.trainingDatesLog ?? []}
              companionLog={profile.companionLog ?? []}
              onDeleteEntry={(date) => {
                athleteRepository.deleteHistoryEntry(date);
                setHistory(athleteRepository.getHistory());
                setProfile(athleteRepository.getProfile());
              }}
            />
          ) : trainingView === 'constancia' ? (
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

      {levelScreen && (
        <Modal open onClose={() => setLevelScreen(null)} title="Tu nivel">
          <LevelScreen
            chip={levelScreen.chip}
            onChip={(chip) => setLevelScreen((cur) => ({ chip, mark: cur?.mark ?? null }))}
            profile={profile}
            history={history}
            imbalanceGroups={imbalanceGroups}
            strengthRatio={strengthRatio}
            stats={stats}
            bodyweightLog={bodyweightLog}
            onBodyweightChange={(log) => {
              setBodyweightLog(log);
              setProfile(athleteRepository.getProfile());
            }}
            todayIso={todayIso}
            marksKey={levelScreen.mark}
            onSaveProfile={(patch) => {
              athleteRepository.saveProfile({ ...athleteRepository.getProfile(), ...patch });
              setProfile(athleteRepository.getProfile());
            }}
            onSaveMarks={saveMarks}
            onCreateWorkGoal={(goal) => {
              athleteRepository.saveProfile({ ...athleteRepository.getProfile(), goals: [...athleteRepository.getProfile().goals, goal] });
              // Un objetivo nuevo cambia lo que sale en las sesiones: las ya preparadas se vuelven a generar.
              resetUpcomingSessions(todayIso);
              setProfile(athleteRepository.getProfile());
            }}
            onOpenProgramming={() => {
              setLevelScreen(null);
              onNavigateToObjetivos('perfil');
            }}
            onCreateGoal={(movementId) => {
              const next = addSubirPrGoal(athleteRepository.getProfile(), movementId, todayIso);
              athleteRepository.saveProfile(next);
              setProfile(next);
            }}
            onOpenObjetivos={() => {
              setLevelScreen(null);
              onNavigateToObjetivos();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
