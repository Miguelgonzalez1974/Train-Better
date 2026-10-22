import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Dumbbell, Moon, Trash2, Zap } from 'lucide-react';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import { generateSessionForDate, hasActiveTrainingStructure, isCachedSessionOrphaned, isCachedSessionStale } from '../../engine/generateSession';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, DailySession, DayLightInfo, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { Modal } from '../shell/Modal';
import { DaySessionBlocks } from './DaySessionBlocks';
import { ensureWeekLocked } from './weeklyLock';
import { wodResultsOf } from '../../engine/wodScoring';
import { estimatePlannedStrain, strainFit } from '../../engine/plannedStrain';
import { buildStrainTarget } from '../../engine/strainTarget';
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

/** Lo que se dibuja de cada día de la semana. */
interface WeekDay {
  kind: 'done' | 'missed' | 'planned' | 'rest';
  /** Esfuerzo (0-100): el real si está hecho, el previsto si no. */
  strain: number;
  emphasis?: 'fuerza' | 'metcon';
  /** Color del semáforo de hoy (solo hoy y con el check-in hecho). */
  light?: DayLightInfo['color'];
  /** Franja del objetivo del día; `estimated` = aún no está fijado (día que falta o hoy sin check-in). */
  band?: { low: number; high: number; estimated: boolean };
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
      weekDates.map((date, index): WeekDay => {
        const dateIso = toLocalIsoDate(date);
        const entry = history.find((h) => h.date === dateIso);
        const isTrainingDay = getDayPlan(index, trainingDaysPerWeek).isTrainingDay;
        // La franja es el objetivo del día. El de ayer y el de hoy es el que se fijó por la mañana; el de los días que faltan
        // no existe todavía (se fija con el check-in de ese día) y se estima con lo que se sabe hoy.
        const stored = profile.strainTargets?.[dateIso];
        const futureOrToday = dateIso >= todayIso;
        const band = stored ?? (futureOrToday ? buildStrainTarget(profile, history, dateIso) : undefined);
        const bandInfo = band ? { low: band.low, high: band.high, estimated: dateIso > todayIso || band.provisional } : undefined;
        if (entry) return { kind: 'done', strain: dayStrain(entry) ?? 0, band: bandInfo };
        if (dateIso < todayIso) return { kind: isTrainingDay ? 'missed' : 'rest', strain: 0, band: isTrainingDay ? bandInfo : undefined };
        const session = isTrainingDay ? sessionFor(date) : null;
        if (!session || session.isRestDay) return { kind: 'rest', strain: 0 };
        const planned = estimatePlannedStrain(session, history);
        return { kind: 'planned', strain: planned?.strain ?? 0, emphasis: session.dayEmphasis, light: dateIso === todayIso ? session.dayLight?.color : undefined, band: bandInfo };
      }),
    [weekOffset, profile, history, goals],
  );

  // Eje vertical común a toda la semana: de unos 12 puntos bajo lo más bajo a unos 10 sobre lo más alto (franjas incluidas),
  // para que las barras y las franjas de distintos días se comparen y no queden aplastadas.
  const axis = useMemo(() => {
    const values = days.flatMap((d) => [d.band?.low, d.band?.high, d.kind === 'done' || d.kind === 'planned' ? d.strain : undefined]).filter((v): v is number => v !== undefined);
    if (values.length === 0) return { lo: 0, hi: 100 };
    return { lo: Math.max(0, Math.floor((Math.min(...values) - 12) / 5) * 5), hi: Math.min(100, Math.ceil((Math.max(...values) + 10) / 5) * 5) };
  }, [days]);

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
          // Cada día cuenta: la barra de esfuerzo (real si ya se hizo, previsto si no) sobre una franja que es el objetivo del día,
          // el número exacto y abajo qué fue: hecho (tic), no registrado (anillo rojo), previsto (fuerza o metcon) o descanso (luna).
          // El color dice dónde cae respecto al objetivo: dentro (verde si está hecho, dorado si es previsto), te pasas (coral)
          // o por debajo (azul), con los mismos márgenes que la sesión de hoy.
          const hasBar = day.kind === 'done' || day.kind === 'planned';
          // Solo se juzga contra un objetivo REAL (fijado por la mañana). La franja estimada de los días que faltan es una
          // referencia: no sabe, por ejemplo, que es semana de descarga, así que no pinta de "por debajo" lo que toca suave.
          const fit = hasBar && day.band && !day.band.estimated ? strainFit(day.strain, day.band).fit : 'dentro';
          const barColor =
            fit === 'se-pasa'
              ? 'rgb(var(--c-over))'
              : fit === 'se-queda-corta'
                ? 'rgb(var(--c-state-cool))'
                : day.kind === 'done'
                  ? 'rgb(var(--c-brand-neon))'
                  : isToday
                    ? 'rgb(var(--c-brand-orange))'
                    : 'rgb(var(--c-brand-gold) / 0.85)';
          const y = (v: number) => (Math.min(axis.hi, Math.max(axis.lo, v)) - axis.lo) / Math.max(1, axis.hi - axis.lo);
          const BAR_H = 56;
          const bandWord = day.band ? `objetivo ${day.band.low}–${day.band.high}${day.band.estimated ? ' (estimado)' : ''}` : '';
          const fitWord = fit === 'se-pasa' ? ' · te pasas' : fit === 'se-queda-corta' ? ' · por debajo' : '';
          const text =
            day.kind === 'done'
              ? `Completado · esfuerzo ${day.strain}${bandWord ? ` · ${bandWord}` : ''}${fitWord}`
              : day.kind === 'missed'
                ? `No registrado${bandWord ? ` · ${bandWord}` : ''}`
                : day.kind === 'planned'
                  ? `Esfuerzo previsto ~${day.strain}${bandWord ? ` · ${bandWord}` : ''}${fitWord}${day.emphasis === 'metcon' ? ' · foco metcon' : day.emphasis === 'fuerza' ? ' · día de fuerza' : ' · día mixto'}`
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
              <span className="relative my-0.5 flex w-full justify-center" style={{ height: BAR_H }} aria-hidden="true">
                {day.band && (
                  <span
                    className={`absolute inset-x-1 rounded ${day.band.estimated ? 'bg-white/[0.05] ring-1 ring-white/10' : 'bg-white/[0.10]'}`}
                    style={{ bottom: y(day.band.low) * BAR_H, height: Math.max(3, (y(day.band.high) - y(day.band.low)) * BAR_H) }}
                  />
                )}
                <span className="relative flex w-2.5 items-end overflow-hidden rounded-full bg-white/[0.08]" style={{ height: BAR_H }}>
                  {hasBar && <span className="w-full rounded-full" style={{ height: `${Math.max(8, y(day.strain) * 100)}%`, background: barColor }} />}
                </span>
              </span>
              <span className={`num text-xs font-bold leading-none ${hasBar ? '' : 'text-neutral-500'}`} style={hasBar ? { color: barColor } : undefined} aria-hidden="true">
                {hasBar ? `${day.kind === 'planned' ? '~' : ''}${day.strain}` : '–'}
              </span>
              <span className="flex h-4 items-center justify-center" aria-hidden="true">
                {day.kind === 'done' ? (
                  <Check size={14} strokeWidth={3} className="text-brand-neon" />
                ) : day.kind === 'missed' ? (
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-red-500/60" />
                ) : day.kind === 'planned' ? (
                  // Pesa = fuerza, rayo = metcon, y los días mixtos (fuerza y WOD en equilibrio) llevan los dos juntos.
                  day.emphasis === 'metcon' ? (
                    <Zap size={13} strokeWidth={2.5} className="text-brand-orange" />
                  ) : day.emphasis === 'fuerza' ? (
                    <Dumbbell size={13} strokeWidth={2.5} className="text-brand-gold" />
                  ) : (
                    <span className="flex items-center gap-px">
                      <Dumbbell size={10} strokeWidth={2.5} className="text-brand-gold" />
                      <Zap size={10} strokeWidth={2.5} className="text-brand-orange" />
                    </span>
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
