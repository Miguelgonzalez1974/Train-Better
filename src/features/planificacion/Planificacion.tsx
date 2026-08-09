import { useMemo, useState } from 'react';
import { RefreshCw, Pencil, Check, NotebookPen, Brain, Shuffle, HeartPulse, CalendarCheck2 } from 'lucide-react';
import type { AthleteProfile, DailySession, RxOrScaled, SessionBlockResult, SessionHistoryEntry, WodResult } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import {
  generateOverrideSession,
  generateSessionForDate,
  resolveOlyPRKey,
  resolveStrengthPRKey,
  toHistoryEntry,
  type SessionOverrideType,
} from '../../engine/generateSession';
import { toLocalIsoDate } from '../../engine/periodization';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { getTestDayBlock, getWodScoreType } from '../../engine/wodScoring';
import { GOAL_TYPE_META } from '../objetivos/goalMeta';
import { CoachHeader } from './CoachHeader';
import { WeekStrip } from './WeekStrip';
import { DaySessionBlocks } from './DaySessionBlocks';
import { Modal } from '../shell/Modal';

const RPE_SCALE = Array.from({ length: 10 }, (_, i) => i + 1);
const DURATION_PRESETS = [30, 45, 60, 75, 90];
const numberInputClass = 'w-16 rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm text-white';

