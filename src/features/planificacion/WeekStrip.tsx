import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Dumbbell, Moon, Trash2, Zap } from 'lucide-react';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import { generateSessionForDate, hasActiveTrainingStructure, isCachedSessionOrphaned, isCachedSessionStale } from '../../engine/generateSession';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, DailySession, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { Modal } from '../shell/Modal';
import { DaySessionBlocks } from './DaySessionBlocks';
import { ensureWeekLocked } from './weeklyLock';
import { wodResultsOf } from '../../engine/wodScoring';
import { estimatePlannedStrain } from '../../engine/plannedStrain';
import { dayStrain } from '../../engine/strain';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function resolveMovementName(id: string): string {
  if (id.startsWith('benchmark:')) {
    const benchmarkId = id.replace('benchmark:', '');
    return benchmarkWorkouts.find((w) => w.id === benchmarkId)?.name ?? benchmarkId;
  }
  return getMovementById(id)?.name ?? id;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - getWeekdayIndex(date));
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatShort(date: Date): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(date);
}

interface WeekStripProps {
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  goals: Goal[];
  today?: Date;
  /** Borra el registro de un dia pasado (por si se anoto por error) — el padre es quien posee `history`, asi que refresca su propio estado. */
  onDeleteHistoryEntry?: (date: string) => void;
  /** Botón fijo a la derecha de los siete días (el icono de nutrición de hoy). */
  trailing?: ReactNode;
}

