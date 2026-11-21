import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, GalleryHorizontalEnd, CalendarClock, Timer, NotebookPen, Brain, Shuffle, Ghost as GhostIcon, HeartPulse, CalendarCheck2, Plus, Info, Trophy, Flame, SlidersHorizontal, Pencil, Frown, Plane, Dumbbell, PauseCircle, CalendarDays, Library, Bell, Undo2, FastForward } from 'lucide-react';
import type { OlyComplex } from '../../data/complexes';
import { buildComplexPool } from '../../engine/olyComplexes';
import { ComplexLibrary } from './ComplexLibrary';
import { HardnessSheet, hardnessContextOf, type HardnessApplyInfo } from './HardnessControl';
import { DayStatusRow, PHASE_WORD } from './DayStatusRow';
import { hardnessAvailable, hardnessSituation, hardnessUnavailableReason, type HardnessLevel } from '../../engine/hardness';
import { learnHardness, suggestHardness } from '../../engine/hardnessLearning';
import type {
  AthleteProfile,
  DailySession,
  Goal,
  PainArea,
  RxOrScaled,
  SessionBlockResult,
  SessionHistoryEntry,
  SetFeedbackEntry,
  SetFeel,
  SetQuality,
  StrainTarget,
  WorkSetEntry,
  WodFeel,
  WodResult,
  WodScalingEntry,
  WodScoreType,
  WodSplitsRecord,
} from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { DaySnapshot } from '../../data/athlete/localRepository';
import { toast } from '../../lib/toast';
import { confirmSheet } from '../../lib/confirmSheet';
import { complexLogId } from '../../data/complexes';
import { fmtKg } from '../../lib/format';
import { buildWodDetail, buildWorkGoal } from '../../engine/wodMovements';
import { getMovementById } from '../../data/movements';
import {
  adoptAdditiveEngineFields,
  buildStrengthProgramWodAddition,
  generateOverrideSession,
  generateSessionForDate,
  previewMacroSession,
  hasActiveTrainingStructure,
  isCachedSessionOrphaned,
  isCachedSessionStale,
  peekRetestHeadsUp,
  resolveOlyPRKey,
  resolveStrengthPRKey,
  resolveVariantPRKey,
  toHistoryEntry,
  wodMovementsOfSession,
  type SessionOverrideType,
} from '../../engine/generateSession';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { ensureWeekLocked } from './weeklyLock';
import { allBarSetsLogged } from '../../engine/sessionProgress';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import {
  buildWodResult,
  EMPTY_WOD_FORM,
  formFromWodResult,
  getTestDayBlock,
  getWodParts,
  getWodScoreType,
  type WodResultForm,
} from '../../engine/wodScoring';
import { applySkips, sessionParts, skippedParts, type Skips } from '../../engine/sessionParts';
import { wodCapFor, type WodCap } from '../../engine/wodCap';
import { getActivePainFlags, PAIN_AREA_LABEL, prunePainFlags, resolvePainFlagUntil, type PainDuration } from '../../engine/painFlags';
import { describeRampStatus, suggestReturnRamp } from '../../engine/intensityRamp';
import { applyMacroReview, buildWeeklyMacroReview, withMacroWeekReviewed } from '../../engine/macroReview';
import { buildNextMacroSuggestion } from '../../engine/nextMacroSuggestion';
import { estimateE1RMFromRpe, qualifiesForE1RMEstimate } from '../../engine/e1rm';
import { feelFromRpe, findTopWorkSet, parseWorkingReps } from '../../engine/setFeedback';
import { countsForProgression, evaluateLiftSession, mainLiftBlock, type ProgressionKind } from '../../engine/progression';
import { WeekStrip } from './WeekStrip';
import { SeasonMapCompact, SeasonMapFull } from '../objetivos/SeasonMap';
import { TrainingDiary } from './TrainingDiary';
import { DaySessionBlocks } from './DaySessionBlocks';
import { wodDoneInfos } from '../../engine/wodDone';
import { workDoneLines } from './workDoneLines';
import { buildSessionSummaryData } from '../../engine/sessionSummary';
import { appNav } from '../../lib/appNav';
import { invalidGroups, repairSession } from '../../engine/sessionRepair';
import { applyManualCorrection } from '../../engine/oneOffCorrections';
import { competitionCountdown, competitionHeadline } from '../shell/competitionMeta';
import { ensureStrainTarget } from '../../engine/strainTarget';
import { estimatePlannedStrain, planFit } from '../../engine/plannedStrain';
import { learnStrain } from '../../engine/strainLearning';

import {
  CoachNoticesBody,
  CoachReasonsList,
  summarizeNotices,
  type CoachNoticesProps,
} from './CoachNotices';
import { RexSupport } from './RexSupport';
import type { SupportAction, SupportEffect } from './rexSupportFlow';
import { RexCorner } from '../dashboard/RexCorner';
import { dismissSuggestion, dockStats, loadRexMemory, pickRexSuggestion, saveRexMemory, wasTyped, withTyped, type RexMemory, type RexTarget } from '../dashboard/rexDashboard';
import { buildPlanRexSuggestions } from './rexPlan';
import { CompanionCard, pickCompanionProgram } from './CompanionCard';
import { CompanionRecover } from './CompanionRecover';
import { ScreenRex } from '../dashboard/ScreenRex';
import { orderRefusal, routeAsk, undoWeekChange } from '../dashboard/rexAskRouter';
import { shortSessionLabel } from '../dashboard/rexMove';
import { buildPreviewLine } from '../dashboard/DayRows';
import { planWeekChange, type WeekPlan } from '../../lib/weekShift';
import { dayLabel } from '../../lib/sessionMove';
import { withRestUnmarked } from '../../engine/restDays';
import { WhatDidModal, OtherThingModal, type OtherFormState } from './OtherActivitySheets';
import { otherDaySession, otherKindInfo } from './otherActivity';
import { peekUndo } from '../../lib/weekUndo';
import { REX_HINTS } from '../dashboard/rexHints';
import { dayAnswer, type AskAnswer } from '../dashboard/rexAsk';
import { adaptDoneAnswer, adaptHowMuchAnswer, adaptProposalAnswer, adaptRefusalAnswer } from '../dashboard/rexAdapt';
import { planAdaptation, type AdaptRequest } from '../../lib/sessionAdapt';
import { describeDayForAsk } from '../dashboard/rexAskDay';
import { handoff } from '../../lib/handoff';
import { rexBus } from '../../lib/rexBus';
import type { LabSection } from '../dashboard/RexCorner';
import { generateCompanionSession } from '../../engine/generateSession';
import { acceptedCompanionLoad, withCompanionLoad } from '../../engine/companionLoad';
import { acceptCompanion, companionStatus, declineCompanion, isCompanionTestSession, pauseCompanion, skipCompanion } from '../../engine/strengthCompanion';
import { LIGHT_LABEL } from '../../engine/dayLight';
import { FocusMode } from './FocusMode';
import { TrainCards } from './TrainCards';
import { TrainList } from './TrainList';
import { LogAll } from './LogAll';
import { readTrainMode, writeTrainMode, type TrainMode } from '../../lib/trainMode';
import { TrainingTimer, type TrackConfig } from './TrainingTimer';
import { isSoftDay } from './clockProps';
import { buildSplitsRecord, pickGhost, summarizeGhost, wodTrackInfo, type Ghost, type GhostSummary } from '../../engine/wodGhost';
import { paceGhost, paceTip } from '../../engine/wodPace';
import { applyRepeatedWod, listRepeatableWods } from '../../engine/wodRepeat';
import { RepeatWodModal } from './RepeatWodModal';
import { readWod, type WodReading } from '../../engine/wodRead';
import { resetUpcomingSessions } from '../../lib/sessionCacheReset';
import { CompleteSessionPanel } from './CompleteSessionPanel';
import { ProfileEmphasisLine } from './ProfileEmphasis';
import { clockFormFor, isFormUntouched, pickClockStop, readClockRuns } from './workoutClockResult';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { timeLimitFor, weekdayPlural } from '../../engine/rexNotes';
import { classifyWod } from '../../engine/wodCategory';
import { levelResultsOfEntry } from '../../engine/levelCategories';
import { Modal } from '../shell/Modal';


const PAIN_AREAS: PainArea[] = ['hombro', 'cadera-lumbar', 'rodilla', 'codo-muneca'];
const PAIN_DURATION_OPTIONS: { value: PainDuration; label: string }[] = [
  { value: 'dias', label: 'Unos días' },
  { value: 'semanas', label: '1-2 semanas' },
  { value: 'indefinido', label: 'Hasta quitarlo' },
];

/**
 * Un bloque admite feedback en caliente de la primera serie si es fuerza u oly con carga y con
 * series rectas de reps limpias — deja fuera los días de test 1RM (sin `sets`), las escaleras de
 * carga ("5-3-1"), el primer técnico de oly ("2-3") y los WOD de referencia. En esos casos no hay
 * "resto de series al mismo peso" que reajustar.
 */
function isAdjustableSetBlock(b: SessionBlockResult): boolean {
  if (b.block !== 'strength' && b.block !== 'oly') return false;
  if (b.movementId.startsWith('benchmark:')) return false;
  // Un complejo no calibra al coach: encadenar pesa menos que cada levantamiento y falsearía su 1RM estimado.
  if (b.complex) return false;
  // Los formatos de oly de serie única (single del día, EMOM) no llevan `sets` pero sí registran
  // el peso real y valoran esfuerzo — entran por `logAsSingle`.
  if ((b.sets === undefined || b.sets < 2) && !b.logAsSingle) return false;
  if (!b.loadKg || b.loadKg <= 0) return false;
  // El primer técnico del complejo de oly (reps "2-3") es preparación, no el esfuerzo principal.
  if (b.block === 'oly' && b.reps === '2-3') return false;
  // Cualquier otro levantamiento principal con carga lleva tarjeta — incluidos los días de rampa
  // "5-3-1" (reps no parseables): el ajuste por sensación no usa las reps y el registro de la serie
  // real pide sus propios números.
  return true;
}

/**
 * Resuelve la sesión de hoy desde la caché: sirve la cacheada si es válida; si quedó huérfana la
 * borra y regenera; si la generó una versión anterior del motor y aún no está registrada, la borra y
 * regenera; y si YA está registrada pero el sello es viejo, no la regenera —conserva lo que el
 * atleta hizo— pero le añade los campos nuevos aditivos del motor (ver `adoptAdditiveEngineFields`).
 * Sin macrociclo ni programa activo y nada elegido, devuelve `null`.
 */
function loadTodaySession(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  goals: Goal[],
  todayIso: string,
): DailySession | null {
  const session = loadTodaySessionBase(profile, history, goals, todayIso);
  if (!session || history.some((h) => h.date === todayIso)) return session;
  // Corrección puntual de la sesión del 17 nov (ver `engine/oneOffCorrections.ts`): se aplica una vez y deja el complejo en la librería.
  const fix = applyManualCorrection(session, athleteRepository.getProfile());
  if (!fix) return session;
  const current = athleteRepository.getProfile();
  if (!(current.customComplexes ?? []).some((c) => c.id === fix.newComplex.id)) {
    athleteRepository.saveProfile({ ...current, customComplexes: [...(current.customComplexes ?? []), fix.newComplex] });
  }
  athleteRepository.saveCachedSession(fix.session);
  return fix.session;
}

function loadTodaySessionBase(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  goals: Goal[],
  todayIso: string,
): DailySession | null {
  const cached = athleteRepository.getCachedSession(todayIso);
  // El bloqueo semanal se resuelve ANTES de servir la cache: si la semana se re-planifico tras un dia
  // perdido, la sesion cacheada de hoy puede contradecir al bloqueo nuevo y hay que regenerarla.
  const structured = hasActiveTrainingStructure(profile, todayIso);
  const lockedProfile = structured ? ensureWeekLocked(profile, history, goals, todayIso) : profile;
  if (cached) {
    if (isCachedSessionOrphaned(cached, profile, todayIso)) {
      athleteRepository.deleteCachedSession(todayIso);
    } else if (!isCachedSessionStale(cached, lockedProfile.weeklyLocks?.[todayIso], history, lockedProfile.painFlags, lockedProfile.regenVariants?.[todayIso] ?? 0)) {
      // Una sesión de hoy aún sin registrar con bloques que el motor ya no programa (un press con mancuernas como fuerza principal, un
      // complejo que mezcla snatch y clean) se repara: una sesión que se registró y se deshizo queda «editada» y no se regeneraría sola.
      if (structured && invalidGroups(cached).length > 0 && !history.some((h) => h.date === todayIso)) {
        const fresh = generateSessionForDate(lockedProfile, history, new Date(), goals);
        const repaired = repairSession(cached, fresh);
        if (repaired !== cached) athleteRepository.saveCachedSession(repaired);
        return repaired;
      }
      return cached;
    } else if (history.some((h) => h.date === todayIso)) {
      const adopted = adoptAdditiveEngineFields(cached, profile, history, new Date(), goals);
      if (adopted !== cached) athleteRepository.saveCachedSession(adopted);
      return adopted;
    } else {
      athleteRepository.deleteCachedSession(todayIso);
    }
  }
  if (!structured) return null;
  const fresh = generateSessionForDate(lockedProfile, history, new Date(), goals);
  athleteRepository.saveCachedSession(fresh);
  return fresh;
}

interface PlanificacionProps {
  onNavigateToObjetivos: () => void;
  /** Abre Objetivos → Perfil (desde la línea de lo que el diagnóstico inclina). */
  onNavigateToPerfil: () => void;
}

