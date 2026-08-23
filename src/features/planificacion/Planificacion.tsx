import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pencil, Check, NotebookPen, Brain, Shuffle, HeartPulse, CalendarCheck2, Plus, Trash2, Bandage, Gauge, TrendingUp, Map } from 'lucide-react';
import type {
  AthleteProfile,
  DailySession,
  PainArea,
  PersonalRecords,
  ReadinessCheck,
  RxOrScaled,
  SessionBlockResult,
  SessionHistoryEntry,
  VariantPersonalRecords,
  WodResult,
} from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import {
  buildStrengthProgramWodAddition,
  generateDailySession,
  generateOverrideSession,
  generateSessionForDate,
  hasActiveTrainingStructure,
  resolveOlyPRKey,
  resolveStrengthPRKey,
  resolveVariantPRKey,
  toHistoryEntry,
  type SessionOverrideType,
} from '../../engine/generateSession';
import { getActiveMacrocycle, toLocalIsoDate } from '../../engine/periodization';
import { MESOCYCLE_PHASE, roundToNearestPlate } from '../../engine/oneRepMaxTables';
import { getTestDayBlock, getWodScoreType } from '../../engine/wodScoring';
import { getActivePainFlags, PAIN_AREA_LABEL, resolvePainFlagUntil, type PainDuration } from '../../engine/painFlags';
import { describeRampStatus, suggestReturnRamp } from '../../engine/intensityRamp';
import { getReadinessCheckForDate } from '../../engine/readiness';
import { buildWeeklyMacroReview, REVIEWED_MACRO_WEEKS_LIMIT } from '../../engine/macroReview';
import { estimateE1RM, parseCleanReps, qualifiesForE1RMEstimate } from '../../engine/e1rm';
import { GOAL_TYPE_META } from '../objetivos/goalMeta';
import { CoachHeader } from './CoachHeader';
import { WeekStrip } from './WeekStrip';
import { DaySessionBlocks } from './DaySessionBlocks';
import { ReadinessCheckIn } from './ReadinessCheckIn';
import { Modal } from '../shell/Modal';

const RPE_SCALE = Array.from({ length: 10 }, (_, i) => i + 1);
const DURATION_PRESETS = [30, 45, 60, 75, 90];
const numberInputClass = 'w-16 rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm text-white';

const PAIN_AREAS: PainArea[] = ['hombro', 'cadera-lumbar', 'rodilla', 'codo-muneca'];
const PAIN_DURATION_OPTIONS: { value: PainDuration; label: string }[] = [
  { value: 'dias', label: 'Unos días' },
  { value: 'semanas', label: '1-2 semanas' },
  { value: 'indefinido', label: 'Hasta quitarlo' },
];

