import { useMemo } from 'react';
import { Moon } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import { SLEEP_OK_FROM, SLEEP_OK_TO, formatSleep } from '../../engine/habits';
import type { ReadinessLearning } from '../../engine/readinessLearning';
import { SectionLabel } from '../shell/SectionLabel';
import { LearnedInsights } from './LearnedInsights';

export const SLEEP = 'rgb(var(--c-sleep))';

const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const initialOf = (iso: string) => DAY_INITIAL[new Date(`${iso}T12:00:00`).getDay()];

/**
 * La pestaña Sueño: las horas de la noche del día elegido frente a la franja ideal (7–9 h), las de los últimos 14 días y
 * lo que el coach ha aprendido de cómo el sueño cambia el esfuerzo de tus sesiones. Las horas y la calidad se anotan en la
 * tarjeta de la mañana; aquí se ven y, para hoy, se abre la tarjeta para anotarlas o corregirlas.
 */
export function SleepTab({
  log,
  dayIso,
  todayIso,
  learning,
  onSelect,
  onOpenMorning,
}: {
  log: ReadinessCheck[];
  dayIso: string;
  todayIso: string;
  learning: ReadinessLearning;
  onSelect: (iso: string) => void;
  /** Abre la tarjeta de la mañana (anotar o corregir las horas de hoy). */
  onOpenMorning: () => void;
}) {
  const byDate = useMemo(() => new Map(log.map((c) => [c.date, c])), [log]);
  const check = byDate.get(dayIso);
  const isToday = dayIso === todayIso;
  const days = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(`${dayIso}T12:00:00`);
        d.setDate(d.getDate() - (13 - i));
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { iso, hours: byDate.get(iso)?.sleepHours };
      }),
    [byDate, dayIso],
  );
  const logged = days.filter((d) => d.hours !== undefined);
  const avg = logged.length > 0 ? logged.reduce((s, d) => s + d.hours!, 0) / logged.length : null;
  const sleepInsights = { ...learning, insights: learning.insights.filter((i) => i.key === 'sleepHours' || i.key.startsWith('habit:')) };
  const hours = check?.sleepHours;
  const quality = check?.sleepQuality;
  const MAX = 10;
  const H = 96;

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Sueño de la noche">
        <SectionLabel>Anoche</SectionLabel>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <span className="num text-[2.6rem] font-semibold leading-none tracking-tight" style={{ color: hours !== undefined ? SLEEP : 'rgb(var(--c-white) / 0.3)' }}>
              {hours !== undefined ? formatSleep(hours) : '—'}
            </span>
            <p className="mt-1 text-xs text-neutral-500">
              {hours === undefined ? 'Sin anotar' : hours >= SLEEP_OK_FROM ? 'Dentro de lo ideal' : `Por debajo de las ${SLEEP_OK_FROM} h ideales`}
            </p>
          </div>
          <p className="text-right text-[11px] text-neutral-500">
            Ideal
            <br />
            <span className="num font-semibold text-neutral-300">
              {SLEEP_OK_FROM}–{SLEEP_OK_TO} h
            </span>
          </p>
        </div>
        <div className="relative mt-4 h-2.5 rounded-full bg-white/[0.07]">
          <div className="absolute inset-y-0 rounded-full border border-white/30 bg-white/[0.14]" style={{ left: `${(SLEEP_OK_FROM / MAX) * 100}%`, width: `${((SLEEP_OK_TO - SLEEP_OK_FROM) / MAX) * 100}%` }} />
          {hours !== undefined && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (hours / MAX) * 100)}%`, backgroundColor: SLEEP }} />}
        </div>
        {quality !== undefined && (
          <div className="mt-4 flex items-center gap-2 text-xs text-neutral-400">
            Calidad
            <span className="flex gap-0.5" role="img" aria-label={`${quality} de 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Moon key={n} size={14} strokeWidth={2} fill={n <= quality ? 'currentColor' : 'none'} style={{ color: n <= quality ? SLEEP : 'rgb(var(--c-white) / 0.2)' }} aria-hidden="true" />
              ))}
            </span>
          </div>
        )}
        {isToday && hours === undefined && (
          <button onClick={onOpenMorning} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:bg-white/5">
            {check ? 'Anotar las horas de hoy' : 'Hacer el check-in de hoy'}
          </button>
        )}
      </section>

      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Sueño de los últimos días">
        <SectionLabel>Últimos 14 días</SectionLabel>
        {logged.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-neutral-400">Anota tus horas de sueño en la tarjeta de cada mañana y aquí verás cómo duermes y cómo te afecta.</p>
        ) : (
          <>
            <div className="relative mt-4" style={{ height: H }}>
              <div className="absolute inset-x-0 rounded-md border border-white/20 bg-white/[0.07]" style={{ bottom: `${(SLEEP_OK_FROM / MAX) * 100}%`, height: `${((SLEEP_OK_TO - SLEEP_OK_FROM) / MAX) * 100}%` }} />
              <div className="relative flex h-full items-end gap-1">
                {days.map((d) => (
                  <button key={d.iso} onClick={() => onSelect(d.iso)} aria-label={`Ver ${d.iso}`} className="flex h-full flex-1 items-end">
                    {d.hours !== undefined ? (
                      <span className="block w-full rounded-t-md" style={{ height: `${(d.hours / MAX) * 100}%`, backgroundColor: SLEEP, opacity: d.iso === dayIso ? 1 : 0.55 }} />
                    ) : (
                      <span className="block w-full rounded-t-md bg-white/[0.04]" style={{ height: '6%' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1.5 flex gap-1">
              {days.map((d) => (
                <span key={d.iso} className={`flex-1 text-center text-[11px] ${d.iso === dayIso ? 'font-semibold text-white' : 'text-neutral-600'}`}>
                  {initialOf(d.iso)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">
              Media de {logged.length} {logged.length === 1 ? 'noche' : 'noches'}: <strong className="font-semibold text-neutral-100">{formatSleep(Math.round(avg! * 2) / 2)}</strong>.
            </p>
          </>
        )}
      </section>

      <div className="rounded-2xl bg-white/[0.03] p-5">
        <LearnedInsights learning={sleepInsights} />
      </div>
    </div>
  );
}