export function Planificacion({ onNavigateToObjetivos, onNavigateToPerfil }: PlanificacionProps) {
  const [profile, setProfile] = useState<AthleteProfile>(() => athleteRepository.getProfile());
  const [history, setHistory] = useState<SessionHistoryEntry[]>(() => athleteRepository.getHistory());
  const goals = profile.goals;
  const todayIso = toLocalIsoDate(new Date());
  const todayWeekdayLabel = (() => {
    const s = new Date().toLocaleDateString('es-ES', { weekday: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const [session, setSession] = useState<DailySession | null>(() => loadTodaySession(profile, history, goals, todayIso));

  const [showCompletePanel, setShowCompletePanel] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  /** Entreno en tarjetas (a prueba): convive con el modo enfocado de siempre. */
  const [cardsMode, setCardsMode] = useState(false);
  /** El atleta tocó Rx/escalado o la dureza en la tarjeta del WOD: al abrir el cierre no se reinician. */
  const wodDetailFromCards = useRef(false);
  /** Cómo se abren las tarjetas: entrenando o revisando (anotar después / corregir), y por dónde. */
  const [cardsOpts, setCardsOpts] = useState<{ mode: 'live' | 'review'; startAt: 'start' | 'end' }>({ mode: 'live', startAt: 'start' });
  /** «Hice otra cosa»: el registro rápido (solo esfuerzo y minutos) para un día en que no se hizo la sesión prevista. Lo ofrece Rex y está dentro del cierre. */
  function openQuickLog() {
    setOtherForm({ kind: 'clase', name: '', result: '', rpe: 7, minutes: otherKindInfo('clase').minutes, moveTomorrow: true });
    // ¿Se puede pasar la prevista a mañana? Solo si hoy es un día del plan (con estructura) y la semana lo admite.
    if (session && !session.isRestDay && session.source !== 'custom') {
      const wp = planWeekChange(athleteRepository.getProfile(), athleteRepository.getHistory(), { kind: 'desplazar', from: todayIso }, todayIso, shortSessionLabel);
      setOtherMove(typeof wp === 'object' ? wp : null);
    } else setOtherMove(null);
    setShowWhatDid(false);
    setShowQuickLog(true);
  }
  /** «Anotar de golpe»: todos los pesos y el cierre en una sola pantalla (lo que se hace al acabar, sin el móvil en la mano mientras se entrena). */
  const [logAllMode, setLogAllMode] = useState(false);
  /** Guarda las series que hay en pantalla en «Anotar de golpe»; se llama justo antes de cerrar la sesión. */
  const logAllCommit = useRef<(() => void) | null>(null);
  function openLogAll() {
    setListMode(false);
    setCardsMode(false);
    setLogAllMode(true);
    // El cierre va en la misma pantalla: se abre ya (con los minutos de la lista, si venían de ella).
    setTestedLoadKg(testDayBlock?.loadKg ?? 0);
    setShowCompletePanel(true);
  }
  function openCards(mode: 'live' | 'review', startAt: 'start' | 'end' = 'start') {
    setListMode(false);
    setLogAllMode(false);
    setCardsOpts({ mode, startAt });
    setCardsMode(true);
  }
  /** «Entrenar» (lista con cronómetro) o «Ir apuntando» (tarjetas): se pregunta la primera vez y se recuerda en este dispositivo. */
  const [trainMode, setTrainMode] = useState<TrainMode | null>(() => readTrainMode(typeof window !== 'undefined' ? window.localStorage : null));
  const [listMode, setListMode] = useState(false);
  const [showModeChoice, setShowModeChoice] = useState(false);
  function chooseTrainMode(mode: TrainMode) {
    writeTrainMode(typeof window !== 'undefined' ? window.localStorage : null, mode);
    setTrainMode(mode);
    setShowModeChoice(false);
    if (mode === 'list') setListMode(true);
    else openCards('live', 'start');
  }
  /** Empezar o continuar la sesión: va por donde el atleta dijo que entrena (y se lo pregunta si aún no lo ha dicho). */
  function startTraining() {
    if (!trainMode) setShowModeChoice(true);
    else if (trainMode === 'list') setListMode(true);
    else openCards('live', 'start');
  }
  /** Una corrección en curso («Ver y corregir»): cómo estaba el día antes de quitar el registro, para devolverlo si se cancela. */
  const correctionRef = useRef<{ snapshot: DaySnapshot; sessionBefore: DailySession } | null>(null);
  /** Los minutos que ya estaban anotados en la sesión que se corrige: el cierre los enseña en vez de la estimación. */
  const correctionPrefill = useRef<{ durationMin: number } | null>(null);
  const [showDiary, setShowDiary] = useState(false);
  const [showSeasonMap, setShowSeasonMap] = useState(false);
  const [showComplexes, setShowComplexes] = useState(false);
  /** «Repetir un WOD que ya hice»: el selector abierto. */
  const [showRepeat, setShowRepeat] = useState(false);
  const [showHardness, setShowHardness] = useState(false);
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>('rx');
  // Qué se escaló del WOD (por movimiento) y cómo de duro fue: se anota en el cierre de la sesión.
  const [wodScaling, setWodScaling] = useState<WodScalingEntry[]>([]);
  const [wodFeel, setWodFeel] = useState<WodFeel | undefined>(undefined);
  const [rpe, setRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(60);
  const [, setSpinning] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Resultado del WOD por parte: la 1 es el unico WOD de un dia normal (o la primera pieza de un dia de doble WOD).
  const [wodForms, setWodForms] = useState<Record<1 | 2, WodResultForm>>({ 1: EMPTY_WOD_FORM, 2: EMPTY_WOD_FORM });
  // "Qué has hecho" del cierre de sesión: las partes marcadas como no hechas (todo viene hecho). Se limpia al cerrar el panel.
  const [skips, setSkips] = useState<Skips>({});
  useEffect(() => {
    if (!showCompletePanel) setSkips({});
  }, [showCompletePanel]);
  // Partes del WOD cuyo resultado salió prellenado desde el reloj de entreno (ver workoutClockResult).
  const [clockParts, setClockParts] = useState<(1 | 2)[]>([]);
  const [testedLoadKg, setTestedLoadKg] = useState(0);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customEditorMode, setCustomEditorMode] = useState<'replace' | 'append'>('replace');
  const [customTitleDraft, setCustomTitleDraft] = useState('');
  const [customNoteDraft, setCustomNoteDraft] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showAddWodPicker, setShowAddWodPicker] = useState(false);
  const [macroWodPreview, setMacroWodPreview] = useState<SessionBlockResult[] | null>(null);
  const [showPainPicker, setShowPainPicker] = useState(false);
  const [showRex, setShowRex] = useState(false);
  /** Por dónde empieza la conversación de Rex cuando RexLab ya sabe qué ha pasado (la molestia, «hoy no», faltar). */
  const [supportStart, setSupportStart] = useState<string | undefined>(undefined);
  const [showNotices, setShowNotices] = useState(false);
  // Rex en Planificación: el detalle del estado del día se abre con «Por qué»; lo apartado se recuerda en este dispositivo.
  const [showPlanDetail, setShowPlanDetail] = useState(false);
  const [rexMemory, setRexMemory] = useState<RexMemory>(() => loadRexMemory(typeof window !== 'undefined' ? window.localStorage : null));
  const [rexCursor, setRexCursor] = useState(0);
  const [regenNote, setRegenNote] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [painAreaDraft, setPainAreaDraft] = useState<PainArea>('hombro');
  const [painDurationDraft, setPainDurationDraft] = useState<PainDuration>('semanas');
  const [showQuickLog, setShowQuickLog] = useState(false);
  /** «Anotar lo que hice»: la pregunta (¿la prevista o otra cosa?) y el registro corto de otra cosa. */
  const [showWhatDid, setShowWhatDid] = useState(false);
  const [otherForm, setOtherForm] = useState<OtherFormState>({ kind: 'clase', name: '', result: '', rpe: 7, minutes: 60, moveTomorrow: true });
  /** Lo que cambiaría en la semana si la sesión prevista pasa a mañana (se calcula al abrir el registro, una vez). */
  const [otherMove, setOtherMove] = useState<WeekPlan | null>(null);

  const activePainFlags = useMemo(() => getActivePainFlags(profile.painFlags, todayIso), [profile.painFlags, todayIso]);
  const rampStatus = useMemo(() => describeRampStatus(profile.intensityRamp, new Date()), [profile.intensityRamp, todayIso]);
  const returnRampSuggestion = useMemo(
    () => suggestReturnRamp(profile.trainingDatesLog, profile.intensityRamp, todayIso),
    [profile.trainingDatesLog, profile.intensityRamp, todayIso],
  );
  const [returnRampDismissed, setReturnRampDismissed] = useState(false);
  const showReturnRampSuggestion = Boolean(returnRampSuggestion && !returnRampDismissed);

  const activeMacro = useMemo(() => getActiveMacrocycle(profile.macrocycles, todayIso), [profile.macrocycles, todayIso]);
  const macroReviewSuggestion = useMemo(
    () => buildWeeklyMacroReview(profile, history, activeMacro, new Date()),
    [profile, history, activeMacro],
  );
  const nextMacroSuggestion = useMemo(() => buildNextMacroSuggestion(profile, history), [profile, history]);
  const retestHeadsUp = useMemo(
    () => peekRetestHeadsUp(history, new Date(), profile.trainingDaysPerWeek),
    [history, profile.trainingDaysPerWeek],
  );

  const isMacroAvailable = Boolean(getActiveMacrocycle(profile.macrocycles, todayIso));
  const nextMacroStart = useMemo(() => {
    const upcoming = profile.macrocycles.filter((m) => m.startDate > todayIso).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (!upcoming) return null;
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(upcoming.startDate));
  }, [profile.macrocycles, todayIso]);
  const alreadyCompletedToday = useMemo(() => (session ? history.some((h) => h.date === session.date) : false), [history, session]);
  // Reconstruido desde el historial persistido (no desde estado efimero de la sesion) para que el
  // resumen post-sesion sobreviva a un refresco de pagina, igual que `alreadyCompletedToday`.
  const todayHistoryEntry = useMemo(() => history.find((h) => h.date === todayIso), [history, todayIso]);
  // Lo del resumen de la sesión hecha (progresión, PR, sugerencias de 1RM, racha), desde lo guardado: Rex lo cuenta en una frase.
  const summaryData = useMemo(
    () => (session && alreadyCompletedToday && todayHistoryEntry ? buildSessionSummaryData({ session, entry: todayHistoryEntry, profile, history, now: new Date() }) : null),
    [session, alreadyCompletedToday, todayHistoryEntry, profile, history],
  );
  // El resultado del WOD de hoy al pie de su tarjeta cuando la sesión ya está registrada.
  const wodDone = useMemo(
    () => (session && alreadyCompletedToday && todayHistoryEntry ? wodDoneInfos(session, todayHistoryEntry, history) : undefined),
    [session, alreadyCompletedToday, todayHistoryEntry, history],
  );
  const [setFeedbackLog, setSetFeedbackLog] = useState<SetFeedbackEntry[]>(() => athleteRepository.getSetFeedbackLog());
  const [workLog, setWorkLog] = useState<WorkSetEntry[]>(() => athleteRepository.getWorkLog());
  const todayWorkLog = useMemo(() => workLog.filter((e) => e.date === todayIso), [workLog, todayIso]);
  // Lo hecho de verdad en fuerza y oly (series anotadas) bajo cada bloque, tanto con la sesión en marcha como ya cerrada.
  const workDone = useMemo(() => (session && !session.isRestDay ? workDoneLines(session, todayWorkLog) : undefined), [session, todayWorkLog]);
  /** Bundle para el popup de progresión del movimiento (tocar la carga de una serie de fuerza/oly). */
  const movementProgress = useMemo(
    () => ({ prs: profile.prs, variantPrs: profile.variantPrs, prLog: profile.prLog ?? [], workLog }),
    [profile.prs, profile.variantPrs, profile.prLog, workLog],
  );
  // La librería de complejos (fábrica + propios, favoritos y ocultos) y la semana del bloque de hoy (la 2 si hoy no cae en un bloque).
  const complexPool = useMemo(() => buildComplexPool(profile.customComplexes, profile.complexPrefs), [profile.customComplexes, profile.complexPrefs]);
  const complexWeek: 1 | 2 | 3 | 4 = session && session.mesocycleWeek >= 1 && session.mesocycleWeek <= 4 ? (session.mesocycleWeek as 1 | 2 | 3 | 4) : 2;
  const hasWodBlock = useMemo(() => Boolean(session?.blocks.some((b) => b.block === 'wod')), [session]);
  // Los WODs que ya hiciste y se pueden repetir (para correr contra tu marca); solo se calcula con el selector abierto.
  const repeatableWods = useMemo(() => (showRepeat ? listRepeatableWods(history, profile) : []), [showRepeat, history, profile]);
  // Objetivo de esfuerzo de hoy (el de la mañana, ver `engine/strainTarget.ts`): lo fija el Dashboard al contestar el
  // check-in; aquí se lee (y se fija si entras antes aquí) para comparar con la sesión prevista.
  const [strainTarget, setStrainTarget] = useState<StrainTarget | null>(() => profile.strainTargets?.[todayIso] ?? null);
  useEffect(() => {
    const fresh = athleteRepository.getProfile();
    const next = ensureStrainTarget(fresh, withCompanionLoad(athleteRepository.getHistory(), fresh.companionLog), todayIso);
    if (next !== fresh) {
      athleteRepository.saveProfile(next);
      setProfile((prev) => ({ ...prev, strainTargets: next.strainTargets }));
    }
    setStrainTarget(next.strainTargets?.[todayIso] ?? null);
  }, [todayIso]);
  const strainBias = useMemo(() => learnStrain(profile, history, todayIso).bias, [profile, history, todayIso]);
  // Lo que el coach ha aprendido de cómo aguantas la dureza que subes (ver engine/hardnessLearning.ts): corrige la previsión de un día subido.
  const hardnessLearn = useMemo(() => learnHardness(profile, history, todayIso), [profile, history, todayIso]);
  // La carga del programa de fuerza que convive con el macro cuenta en el esfuerzo (ver `engine/companionLoad.ts`): la tira de la semana lo enseña con ella
  // y la previsión de hoy suma la sesión del programa si ya has aceptado hacerla. Lo que aprende el coach sigue con el historial del macro solo.
  const loadHistory = useMemo(() => withCompanionLoad(history, profile.companionLog), [history, profile.companionLog]);
  const companionExtra = useMemo(() => acceptedCompanionLoad(profile, todayIso, (p) => generateCompanionSession(profile, history, p, todayIso, { neutral: true })), [profile, history, todayIso]);
  const plannedStrain = useMemo(
    () => (session && !alreadyCompletedToday ? estimatePlannedStrain(session, history, strainBias + (session.hardness ? hardnessLearn.bias : 0), companionExtra) : null),
    [session, history, alreadyCompletedToday, strainBias, hardnessLearn.bias, companionExtra],
  );
  const planFitResult = plannedStrain && strainTarget ? planFit(plannedStrain, strainTarget) : null;
  // Se puede subir la dureza de hoy (ver `engine/hardness.ts`): una sesión normal de entreno todavía sin registrar.
  const canHarder = Boolean(session && !alreadyCompletedToday && hardnessAvailable(session));
  // El coach te sugiere subirla solo si ya sabe que la aguantas en esta situación (ver `suggestHardness`).
  const hardnessSuggestion = useMemo(
    () =>
      session && canHarder && !session.hardness
        ? suggestHardness({
            learning: hardnessLearn,
            situation: hardnessSituation(hardnessContextOf(session)),
            light: session.dayLight?.color === 'verde' ? 'verde' : session.dayLight?.color === 'ambar' ? 'ambar' : null,
            offered: true,
            planned: plannedStrain ? plannedStrain.strain : null,
            target: strainTarget,
            todayIso,
          })
        : null,
    [session, canHarder, hardnessLearn, plannedStrain, strainTarget, todayIso],
  );
  // Partes de WOD de hoy (1 en un dia normal, 2 en un dia de doble WOD) y como se puntua cada una.
  const wodParts = useMemo(() => (session ? getWodParts(session) : []), [session]);
  const wodMovements = useMemo(() => (session ? wodMovementsOfSession(session) : []), [session]);
  const wodScoreTypes = useMemo<Record<1 | 2, WodScoreType | null>>(
    () => ({ 1: session ? getWodScoreType(session, 1) : null, 2: session ? getWodScoreType(session, 2) : null }),
    [session],
  );
  // El límite de tiempo de cada parte del WOD (cap o duración del AMRAP), para el reloj de entreno.
  const wodCaps = useMemo<Record<1 | 2, WodCap | null>>(
    () => ({ 1: session ? wodCapFor(session, 1) : null, 2: session ? wodCapFor(session, 2) : null }),
    [session],
  );
  // El modo fantasma del reloj: los tramos del WOD de cada parte (solo los WODs por tiempo) y el fantasma contra el que correr. Viene apagado
  // en un día suave (descarga, recuperación, semáforo ámbar o rojo): ahí el coach no empuja a correr contra nadie.
  const trackConfigs = useMemo<Partial<Record<1 | 2, TrackConfig | null>>>(() => {
    if (!session) return {};
    const soft = isSoftDay(session);
    const out: Partial<Record<1 | 2, TrackConfig | null>> = {};
    for (const part of wodParts) {
      const info = wodTrackInfo(session, part, wodScoreTypes[part], wodCaps[part]);
      out[part] = info
        ? {
            info,
            ghostFor: (mode) => pickGhost({ info, mode, todayIso: session.date, history, ghosts: profile.wodGhosts ?? [] }),
            ghostDefaultOff: soft,
            paceFor: () => paceTip({ info, todayIso: session.date, history, ghosts: profile.wodGhosts ?? [] }),
          }
        : null;
    }
    return out;
  }, [session, wodParts, wodScoreTypes, wodCaps, history, profile.wodGhosts]);
  /** Los parciales cronometrados hoy en cada parte del WOD (los del reloj de entreno), como se guardarían. Solo el día de hoy y las partes no saltadas. */
  function splitRecordsToday(): WodSplitsRecord[] {
    if (!session || session.date !== toLocalIsoDate(new Date())) return [];
    const runs = readClockRuns(session.date);
    const out: WodSplitsRecord[] = [];
    for (const part of wodParts) {
      const cfg = trackConfigs[part];
      const stop = pickClockStop(runs, part, wodParts.length);
      if (!cfg || !stop?.marks || skips[part === 1 ? 'wod1' : 'wod2']) continue;
      const record = buildSplitsRecord({ date: session.date, info: cfg.info, mode: stop.trackMode ?? cfg.info.defaultMode, marks: stop.marks, totalSeconds: stop.seconds, rx: rxOrScaled === 'rx', capped: stop.capped });
      if (record) out.push(record);
    }
    return out;
  }
  /** Contra qué corriste hoy: la pauta de Rex si la aceptaste en el reloj, o tu fantasma de siempre. */
  function ghostOfRecord(record: WodSplitsRecord): Ghost | null {
    const cfg = trackConfigs[record.part];
    if (!cfg || !session) return null;
    const stop = pickClockStop(readClockRuns(session.date), record.part, wodParts.length);
    return stop?.paceSeconds ? paceGhost(stop.paceSeconds, cfg.info, record.mode) : cfg.ghostFor(record.mode);
  }
  const ghostSummaries = useMemo<Partial<Record<1 | 2, GhostSummary>>>(
    () => {
      if (!showCompletePanel) return {};
      const out: Partial<Record<1 | 2, GhostSummary>> = {};
      for (const record of splitRecordsToday()) out[record.part] = summarizeGhost(record, ghostOfRecord(record));
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showCompletePanel, rxOrScaled, skips, trackConfigs],
  );
  // La lectura de Rex de cada parte (solo si hay algo que decir): dónde se hundió el ritmo y qué movimiento cede más.
  const wodReadings = useMemo<Partial<Record<1 | 2, WodReading>>>(
    () => {
      if (!showCompletePanel) return {};
      const out: Partial<Record<1 | 2, WodReading>> = {};
      for (const record of splitRecordsToday()) {
        const reading = readWod(record, ghostOfRecord(record));
        if (reading) out[record.part] = reading;
      }
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showCompletePanel, rxOrScaled, skips, trackConfigs],
  );
  /** «Trabajar» el movimiento flojo desde la lectura de Rex: un objetivo normal (se quita en Objetivos) y las sesiones por venir se vuelven a preparar. */
  function createWorkGoal(movementId: string): boolean {
    const goal = buildWorkGoal(movementId, todayIso);
    if (!goal) return false;
    const current = athleteRepository.getProfile();
    athleteRepository.saveProfile({ ...current, goals: [...current.goals, goal] });
    resetUpcomingSessions(todayIso);
    setProfile(athleteRepository.getProfile());
    return true;
  }
  const doneParts = useMemo(() => (session ? sessionParts(session) : []), [session]);
  const testDayBlock = useMemo(() => (session ? getTestDayBlock(session) : undefined), [session]);
  const testDayMovement = testDayBlock ? getMovementById(testDayBlock.movementId) : undefined;
  // Referencia para el cierre de sesión: lo que el coach calculó, a múltiplos de 5 y sin salirse de lo razonable.
  const estimatedMin = useMemo(() => (session ? Math.min(120, Math.max(20, Math.round(estimateSessionMinutes(session) / 5) * 5)) : 60), [session]);
  // Al abrir el cierre de sesión la duración arranca en la estimada: si fue lo normal, no hay que tocarla.
  useEffect(() => {
    if (!showCompletePanel) return;
    // Corrigiendo una sesión terminada, el cierre sale con lo que ya estaba anotado.
    const pre = correctionPrefill.current;
    correctionPrefill.current = null;
    setDurationMin(pre?.durationMin ?? estimatedMin);
    if (!wodDetailFromCards.current) {
      // Lo que ya anotaste en la tarjeta del WOD (entreno en tarjetas) llega al cierre tal cual; si no, arranca en Rx.
      setWodScaling([]);
      setWodFeel(undefined);
      setRxOrScaled('rx');
    }
    wodDetailFromCards.current = false;
    // Si paraste el reloj de entreno en el WOD, su tiempo o sus rondas llegan ya rellenos (editables). Solo se toca un
    // formulario que sigue vacío, y solo el día de hoy.
    if (!session || session.date !== toLocalIsoDate(new Date())) return;
    const runs = readClockRuns(session.date);
    const filled: (1 | 2)[] = [];
    const nextForms = { ...wodForms };
    for (const part of wodParts) {
      const scoreType = wodScoreTypes[part];
      const stop = pickClockStop(runs, part, wodParts.length);
      const patch = scoreType && stop ? clockFormFor(stop, scoreType) : null;
      if (patch && isFormUntouched(wodForms[part])) {
        nextForms[part] = { ...wodForms[part], ...patch };
        filled.push(part);
      }
    }
    if (filled.length > 0) {
      setClockParts((prev) => [...new Set([...prev, ...filled])]);
      setWodForms(nextForms);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompletePanel]);
  const resolveTestDayPRKey = testDayBlock?.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey;

  /**
   * Bloques de fuerza/oly de hoy con una serie ya registrada en `workLog` (modo enfocado) — solo esos
   * admiten el check-in de RPE: el peso y las reps salen de ahí, no se vuelven a pedir. Sin serie
   * registrada todavía no hay nada que calibrar.
   */
  const adjustableSetBlocks = useMemo(() => {
    if (!session || session.isRestDay || session.source === 'custom') return [];
    return session.blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => isAdjustableSetBlock(block))
      .flatMap(({ block, index }) => {
        const topSet = findTopWorkSet(todayWorkLog, block.movementId);
        if (!topSet) return [];
        const logEntry = setFeedbackLog.find((e) => e.date === session.date && e.movementId === block.movementId);
        return [
          {
            index,
            movementName: getMovementById(block.movementId)?.name ?? block.movementId,
            topSet,
            loggedRpe: logEntry?.actualRpe ?? null,
            estimated1rm: logEntry?.estimated1rm,
          },
        ];
      });
  }, [session, setFeedbackLog, todayWorkLog]);

  /** index de bloque -> props de su check-in de RPE, para el modo enfocado (`FocusMode` sí necesita
   * `movementName`: ahí la ficha vive en una lista de varios levantamientos, no pegada a su nombre). */
  const setFeedbackByIndex = useMemo(
    () => new Map(adjustableSetBlocks.map((b) => [b.index, b])),
    [adjustableSetBlocks],
  );

  /** Misma percepción de esfuerzo, recortada para `SessionBlockCard`: ahí el check-in ya vive debajo
   * de su levantamiento, así que `index`/`movementName` no hacen falta. */
  const sessionCardFeedbackByIndex = useMemo(
    () =>
      new Map(
        adjustableSetBlocks.map((b) => [b.index, { topSet: b.topSet, loggedRpe: b.loggedRpe, estimated1rm: b.estimated1rm }]),
      ),
    [adjustableSetBlocks],
  );

  /**
   * Clave de PR y % del 1RM del levantamiento valorado. La clave se resuelve igual que en el motor
   * (`resolveStrengthPRKey/resolveOlyPRKey ?? resolveVariantPRKey`) para que `computeResponseProfile`
   * agregue la sensación bajo la misma clave con la que el motor prescribe ese lift.
   */
  function resolveSetFeedbackTarget(block: SessionBlockResult, prescribedKg: number): { prKey?: string; pctOf1rm?: number } {
    const movement = getMovementById(block.movementId);
    if (!movement) return {};
    const rootKey = (block.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey)(movement);
    const variantKey = resolveVariantPRKey(movement);
    const prKey = rootKey ?? variantKey ?? undefined;
    if (!prKey) return {};
    const pr = rootKey ? profile.prs[rootKey] : profile.variantPrs?.[variantKey!];
    const pctOf1rm = pr && pr > 0 ? Math.round((prescribedKg / pr) * 100) / 100 : undefined;
    return { prKey, pctOf1rm };
  }

  /**
   * Calibra el coach con el RPE de la serie más pesada que el atleta ya registró en `workLog` — el
   * peso y las reps de esa serie no se vuelven a pedir. Ya no reajusta las series que quedan hoy:
   * para eso el atleta ya tiene los +/- del modo enfocado, más directos que una sugerencia derivada
   * de una sensación cualitativa.
   */
  function handleRateSet(index: number, rpe: number) {
    if (!session) return;
    const block = session.blocks[index];
    if (!block) return;
    const topSet = findTopWorkSet(todayWorkLog, block.movementId);
    if (!topSet) return;
    const existing = setFeedbackLog.find((e) => e.date === session.date && e.movementId === block.movementId);
    const prescribedKg = existing?.prescribedKg ?? block.loadKg ?? 0;
    const prescribedSets = existing?.prescribedSets ?? block.sets ?? (block.logAsSingle ? 1 : 0);
    const prescribedReps = existing?.prescribedReps ?? parseWorkingReps(block.reps ?? '') ?? 0;
    if (prescribedKg <= 0 || (prescribedSets < 2 && !block.logAsSingle)) return;

    const { prKey, pctOf1rm } = resolveSetFeedbackTarget(block, prescribedKg);
    const estimated1rm = estimateE1RMFromRpe(topSet.kg, topSet.reps, rpe) ?? undefined;

    athleteRepository.appendSetFeedbackEntry({
      date: session.date,
      movementId: block.movementId,
      block: block.block as 'strength' | 'oly',
      prescribedKg,
      prescribedReps,
      prescribedSets,
      feel: feelFromRpe(rpe),
      prKey,
      pctOf1rm,
      actualKg: topSet.kg,
      actualReps: topSet.reps,
      actualRpe: rpe,
      estimated1rm,
    });
    setSetFeedbackLog(athleteRepository.getSetFeedbackLog());
  }

  /**
   * Cómo fue la primera serie ("me sobró"… "muy duro"): se guarda como feedback del levantamiento para calibrar al coach. Si ya hay
   * un RPE de la serie más pesada del mismo día, ese dato (más preciso) manda y no se pisa.
   */
  function handleFeelSet(index: number, feel: SetFeel) {
    if (!session) return;
    const block = session.blocks[index];
    if (!block) return;
    const existing = setFeedbackLog.find((e) => e.date === session.date && e.movementId === block.movementId);
    if (existing?.actualRpe !== undefined) return;
    const first = todayWorkLog.find((e) => e.movementId === block.movementId && e.setNumber === 1);
    const prescribedKg = existing?.prescribedKg ?? block.loadKg ?? 0;
    const prescribedSets = existing?.prescribedSets ?? block.sets ?? 0;
    const prescribedReps = existing?.prescribedReps ?? parseWorkingReps(block.reps ?? '') ?? 0;
    if (prescribedKg <= 0 || prescribedSets < 2) return;
    const { prKey, pctOf1rm } = resolveSetFeedbackTarget(block, prescribedKg);
    athleteRepository.appendSetFeedbackEntry({
      date: session.date,
      movementId: block.movementId,
      block: block.block as 'strength' | 'oly',
      prescribedKg,
      prescribedReps,
      prescribedSets,
      feel,
      prKey,
      pctOf1rm,
      ...(first ? { actualKg: first.kg, actualReps: first.reps } : {}),
    });
    setSetFeedbackLog(athleteRepository.getSetFeedbackLog());
  }

  function handleLogWorkSet(movementId: string, block: 'strength' | 'oly', setNumber: number, kg: number, reps: number, quality?: SetQuality, asPlanned?: boolean) {
    if (!session) return;
    athleteRepository.saveWorkSet({ date: session.date, movementId, block, setNumber, kg, reps, ...(quality ? { quality } : {}), ...(asPlanned ? { asPlanned: true } : {}) });
    setWorkLog(athleteRepository.getWorkLog());
    // Aviso corto: una serie tras otra se sustituyen entre sí (mismo id) en vez de apilarse.
    const planned = session.blocks.find((b) => b.block === block && b.movementId === movementId)?.sets;
    const name = getMovementById(movementId)?.name ?? session.blocks.find((b) => b.complex?.id && complexLogId(b.complex.id) === movementId)?.complex?.name ?? 'Serie';
    toast.show(`Serie guardada · ${name} ${setNumber}${planned ? `/${planned}` : ''}${kg > 0 ? ` · ${fmtKg(kg)}` : ''}`, { id: 'serie', ttlMs: 2500 });
  }

  /** Cómo salió una serie ya hecha (justa, fallada) o de vuelta a bien: se guarda en la propia serie. */
  function handleSetQuality(movementId: string, setNumber: number, quality: SetQuality | undefined) {
    if (!session) return;
    const entry = athleteRepository.getWorkLog().find((e) => e.date === session.date && e.movementId === movementId && e.setNumber === setNumber);
    if (!entry) return;
    // Tocar cómo salió la serie es medirla: deja de ser «como estaba previsto».
    const { quality: _previous, asPlanned: _asPlanned, ...rest } = entry;
    athleteRepository.saveWorkSet(quality ? { ...rest, quality } : rest);
    setWorkLog(athleteRepository.getWorkLog());
  }

  function handleClearWorkSet(movementId: string, setNumber: number) {
    if (!session) return;
    athleteRepository.clearWorkSet(session.date, movementId, setNumber);
    setWorkLog(athleteRepository.getWorkLog());
  }

  function generateAndCache(nextProfile: AthleteProfile): DailySession {
    const next = generateSessionForDate(nextProfile, history, new Date(), nextProfile.goals);
    athleteRepository.saveCachedSession(next);
    return next;
  }

  // `todayIso` se recalcula en cada render, pero `session` solo se cargaba una vez al montar — si
  // el atleta deja la pestaña abierta pasada la medianoche, esto resincroniza la sesion (y los
  // estados de "hoy" que dependen de ella) con el dia real la proxima vez que algo dispare un
  // render, en vez de quedarse mostrando el dia de ayer hasta recargar la pagina a mano.
  useEffect(() => {
    setSession(loadTodaySession(profile, history, goals, todayIso));
    // `loadTodaySession` puede haber bloqueado la semana (`ensureWeekLocked`) escribiendo
    // directamente en el repositorio — se relee aqui para que el estado de React no se quede con un
    // `profile.weeklyLocks` desactualizado (un `handleSaveProfile` posterior partiria de este estado).
    setProfile(athleteRepository.getProfile());
    setShowCompletePanel(false);
    setFocusMode(false);
    setCardsMode(false);
    setEditMode(false);
    setReturnRampDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIso]);

  function handleUpdateEntry(index: number, patch: Partial<SessionBlockResult>) {
    setSession((prev) => {
      if (!prev) return prev;
      const next: DailySession = {
        ...prev,
        // Si se tocan series, reps o carga a mano, el plan serie a serie de la rampa ya no vale: se quita y vuelve el esquema simple.
        blocks: prev.blocks.map((b, i) =>
          i === index ? { ...b, ...patch, ...(!('setPlan' in patch) && ('sets' in patch || 'reps' in patch || 'loadKg' in patch) ? { setPlan: undefined, waveSize: undefined } : {}), ...('movementId' in patch && !('complex' in patch) ? { complex: undefined } : {}) } : b,
        ),
        editedByAthlete: true,
      };
      athleteRepository.saveCachedSession(next);
      return next;
    });
  }

  /** Añade un movimiento nuevo justo despues de `afterIndex` — solo en bloques que son listas simples (ver `blockHasFixedShape` en SessionBlockCard.tsx). */
  function handleAddEntry(newEntry: SessionBlockResult, afterIndex: number) {
    setSession((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.blocks];
      blocks.splice(afterIndex + 1, 0, newEntry);
      const next: DailySession = { ...prev, blocks, editedByAthlete: true };
      athleteRepository.saveCachedSession(next);
      return next;
    });
  }

  function handleRemoveEntry(index: number) {
    setSession((prev) => {
      if (!prev) return prev;
      const next: DailySession = { ...prev, blocks: prev.blocks.filter((_, i) => i !== index), editedByAthlete: true };
      athleteRepository.saveCachedSession(next);
      return next;
    });
  }

  function handleSaveProfile(newProfile: AthleteProfile) {
    athleteRepository.saveProfile(newProfile);
    // Al cambiar las programaciones de las que sale el WOD (o cómo se elige por esfuerzo), las vistas previas de dias futuros ya cacheadas se descartan
    // para que se recalculen con las nuevas (hoy se recalcula justo debajo).
    if (JSON.stringify(newProfile.wodSources ?? null) !== JSON.stringify(profile.wodSources ?? null) || (newProfile.wodEffortMode ?? null) !== (profile.wodEffortMode ?? null)) {
      for (const date of Object.keys(athleteRepository.getProfile().sessionCache ?? {})) {
        if (date > todayIso) athleteRepository.deleteCachedSession(date);
      }
      newProfile = athleteRepository.getProfile();
    }
    setProfile(newProfile);
    // Solo se recalcula la sesion de hoy (p.ej. tras cambiar un PR) si ya habia una elegida —
    // guardar el perfil no debe materializar una sesion cuando se esta esperando a que el
    // atleta elija que hacer hoy (sin macrociclo activo).
    if (session) setSession(generateAndCache(newProfile));
  }

  /**
   * Guarda los complejos propios y los favoritos y ocultos de la librería. No regenera la sesión de hoy (podría estar a medias o
   * editada a mano): solo se descartan las vistas previas de los días siguientes para que se recalculen con la librería nueva.
   */
  function handleSaveComplexes(next: { customComplexes: OlyComplex[]; complexPrefs: { favorites: string[]; hidden: string[] } }) {
    const fresh = athleteRepository.getProfile();
    athleteRepository.saveProfile({ ...fresh, customComplexes: next.customComplexes, complexPrefs: next.complexPrefs });
    for (const date of Object.keys(athleteRepository.getProfile().sessionCache ?? {})) {
      if (date > todayIso) athleteRepository.deleteCachedSession(date);
    }
    setProfile(athleteRepository.getProfile());
  }

  /** Guarda la dureza pedida para hoy y rehace la sesión con ella (0 = volver a como la programó el coach). */
  function handleApplyHardness(level: HardnessLevel, info?: HardnessApplyInfo) {
    // Se apunta lo que se sabía al subirla (situación, previsión, objetivo): el coach lo compara después con lo que pasó.
    const rest = (profile.hardnessLog ?? []).filter((e) => e.date !== todayIso);
    const hardnessLog = level > 0 && info ? [...rest, { date: todayIso, level: level as 1 | 2, ...info }].slice(-120) : rest;
    handleSaveProfile({ ...profile, hardness: { ...(profile.hardness ?? {}), [todayIso]: level }, hardnessLog });
    setShowHardness(false);
  }

  function handleActivateReturnRamp() {
    if (!returnRampSuggestion) return;
    handleSaveProfile({ ...profile, intensityRamp: returnRampSuggestion.ramp });
    setReturnRampDismissed(true);
  }

  function handleConfirmMacroReview() {
    if (!macroReviewSuggestion) return;
    handleSaveProfile(applyMacroReview(profile, macroReviewSuggestion, todayIso));
  }

  function handleDismissMacroReview() {
    if (!macroReviewSuggestion) return;
    handleSaveProfile(withMacroWeekReviewed(profile, macroReviewSuggestion.reviewKey));
  }
  /**
   * "Regenerar sesión": da OTRO WOD (y el core/skill que dependan del azar) para hoy. La fuerza, el oly y el accesorio
   * los fija el bloqueo semanal y no cambian. Cada pulsación sube la variante del día (`profile.regenVariants`), que
   * entra en la semilla del WOD, así que PC y móvil ven el mismo. Si el WOD está fijado por la semana (día de test)
   * no hay otro que dar y se avisa en vez de guardar nada.
   */
  function handleRegenerate() {
    if (!session || alreadyCompletedToday) return;
    setSpinning(true);
    setTimeout(() => setSpinning(false), 500);
    const wodSignature = (s: DailySession) =>
      s.blocks.filter((b) => b.block === 'wod').map((b) => `${b.movementId}|${b.reps ?? ''}|${b.format ?? ''}|${b.wodPart ?? ''}`).join(';');
    const before = wodSignature(session);
    const current = profile.regenVariants?.[todayIso] ?? 0;
    const date = new Date();
    for (let k = 1; k <= 4; k++) {
      const merged = { ...(profile.regenVariants ?? {}), [todayIso]: current + k };
      const recent = Object.fromEntries(Object.keys(merged).sort().slice(-14).map((d) => [d, merged[d]]));
      const candidateProfile: AthleteProfile = { ...profile, regenVariants: recent };
      const candidate = generateSessionForDate(candidateProfile, history, date, candidateProfile.goals);
      if (wodSignature(candidate) === before) continue;
      athleteRepository.saveProfile(candidateProfile);
      setProfile(candidateProfile);
      athleteRepository.saveCachedSession(candidate);
      setSession(candidate);
      setRegenNote(null);
      toast.show('WOD cambiado');
      return;
    }
    setRegenNote('Hoy el WOD está fijado por la semana (día de test o de referencia), así que no hay otro que dar.');
    setTimeout(() => setRegenNote(null), 6000);
  }

  function openCustomEditor(mode: 'replace' | 'append' = 'replace') {
    setCustomEditorMode(mode);
    setCustomTitleDraft(mode === 'replace' && session?.source === 'custom' ? (session.customTitle ?? '') : '');
    setCustomNoteDraft(mode === 'replace' && session?.source === 'custom' ? (session.customNote ?? '') : '');
    setShowCustomEditor(true);
  }

  function handleSaveCustomSession() {
    const note = customNoteDraft.trim();
    if (!note) return;

    if (customEditorMode === 'append' && session) {
      const wodEntry: SessionBlockResult = {
        block: 'wod',
        movementId: 'custom-wod-note',
        title: customTitleDraft.trim() || undefined,
        format: 'Tu WOD',
        notes: note,
      };
      const next: DailySession = { ...session, blocks: [...session.blocks, wodEntry], editedByAthlete: true };
      athleteRepository.saveCachedSession(next);
      setSession(next);
      setShowCustomEditor(false);
      setShowAddWodPicker(false);
      return;
    }

    const next: DailySession = {
      date: session?.date ?? todayIso,
      mesocycleWeek: 0,
      isRestDay: false,
      blocks: [],
      source: 'custom',
      customTitle: customTitleDraft.trim() || undefined,
      customNote: note,
      swapLabel: 'Tu sesión',
    };
    athleteRepository.saveCachedSession(next);
    setSession(next);
    setShowCustomEditor(false);
  }

  function handlePickType(type: SessionOverrideType | 'macro') {
    const next = type === 'macro' ? generateSessionForDate(profile, history, new Date(), goals) : generateOverrideSession(profile, history, new Date(), type);
    athleteRepository.saveCachedSession(next);
    setSession(next);
    setShowTypePicker(false);
  }

  function openAddWodPicker() {
    const macro = getActiveMacrocycle(profile.macrocycles, todayIso);
    // Determinista (misma semilla que `generateSessionForDate`): lo que se ve en la vista previa es
    // exactamente lo que se añade al confirmar.
    setMacroWodPreview(
      macro ? previewMacroSession(profile, history, macro, new Date(), goals).blocks.filter((b) => b.block === 'wod') : null,
    );
    setShowAddWodPicker(true);
  }

  function handleAddWod(type: SessionOverrideType | 'macro') {
    if (!session) return;
    const wodBlocks =
      type === 'macro'
        ? (macroWodPreview ?? [])
        : buildStrengthProgramWodAddition(history, type, profile.painFlags, todayIso, profile.intensityRamp).blocks;
    if (wodBlocks.length === 0) return;
    const next: DailySession = {
      ...session,
      blocks: [...session.blocks, ...wodBlocks],
      wodTag: type === 'macro' ? 'de tu macrociclo' : undefined,
      editedByAthlete: true,
    };
    athleteRepository.saveCachedSession(next);
    setSession(next);
    setShowAddWodPicker(false);
  }

  function buildPartResult(part: 1 | 2): WodResult | undefined {
    if (skips[part === 1 ? 'wod1' : 'wod2']) return undefined; // un WOD no hecho no tiene resultado
    const scoreType = wodScoreTypes[part];
    return scoreType ? buildWodResult(scoreType, wodForms[part]) : undefined;
  }

  /**
   * Anota cómo salió el levantamiento principal de fuerza y el de oly de hoy (limpia, hecha, dura, fallo) para la progresión por
   * resultados. No anota nada de una parte que se marcó como no hecha, si no se registraron todas sus series o si el formato no es
   * de reps limpias (rampas, olas, complejos, series únicas).
   */
  function recordProgression() {
    if (!session || !countsForProgression(session)) return;
    const log = athleteRepository.getWorkLog();
    const feedbackLog = athleteRepository.getSetFeedbackLog();
    const records = (['strength', 'oly'] as const).flatMap((kind: ProgressionKind) => {
      if (skips[kind]) return [];
      const block = mainLiftBlock(session.blocks, kind);
      const movement = block ? getMovementById(block.movementId) : undefined;
      if (!block || !movement) return [];
      const rootKey = (kind === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey)(movement);
      const record = evaluateLiftSession({
        date: session.date,
        kind,
        block,
        key: rootKey ?? resolveVariantPRKey(movement),
        sets: log.filter((e) => e.date === session.date && e.movementId === block.movementId && e.block === kind),
        feedback: feedbackLog.find((e) => e.date === session.date && e.movementId === block.movementId),
      });
      return record ? [record] : [];
    });
    if (records.length > 0) athleteRepository.appendProgressionRecords(records);
  }

  /** Lo anotado del WOD al cerrar: Rx (sin escalados) o lo que se escaló, y la dureza. Sin movimientos que preguntar o con el WOD sin hacer, nada. */
  function wodDetailFor(): ReturnType<typeof buildWodDetail> {
    const asked = wodMovements.filter((m) => !skips[m.part === 1 ? 'wod1' : 'wod2']);
    if (asked.length === 0) return undefined;
    return buildWodDetail(asked, rxOrScaled, wodScaling, wodFeel);
  }

  function handleConfirmComplete() {
    if (!session) return;
    let nextMessage: string | null = null;

    if (testDayBlock && testDayMovement && testedLoadKg > 0) {
      const prKey = resolveTestDayPRKey(testDayMovement);
      if (prKey && testedLoadKg > profile.prs[prKey]) {
        // Un test de verdad exige la misma evidencia que ya le pedimos a una simple estimacion de
        // e1RM en un dia normal (Rx + RPE alto) — si no, un intento escalado o a medio gas podria
        // sobreescribir el PR con menos garantia que una serie de trabajo cualquiera.
        if (qualifiesForE1RMEstimate(rxOrScaled, rpe)) {
          const nextProfile = { ...profile, prs: { ...profile.prs, [prKey]: testedLoadKg } };
          athleteRepository.saveProfile(nextProfile);
          setProfile(nextProfile);
          nextMessage = `Nuevo PR registrado: ${testDayMovement.name} a ${testedLoadKg} kg. A partir de hoy tus sesiones se calculan sobre esta marca.`;
        } else {
          nextMessage = `Anotado ${testedLoadKg} kg en ${testDayMovement.name}, pero no se ha actualizado tu PR — un test real solo cuenta si vas a Rx y con RPE alto (cerca del límite).`;
        }
      }
    }

    // El historial solo recoge lo que se hizo: las partes marcadas como no hechas se quitan (y se anotan en `skipped`).
    const notDone = skippedParts(skips);
    const wodSplits = splitRecordsToday();
    // A qué categoría de «Tu nivel» contó cada parte del WOD que se hizo (con tus marcas de hoy).
    const wodCategories: NonNullable<SessionHistoryEntry['wodCategories']> = {};
    for (const part of wodParts) {
      if (skips[part === 1 ? 'wod1' : 'wod2']) continue;
      const verdict = classifyWod(session, part, { prs: profile.prs });
      if (verdict.category) wodCategories[part] = verdict.category;
    }
    const builtEntry: SessionHistoryEntry = {
      ...toHistoryEntry(
        applySkips(session, skips),
        rxOrScaled,
        rpe,
        durationMin,
        buildPartResult(1),
        testDayBlock && testedLoadKg > 0 && !skips[testDayBlock.block as 'strength' | 'oly'] ? testedLoadKg : undefined,
        wodParts.includes(2) ? buildPartResult(2) : undefined,
        wodDetailFor(),
      ),
      ...(notDone.length > 0 ? { skipped: notDone } : {}),
      ...(wodSplits.length > 0 ? { wodSplits } : {}),
      ...(Object.keys(wodCategories).length > 0 ? { wodCategories } : {}),
    };
    // Los resultados de WOD en Rx que cuentan para «Tu nivel» (van también al registro largo del perfil).
    const levelResults = levelResultsOfEntry(builtEntry, profile.prs);
    athleteRepository.appendHistoryEntry({ ...builtEntry, ...(levelResults.length > 0 ? { levelResults } : {}) });
    recordProgression();
    // Marca la sesion como "esto paso de verdad" en el mismo instante de completarla — no basta con
    // que el historial/workLog ya esten protegidos: sin esto, otro dispositivo que sincronice antes
    // de enterarse del entreno de hoy podia seguir ganando el empate y pisar la tarjeta del plan
    // (ver bug real: WOD, accesorios de oly y hasta un ejercicio de fuerza distintos tras completar).
    const completed: DailySession = { ...session, editedByAthlete: true };
    athleteRepository.saveCachedSession(completed);
    setSession(completed);
    setHistory(athleteRepository.getHistory());
    // appendHistoryEntry tambien actualiza trainingDatesLog en el perfil persistido — sin esto,
    // returnRampSuggestion (que lee profile.trainingDatesLog del estado) no veria la sesion de hoy
    // hasta el proximo guardado de perfil o recarga.
    setProfile(athleteRepository.getProfile());
    setShowCompletePanel(false);
    setCardsMode(false);
    setLogAllMode(false);
    correctionRef.current = null;
    toast.show('Sesión registrada');
    // Un test que no actualizó el PR no deja rastro en el registro de PRs: se dice aquí, antes de pasar al Dashboard.
    if (nextMessage && !nextMessage.startsWith('Nuevo PR')) toast.show(nextMessage, { tone: 'warn', ttlMs: 12000 });
    // El entreno acaba en el Dashboard: ahí están los aros con lo realizado frente a lo previsto y el resumen de la sesión.
    appNav.goTo('dashboard');
  }

  /**
   * «Ver y corregir»: abre las tarjetas con lo que ya estaba anotado (series, kilos, Rx/escalado, dureza, RPE, minutos y resultado del WOD) para tocar
   * solo lo que cambió. El registro se quita mientras se corrige (así se puede volver a guardar) pero las series se conservan; salir sin guardar, o el
   * aviso, lo devuelve tal como estaba.
   */
  function handleCorrectDay() {
    if (!session) return;
    const snapshot = athleteRepository.snapshotDay(session.date);
    const sessionBefore = session;
    athleteRepository.deleteHistoryEntry(session.date);
    for (const e of snapshot.workLog) athleteRepository.saveWorkSet(e);
    const entry = snapshot.entry;
    if (entry) {
      // Todo lo anotado vuelve a su sitio ya: lo que se toque en las tarjetas parte de ahí y el cierre no lo reinicia.
      correctionPrefill.current = { durationMin: entry.durationMin };
      setRpe(entry.rpe);
      setRxOrScaled(entry.rxOrScaled);
      setWodScaling(entry.wodScaling ?? []);
      setWodFeel(entry.wodFeel);
      wodDetailFromCards.current = true;
      setWodForms({ 1: formFromWodResult(entry.wodResult), 2: formFromWodResult(entry.wodResult2) });
    }
    correctionRef.current = { snapshot, sessionBefore };
    setHistory(athleteRepository.getHistory());
    setWorkLog(athleteRepository.getWorkLog());
    setTestedLoadKg(testDayBlock?.loadKg ?? 0);
    openCards('review', 'start');
    toast.show('Corrigiendo tu sesión: al guardar se vuelve a registrar', { action: { label: 'Dejarlo como estaba', run: () => cancelCorrection() }, ttlMs: 8000 });
  }

  /** Sale de una corrección sin guardar: el registro vuelve tal como estaba. */
  function cancelCorrection() {
    const c = correctionRef.current;
    correctionRef.current = null;
    if (!c) return;
    restoreRegistration(c.snapshot, c.sessionBefore);
  }

  /** Devuelve un registro que se acaba de quitar («Volver a registrar»): la entrada, las series, la progresión y la sesión tal como estaba. */
  function restoreRegistration(snapshot: DaySnapshot, sessionBefore: DailySession) {
    if (!athleteRepository.restoreDay(snapshot)) {
      toast.show('Ese día ya tiene otro registro: no se ha tocado', { tone: 'warn' });
      return;
    }
    athleteRepository.saveCachedSession(sessionBefore);
    setSession(sessionBefore);
    setHistory(athleteRepository.getHistory());
    setWorkLog(athleteRepository.getWorkLog());
    setProfile(athleteRepository.getProfile());
    setShowCompletePanel(false);
    setCardsMode(false);
    toast.show('Registro devuelto');
  }

  function handleUndoComplete() {
    if (!session) return;
    // Sin pregunta: es reversible con el aviso («Volver a registrar»).
    const snapshot = athleteRepository.snapshotDay(session.date);
    const sessionBefore = session;
    athleteRepository.deleteHistoryEntry(session.date);
    const nextHistory = athleteRepository.getHistory();
    setHistory(nextHistory);
    setWorkLog(athleteRepository.getWorkLog());
    // Sin el registro, la sesión vuelve a poder repararse (ver `loadTodaySession`) y se enseña ya con lo corregido.
    setSession(loadTodaySession(athleteRepository.getProfile(), nextHistory, goals, todayIso));
    setProfile(athleteRepository.getProfile());
    toast.show('Registro de hoy deshecho', { action: { label: 'Volver a registrar', run: () => restoreRegistration(snapshot, sessionBefore) } });
  }

  /**
   * Registro rápido de un día fuera de plan (p.ej. entreno de equipo el sábado): sin Rx/escalado ni
   * detalle de bloques, solo RPE + duración — lo justo para que ACWR, racha y volumen semanal vean
   * el día, sin fingir que se hizo lo prescrito. Sustituye la sesión de hoy por una nota genérica
   * (mismo mecanismo que "Tu sesión") y registra el historial con `movementIds` vacío.
   */
  function handleConfirmQuickLog() {
    if (!session) return;
    // «Pasar la prevista a mañana»: cada sesión del plan baja un día hasta que un descanso lo absorbe (lo mismo que «desplaza la semana» de Rex).
    // Hoy se escribe después con lo que se hizo, y deja de ser un descanso elegido: se ha entrenado.
    const moved = otherForm.moveTomorrow && otherMove !== null;
    if (moved && otherMove) {
      athleteRepository.saveProfile(otherMove.profile);
      for (const c of otherMove.changes) if (c.date !== session.date) athleteRepository.saveCachedSession(c.after);
      athleteRepository.saveProfile(withRestUnmarked(athleteRepository.getProfile(), session.date));
    }
    const next = otherDaySession(session.date, session.mesocycleWeek, { kind: otherForm.kind, name: otherForm.name, result: otherForm.result });
    athleteRepository.saveCachedSession(next);
    setSession(next);
    athleteRepository.appendHistoryEntry(toHistoryEntry(next, 'rx', otherForm.rpe, otherForm.minutes));
    setHistory(athleteRepository.getHistory());
    setProfile(athleteRepository.getProfile());
    setShowQuickLog(false);
    // Si se llegó desde la tarjeta de cierre, las tarjetas se cierran: el día ya está registrado.
    setCardsMode(false);
    setListMode(false);
    setLogAllMode(false);
    setShowCompletePanel(false);
    toast.show(moved ? 'Anotado. La sesión prevista pasa a mañana' : 'Anotado como otra cosa');
  }

  /**
   * Se registró un día pasado que se había quedado sin apuntar (ver LogPastDay). El historial y el perfil (fechas de entreno, trabajo del día)
   * se vuelven a leer, y la sesión de hoy se rehace si aún no se ha tocado: el coach ya sabe que ese día se entrenó (y no fue descanso).
   */
  function handleLoggedPastDay() {
    const nextHistory = athleteRepository.getHistory();
    const nextProfile = athleteRepository.getProfile();
    setHistory(nextHistory);
    setProfile(nextProfile);
    setWorkLog(athleteRepository.getWorkLog());
    if (session && !history.some((h) => h.date === session.date) && !session.editedByAthlete && session.source !== 'custom') {
      const next = generateSessionForDate(nextProfile, nextHistory, new Date(), nextProfile.goals);
      athleteRepository.saveCachedSession(next);
      setSession(next);
    }
  }

  async function handleDeleteTodaySession() {
    if (!session) return;
    const ok = await confirmSheet({ title: '¿Borrar la sesión de hoy?', body: 'Volverás a elegir qué hacer hoy.', confirmLabel: 'Borrar sesión', danger: true });
    if (!ok) return;
    athleteRepository.deleteCachedSession(session.date);
    toast.show('Sesión de hoy borrada');
    setSession(hasActiveTrainingStructure(profile, session.date) ? generateAndCache(profile) : null);
    setEditMode(false);
    setShowCompletePanel(false);
  }

  function handleSavePainFlag() {
    const flag = {
      id: crypto.randomUUID(),
      area: painAreaDraft,
      createdDate: todayIso,
      until: resolvePainFlagUntil(todayIso, painDurationDraft),
    };
    const nextProfile = { ...profile, painFlags: [...prunePainFlags(profile.painFlags, todayIso), flag] };
    handleSaveProfile(nextProfile);
    setShowPainPicker(false);
  }

  /** Lo que decide Rex ante un imprevisto: un aviso de molestia (se recalcula la sesión), días de descanso, o cambiar la sesión de hoy. */
  function handleRexApply(effect: SupportEffect) {
    if (effect.regenerate) handleSaveProfile(effect.profile);
    else if (effect.profile !== profile) {
      // Solo marcas de descanso: no se toca la sesión de hoy (podría estar a medias o ya hecha).
      athleteRepository.saveProfile(effect.profile);
      setProfile(effect.profile);
    }
    if (effect.swap) handlePickType(effect.swap);
  }

  function handleRemovePainFlag(id: string) {
    // No se borra: se marca como retirado hoy. Deja de evitar sus patrones al instante, pero la
    // carga de esos patrones vuelve en rampa las siguientes semanas (getPainReintroPatterns). Los
    // avisos cuya ventana de reintroduccion ya paso se limpian aqui.
    const painFlags = prunePainFlags(profile.painFlags, todayIso).map((f) =>
      f.id === id ? { ...f, clearedDate: todayIso } : f,
    );
    handleSaveProfile({ ...profile, painFlags });
  }

  // Los avisos del coach ya no ocupan una barra: un icono arriba (con punto solo si hay algo que decidir) abre la hoja.
  const noticeProps: CoachNoticesProps = {
    activePainFlags,
    onRemovePainFlag: handleRemovePainFlag,
    rampStatus,
    returnRampSuggestion,
    showReturnRampSuggestion,
    onActivateReturnRamp: handleActivateReturnRamp,
    onDismissReturnRamp: () => setReturnRampDismissed(true),
    macroReviewSuggestion,
    onConfirmMacroReview: handleConfirmMacroReview,
    onDismissMacroReview: handleDismissMacroReview,
    nextMacroSuggestion,
    onNavigateToObjetivos,
    retestHeadsUp,
  };
  const noticeSummary = summarizeNotices(noticeProps);

  // Rex: la frase del estado del día y el aviso de que el coach tiene algo que contar. La molestia ya va dentro de la frase.
  const noticesWithoutPain = Math.max(0, noticeSummary.count - activePainFlags.length);
  const planComp = session?.competition;
  // Con la sesión hecha, Rex cuenta lo que importa en una frase (cambios de carga, un PR, la racha) y el resumen entero se abre aparte.
  const kgText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;
  const completedInfo =
    alreadyCompletedToday && session && summaryData
      ? {
          changes: summaryData.progression.flatMap((v) => {
            const name = getMovementById(v.record.movementId)?.name ?? v.record.movementId;
            if (v.change === 'subio' && v.nextKg) return [`${name} sube a ${kgText(v.nextKg)} el próximo día.`];
            if (v.change === 'bajo' && v.nextKg) return [`${name} baja a ${kgText(v.nextKg)} el próximo día: te están costando las series.`];
            return [];
          }),
          prMessage: summaryData.prMessage,
          e1rmPending: summaryData.e1rmSuggestions.length,
          streak: summaryData.streak,
          weekDone: summaryData.weekCount.done,
          weekPlanned: summaryData.weekCount.planned,
        }
      : null;
  // El programa de fuerza que convive con el macro: si hoy toca ofrecerlo (o ya lo aceptaste), Rex lo anuncia y la tarjeta cuelga bajo la sesión.
  const companionProgram = pickCompanionProgram(profile, todayIso);
  const companionStat = companionProgram ? companionStatus(companionProgram, todayIso) : null;
  const companionPlan =
    companionProgram && (companionStat?.kind === 'oferta' || companionStat?.kind === 'aceptada') ? generateCompanionSession(profile, history, companionProgram, todayIso) : null;
  const companionForRex =
    companionPlan && companionStat
      ? {
          title: companionPlan.title,
          number: companionPlan.index + 1,
          total: companionPlan.total,
          accepted: companionStat.kind === 'aceptada',
          late: companionStat.kind === 'oferta' && companionStat.late,
          isTest: companionPlan.isTest,
        }
      : null;
  /** Aplica un cambio al perfil guardado y refresca la pantalla (la tarjeta del programa de fuerza lo usa). */
  function commitCompanion(change: (p: AthleteProfile) => AthleteProfile) {
    const next = change(athleteRepository.getProfile());
    athleteRepository.saveProfile(next);
    setProfile(next);
  }
  function openSupport(node?: string) {
    setSupportStart(node);
    setShowRex(true);
  }
  const companionLive = companionProgram && (companionStat?.kind === 'oferta' || companionStat?.kind === 'aceptada' || companionStat?.kind === 'aplazada');
  /** Lo que se hace con el programa de fuerza desde RexLab: hacerla hoy, aplazarla, saltarla o pausar el programa. */
  function programAsk(action: 'aplazar' | 'saltar' | 'pausar' | 'hacer', days: number | null): AskAnswer {
    if (!companionProgram || !companionLive) return { lead: 'Sin sesión del programa.', tone: 'info', text: 'Hoy no toca ninguna sesión de tu programa de fuerza.', actions: [] };
    const id = companionProgram.id;
    if (action === 'hacer') {
      commitCompanion((p) => acceptCompanion(p, id, todayIso));
      return { lead: 'Hecho.', tone: 'good', text: 'La sesión del programa va en tu día. Al terminarla, apúntala en su tarjeta.', actions: [{ label: 'Verla', target: 'plan-programa' }] };
    }
    if (action === 'aplazar') {
      commitCompanion((p) => declineCompanion(p, id, todayIso));
      return { lead: 'Aplazada.', tone: 'info', text: 'La sesión no se pierde: mañana te la vuelvo a ofrecer.', actions: [] };
    }
    if (action === 'saltar') {
      if (companionPlan && isCompanionTestSession(companionProgram, companionPlan.index)) return { lead: 'Esa no se salta.', tone: 'mid', text: 'Es una sesión de test: solo se puede aplazar.', actions: [] };
      commitCompanion((p) => skipCompanion(p, id, todayIso, companionPlan?.title));
      return { lead: 'Saltada.', tone: 'info', text: 'El programa avanza a la siguiente sin hacerla.', actions: [] };
    }
    commitCompanion((p) => pauseCompanion(p, id, todayIso, days ?? 7));
    return { lead: 'Programa en pausa.', tone: 'info', text: `No te ofreceré nada del programa durante ${days ?? 7} días.`, actions: [] };
  }
  /**
   * Cambiar la sesión de hoy hablando («tengo 30 minutos», «sin accesorio», «solo fuerza»): primero se enseña qué se quitaría y solo se aplica con el
   * «Sí». La sesión de antes se guarda en memoria para poder deshacer mientras no recargues.
   */
  /** Se han movido sesiones de la semana (o se ha deshecho): se relee el perfil y la sesión de hoy, que puede haber cambiado de día o de contenido. */
  function reloadWeek() {
    const fresh = athleteRepository.getProfile();
    setProfile(fresh);
    setSession(loadTodaySession(fresh, history, goals, todayIso));
  }
  const adaptUndoRef = useRef<DailySession | null>(null);
  // Para enseñar «Deshacer el cambio» en el lab mientras haya algo que deshacer (la referencia sola no repinta).
  const [canUndoAdapt, setCanUndoAdapt] = useState(false);
  // «Deshacer el último cambio» de la semana: se ve mientras Rex lo recuerde (24 h, en este móvil); se relee al abrir el lab y tras cada cambio.
  const canUndoWeek = peekUndo() !== null;
  function adaptAsk(request: AdaptRequest, confirmed: boolean): AskAnswer {
    if (!session) return adaptRefusalAnswer('sin-sesion');
    if (alreadyCompletedToday) return adaptRefusalAnswer('hecha');
    const plan = planAdaptation(session, request);
    if (typeof plan === 'string') return adaptRefusalAnswer(plan);
    if (plan.removed.length === 0) return adaptProposalAnswer(request, plan);
    if (!confirmed) return adaptProposalAnswer(request, plan);
    adaptUndoRef.current = session;
    setCanUndoAdapt(true);
    athleteRepository.saveCachedSession(plan.session);
    setSession(plan.session);
    return adaptDoneAnswer(plan);
  }
  function adaptUndo(): AskAnswer {
    const before = adaptUndoRef.current;
    // Sin sesión acortada que deshacer, «deshaz el cambio» deshace el último cambio de la semana (mover, intercambiar, desplazar).
    if (!before) return peekUndo() ? undoWeekChange({ onWeekChanged: reloadWeek }) : adaptRefusalAnswer('nada-que-deshacer');
    athleteRepository.saveCachedSession(before);
    setSession(before);
    adaptUndoRef.current = null;
    setCanUndoAdapt(false);
    return { lead: 'Deshecho.', tone: 'good', text: 'La sesión de hoy vuelve a como estaba.', actions: [] };
  }
  /** La caja de RexLab de Planificación: lo que se hace aquí lo hace esta pantalla; lo demás lo reparte el común (`rexAskRouter.ts`). */
  function askRex(text: string): AskAnswer | 'close' {
    return routeAsk(text, 'planificacion', {
      todayIso,
      // Una marca nueva cambia los pesos: se relee el perfil y se recalcula la sesión de hoy (como al guardarla desde el perfil).
      onMarkSaved: () => handleSaveProfile(athleteRepository.getProfile()),
      // Se han movido sesiones de la semana: se relee el perfil y la sesión de hoy (que puede haber cambiado de día o de contenido).
      onWeekChanged: reloadWeek,
      local: {
        dolor: () => {
          openSupport('p_zone');
          return 'close';
        },
        'no-plan': () => {
          openSupport('t_what');
          return 'close';
        },
        faltar: () => {
          openSupport('a_why');
          return 'close';
        },
        'otro-wod': () => {
          if (!hasWodBlock || alreadyCompletedToday) return { lead: 'Hoy no hay WOD que cambiar.', tone: 'info', text: 'No hay un WOD en la sesión de hoy o ya está hecha.', actions: [] };
          handleRexAct('otro-wod');
          return 'close';
        },
        // «Empieza la sesión» / «cierra la sesión»: las tarjetas, sin salir de aquí (en el cierre si se pidió cerrar).
        empezar: () => {
          const refused = orderRefusal('empezar', todayIso);
          if (refused) return refused;
          startTraining();
          return 'close';
        },
        cerrar: () => {
          const refused = orderRefusal('cerrar', todayIso);
          if (refused) return refused;
          openCards('live', 'end');
          return 'close';
        },
        // «Anota lo que hice» y «hice otra cosa»: la pregunta de qué hiciste y el registro corto, sin salir de aquí.
        anotar: () => {
          const refused = orderRefusal('anotar', todayIso);
          if (refused) return refused;
          setShowWhatDid(true);
          return 'close';
        },
        'otra-cosa': () => {
          const refused = orderRefusal('otra-cosa', todayIso);
          if (refused) return refused;
          openQuickLog();
          return 'close';
        },
        programa: (intent) => programAsk(intent.action, intent.days),
        adaptar: (intent) => adaptAsk(intent.request, intent.confirmed),
        'adaptar-ayuda': () => (!session || alreadyCompletedToday ? adaptRefusalAnswer(session ? 'hecha' : 'sin-sesion') : adaptHowMuchAnswer()),
        'adaptar-deshacer': () => adaptUndo(),
        dia: (intent) =>
          dayAnswer(
            intent.label,
            describeDayForAsk({ offset: intent.offset, todayIso, profile, history, todaySession: session && !alreadyCompletedToday ? session : null, todayStrain: null, bias: strainBias }),
          ),
      },
    });
  }
  /** Las opciones de RexLab de Planificación: lo que antes estaba en «¿Cambiar algo?», agrupado, y el programa de fuerza. */
  const canChangeToday = Boolean(session && !session.isRestDay && !alreadyCompletedToday);
  const rexLab: LabSection[] = [
    // «Cambiar día» está siempre: sirve para cualquier día de la semana, tenga sesión hoy o no (descanso, ya hecha…).
    {
      title: 'Tu semana',
      items: [
        { id: 'cambiar-dia', label: 'Cambiar día', hint: 'mover, intercambiar, desplazar', icon: CalendarClock, ask: 'cambiar dia' },
        ...(canUndoWeek ? [{ id: 'deshacer-semana', label: 'Deshacer el último cambio', icon: Undo2, ask: 'deshaz el cambio de la semana' }] : []),
      ],
    },
    ...(canChangeToday
      ? [
          {
            title: 'Cambiar la sesión de hoy',
            items: [
              { id: 'modo-entreno', label: 'Cómo entreno', hint: trainMode === 'list' ? 'ahora: lista y cronómetro' : trainMode === 'cards' ? 'ahora: serie a serie' : 'lista o serie a serie', icon: Layers, onClick: () => setShowModeChoice(true) },
              { id: 'modo-enfocado', label: 'Entreno de siempre', hint: 'una parte por pantalla', icon: GalleryHorizontalEnd, onClick: () => setFocusMode(true) },
              ...(hasWodBlock ? [{ id: 'otro-wod', label: 'Otro WOD', icon: Shuffle, onClick: () => handleRexAct('otro-wod') }] : []),
              ...(hasWodBlock ? [{ id: 'wod-fantasma', label: 'Repetir WOD fantasma', hint: 'correr contra tu marca de entonces', icon: GhostIcon, onClick: () => setShowRepeat(true) }] : []),
              ...(canHarder ? [{ id: 'mas-dura', label: 'Más dura', hint: '+1 / +2', icon: Flame, onClick: () => handleRexAct('dureza') }] : []),
              { id: 'acortar', label: 'Acortar la sesión', hint: 'tengo poco tiempo', icon: Timer, ask: 'acortar la sesion' },
              ...(canUndoAdapt ? [{ id: 'deshacer-cambio', label: 'Deshacer el cambio', icon: Undo2, ask: 'deshaz el cambio' }] : []),
              { id: 'tipo', label: 'Cambiar el tipo', hint: 'recovery, WOD libre', icon: SlidersHorizontal, onClick: () => handleRexAct('tipo') },
              { id: 'editar', label: 'Editar sesión', icon: Pencil, onClick: () => handleRexAct('editar') },
            ],
          },
        ]
      : []),
    {
      title: 'Si algo ha pasado',
      items: [
        { id: 'me-duele', label: 'Me duele algo', icon: HeartPulse, onClick: () => openSupport('p_zone') },
        ...(session && !session.isRestDay && !alreadyCompletedToday ? [{ id: 'otra-cosa', label: 'Hice otra cosa', hint: 'clase, running, equipo…', icon: NotebookPen, onClick: () => openQuickLog() }] : []),
        ...(!alreadyCompletedToday ? [{ id: 'no-estoy', label: 'Hoy no estoy para el plan', icon: Frown, onClick: () => openSupport('t_what') }] : []),
        { id: 'faltar', label: 'Voy a faltar unos días', icon: Plane, onClick: () => openSupport('a_why') },
      ],
    },
    ...(companionProgram && companionLive
      ? [
          {
            title: 'Programa de fuerza',
            items: [
              ...(companionStat?.kind !== 'aceptada' ? [{ id: 'prog-hacer', label: 'Hacerla hoy', hint: companionPlan ? `sesión ${companionPlan.index + 1}` : undefined, icon: Dumbbell, onClick: () => programAsk('hacer', null) }] : []),
              ...(companionStat?.kind !== 'aplazada' ? [{ id: 'prog-aplazar', label: 'Aplazar la del programa', hint: 'pasa a mañana', icon: FastForward, onClick: () => programAsk('aplazar', null) }] : []),
              { id: 'prog-semanas', label: 'Ver semana a semana', icon: CalendarDays, onClick: () => rexBus.emit('companion-weeks') },
              { id: 'prog-pausar', label: 'Pausar 7 días', icon: PauseCircle, onClick: () => programAsk('pausar', 7) },
            ],
          },
        ]
      : []),
    {
      title: 'Más',
      items: [
        { id: 'complejos', label: 'Librería de complejos', icon: Library, onClick: () => handleRexAct('complejos') },
        ...(noticeSummary.count > 0 ? [{ id: 'avisos', label: 'Avisos del coach', hint: String(noticeSummary.count), icon: Bell, onClick: () => handleRexAct('avisos') }] : []),
        ...(alreadyCompletedToday ? [{ id: 'corregir', label: 'Ver y corregir', hint: 'las tarjetas con lo anotado', icon: Pencil, onClick: () => handleCorrectDay() }] : []),
        ...(alreadyCompletedToday ? [{ id: 'deshacer-registro', label: 'Deshacer el registro', icon: Undo2, onClick: () => handleRexAct('deshacer') }] : []),
      ],
    },
  ];

  // Si RexLab de otra pantalla dejó dicho qué abrir (la molestia, «hoy no», faltar, otro WOD), se abre al llegar.
  // «Continuar sesión» del Dashboard: se mira al montar (sin gastarlo) para que el modo desarrollo, que repite los efectos, no lo pierda.
  const dashboardAct = useRef<string | null>(handoff.peek('plan-act'));
  useEffect(() => {
    const node = handoff.take('support-start');
    const pending = ['continuar', 'cerrar', 'anotar', 'otra-cosa'].includes(dashboardAct.current ?? '') ? dashboardAct.current : null;
    const act = handoff.take('plan-act') ?? pending;
    const canOpen = Boolean(session && !session.isRestDay && session.source !== 'custom' && session.blocks.length > 0 && !alreadyCompletedToday);
    if (node) openSupport(node);
    // «Continuar sesión» y «Cerrar sesión» desde el Dashboard: se abren las tarjetas, donde estaban las series anotadas (la segunda, en el cierre).
    else if (act === 'continuar' && canOpen) startTraining();
    else if (act === 'cerrar' && canOpen) openCards('live', 'end');
    else if (act === 'anotar' && canOpen) setShowWhatDid(true);
    else if (act === 'otra-cosa' && session && !alreadyCompletedToday) openQuickLog();
    else if (act === 'otro-wod' && hasWodBlock && !alreadyCompletedToday) {
      const t = window.setTimeout(() => handleRexAct('otro-wod'), 400);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lo que le dijiste a Rex de tu tiempo en este día de la semana («los jueves solo tengo 45 minutos»).
  const todayWeekday = new Date(`${todayIso}T12:00:00`).getDay();
  const todayTimeNote = timeLimitFor(profile.rexNotes, todayWeekday);
  const rexList = buildPlanRexSuggestions({
    canStart: Boolean(session && !alreadyCompletedToday && session.source !== 'custom' && session.blocks.length > 0 && !session.isRestDay),
    inProgress: !alreadyCompletedToday && todayWorkLog.length > 0 ? { sets: todayWorkLog.length } : null,
    allSetsLogged: Boolean(session && !alreadyCompletedToday && allBarSetsLogged(session.blocks, todayWorkLog)),
    editing: editMode && Boolean(session && !session.isRestDay),
    restDay: Boolean(session?.isRestDay && !session.competition?.eventDay),
    completed: completedInfo,
    hasTrainingSession: Boolean(session && !session.isRestDay && !editMode && !alreadyCompletedToday),
    light: session?.dayLight ? { color: session.dayLight.color, name: LIGHT_LABEL[session.dayLight.color].name } : null,
    planned: plannedStrain ? plannedStrain.strain : null,
    fit: planFitResult ? { kind: planFitResult.fit, diff: planFitResult.diff } : null,
    target: strainTarget ? { low: strainTarget.low, high: strainTarget.high } : null,
    hardness: session?.hardness ?? 0,
    canHarder,
    competition: planComp && !planComp.eventDay && planComp.daysToEvent > 0 ? { daysToEvent: planComp.daysToEvent, phase: PHASE_WORD[planComp.phase] } : null,
    painLabels: activePainFlags.map((f) => PAIN_AREA_LABEL[f.area]),
    emphasis: session?.profileEmphasis?.summary ?? null,
    notices: { count: noticesWithoutPain, actionable: noticeSummary.actionable },
    program: companionForRex,
    timeNote: todayTimeNote ? { day: weekdayPlural(todayWeekday), minutes: todayTimeNote, sessionMinutes: estimatedMin } : null,
  });
  const rexPick = pickRexSuggestion(rexList, rexMemory, todayIso, rexCursor);
  const showRexBar = rexList.length > 0 && rexPick.current.id !== 'quiet';
  function updateRexMemory(change: (m: RexMemory) => RexMemory) {
    setRexMemory((prev) => {
      const next = change(prev);
      if (next !== prev) saveRexMemory(typeof window !== 'undefined' ? window.localStorage : null, next);
      return next;
    });
  }
  function runPlanTarget(target: RexTarget) {
    if (target === 'plan-detalle') setShowPlanDetail((v) => !v);
    else if (target === 'plan-dureza') setShowHardness(true);
    else if (target === 'plan-molestia') setShowPainPicker(true);
    else if (target === 'plan-avisos') setShowNotices(true);
    else if (target === 'plan-resumen') {
      // El resumen de la sesión hecha está en el Dashboard: se va allí y se abre.
      handoff.put('dash-act', 'resumen');
      appNav.goTo('dashboard');
    }
    else if (target === 'plan-cambiar') setShowRex(true);
    else if (target === 'plan-empezar') startTraining();
    else if (target === 'plan-anotar') setShowWhatDid(true);
    else if (target === 'plan-corregir') handleCorrectDay();
    else if (target === 'plan-cerrar') openCards('live', 'end');
    else if (target === 'plan-terminar') setEditMode(false);
    else if (target === 'plan-programa') document.getElementById('companion-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  /** El cierre de la sesión (resultado del WOD, Rx/escalado, esfuerzo, minutos): va tras los bloques o, con las tarjetas, dentro de la última. */
  function renderCompletePanel() {
    if (!session) return null;
    return (
      <CompleteSessionPanel
        wodParts={wodParts}
        scoreTypes={wodScoreTypes}
        targets={Object.fromEntries(
          wodParts.map((part) => [part, session.blocks.find((b) => b.block === 'wod' && (b.wodPart ?? 1) === part && b.wodTarget)?.wodTarget?.display]),
        )}
        forms={wodForms}
        parts={doneParts}
        skips={skips}
        onSkipsChange={setSkips}
        clockParts={clockParts}
        ghostSummaries={ghostSummaries}
        wodReadings={wodReadings}
        onWorkMovement={createWorkGoal}
        capSeconds={{ 1: wodCaps[1]?.kind === 'cap' ? wodCaps[1].seconds : undefined, 2: wodCaps[2]?.kind === 'cap' ? wodCaps[2].seconds : undefined }}
        onFormChange={(part, patch) => setWodForms((prev) => ({ ...prev, [part]: { ...prev[part], ...patch } }))}
        test={testDayBlock && testDayMovement ? { movementName: testDayMovement.name, loadKg: testedLoadKg, onChange: setTestedLoadKg } : undefined}
        wodMovements={wodMovements}
        scaling={wodScaling}
        onScaling={(next) => {
          setWodScaling(next);
          // Escalar un movimiento es escalar el WOD; quitarlos todos no vuelve a Rx solo (el interruptor lo decide).
          if (next.length > 0) setRxOrScaled('scaled');
        }}
        feel={wodFeel}
        onFeel={setWodFeel}
        rxOrScaled={rxOrScaled}
        onRxOrScaled={setRxOrScaled}
        rpe={rpe}
        onRpe={setRpe}
        durationMin={durationMin}
        onDuration={setDurationMin}
        estimatedMin={estimatedMin}
        singleStep={logAllMode}
        // «Anotar de golpe»: las series de la pantalla se guardan justo antes de registrar la sesión (el registro y la progresión las leen del almacén).
        onConfirm={() => {
          if (logAllMode) {
            logAllCommit.current?.();
            setWorkLog(athleteRepository.getWorkLog());
          }
          handleConfirmComplete();
        }}
        onCancel={() => {
          setShowCompletePanel(false);
          setLogAllMode(false);
        }}
      />
    );
  }
  /** Los cambios directos de la sesión que Rex ofrece en «¿Cambiar algo?»: otro WOD, el selector de tipo o la hoja de dureza. */
  function handleRexAct(action: SupportAction) {
    if (action === 'otro-wod') handleRegenerate();
    else if (action === 'tipo') setShowTypePicker(true);
    else if (action === 'editar') setEditMode(true);
    else if (action === 'complejos') setShowComplexes(true);
    else if (action === 'avisos') setShowNotices(true);
    else if (action === 'deshacer') handleUndoComplete();
    else if (action === 'borrar') handleDeleteTodaySession();
    else setShowHardness(true);
  }

  return (
    <div className="flex flex-col gap-4 pb-44">
      <Modal open={showNotices} onClose={() => setShowNotices(false)} title="Avisos del coach">
        <CoachNoticesBody {...noticeProps} />
      </Modal>
      <Modal open={showReasons} onClose={() => setShowReasons(false)} title="Por qué tu sesión es así hoy">
        <CoachReasonsList reasons={session?.coachReasons ?? []} />
      </Modal>
      {session && !session.isRestDay && <TrainingTimer caps={wodCaps} track={trackConfigs} />}
      {focusMode && session && !session.isRestDay && (
        <FocusMode
          session={session}
          setFeedbackByIndex={setFeedbackByIndex}
          onRateSet={handleRateSet}
          todayWorkLog={todayWorkLog}
          progress={movementProgress}
          onLogWorkSet={handleLogWorkSet}
          onSetQuality={handleSetQuality}
          onClearWorkSet={handleClearWorkSet}
          canRaise={session.dayLight?.color !== 'ambar' && activePainFlags.length === 0}
          onFeel={handleFeelSet}
          painFlags={activePainFlags}
          onSwap={handleUpdateEntry}
          complexPool={complexPool}
          complexWeek={complexWeek}
          onExit={() => setFocusMode(false)}
          // Al acabar el último bloque se cierra en el único sitio donde se cierra: la última tarjeta.
          onFinish={() => {
            setFocusMode(false);
            openCards('live', 'end');
          }}
        />
      )}
      {listMode && session && !session.isRestDay && !alreadyCompletedToday && (
        <TrainList
          session={session}
          todayWorkLog={todayWorkLog}
          onExit={() => setListMode(false)}
          onPain={() => openSupport('p_zone')}
          onSwitchToCards={() => {
            writeTrainMode(typeof window !== 'undefined' ? window.localStorage : null, 'cards');
            setTrainMode('cards');
            openCards('live', 'start');
          }}
          // Los minutos de la lista llegan al cierre como los de una corrección: se enseñan en vez de la estimación.
          onFinish={(minutes) => {
            correctionPrefill.current = { durationMin: minutes };
            openLogAll();
          }}
        />
      )}
      {logAllMode && session && !session.isRestDay && !alreadyCompletedToday && (
        <LogAll
          session={session}
          todayWorkLog={todayWorkLog}
          skips={skips}
          commitRef={logAllCommit}
          closePanel={showCompletePanel ? renderCompletePanel() : null}
          onExit={() => {
            setLogAllMode(false);
            setShowCompletePanel(false);
          }}
          onSwitchToCards={() => openCards('review', 'start')}
          onOtherThing={openQuickLog}
        />
      )}
      {cardsMode && session && !session.isRestDay && (
        <TrainCards
          session={session}
          setFeedbackByIndex={setFeedbackByIndex}
          onRateSet={handleRateSet}
          todayWorkLog={todayWorkLog}
          progress={movementProgress}
          onLogWorkSet={handleLogWorkSet}
          onSetQuality={handleSetQuality}
          onClearWorkSet={handleClearWorkSet}
          canRaise={session.dayLight?.color !== 'ambar' && activePainFlags.length === 0}
          onFeel={handleFeelSet}
          painFlags={activePainFlags}
          onSwap={handleUpdateEntry}
          complexPool={complexPool}
          complexWeek={complexWeek}
          // Salir de una corrección sin guardar devuelve el registro tal como estaba; entrenando, las series ya están guardadas.
          onExit={() => {
            if (correctionRef.current) cancelCorrection();
            else {
              setCardsMode(false);
              // El cierre solo vive dentro de la última tarjeta: al salir se cierra, y se vuelve a abrir al llegar otra vez al final.
              setShowCompletePanel(false);
            }
          }}
          mode={cardsOpts.mode}
          startAt={cardsOpts.startAt}
          closePanel={showCompletePanel && !alreadyCompletedToday ? renderCompletePanel() : null}
          onReachClose={() => {
            if (alreadyCompletedToday || showCompletePanel) return;
            setTestedLoadKg(testDayBlock?.loadKg ?? 0);
            setShowCompletePanel(true);
          }}
          onPain={() => openSupport('p_zone')}
          wod={
            wodMovements.length > 0
              ? {
                  movements: wodMovements,
                  rxOrScaled,
                  onRxOrScaled: (v) => {
                    wodDetailFromCards.current = true;
                    setRxOrScaled(v);
                  },
                  scaling: wodScaling,
                  onScaling: (next) => {
                    wodDetailFromCards.current = true;
                    setWodScaling(next);
                    if (next.length > 0) setRxOrScaled('scaled');
                  },
                  feel: wodFeel,
                  onFeel: (v) => {
                    wodDetailFromCards.current = true;
                    setWodFeel(v);
                  },
                }
              : undefined
          }
          onOtherThing={openQuickLog}
          // Con el cierre integrado (`onReachClose`) la última tarjeta no termina por aquí: el cierre se guarda dentro de ella.
          onFinish={() => openCards('live', 'end')}
        />
      )}
      {showComplexes && (
        <ComplexLibrary profile={profile} workLog={workLog} week={complexWeek} onSave={handleSaveComplexes} onClose={() => setShowComplexes(false)} />
      )}

      <Modal open={showSeasonMap} onClose={() => setShowSeasonMap(false)} title="Tu temporada">
        <SeasonMapFull profile={profile} todayIso={todayIso} embedded />
      </Modal>

      {showDiary && (
        <TrainingDiary
          history={history}
          workLog={workLog}
          trainingDatesLog={profile.trainingDatesLog ?? []}
          companionLog={profile.companionLog ?? []}
          onDeleteEntry={(date) => {
            athleteRepository.deleteHistoryEntry(date);
            setHistory(athleteRepository.getHistory());
            setWorkLog(athleteRepository.getWorkLog());
            setProfile(athleteRepository.getProfile());
          }}
          onClose={() => setShowDiary(false)}
        />
      )}

      {/* En escritorio (lg+) la sesión ocupa la columna ancha y la banda de semana + los avisos del
          coach van a un raíl fijo a la derecha. En móvil todo se apila en el orden de siempre. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6">
        <div className="contents lg:col-start-2 lg:row-start-1 lg:block">
          <div className="flex flex-col gap-3 lg:sticky lg:top-6">
            <SeasonMapCompact profile={profile} todayIso={todayIso} onOpen={() => setShowSeasonMap(true)} />
            <div className="flex flex-col gap-1.5">
              <WeekStrip
                profile={profile}
                history={loadHistory}
                goals={goals}
                onDeleteHistoryEntry={(date) => {
                  athleteRepository.deleteHistoryEntry(date);
                  setHistory(athleteRepository.getHistory());
                }}
                onLoggedDay={handleLoggedPastDay}
                onRestChange={() => setProfile(athleteRepository.getProfile())}
              />
              {(history.length > 0 || (profile.companionLog ?? []).length > 0) && (
                <button
                  onClick={() => setShowDiary(true)}
                  className="self-end text-xs font-semibold text-neutral-500 transition-colors duration-200 hover:text-brand-gold"
                >
                  Ver diario completo →
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">

      {!session && (
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-border bg-brand-surfaceMuted">
            <Brain size={24} strokeWidth={2} className="text-brand-neon" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Todavía no hay macrociclo activo</p>
            <p className="mt-1 text-xs text-neutral-400">
              {nextMacroStart ? `Hasta que empiece el ${nextMacroStart}, decides tú qué haces cada día.` : 'Decides tú qué haces cada día.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => handlePickType('random')}
              className="flex items-center gap-1.5 rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              <Shuffle size={13} strokeWidth={2.25} className="text-brand-gold" />
              Aleatoria
            </button>
            <button
              onClick={() => openCustomEditor()}
              className="flex items-center gap-1.5 rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              <NotebookPen size={13} strokeWidth={2.25} className="text-brand-gold" />
              Propia
            </button>
            <button
              onClick={() => handlePickType('recovery')}
              className="flex items-center gap-1.5 rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              <HeartPulse size={13} strokeWidth={2.25} className="text-brand-gold" />
              Recuperación
            </button>
          </div>
        </div>
      )}

      {/* Sin sesión, Rex sigue en su esquina de siempre con una frase sobre por qué. */}
      {!session && (
        <ScreenRex
          id="plan-sin-sesion"
          screen="planificacion"
          tileContext={{ session: 'none' }}
          lead="Sin sesión hoy."
          text={nextMacroStart ? `Tu macro empieza el ${nextMacroStart}. Hasta entonces decides tú qué haces cada día.` : 'Decides tú qué haces cada día.'}
        />
      )}

      {/* Sin macro activo hoy (p. ej. empieza mañana) el programa de fuerza también se ve: aún no ha empezado o se ofrece solo. */}
      {!session && <CompanionRecover profile={profile} todayIso={todayIso} commit={commitCompanion} />}
      {!session && <CompanionCard profile={profile} history={history} todayIso={todayIso} commit={commitCompanion} light={null} />}

      {session && (
      <>
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {session.competition?.eventDay ? 'Día de competición' : session.isRestDay ? 'Día de descanso' : todayWeekdayLabel}
            </h1>
            {/* El «por qué» de la sesión vive en las casillas de esfuerzo y semáforo; este botón solo queda donde no hay casillas. */}
            {(session.coachReasons?.length ?? 0) > 0 && !(!session.isRestDay && !editMode && (plannedStrain || session.dayLight)) && (
              <button
                onClick={() => setShowReasons(true)}
                title="Por qué tu sesión es así hoy"
                aria-label="Por qué tu sesión es así hoy"
                className="mt-1 flex h-6 w-6 items-center justify-center rounded-full text-neutral-600 transition-colors duration-200 hover:bg-white/5 hover:text-neutral-300"
              >
                <Info size={15} strokeWidth={2.25} />
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
            {session.competition && (
              <>
                <span className="inline-flex items-center gap-1 font-semibold text-brand-gold">
                  <Trophy size={13} strokeWidth={2.5} />
                  {competitionHeadline(session.competition)}
                </span>
                {session.mesocycleWeek > 0 && !session.competition.eventDay && <span aria-hidden>·</span>}
              </>
            )}
            {session.mesocycleWeek > 0 && !session.competition?.eventDay && (
              <span>
                {MESOCYCLE_PHASE[session.mesocycleWeek as 1 | 2 | 3 | 4]}
                {session.phaseWeekInPhase && session.phaseLengthWeeks && session.phaseLengthWeeks > 1 &&
                  ` · sem. ${session.phaseWeekInPhase}/${session.phaseLengthWeeks}`}
              </span>
            )}
            {session.mesocycleWeek === 0 && !session.isRestDay && (
              <span>{session.strengthProgramLabel?.split(' · Semana ')[0] ?? session.swapLabel ?? 'Mantenimiento'}</span>
            )}
            {!session.isRestDay && session.dayEmphasis && (
              <>
                {session.mesocycleWeek > 0 && <span aria-hidden>·</span>}
                <span className={session.dayEmphasis === 'fuerza' ? 'text-brand-gold' : 'text-brand-orange'}>
                  {session.dayEmphasis === 'fuerza' ? 'Día de fuerza' : 'Foco metcon'}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Rex, en la esquina, cuenta el estado del día en una frase (semáforo, esfuerzo previsto, dureza, competición, molestias, perfil) y
            avisa de lo que el coach tiene para ti; sus botones (Empezar sesión, Por qué, ¿Cambiar algo?) salen en el globo y en su panel.
            Las casillas con todo el detalle quedan detrás de «Por qué». */}
        {showRexBar && !focusMode && !cardsMode && !listMode && !logAllMode && (
          <RexCorner
            speak
            screen="planificacion"
            tileContext={{
              session: session.isRestDay ? 'rest' : alreadyCompletedToday ? 'done' : todayWorkLog.length > 0 ? 'in-progress' : 'pending',
              tired: session.dayLight ? session.dayLight.color !== 'verde' : false,
              pain: activePainFlags.length > 0,
            }}
            dock={{ stats: dockStats({ low: strainTarget?.low ?? null, high: strainTarget?.high ?? null, real: null, planned: plannedStrain?.strain ?? null }) }}
            suggestion={rexPick.current}
            waiting={rexPick.waiting}
            typedAlready={wasTyped(rexMemory, rexPick.current.id, todayIso)}
            badges={{}}
            dots={[]}
            showDate={false}
            modules={false}
            ask={askRex}
            lab={rexLab}
            hints={REX_HINTS.planificacion}
            onAction={runPlanTarget}
            onDismiss={() => updateRexMemory((m) => dismissSuggestion(m, rexPick.current.id, todayIso))}
            onNext={() => setRexCursor((c) => c + 1)}
            onTyped={() => updateRexMemory((m) => withTyped(m, rexPick.current.id, todayIso))}
          />
        )}
        {showPlanDetail && !session.isRestDay && !editMode && !alreadyCompletedToday && (
          <DayStatusRow
            session={session}
            planned={plannedStrain}
            target={strainTarget}
            fit={planFitResult}
            painFlags={activePainFlags}
            onRemovePain={handleRemovePainFlag}
            hardness={
              alreadyCompletedToday
                ? null
                : { available: canHarder, reason: hardnessUnavailableReason(session), suggestion: hardnessSuggestion?.text, onOpen: () => setShowHardness(true), onReset: () => handleApplyHardness(0) }
            }
            canSwapWod={hasWodBlock}
            onSwapWod={handleRegenerate}
            onLighter={() => handlePickType('recovery')}
            onShowReasons={(session.coachReasons?.length ?? 0) > 0 ? () => setShowReasons(true) : null}
          />
        )}
        {showPlanDetail && !session.isRestDay && !editMode && !alreadyCompletedToday && session.profileEmphasis && (
          <ProfileEmphasisLine emphasis={session.profileEmphasis} onOpen={onNavigateToPerfil} />
        )}
      </div>
      {regenNote && <p className="text-xs text-neutral-500">{regenNote}</p>}

      {showHardness && (
        <HardnessSheet
          profile={profile}
          history={history}
          session={session}
          target={strainTarget}
          strainBias={strainBias}
          todayIso={todayIso}
          onApply={handleApplyHardness}
          onClose={() => setShowHardness(false)}
        />
      )}

      {/* El resumen de la sesión hecha vive en el Dashboard («Sesión completada» → Lo que hiciste); aquí solo queda la sesión y lo hecho bajo cada bloque. */}

      {session.competition?.eventDay ? (
        <div className="card flex flex-col gap-2 p-4">
          <p className="flex items-center gap-2 text-lg font-semibold text-white">
            <Trophy size={18} strokeWidth={2.25} className="text-brand-gold" />
            {competitionCountdown(session.competition)}
          </p>
          <p className="text-sm text-neutral-300">{session.competition.guidance}</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-neutral-400">
            {(session.coachReasons ?? []).slice(1).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : session.isRestDay ? (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-neutral-400">Hoy toca descansar. Aprovecha para movilidad ligera o recuperación activa.</p>
          <button
            onClick={() => openCustomEditor()}
            className="flex items-center gap-2 self-start rounded-lg border border-brand-border px-3 py-1.5 text-sm text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <NotebookPen size={15} strokeWidth={2.25} />
            ¿Tienes algo pensado? Añade tu sesión
          </button>
        </div>
      ) : (
        <DaySessionBlocks
          session={session}
          autoOpenMain={!alreadyCompletedToday}
          wodDone={wodDone}
          workDone={workDone}
          editable={editMode}
          onUpdateEntry={handleUpdateEntry}
          onAddEntry={handleAddEntry}
          onRemoveEntry={handleRemoveEntry}
          progress={movementProgress}
          // Sin check-in de RPE en edición ni con el panel de "completar" abierto — ahí el foco es
          // otro, no valorar series ya hechas.
          setFeedbackByIndex={editMode || showCompletePanel ? undefined : sessionCardFeedbackByIndex}
          onRateSet={editMode || showCompletePanel ? undefined : handleRateSet}
        />
      )}

      {/* Cerrar la sesión solo se hace en la última tarjeta del entreno, y a ella te lleva Rex («Cerrar sesión»): aquí no hay otro cierre. */}

      {session.strengthProgramLabel && !session.isRestDay && (
        hasWodBlock ? (
          session.wodTag && <p className="text-xs text-neutral-500">WOD añadido — {session.wodTag}.</p>
        ) : (
          <button
            onClick={openAddWodPicker}
            className="flex items-center gap-2 self-start rounded-lg border border-dashed border-brand-border px-3 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <Plus size={15} strokeWidth={2.25} className="text-brand-gold" />
            Añadir WOD (opcional)
          </button>
        )
      )}

      {/* El programa de fuerza que convive con el macro: «¿quieres hacerla hoy?» bajo la sesión del día. */}
      {!editMode && <CompanionRecover profile={profile} todayIso={todayIso} commit={commitCompanion} />}
      {!editMode && <CompanionCard
          profile={profile}
          history={history}
          todayIso={todayIso}
          commit={commitCompanion}
          light={session?.dayLight ? { color: session.dayLight.color, name: LIGHT_LABEL[session.dayLight.color].name, reason: session.dayLight.reasons?.[0] } : null}
        />}
      </>
      )}
        </div>
      </div>

      <Modal open={showCustomEditor} onClose={() => setShowCustomEditor(false)} title="Tu sesión de hoy">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-neutral-500">
            Si ya tienes tu propia sesión pensada para hoy, escríbela aquí y el coach la guarda tal cual, sin generar nada nuevo.
          </p>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Nombre (opcional)
            <input
              type="text"
              value={customTitleDraft}
              onChange={(e) => setCustomTitleDraft(e.target.value)}
              placeholder="Ej. Fran a mi manera"
              className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-white focus:border-brand-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Sesión
            <textarea
              value={customNoteDraft}
              onChange={(e) => setCustomNoteDraft(e.target.value)}
              rows={8}
              placeholder={'21-15-9\nThrusters\nPull-ups'}
              className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-white focus:border-brand-gold focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleSaveCustomSession}
              disabled={!customNoteDraft.trim()}
              className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              Guardar sesión
            </button>
            <button
              onClick={() => setShowCustomEditor(false)}
              className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showModeChoice} onClose={() => setShowModeChoice(false)} title="¿Cómo vas a entrenar?">
        <div className="flex flex-col gap-3" data-testid="train-mode-choice">
          <p className="text-xs text-neutral-500">Lo recuerdo para la próxima vez. Lo cambias cuando quieras en el menú de Rex.</p>
          {([
            { mode: 'list' as const, title: 'Entrenar', text: 'Una lista simple con el cronómetro siempre a mano. Apuntas al acabar, con todo lo previsto ya rellenado.' },
            { mode: 'cards' as const, title: 'Ir apuntando', text: 'Las tarjetas, serie a serie, con el descanso entre series.' },
          ]).map((o) => (
            <button
              key={o.mode}
              onClick={() => chooseTrainMode(o.mode)}
              data-testid={`train-mode-${o.mode}`}
              className={`rounded-xl border px-4 py-3 text-left transition-colors hover:bg-white/5 ${trainMode === o.mode ? 'border-brand-neon' : 'border-brand-border'}`}
            >
              <span className="block text-sm font-semibold text-white">{o.title}</span>
              <span className="mt-0.5 block text-xs text-neutral-400">{o.text}</span>
            </button>
          ))}
        </div>
      </Modal>

      <WhatDidModal
        open={showWhatDid}
        onClose={() => setShowWhatDid(false)}
        plannedLabel={session ? buildPreviewLine(session) : ''}
        onPlanned={() => {
          setShowWhatDid(false);
          openLogAll();
        }}
        onOther={openQuickLog}
      />

      <OtherThingModal
        open={showQuickLog}
        onClose={() => setShowQuickLog(false)}
        form={otherForm}
        onChange={(patch) => setOtherForm((prev) => ({ ...prev, ...patch }))}
        onSave={handleConfirmQuickLog}
        movePreview={otherMove ? otherMove.rows.map((r) => `${dayLabel(r.date, todayIso).replace(/^./, (c) => c.toUpperCase())}: ${r.before} → ${r.after}`) : null}
      />

      <RepeatWodModal
        open={showRepeat}
        onClose={() => setShowRepeat(false)}
        list={repeatableWods}
        onPick={(w) => {
          if (!session || alreadyCompletedToday) return;
          const previous = session;
          const next = applyRepeatedWod(session, w.blocks);
          athleteRepository.saveCachedSession(next);
          setSession(next);
          setShowRepeat(false);
          toast.show(`WOD cambiado a «${w.title}»`, {
            action: {
              label: 'Deshacer',
              run: () => {
                athleteRepository.saveCachedSession(previous);
                setSession(previous);
              },
            },
          });
        }}
      />

      <Modal open={showTypePicker} onClose={() => setShowTypePicker(false)} title="Elige tu sesión de hoy">
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-xs text-neutral-500">
            No tienes por qué seguir siempre lo mismo — elige qué te viene mejor hoy, sin desmontar tu programación.
          </p>
          {isMacroAvailable && (
            <button
              onClick={() => handlePickType('macro')}
              className="flex items-start gap-3 rounded-lg border-2 border-brand-gold bg-brand-gold/10 px-3 py-2.5 text-left"
            >
              <CalendarCheck2 size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
              <span>
                <span className="flex items-center gap-2">
                  <span className="block text-sm font-semibold text-white">Programación del coach</span>
                  <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[11px] font-semibold text-brand-bg">Recomendado</span>
                </span>
                <span className="block text-xs text-neutral-400">Vuelve a lo que toca hoy según tu macrociclo.</span>
              </span>
            </button>
          )}
          <button
            onClick={() => handlePickType('random')}
            className="flex items-start gap-3 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <Shuffle size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-neutral-400" />
            <span>
              <span className="block text-sm font-semibold text-white">Aleatoria</span>
              <span className="block text-xs text-neutral-500">WOD variado sorpresa — sin cargas basadas en tu PR.</span>
            </span>
          </button>
          <button
            onClick={() => {
              setShowTypePicker(false);
              openCustomEditor();
            }}
            className="flex items-start gap-3 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <NotebookPen size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-neutral-400" />
            <span>
              <span className="block text-sm font-semibold text-white">Propia</span>
              <span className="block text-xs text-neutral-500">Ya tienes tu sesión pensada — escríbela tal cual.</span>
            </span>
          </button>
          <button
            onClick={() => handlePickType('recovery')}
            className="flex items-start gap-3 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <HeartPulse size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-neutral-400" />
            <span>
              <span className="block text-sm font-semibold text-white">Recuperación</span>
              <span className="block text-xs text-neutral-500">Ritmo suave, sin buscar fatiga — para cuando no tienes el día para más.</span>
            </span>
          </button>
        </div>
      </Modal>

      <Modal open={showAddWodPicker} onClose={() => setShowAddWodPicker(false)} title="Añade un WOD a hoy">
        <div className="flex flex-col gap-2">
          {macroWodPreview && macroWodPreview.length > 0 && (
            <button
              onClick={() => handleAddWod('macro')}
              className="flex flex-col items-start gap-2 rounded-lg border-2 border-brand-gold bg-brand-gold/10 px-3 py-2.5 text-left"
            >
              <span className="flex items-center gap-2">
                <CalendarCheck2 size={16} strokeWidth={2.25} className="shrink-0 text-brand-gold" />
                <span className="text-sm font-semibold text-white">Lo que tocaría hoy</span>
                <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[11px] font-semibold text-brand-bg">De tu macrociclo</span>
              </span>
              <span className="w-full rounded-lg bg-black/25 px-2.5 py-2 text-xs text-neutral-300">
                {macroWodPreview[0].format ?? 'WOD del ciclo (en pausa)'}
              </span>
            </button>
          )}
          <button
            onClick={() => handleAddWod('random')}
            className="flex items-center gap-3 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <Shuffle size={16} strokeWidth={2.25} className="shrink-0 text-neutral-400" />
            <span className="text-sm font-semibold text-white">Aleatoria</span>
          </button>
          <button
            onClick={() => openCustomEditor('append')}
            className="flex items-center gap-3 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <NotebookPen size={16} strokeWidth={2.25} className="shrink-0 text-neutral-400" />
            <span className="text-sm font-semibold text-white">Propia</span>
          </button>
          <button
            onClick={() => handleAddWod('recovery')}
            className="flex items-center gap-3 rounded-lg border border-brand-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <HeartPulse size={16} strokeWidth={2.25} className="shrink-0 text-neutral-400" />
            <span className="text-sm font-semibold text-white">Recuperación</span>
          </button>
        </div>
      </Modal>

      <Modal open={showRex} onClose={() => setShowRex(false)} title="¿Algo ha pasado?">
        <RexSupport
          profile={profile}
          todayIso={todayIso}
          todayDone={alreadyCompletedToday}
          canSwapWod={hasWodBlock && !alreadyCompletedToday}
          canChangeType={!alreadyCompletedToday}
          canHarder={canHarder}
          canEdit={Boolean(session && !session.isRestDay)}
          moreOptions
          noticeCount={noticeSummary.count}
          canDelete={Boolean(session && !alreadyCompletedToday)}
          startNode={supportStart}
          onApply={handleRexApply}
          onAct={handleRexAct}
          onClose={() => {
            setShowRex(false);
            setSupportStart(undefined);
          }}
        />
      </Modal>

      <Modal open={showPainPicker} onClose={() => setShowPainPicker(false)} title="¿Algo te molesta hoy?">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-neutral-500">
            Mientras el aviso esté activo, el coach evita ese patrón de movimiento y sustituye lo que toque por una alternativa —
            avisándote cuando lo haga.
          </p>

          <div className="flex flex-col gap-2">
            {PAIN_AREAS.map((area) => (
              <button
                key={area}
                onClick={() => setPainAreaDraft(area)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors duration-200 ${
                  painAreaDraft === area
                    ? 'border-[1.5px] border-bad bg-bad/10 text-white'
                    : 'border border-brand-border bg-white/[0.03] text-neutral-300 hover:border-bad/50'
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-bad" />
                {PAIN_AREA_LABEL[area]}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">¿Durante cuánto?</p>
            <div className="flex gap-2">
              {PAIN_DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPainDurationDraft(opt.value)}
                  className={`flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold transition-colors duration-200 ${
                    painDurationDraft === opt.value ? 'bg-bad text-brand-bg' : 'border border-brand-border bg-white/[0.03] text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSavePainFlag}
            className="rounded-xl bg-bad px-4 py-2.5 text-sm font-semibold text-brand-bg transition-all duration-200 hover:brightness-110"
          >
            Guardar aviso
          </button>
        </div>
      </Modal>
    </div>
  );
}
