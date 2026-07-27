import { useState } from 'react';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate, type OlyFamily } from '../../engine/periodization';
import { getMovementById, benchmarkWorkouts } from '../../data/movements';
import type { MovementPattern } from '../../data/movements/types';
import type { SessionHistoryEntry } from '../../data/athlete/types';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const PATTERN_LABEL: Partial<Record<MovementPattern, string>> = {
  squat: 'Sentadilla',
  hinge: 'Bisagra de cadera',
  horizontalPush: 'Empuje horizontal',
  verticalPush: 'Empuje vertical',
};

function olyFamilyLabel(family: OlyFamily): string {
  return family === 'snatch' ? 'Snatch' : 'Clean & Jerk';
}

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

interface WeekStripProps {
  trainingDaysPerWeek: 3 | 4 | 5 | 6;
  history: SessionHistoryEntry[];
  today?: Date;
}

export function WeekStrip({ trainingDaysPerWeek, history, today = new Date() }: WeekStripProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const todayIndex = getWeekdayIndex(today);
  const todayIso = toLocalIsoDate(today);
  const monday = startOfWeek(today);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="card p-3">
      <div className="flex justify-between gap-1">
        {DAY_LABELS.map((label, index) => {
          const plan = getDayPlan(index, trainingDaysPerWeek);
          const isToday = index === todayIndex;
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
          const plan = getDayPlan(expanded, trainingDaysPerWeek);
          const entry = history.find((h) => h.date === dateIso);
          const isPast = dateIso < todayIso;

          return (
            <div className="mt-3 rounded-xl bg-brand-surfaceMuted/80 p-3 text-sm">
              <p className="mb-1.5 font-semibold text-white">
                {DAY_LABELS[expanded]} · {dateIso}
              </p>
              {!plan.isTrainingDay ? (
                <p className="text-neutral-400">Descanso</p>
              ) : entry ? (
                <div className="flex flex-col gap-2">
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
                <p className="text-neutral-500">No registrado</p>
              ) : (
                <p className="text-neutral-300">
                  Fuerza: {PATTERN_LABEL[plan.strengthPattern] ?? plan.strengthPattern} · Oly: {olyFamilyLabel(plan.olyFamily)}
                </p>
              )}
            </div>
          );
        })()}
    </div>
  );
}
