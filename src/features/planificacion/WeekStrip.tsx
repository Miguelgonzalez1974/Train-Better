import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getActiveMacrocycle, getDayPlan, getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import { generateSessionForDate } from '../../engine/generateSession';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, DailySession, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { Modal } from '../shell/Modal';
import { DaySessionBlocks } from './DaySessionBlocks';

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
}

export function WeekStrip({ profile, history, goals, today = new Date() }: WeekStripProps) {
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

  const expandedPreview = useMemo<DailySession | null>(() => {
    if (expanded === null) return null;
    const date = weekDates[expanded];
    const dateIso = toLocalIsoDate(date);
    if (dateIso === todayIso) return null;
    if (history.some((h) => h.date === dateIso)) return null;
    if (dateIso < todayIso) return null;

    const cached = athleteRepository.getCachedSession(dateIso);
    if (cached) return cached;
    // Sin macrociclo activo ese dia y nada elegido todavia: no se auto-genera ni se muestra
    // "Mantenimiento" — mismo criterio que la vista de "Sesion de hoy".
    if (!getActiveMacrocycle(profile.macrocycles, dateIso)) return null;
    const fresh = generateSessionForDate(profile, history, date, goals);
    athleteRepository.saveCachedSession(fresh);
    return fresh;
  }, [expanded, weekOffset, profile, history, goals]);

  return (
    <div className="card p-3">
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

      <div className="flex justify-between gap-1">
        {DAY_LABELS.map((label, index) => {
          const plan = getDayPlan(index, trainingDaysPerWeek);
          const isToday = toLocalIsoDate(weekDates[index]) === todayIso;
          const isSelected = expanded === index;
          return (
            <button
              key={label}
              onClick={() => setExpanded((prev) => (prev === index ? null : index))}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs transition-all duration-200 ${
                isSelected
                  ? 'bg-brand-gold/15 ring-1 ring-brand-gold'
                  : isToday
                    ? 'bg-brand-orange/15 ring-1 ring-brand-orange'
                    : 'bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <span className="font-medium text-neutral-300">{label}</span>
              <span className={`h-2 w-2 rounded-full ${plan.isTrainingDay ? 'bg-brand-gold' : 'bg-neutral-700'}`} />
            </button>
          );
        })}
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
                    {entry.wodResult && (
                      <span className="rounded-md bg-brand-orange/15 px-2 py-0.5 text-xs font-semibold text-brand-orange">
                        WOD: {entry.wodResult.value}
                      </span>
                    )}
                  </div>
                  <p className="text-neutral-300">{entry.movementIds.map(resolveMovementName).join(' · ')}</p>
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