function formatPainUntil(until: string | null): string {
  if (!until) return 'hasta que lo quites';
  return `hasta el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${until}T00:00:00`))}`;
}

/** A que PR se escribiria la estimacion — raiz (prs) o de variante (variantPrs), segun de cual se calculo la carga de hoy. */
type E1rmTarget = { kind: 'root'; key: keyof PersonalRecords } | { kind: 'variant'; key: keyof VariantPersonalRecords };

interface E1rmSuggestion {
  target: E1rmTarget;
  movementName: string;
  estimatedKg: number;
  currentKg: number;
}

export function Planificacion() {
  const [profile, setProfile] = useState<AthleteProfile>(() => athleteRepository.getProfile());
  const [history, setHistory] = useState<SessionHistoryEntry[]>(() => athleteRepository.getHistory());
  const goals = profile.goals;
  const todayIso = toLocalIsoDate(new Date());
  const [session, setSession] = useState<DailySession | null>(() => {
    const cached = athleteRepository.getCachedSession(todayIso);
    if (cached) return cached;
    // Sin macrociclo NI programa de fuerza activo, y nada elegido todavía para hoy: no se
    // auto-genera ni se muestra "Mantenimiento" — se espera a que el atleta elija qué quiere hacer.
    if (!hasActiveTrainingStructure(profile, todayIso)) return null;
    const fresh = generateSessionForDate(profile, history, new Date(), goals);
    athleteRepository.saveCachedSession(fresh);
    return fresh;
  });

  const [showCompletePanel, setShowCompletePanel] = useState(false);
  const [rxOrScaled, setRxOrScaled] = useState<RxOrScaled>('rx');
  const [rpe, setRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(60);
  const [spinning, setSpinning] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [wodMinutes, setWodMinutes] = useState(0);
  const [wodSeconds, setWodSeconds] = useState(0);
  const [wodRounds, setWodRounds] = useState(0);
  const [wodExtraReps, setWodExtraReps] = useState(0);
  const [wodReps, setWodReps] = useState(0);
  const [wodLoad, setWodLoad] = useState(0);
  const [testedLoadKg, setTestedLoadKg] = useState(0);
  const [prUpdateMessage, setPrUpdateMessage] = useState<string | null>(null);
  const [e1rmSuggestions, setE1rmSuggestions] = useState<E1rmSuggestion[]>([]);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customEditorMode, setCustomEditorMode] = useState<'replace' | 'append'>('replace');
  const [customTitleDraft, setCustomTitleDraft] = useState('');
  const [customNoteDraft, setCustomNoteDraft] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showAddWodPicker, setShowAddWodPicker] = useState(false);
  const [macroWodPreview, setMacroWodPreview] = useState<SessionBlockResult[] | null>(null);
  const [showPainPicker, setShowPainPicker] = useState(false);
  const [painAreaDraft, setPainAreaDraft] = useState<PainArea>('hombro');
  const [painDurationDraft, setPainDurationDraft] = useState<PainDuration>('semanas');

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

  const isMacroAvailable = Boolean(getActiveMacrocycle(profile.macrocycles, todayIso));
  const nextMacroStart = useMemo(() => {
    const upcoming = profile.macrocycles.filter((m) => m.startDate > todayIso).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (!upcoming) return null;
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(upcoming.startDate));
  }, [profile.macrocycles, todayIso]);
  const alreadyCompletedToday = useMemo(() => (session ? history.some((h) => h.date === session.date) : false), [history, session]);
  const [readinessLog, setReadinessLog] = useState<ReadinessCheck[]>(() => athleteRepository.getReadinessLog());
  const [readinessDismissed, setReadinessDismissed] = useState(false);
  const todayReadiness = useMemo(() => getReadinessCheckForDate(readinessLog, todayIso), [readinessLog, todayIso]);
  const showReadinessCheck = Boolean(session && !session.isRestDay && !alreadyCompletedToday && !todayReadiness && !readinessDismissed);
  const hasWodBlock = useMemo(() => Boolean(session?.blocks.some((b) => b.block === 'wod')), [session]);
  const wodScoreType = useMemo(() => (session ? getWodScoreType(session) : null), [session]);
  const testDayBlock = useMemo(() => (session ? getTestDayBlock(session) : undefined), [session]);
  const testDayMovement = testDayBlock ? getMovementById(testDayBlock.movementId) : undefined;
  const resolveTestDayPRKey = testDayBlock?.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey;

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
    const cached = athleteRepository.getCachedSession(todayIso);
    setSession(cached ?? (hasActiveTrainingStructure(profile, todayIso) ? generateAndCache(profile) : null));
    setShowCompletePanel(false);
    setEditMode(false);
    setPrUpdateMessage(null);
    setE1rmSuggestions([]);
    setReadinessDismissed(false);
    setReturnRampDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIso]);

  function handleUpdateEntry(index: number, patch: Partial<SessionBlockResult>) {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, blocks: prev.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) };
      athleteRepository.saveCachedSession(next);
      return next;
    });
  }

  function handleSaveProfile(newProfile: AthleteProfile) {
    athleteRepository.saveProfile(newProfile);
    setProfile(newProfile);
    // Solo se recalcula la sesion de hoy (p.ej. tras cambiar un PR) si ya habia una elegida —
    // guardar el perfil no debe materializar una sesion cuando se esta esperando a que el
    // atleta elija que hacer hoy (sin macrociclo activo).
    if (session) setSession(generateAndCache(newProfile));
  }

  function handleActivateReturnRamp() {
    if (!returnRampSuggestion) return;
    handleSaveProfile({ ...profile, intensityRamp: returnRampSuggestion.ramp });
    setReturnRampDismissed(true);
  }

  /** Marca la semana de revision como ya mostrada (confirmada o descartada) para que no vuelva a salir hasta la semana siguiente del macrociclo. */
  function markMacroWeekReviewed(reviewKey: string, extra: Partial<AthleteProfile> = {}) {
    const reviewedMacroWeeks = [...(profile.reviewedMacroWeeks ?? []), reviewKey].slice(-REVIEWED_MACRO_WEEKS_LIMIT);
    handleSaveProfile({ ...profile, ...extra, reviewedMacroWeeks });
  }

  function handleConfirmMacroReview() {
    if (!macroReviewSuggestion) return;
    if (macroReviewSuggestion.kind === 'extend-phase') {
      const macrocycles = profile.macrocycles.map((m) => {
        if (m.id !== activeMacro?.id || !m.phaseWeeks) return m;
        const phaseWeeks = [...m.phaseWeeks] as [number, number, number, number];
        phaseWeeks[macroReviewSuggestion.phaseIndex - 1] += 1;
        return { ...m, phaseWeeks };
      });
      markMacroWeekReviewed(macroReviewSuggestion.reviewKey, { macrocycles });
    } else {
      const goals = profile.goals.map((g) => (g.id === macroReviewSuggestion.goalId ? { ...g, emphasis: 'intensivo' as const } : g));
      markMacroWeekReviewed(macroReviewSuggestion.reviewKey, { goals });
    }
  }

  function handleDismissMacroReview() {
    if (!macroReviewSuggestion) return;
    markMacroWeekReviewed(macroReviewSuggestion.reviewKey);
  }

  function handleSaveReadinessCheck(check: ReadinessCheck) {
    athleteRepository.saveReadinessCheck(check);
    setReadinessLog(athleteRepository.getReadinessLog());
    // Recalcula la sesion de hoy con el nuevo factor de energia — mismo compromiso que ya acepta
    // handleSaveProfile al cambiar un PR o un aviso de dolor: el motor tiene aleatoriedad interna,
    // asi que confirmar el check-in puede volver a barajar el WOD de hoy, no solo el peso.
    setSession(generateAndCache(profile));
  }

  function handleRegenerate() {
    setSession(generateAndCache(profile));
    setSpinning(true);
    setTimeout(() => setSpinning(false), 500);
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
      const next: DailySession = { ...session, blocks: [...session.blocks, wodEntry] };
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
    // Se genera una unica vez aqui y se reutiliza tal cual al confirmar — el motor usa
    // aleatoriedad interna, asi que volver a generar en el momento de confirmar podria dar un WOD
    // distinto al que se vio en la vista previa.
    setMacroWodPreview(macro ? generateDailySession(profile, history, macro, new Date(), goals).blocks.filter((b) => b.block === 'wod') : null);
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
    };
    athleteRepository.saveCachedSession(next);
    setSession(next);
    setShowAddWodPicker(false);
  }

  function buildWodResult(): WodResult | undefined {
    if (!wodScoreType) return undefined;
    if (wodScoreType === 'time') return { scoreType: 'time', value: `${wodMinutes}:${String(wodSeconds).padStart(2, '0')}` };
    if (wodScoreType === 'rounds+reps') {
      return { scoreType: 'rounds+reps', value: wodExtraReps > 0 ? `${wodRounds}+${wodExtraReps}` : `${wodRounds}` };
    }
    if (wodScoreType === 'reps') return { scoreType: 'reps', value: `${wodReps} reps` };
    return { scoreType: 'load', value: `${wodLoad} kg` };
  }

  /**
   * Busca series principales de fuerza/oly que hoy podrian actualizar un PR sin haber sido un
   * dia de test formal — ver src/engine/e1rm.ts. Solo se llama cuando ya se sabe que la sesion
   * califica (Rx + RPE alto), nunca en un dia de test real (ese ya tiene su propio flujo exacto).
   */
  function findE1rmSuggestions(): E1rmSuggestion[] {
    if (!session || testDayBlock) return [];
    if (!qualifiesForE1RMEstimate(rxOrScaled, rpe)) return [];

    const suggestions: E1rmSuggestion[] = [];
    for (const block of session.blocks) {
      if (block.block !== 'strength' && block.block !== 'oly') continue;
      if (!block.loadKg || !block.reps) continue;
      const reps = parseCleanReps(block.reps);
      if (reps === null) continue;
      const movement = getMovementById(block.movementId);
      if (!movement) continue;

      // La carga de hoy pudo calcularse sobre un PR de variante (p.ej. sumo deadlift), no sobre el
      // lift raiz — comparar y escribir contra el raiz corromperia un PR que no tiene nada que ver
      // con lo que de verdad se entreno hoy.
      const variantKey = resolveVariantPRKey(movement);
      const rootKey = (block.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey)(movement);
      const target: E1rmTarget | null =
        variantKey && profile.variantPrs?.[variantKey] ? { kind: 'variant', key: variantKey } : rootKey ? { kind: 'root', key: rootKey } : null;
      if (!target) continue;

      const currentKg = target.kind === 'variant' ? (profile.variantPrs?.[target.key] ?? 0) : profile.prs[target.key];
      const estimatedKg = roundToNearestPlate(estimateE1RM(block.loadKg, reps));
      if (estimatedKg > currentKg) {
        suggestions.push({ target, movementName: movement.name, estimatedKg, currentKg });
      }
    }
    return suggestions;
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

    athleteRepository.appendHistoryEntry(
      toHistoryEntry(
        session,
        rxOrScaled,
        rpe,
        durationMin,
        buildWodResult(),
        testDayBlock && testedLoadKg > 0 ? testedLoadKg : undefined,
      ),
    );
    setHistory(athleteRepository.getHistory());
    // appendHistoryEntry tambien actualiza trainingDatesLog en el perfil persistido — sin esto,
    // returnRampSuggestion (que lee profile.trainingDatesLog del estado) no veria la sesion de hoy
    // hasta el proximo guardado de perfil o recarga.
    setProfile(athleteRepository.getProfile());
    setShowCompletePanel(false);
    setPrUpdateMessage(nextMessage);
    setE1rmSuggestions(findE1rmSuggestions());
  }

  function handleConfirmE1rmSuggestion(suggestion: E1rmSuggestion) {
    const nextProfile =
      suggestion.target.kind === 'variant'
        ? { ...profile, variantPrs: { ...profile.variantPrs, [suggestion.target.key]: suggestion.estimatedKg } }
        : { ...profile, prs: { ...profile.prs, [suggestion.target.key]: suggestion.estimatedKg } };
    athleteRepository.saveProfile(nextProfile);
    setProfile(nextProfile);

    // El PR ya se actualiza arriba, pero sin esto el punto debil y el progreso de objetivo (que
    // leen testLoadKg del historial, no profile.prs) seguirian ciegos a esta subida real.
    if (session) {
      athleteRepository.updateHistoryTestLoad(session.date, suggestion.estimatedKg);
      setHistory(athleteRepository.getHistory());
    }

    setE1rmSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  function handleDismissE1rmSuggestion(suggestion: E1rmSuggestion) {
    setE1rmSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  function handleUndoComplete() {
    if (!session) return;
    if (!window.confirm('¿Deshacer el registro de hoy? Esto no se puede deshacer.')) return;
    athleteRepository.deleteHistoryEntry(session.date);
    setHistory(athleteRepository.getHistory());
    setPrUpdateMessage(null);
    setE1rmSuggestions([]);
  }

  function handleDeleteTodaySession() {
    if (!session) return;
    if (!window.confirm('¿Borrar la sesión de hoy? Volverás a elegir qué hacer.')) return;
    athleteRepository.deleteCachedSession(session.date);
    setSession(hasActiveTrainingStructure(profile, session.date) ? generateAndCache(profile) : null);
    setEditMode(false);
    setShowCompletePanel(false);
    setPrUpdateMessage(null);
    setE1rmSuggestions([]);
  }

  function handleSavePainFlag() {
    const flag = {
      id: crypto.randomUUID(),
      area: painAreaDraft,
      createdDate: todayIso,
      until: resolvePainFlagUntil(todayIso, painDurationDraft),
    };
    const nextProfile = { ...profile, painFlags: [...(profile.painFlags ?? []), flag] };
    handleSaveProfile(nextProfile);
    setShowPainPicker(false);
  }

  function handleRemovePainFlag(id: string) {
    const nextProfile = { ...profile, painFlags: (profile.painFlags ?? []).filter((f) => f.id !== id) };
    handleSaveProfile(nextProfile);
  }

  return (
    <div className="flex flex-col gap-4">
      <CoachHeader profile={profile} onSaveProfile={handleSaveProfile} />

      {goals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {goals.map((g) => {
            const meta = GOAL_TYPE_META[g.type];
            const Icon = meta.Icon;
            const movement = g.movementId ? getMovementById(g.movementId) : undefined;
            return (
              <div
                key={g.id}
                className="flex items-center gap-2 rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-1.5 text-sm text-brand-gold"
              >
                <Icon size={16} strokeWidth={2.25} />
                <span>
                  {meta.label}
                  {movement && ` — ${movement.name}`} ({g.emphasis})
                </span>
              </div>
            );
          })}
        </div>
      )}

      <WeekStrip
        profile={profile}
        history={history}
        goals={goals}
        onDeleteHistoryEntry={(date) => {
          athleteRepository.deleteHistoryEntry(date);
          setHistory(athleteRepository.getHistory());
        }}
      />

      {activePainFlags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {activePainFlags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              <span className="flex-1 text-red-300">
                Evitando {PAIN_AREA_LABEL[flag.area].toLowerCase()} — {formatPainUntil(flag.until)}
              </span>
              <button
                onClick={() => handleRemovePainFlag(flag.id)}
                className="text-xs text-neutral-400 underline decoration-dotted transition-colors duration-200 hover:text-red-300"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      {rampStatus && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-neon/25 bg-brand-neon/10 px-3 py-2 text-sm text-brand-neon">
          <Gauge size={15} strokeWidth={2.25} className="shrink-0" />
          <span className="flex-1">{rampStatus}</span>
        </div>
      )}

      {showReturnRampSuggestion && returnRampSuggestion && (
        <div className="flex items-start gap-2.5 rounded-xl border border-brand-gold/30 bg-brand-gold/10 px-3 py-2.5 text-sm">
          <Gauge size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
          <div className="flex-1">
            <p className="text-neutral-200">
              Llevas <span className="font-semibold text-brand-gold">{returnRampSuggestion.gapDays} días</span> sin entrenar — ¿activamos
              una rampa de vuelta para no arrancar al 100%?
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Fuerza/oly {returnRampSuggestion.ramp.strengthWeeks} semanas, WOD {returnRampSuggestion.ramp.wodWeeks} — la carga sube
              gradual hasta el 100% en vez de empezar de golpe donde lo dejaste.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleActivateReturnRamp}
                className="rounded-md bg-brand-gold px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 hover:bg-brand-gold-soft"
              >
                Activar rampa
              </button>
              <button
                onClick={() => setReturnRampDismissed(true)}
                className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
              >
                No, gracias
              </button>
            </div>
          </div>
        </div>
      )}

      {macroReviewSuggestion && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
            macroReviewSuggestion.kind === 'extend-phase'
              ? 'border-brand-orange/30 bg-brand-orange/10'
              : 'border-brand-gold/30 bg-brand-gold/10'
          }`}
        >
          <Map
            size={16}
            strokeWidth={2.25}
            className={`mt-0.5 shrink-0 ${macroReviewSuggestion.kind === 'extend-phase' ? 'text-brand-orange' : 'text-brand-gold'}`}
          />
          <div className="flex-1">
            <p className="text-neutral-200">{macroReviewSuggestion.headline}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{macroReviewSuggestion.detail}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleConfirmMacroReview}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 ${
                  macroReviewSuggestion.kind === 'extend-phase' ? 'bg-brand-orange hover:bg-brand-orange-dark' : 'bg-brand-gold hover:bg-brand-gold-soft'
                }`}
              >
                {macroReviewSuggestion.kind === 'extend-phase' ? 'Alargar fase' : 'Subir a intensivo'}
              </button>
              <button
                onClick={handleDismissMacroReview}
                className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}

      {!session && (
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-surface">
            <span className="absolute inset-0 animate-pulse rounded-2xl bg-brand-neon/20 blur-lg" />
            <Brain size={26} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]" />
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

      {session && (
      <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {session.mesocycleWeek > 0 && (
            <p className="text-sm text-neutral-400">
              Fase: {MESOCYCLE_PHASE[session.mesocycleWeek as 1 | 2 | 3 | 4]}
              {session.phaseWeekInPhase && session.phaseLengthWeeks && session.phaseLengthWeeks > 1 &&
                ` · semana ${session.phaseWeekInPhase} de ${session.phaseLengthWeeks}`}
            </p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-white">{session.isRestDay ? 'Día de descanso' : 'Sesión de hoy'}</p>
            {!session.isRestDay && session.mesocycleWeek === 0 && (
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  session.strengthProgramLabel ? 'bg-brand-gold/15 text-brand-gold' : 'bg-white/10 text-neutral-300'
                }`}
              >
                {session.strengthProgramLabel ?? session.swapLabel ?? 'Mantenimiento'}
              </span>
            )}
            {!session.isRestDay && (
              <button
                onClick={() => setShowTypePicker(true)}
                title="Elegir tipo de sesión"
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-surfaceMuted transition-transform duration-200 hover:scale-110"
              >
                <span className="absolute inset-0 animate-pulse rounded-full bg-brand-neon/20 blur-md" />
                <Brain size={14} strokeWidth={2.25} className="relative text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.65)]" />
              </button>
            )}
          </div>
        </div>
        {!session.isRestDay && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode((prev) => !prev)}
              title={editMode ? 'Terminar edición' : 'Editar sesión'}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                editMode ? 'bg-brand-gold text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-brand-gold'
              }`}
            >
              {editMode ? <Check size={17} /> : <Pencil size={16} />}
            </button>
            <button
              onClick={handleRegenerate}
              title="Regenerar sesión"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition-all duration-200 hover:bg-white/10 hover:text-brand-gold"
            >
              <RefreshCw size={17} className={spinning ? 'animate-spin' : ''} />
            </button>
            {!alreadyCompletedToday && (
              <button
                onClick={handleDeleteTodaySession}
                title="Borrar sesión de hoy"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition-all duration-200 hover:bg-red-500/15 hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={() => setShowPainPicker(true)}
              title="¿Algo te molesta hoy?"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                activePainFlags.length > 0
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-white/5 text-neutral-300 hover:bg-red-500/15 hover:text-red-400'
              }`}
            >
              <Bandage size={16} />
            </button>
            <button
              onClick={() => {
                setTestedLoadKg(testDayBlock?.loadKg ?? 0);
                setPrUpdateMessage(null);
                setShowCompletePanel(true);
              }}
              disabled={alreadyCompletedToday}
              className="rounded-lg bg-brand-orange px-3 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {alreadyCompletedToday ? 'Completado ✓' : 'Marcar como completado'}
            </button>
            {alreadyCompletedToday && (
              <button
                onClick={handleUndoComplete}
                title="Deshacer el registro de hoy"
                className="text-xs text-neutral-500 underline decoration-dotted transition-colors duration-200 hover:text-red-400"
              >
                Deshacer
              </button>
            )}
          </div>
        )}
      </div>

      {prUpdateMessage && (
        <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-2 text-sm text-brand-gold">{prUpdateMessage}</div>
      )}

      {e1rmSuggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          {e1rmSuggestions.map((s) => (
            <div
              key={`${s.target.kind}-${s.target.key}`}
              className="flex items-start gap-2.5 rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-2.5 text-sm"
            >
              <TrendingUp size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
              <div className="flex-1">
                <p className="text-neutral-200">
                  Estimación de nuevo máximo en <span className="font-semibold text-brand-gold">{s.movementName}</span>: ~
                  {s.estimatedKg} kg (tu PR actual es {s.currentKg} kg)
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  A partir de tu serie de hoy — es una estimación, no un test. Puedes confirmarla o esperar a probarla de verdad.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleConfirmE1rmSuggestion(s)}
                    className="rounded-md bg-brand-gold px-2.5 py-1 text-xs font-semibold text-black transition-colors duration-200 hover:bg-brand-gold-soft"
                  >
                    Actualizar PR a {s.estimatedKg} kg
                  </button>
                  <button
                    onClick={() => handleDismissE1rmSuggestion(s)}
                    className="rounded-md border border-brand-border px-2.5 py-1 text-xs text-neutral-400 transition-colors duration-200 hover:bg-white/5"
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCompletePanel && !alreadyCompletedToday && (
        <div className="flex flex-col gap-4 card border-brand-gold/30 p-4">
          {wodScoreType && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-300">Resultado del WOD</p>
              {wodScoreType === 'time' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={wodMinutes}
                    onChange={(e) => setWodMinutes(Number(e.target.value))}
                    className={numberInputClass}
                  />
                  <span className="text-neutral-500">min</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={wodSeconds}
                    onChange={(e) => setWodSeconds(Number(e.target.value))}
                    className={numberInputClass}
                  />
                  <span className="text-neutral-500">seg</span>
                </div>
              )}
              {wodScoreType === 'rounds+reps' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={wodRounds}
                    onChange={(e) => setWodRounds(Number(e.target.value))}
                    className={numberInputClass}
                  />
                  <span className="text-neutral-500">rondas +</span>
                  <input
                    type="number"
                    min={0}
                    value={wodExtraReps}
                    onChange={(e) => setWodExtraReps(Number(e.target.value))}
                    className={numberInputClass}
                  />
                  <span className="text-neutral-500">reps</span>
                </div>
              )}
              {wodScoreType === 'reps' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={wodReps}
                    onChange={(e) => setWodReps(Number(e.target.value))}
                    className={numberInputClass}
                  />
                  <span className="text-neutral-500">reps totales</span>
                </div>
              )}
              {wodScoreType === 'load' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={2.5}
                    value={wodLoad}
                    onChange={(e) => setWodLoad(Number(e.target.value))}
                    className={numberInputClass}
                  />
                  <span className="text-neutral-500">kg</span>
                </div>
              )}
            </div>
          )}

          {testDayBlock && testDayMovement && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-300">
                Test 1RM — {testDayMovement.name}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={2.5}
                  value={testedLoadKg}
                  onChange={(e) => setTestedLoadKg(Number(e.target.value))}
                  className={numberInputClass}
                />
                <span className="text-neutral-500">kg levantados</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Si supera tu marca actual, se actualiza tu PR y las próximas sesiones se calculan sobre el nuevo número.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-300">¿Rx o escalado?</p>
            <div className="flex gap-2">
              {(['rx', 'scaled'] as RxOrScaled[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setRxOrScaled(option)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-all duration-200 ${
                    rxOrScaled === option ? 'bg-brand-gold text-black' : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                  }`}
                >
                  {option === 'rx' ? 'Rx' : 'Escalado'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-300">RPE (esfuerzo percibido)</p>
            <div className="flex flex-wrap gap-1.5">
              {RPE_SCALE.map((value) => (
                <button
                  key={value}
                  onClick={() => setRpe(value)}
                  className={`h-8 w-8 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    rpe === value ? 'bg-brand-orange text-black' : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-300">Duración de la sesión</p>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((value) => (
                <button
                  key={value}
                  onClick={() => setDurationMin(value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                    durationMin === value ? 'bg-brand-gold text-black' : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                  }`}
                >
                  {value} min
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConfirmComplete}
              className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark hover:shadow-lg hover:shadow-brand-orange/30"
            >
              Confirmar
            </button>
            <button
              onClick={() => setShowCompletePanel(false)}
              className="rounded-lg border border-brand-border px-4 py-2 text-sm text-neutral-300 transition-colors duration-200 hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {session.deloadNote && (
        <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/10 px-3 py-2 text-sm text-brand-orange">
          {session.deloadNote}
        </div>
      )}

      {session.isRestDay ? (
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
        <DaySessionBlocks session={session} editable={editMode} onUpdateEntry={handleUpdateEntry} />
      )}

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
      </>
      )}

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
                  <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-semibold text-brand-bg">Recomendado</span>
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
                <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-semibold text-brand-bg">De tu macrociclo</span>
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
                    ? 'border-[1.5px] border-red-400 bg-red-400/10 text-white'
                    : 'border border-brand-border bg-white/[0.03] text-neutral-300 hover:border-red-400/50'
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
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
                    painDurationDraft === opt.value ? 'bg-red-400 text-red-950' : 'border border-brand-border bg-white/[0.03] text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSavePainFlag}
            className="rounded-xl bg-red-400 px-4 py-2.5 text-sm font-semibold text-red-950 transition-all duration-200 hover:bg-red-300"
          >
            Guardar aviso
          </button>
        </div>
      </Modal>

      <Modal open={showReadinessCheck} onClose={() => setReadinessDismissed(true)} title="¿Cómo llegas hoy?">
        <ReadinessCheckIn dateIso={todayIso} onConfirm={handleSaveReadinessCheck} onSkip={() => setReadinessDismissed(true)} />
      </Modal>
    </div>
  );
}
