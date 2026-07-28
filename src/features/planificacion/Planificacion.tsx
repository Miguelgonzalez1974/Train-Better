import { useMemo, useState } from 'react';
import { RefreshCw, Pencil, Check } from 'lucide-react';
import type { AthleteProfile, DailySession, RxOrScaled, SessionBlockResult, SessionHistoryEntry, WodResult } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import { generateDailySession, toHistoryEntry } from '../../engine/generateSession';
import { toLocalIsoDate } from '../../engine/periodization';
import { MESOCYCLE_PHASE } from '../../engine/oneRepMaxTables';
import { getWodScoreType } from '../../engine/wodScoring';
import { GOAL_TYPE_META } from '../objetivos/goalMeta';
import { CoachHeader } from './CoachHeader';
import { WeekStrip } from './WeekStrip';
import { DaySessionBlocks } from './DaySessionBlocks';

const RPE_SCALE = Array.from({ length: 10 }, (_, i) => i + 1);
const DURATION_PRESETS = [30, 45, 60, 75, 90];
const numberInputClass = 'w-16 rounded-lg border border-brand-border bg-brand-bg px-2 py-1.5 text-center text-sm text-white';

function emptySession(dateIso: string): DailySession {
  return { date: dateIso, mesocycleWeek: 0, isRestDay: false, blocks: [] };
}

function formatMacrocycleDate(dateIso: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateIso));
}

export function Planificacion() {
  const [profile, setProfile] = useState<AthleteProfile>(() => athleteRepository.getProfile());
  const [history, setHistory] = useState<SessionHistoryEntry[]>(() => athleteRepository.getHistory());
  const [goal] = useState(() => athleteRepository.getGoal());
  const todayIso = toLocalIsoDate(new Date());
  const macrocycleNotStarted = todayIso < profile.mesocycleStartDate;
  const [session, setSession] = useState<DailySession>(() => {
    if (macrocycleNotStarted) return emptySession(todayIso);
    const cached = athleteRepository.getTodaySession();
    if (cached && cached.date === todayIso) return cached;
    const fresh = generateDailySession(profile, history, new Date(), goal);
    athleteRepository.saveTodaySession(fresh);
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

  const alreadyCompletedToday = useMemo(() => history.some((h) => h.date === session.date), [history, session.date]);
  const goalMovement = goal?.movementId ? getMovementById(goal.movementId) : undefined;
  const wodScoreType = useMemo(() => getWodScoreType(session), [session]);

  function generateAndCache(nextProfile: AthleteProfile): DailySession {
    if (todayIso < nextProfile.mesocycleStartDate) return emptySession(todayIso);
    const next = generateDailySession(nextProfile, history, new Date(), goal);
    athleteRepository.saveTodaySession(next);
    return next;
  }

  function handleUpdateEntry(index: number, patch: Partial<SessionBlockResult>) {
    setSession((prev) => {
      const next = { ...prev, blocks: prev.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) };
      athleteRepository.saveTodaySession(next);
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
    athleteRepository.appendHistoryEntry(toHistoryEntry(session, rxOrScaled, rpe, durationMin, buildWodResult()));
    setHistory(athleteRepository.getHistory());
    setShowCompletePanel(false);
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

      <div className="flex items-center justify-between">
        <div>
          {!macrocycleNotStarted && (
            <p className="text-sm text-neutral-400">
              Semana {session.mesocycleWeek}/4 · Fase: {MESOCYCLE_PHASE[session.mesocycleWeek as 1 | 2 | 3 | 4]}
            </p>
          )}
          <p className="text-lg font-semibold text-white">
            {macrocycleNotStarted ? 'Sin programar' : session.isRestDay ? 'Día de descanso' : 'Sesión de hoy'}
          </p>
        </div>
        {!session.isRestDay && !macrocycleNotStarted && (
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
              onClick={() => setShowCompletePanel(true)}
              disabled={alreadyCompletedToday}
              className="rounded-lg bg-brand-orange px-3 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {alreadyCompletedToday ? 'Completado ✓' : 'Marcar como completado'}
            </button>
          </div>
        )}
      </div>

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

      {macrocycleNotStarted ? (
        <p className="card p-4 text-neutral-400">
          Tu próximo macrociclo empieza el {formatMacrocycleDate(profile.mesocycleStartDate)}. Todavía no hay programación.
        </p>
      ) : session.isRestDay ? (
        <p className="card p-4 text-neutral-400">
          Hoy toca descansar. Aprovecha para movilidad ligera o recuperación activa.
        </p>
      ) : (
        <DaySessionBlocks session={session} editable={editMode} onUpdateEntry={handleUpdateEntry} />
      )}
    </div>
  );
}