export function WeekStrip({ profile, history, goals, today = new Date(), onDeleteHistoryEntry, trailing }: WeekStripProps) {
  const { trainingDaysPerWeek } = profile;
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const todayIso = toLocalIsoDate(today);
  const monday = startOfWeek(today);
  monday.setDate(monday.getDate() + weekOffset * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  /** La sesión prevista de un día aún sin registrar: la cacheada o, si no la hay, la generada y sellada. */
  const sessionFor = (date: Date): DailySession | null => {
    const dateIso = toLocalIsoDate(date);
    const cached = athleteRepository.getCachedSession(dateIso);
    // Ignora una sesión periodizada huérfana (su macro/programa se borró) —se limpia de verdad al
    // borrar la estructura— o generada por una versión anterior del motor (se regenera abajo,
    // determinista, y se re-cachea sellada). Aquí solo hay días futuros sin registrar.
    // El bloqueo semanal se resuelve antes de servir la cache: una re-planificacion tras un dia
    // perdido puede dejar la sesion cacheada de este dia contradiciendo al bloqueo nuevo.
    const structured = hasActiveTrainingStructure(profile, dateIso);
    const lockedProfile = structured ? ensureWeekLocked(profile, history, goals, dateIso) : profile;
    if (
      cached &&
      !isCachedSessionOrphaned(cached, profile, dateIso) &&
      !isCachedSessionStale(cached, lockedProfile.weeklyLocks?.[dateIso], history, lockedProfile.painFlags)
    ) {
      return cached;
    }
    // Sin macrociclo NI programa de fuerza activo ese dia y nada elegido todavia: no se
    // auto-genera ni se muestra "Mantenimiento" — mismo criterio que la vista de "Sesion de hoy".
    if (!structured) return null;
    const fresh = generateSessionForDate(lockedProfile, history, date, goals);
    athleteRepository.saveCachedSession(fresh);
    return fresh;
  };

  const expandedPreview = useMemo<DailySession | null>(() => {
    if (expanded === null) return null;
    const date = weekDates[expanded];
    const dateIso = toLocalIsoDate(date);
    if (dateIso === todayIso) return null;
    if (history.some((h) => h.date === dateIso)) return null;
    if (dateIso < todayIso) return null;
    return sessionFor(date);
  }, [expanded, weekOffset, profile, history, goals]);

  /**
   * Lo que se pinta en cada día de un vistazo: qué fue (hecho, no registrado, previsto, descanso), cuánto esfuerzo (real si
   * ya se hizo, previsto si no: la misma estimación de la sesión de hoy) y de qué va (fuerza o metcon).
   */
  const days = useMemo(
    () =>
      weekDates.map((date, index) => {
        const dateIso = toLocalIsoDate(date);
        const entry = history.find((h) => h.date === dateIso);
        const isTrainingDay = getDayPlan(index, trainingDaysPerWeek).isTrainingDay;
        if (entry) return { kind: 'done' as const, strain: dayStrain(entry) ?? 0, emphasis: undefined, light: undefined };
        if (dateIso < todayIso) return { kind: isTrainingDay ? ('missed' as const) : ('rest' as const), strain: 0, emphasis: undefined, light: undefined };
        const session = isTrainingDay ? sessionFor(date) : null;
        if (!session || session.isRestDay) return { kind: 'rest' as const, strain: 0, emphasis: undefined, light: undefined };
        const planned = estimatePlannedStrain(session, history);
        return { kind: 'planned' as const, strain: planned?.strain ?? 0, emphasis: session.dayEmphasis, light: dateIso === todayIso ? session.dayLight?.color : undefined };
      }),
    [weekOffset, profile, history, goals],
  );

  return (
    <div className="py-1">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((prev) => prev - 1)}
          title="Semana anterior"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors duration-200 hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span>
            {formatShort(weekDates[0])} – {formatShort(weekDates[6])}
          </span>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-md bg-white/5 px-2 py-0.5 font-semibold text-neutral-300 transition-colors duration-200 hover:bg-white/10"
            >
              Hoy
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((prev) => prev + 1)}
          title="Semana siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors duration-200 hover:bg-white/5 hover:text-white"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="flex items-stretch gap-1.5">
      <div className="flex min-w-0 flex-1 justify-between gap-1">
        {DAY_LABELS.map((label, index) => {
          const day = days[index];
          const date = weekDates[index];
          const dateIso = toLocalIsoDate(date);
          const isToday = dateIso === todayIso;
          const isSelected = expanded === index;
          // Cada día cuenta tres cosas: el número (qué día es), una barra de esfuerzo (real si ya se hizo, previsto si no) y
          // abajo qué fue: hecho (tic), no registrado (anillo rojo), previsto (fuerza o metcon) o descanso (luna).
          // Hoy, con el check-in hecho, la barra toma el color del semáforo.
          const barColor =
            day.kind === 'done'
              ? 'rgb(var(--c-brand-neon))'
              : day.light
                ? `rgb(var(--c-state-${day.light === 'verde' ? 'good' : day.light === 'ambar' ? 'mid' : 'low'}))`
                : isToday
                  ? 'rgb(var(--c-brand-orange))'
                  : 'rgb(var(--c-brand-gold) / 0.7)';
          const hasBar = day.kind === 'done' || day.kind === 'planned';
          const text =
            day.kind === 'done'
              ? `Completado · esfuerzo ${day.strain}`
              : day.kind === 'missed'
                ? 'No registrado'
                : day.kind === 'planned'
                  ? `Esfuerzo previsto ~${day.strain}${day.emphasis === 'metcon' ? ' · foco metcon' : day.emphasis === 'fuerza' ? ' · día de fuerza' : ''}`
                  : 'Descanso';
          return (
            <button
              key={label}
              onClick={() => setExpanded((prev) => (prev === index ? null : index))}
              title={text}
              aria-label={`${label} ${date.getDate()}: ${text}`}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs transition-all duration-200 ${
                isSelected
                  ? 'bg-brand-gold/15 ring-1 ring-brand-gold'
                  : isToday
                    ? 'bg-brand-orange/15 ring-1 ring-brand-orange'
                    : 'bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
              <span className={`num text-sm font-bold leading-none ${isToday ? 'text-brand-orange' : 'text-white'}`}>{date.getDate()}</span>
              <span className="relative my-0.5 flex h-9 w-2.5 items-end overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                {hasBar && <span className="w-full rounded-full" style={{ height: `${Math.max(14, Math.min(100, day.strain))}%`, background: barColor }} />}
              </span>
              <span className="flex h-4 items-center justify-center" aria-hidden="true">
                {day.kind === 'done' ? (
                  <Check size={14} strokeWidth={3} className="text-brand-neon" />
                ) : day.kind === 'missed' ? (
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-red-500/60" />
                ) : day.kind === 'planned' ? (
                  day.emphasis === 'metcon' ? (
                    <Zap size={13} strokeWidth={2.5} className="text-brand-orange" />
                  ) : (
                    <Dumbbell size={13} strokeWidth={2.5} className="text-brand-gold" />
                  )
                ) : (
                  <Moon size={12} strokeWidth={2.5} className="text-neutral-500" />
                )}
              </span>
            </button>
          );
        })}
      </div>
      {trailing}
      </div>

      {expanded !== null &&
        (() => {
          const date = weekDates[expanded];
          const dateIso = toLocalIsoDate(date);
          const entry = history.find((h) => h.date === dateIso);
          const isPast = dateIso < todayIso;
          const isToday = dateIso === todayIso;

          return (
            <Modal open onClose={() => setExpanded(null)} title={`${DAY_LABELS[expanded]} · ${dateIso}`}>
              {entry ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        entry.rxOrScaled === 'rx' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-white/10 text-neutral-300'
                      }`}
                    >
                      {entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}
                    </span>
                    <span className="text-neutral-500">RPE {entry.rpe}</span>
                    {wodResultsOf(entry).map(({ part, result }) => (
                      <span key={part} className="rounded-md bg-brand-orange/15 px-2 py-0.5 text-xs font-semibold text-brand-orange">
                        {entry.wodResult2 ? `WOD parte ${part}` : 'WOD'}: {result.value}
                      </span>
                    ))}
                  </div>
                  <p className="text-neutral-300">{entry.movementIds.map(resolveMovementName).join(' · ')}</p>
                  {onDeleteHistoryEntry && (
                    <button
                      onClick={() => {
                        if (!window.confirm(`¿Borrar la sesión registrada el ${dateIso}? Esto no se puede deshacer.`)) return;
                        onDeleteHistoryEntry(dateIso);
                        setExpanded(null);
                      }}
                      className="mt-2 flex items-center gap-1.5 self-start rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors duration-200 hover:border-red-500/60 hover:bg-red-500/20"
                    >
                      <Trash2 size={14} />
                      Borrar esta sesión
                    </button>
                  )}
                </div>
              ) : isPast ? (
                <p className="text-sm text-neutral-500">No registrado</p>
              ) : isToday ? (
                <p className="text-sm text-neutral-400">Consulta el detalle completo en «Sesión de hoy».</p>
              ) : expandedPreview?.isRestDay ? (
                <p className="text-sm text-neutral-400">Descanso</p>
              ) : expandedPreview ? (
                <DaySessionBlocks session={expandedPreview} />
              ) : (
                <p className="text-sm text-neutral-400">Sin macrociclo activo ese día todavía — ese día decides tú qué hacer.</p>
              )}
            </Modal>
          );
        })()}
    </div>
  );
}