export function Planificacion() {
  const [profile, setProfile] = useState<AthleteProfile>(() => athleteRepository.getProfile());
  const [history, setHistory] = useState<SessionHistoryEntry[]>(() => athleteRepository.getHistory());
  const [goal] = useState(() => athleteRepository.getGoal());
  const todayIso = toLocalIsoDate(new Date());
  const [session, setSession] = useState<DailySession>(() => {
    const cached = athleteRepository.getCachedSession(todayIso);
    if (cached) return cached;
    const fresh = generateSessionForDate(profile, history, new Date(), goal);
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
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customTitleDraft, setCustomTitleDraft] = useState('');
  const [customNoteDraft, setCustomNoteDraft] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const isMacroAvailable = todayIso >= profile.mesocycleStartDate;
  const alreadyCompletedToday = useMemo(() => history.some((h) => h.date === session.date), [history, session.date]);
  const goalMovement = goal?.movementId ? getMovementById(goal.movementId) : undefined;
  const wodScoreType = useMemo(() => getWodScoreType(session), [session]);
  const testDayBlock = useMemo(() => getTestDayBlock(session), [session]);
  const testDayMovement = testDayBlock ? getMovementById(testDayBlock.movementId) : undefined;
  const resolveTestDayPRKey = testDayBlock?.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey;

  function generateAndCache(nextProfile: AthleteProfile): DailySession {
    const next = generateSessionForDate(nextProfile, history, new Date(), goal);
    athleteRepository.saveCachedSession(next);
    return next;
  }

  function handleUpdateEntry(index: number, patch: Partial<SessionBlockResult>) {
    setSession((prev) => {
      const next = { ...prev, blocks: prev.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) };
      athleteRepository.saveCachedSession(next);
      return next;
    });
  }

  function handleSaveProfile(newProfile: AthleteProfile) {
    athleteRepository.saveProfile(newProfile);
    setProfile(newProfile);
    setSession(generateAndCache(newProfile));
  }

  function handleRegenerate() {
    setSession(generateAndCache(profile));
    setSpinning(true);
    setTimeout(() => setSpinning(false), 500);
  }

  function openCustomEditor() {
    setCustomTitleDraft(session.source === 'custom' ? (session.customTitle ?? '') : '');
    setCustomNoteDraft(session.source === 'custom' ? (session.customNote ?? '') : '');
    setShowCustomEditor(true);
  }

  function handleSaveCustomSession() {
    const note = customNoteDraft.trim();
    if (!note) return;
    const next: DailySession = {
      date: session.date,
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
    const next = type === 'macro' ? generateSessionForDate(profile, history, new Date(), goal) : generateOverrideSession(profile, history, new Date(), type);
    athleteRepository.saveCachedSession(next);
    setSession(next);
    setShowTypePicker(false);
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

  function handleConfirmComplete() {
    let nextMessage: string | null = null;

    if (testDayBlock && testDayMovement && testedLoadKg > 0) {
      const prKey = resolveTestDayPRKey(testDayMovement);
      if (prKey && testedLoadKg > profile.prs[prKey]) {
        const nextProfile = { ...profile, prs: { ...profile.prs, [prKey]: testedLoadKg } };
        athleteRepository.saveProfile(nextProfile);
        setProfile(nextProfile);
        nextMessage = `Nuevo PR registrado: ${testDayMovement.name} a ${testedLoadKg} kg. A partir de hoy tus sesiones se calculan sobre esta marca.`;
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
    setShowCompletePanel(false);
    setPrUpdateMessage(nextMessage);
  }

  return (
    <div className="flex flex-col gap-4">
      <CoachHeader profile={profile} onSaveProfile={handleSaveProfile} />

      {goal && (
        <div className="flex items-center gap-2.5 rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-2 text-sm text-brand-gold">
          {(() => {
            const Icon = GOAL_TYPE_META[goal.type].Icon;
            return <Icon size={16} strokeWidth={2.25} />;
          })()}
          <span>
            Objetivo activo: {GOAL_TYPE_META[goal.type].label}
            {goalMovement && ` — ${goalMovement.name}`} ({goal.emphasis})
          </span>
        </div>
      )}

      <WeekStrip profile={profile} history={history} goal={goal} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {session.mesocycleWeek > 0 && (
            <p className="text-sm text-neutral-400">
              Semana {session.mesocycleWeek}/4 · Fase: {MESOCYCLE_PHASE[session.mesocycleWeek as 1 | 2 | 3 | 4]}
            </p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-white">{session.isRestDay ? 'Día de descanso' : 'Sesión de hoy'}</p>
            {!session.isRestDay && session.mesocycleWeek === 0 && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                {session.swapLabel ?? 'Mantenimiento'}
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
          </div>
        )}
      </div>

      {prUpdateMessage && (
        <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-2 text-sm text-brand-gold">{prUpdateMessage}</div>
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
            onClick={openCustomEditor}
            className="flex items-center gap-2 self-start rounded-lg border border-brand-border px-3 py-1.5 text-sm text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            <NotebookPen size={15} strokeWidth={2.25} />
            ¿Tienes algo pensado? Añade tu sesión
          </button>
        </div>
      ) : (
        <DaySessionBlocks session={session} editable={editMode} onUpdateEntry={handleUpdateEntry} />
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
          <button
            onClick={() => handlePickType('random')}
            className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-surfaceMuted/60 px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <Shuffle size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
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
            className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-surfaceMuted/60 px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <NotebookPen size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
            <span>
              <span className="block text-sm font-semibold text-white">Propia</span>
              <span className="block text-xs text-neutral-500">Ya tienes tu sesión pensada — escríbela tal cual.</span>
            </span>
          </button>
          <button
            onClick={() => handlePickType('recovery')}
            className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-surfaceMuted/60 px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
          >
            <HeartPulse size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
            <span>
              <span className="block text-sm font-semibold text-white">Recuperación</span>
              <span className="block text-xs text-neutral-500">Ritmo suave, sin buscar fatiga — para cuando no tienes el día para más.</span>
            </span>
          </button>
          {isMacroAvailable && (
            <button
              onClick={() => handlePickType('macro')}
              className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-surfaceMuted/60 px-3 py-2.5 text-left transition-colors duration-200 hover:border-brand-gold"
            >
              <CalendarCheck2 size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
              <span>
                <span className="block text-sm font-semibold text-white">Programación del coach</span>
                <span className="block text-xs text-neutral-500">Vuelve a lo que toca hoy según tu macrociclo.</span>
              </span>
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
