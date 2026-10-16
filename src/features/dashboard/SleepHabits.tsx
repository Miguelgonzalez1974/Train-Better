import { useMemo, useState } from 'react';
import { ChevronDown, Minus, Moon, Plus } from 'lucide-react';
import type { HabitTag, ReadinessCheck } from '../../data/athlete/types';
import { HABIT_LABEL, HABIT_ORDER, SLEEP_OK_FROM, SLEEP_OK_TO, formatSleep } from '../../engine/habits';
import type { ReadinessLearning } from '../../engine/readinessLearning';
import { SectionLabel } from '../shell/SectionLabel';
import { LearnedInsights } from './LearnedInsights';

export const SLEEP = 'rgb(var(--c-sleep))';
const DEFAULT_HOURS = 7;
const MIN_HOURS = 3;
const MAX_HOURS = 12;

const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const initialOf = (iso: string) => DAY_INITIAL[new Date(`${iso}T12:00:00`).getDay()];

type Patch = Partial<Pick<ReadinessCheck, 'sleepHours' | 'habits'>>;

/** Las etiquetas de hábitos (alcohol, cafeína…) más "Nada especial": tocar una la pone o la quita; se guarda al instante. */
function HabitChips({ habits, onChange }: { habits: HabitTag[] | undefined; onChange: (patch: Patch) => void }) {
  const toggle = (tag: HabitTag) => {
    const cur = habits ?? [];
    onChange({ habits: cur.includes(tag) ? cur.filter((h) => h !== tag) : [...cur, tag] });
  };
  const none = habits !== undefined && habits.length === 0;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {HABIT_ORDER.map((tag) => {
        const on = habits?.includes(tag) ?? false;
        return (
          <button
            key={tag}
            onClick={() => toggle(tag)}
            aria-pressed={on}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              on ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
            }`}
          >
            {HABIT_LABEL[tag]}
          </button>
        );
      })}
      <button
        onClick={() => onChange({ habits: [] })}
        aria-pressed={none}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
          none ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-500 hover:text-white'
        }`}
      >
        Nada especial
      </button>
    </div>
  );
}

const QUICK_HOURS = [5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
const hoursWord = (h: number) => `${String(h).replace('.', ',')} h`;

/**
 * La pregunta de la mañana, en el Resumen y solo mientras falta: un toque en las horas dormidas y, ya puesto, unas etiquetas
 * opcionales para lo de ayer. "Listo" (o "Ahora no") la quita; después vive solo en la pestaña Sueño.
 */
export function SleepPrompt({ check, onChange, onDone }: { check: ReadinessCheck; onChange: (patch: Patch) => void; onDone: () => void }) {
  const hours = check.sleepHours;
  return (
    <section className="rounded-2xl bg-white/[0.03] p-4" aria-label="Sueño de anoche">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgb(var(--c-sleep) / 0.16)', color: SLEEP }}>
          <Moon size={16} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{hours === undefined ? '¿Cuánto has dormido?' : `Has dormido ${formatSleep(hours)}`}</p>
          <p className="text-xs text-neutral-500">{hours === undefined ? 'Un toque y el coach te conoce mejor' : '¿Algo de ayer que quieras apuntar?'}</p>
        </div>
        {hours === undefined ? (
          <button onClick={onDone} className="shrink-0 text-xs font-medium text-neutral-500 transition-colors hover:text-white">
            Ahora no
          </button>
        ) : (
          <button onClick={() => onChange({ sleepHours: undefined })} className="shrink-0 text-xs font-medium text-neutral-500 transition-colors hover:text-white">
            Cambiar
          </button>
        )}
      </div>
      {hours === undefined ? (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {QUICK_HOURS.map((h) => (
            <button
              key={h}
              onClick={() => onChange({ sleepHours: h })}
              className="num rounded-full border border-brand-border py-2 text-sm font-semibold text-neutral-200 transition-colors duration-200 hover:border-white/40 hover:text-white"
            >
              {hoursWord(h)}
            </button>
          ))}
        </div>
      ) : (
        <div className="animate-section-in motion-reduce:animate-none">
          <HabitChips habits={check.habits} onChange={onChange} />
          <div className="mt-3 flex justify-end">
            <button onClick={onDone} className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15">
              Listo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Sueño y hábitos de anoche: las horas dormidas (con un paso de media hora) y unas etiquetas para lo que pasó ayer. Se
 * guardan al instante en el check-in de hoy y el coach las cruza con cómo te salen las sesiones para aprender qué te
 * afecta de verdad. Todo es opcional.
 */
export function SleepHabitsPanel({ check, onChange, defaultOpen = false }: { check: ReadinessCheck; onChange: (patch: Patch) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hours = check.sleepHours;
  const habits = check.habits;
  const summary = [hours !== undefined ? formatSleep(hours) : null, habits === undefined ? null : habits.length === 0 ? 'sin hábitos' : habits.map((h) => HABIT_LABEL[h].toLowerCase()).join(', ')]
    .filter(Boolean)
    .join(' · ');

  const step = (delta: number) => onChange({ sleepHours: Math.min(MAX_HOURS, Math.max(MIN_HOURS, (hours ?? DEFAULT_HOURS) + delta)) });

  return (
    <div className="rounded-2xl bg-white/[0.03]">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgb(var(--c-sleep) / 0.16)', color: SLEEP }}>
          <Moon size={16} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Sueño y hábitos de anoche</span>
          <span className="block truncate text-xs text-neutral-500">{summary || 'Opcional: ayuda al coach a conocerte'}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-white/5 px-4 pb-4 pt-3">
          <div>
            <p className="text-xs font-medium text-neutral-300">Horas dormidas</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => step(-0.5)}
                aria-label="Menos horas"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border text-neutral-300 transition-colors hover:bg-white/5"
              >
                <Minus size={15} />
              </button>
              <span className="num min-w-[5.5rem] text-center text-2xl font-semibold" style={{ color: hours !== undefined ? 'rgb(var(--c-white))' : 'rgb(var(--c-white) / 0.35)' }}>
                {formatSleep(hours ?? DEFAULT_HOURS)}
              </span>
              <button
                onClick={() => step(0.5)}
                aria-label="Más horas"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-border text-neutral-300 transition-colors hover:bg-white/5"
              >
                <Plus size={15} />
              </button>
              {hours === undefined && <span className="text-[11px] text-neutral-600">toca + o − para anotarlo</span>}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-neutral-300">Ayer y anoche</p>
            <HabitChips habits={habits} onChange={onChange} />
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">Cuantos más días lo anotes, antes te diré qué te afecta a ti. Aún no cambia tu nota.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * La pestaña Sueño: las horas de la noche del día elegido frente a la franja ideal (7–9 h), las de los últimos 14 días y
 * lo que el coach ha aprendido de cómo el sueño y tus hábitos cambian el esfuerzo de tus sesiones.
 */
export function SleepTab({
  log,
  dayIso,
  todayIso,
  learning,
  onSelect,
  onChange,
}: {
  log: ReadinessCheck[];
  dayIso: string;
  todayIso: string;
  learning: ReadinessLearning;
  onSelect: (iso: string) => void;
  /** Cambiar las horas o hábitos del día elegido (solo hoy). */
  onChange: (patch: Patch) => void;
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
  const MAX = 10;
  const H = 96;

  return (
    <div className="flex flex-col gap-3">
      {isToday && check && <SleepHabitsPanel check={check} onChange={onChange} defaultOpen={hours === undefined} />}
      {isToday && !check && <p className="rounded-2xl bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-neutral-400">Haz primero el check-in de hoy en Resumen y aquí podrás anotar tus horas de sueño y tus hábitos.</p>}

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
        {check?.habits && check.habits.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {check.habits.map((h) => (
              <span key={h} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                {HABIT_LABEL[h]}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Sueño de los últimos días">
        <SectionLabel>Últimos 14 días</SectionLabel>
        {logged.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-neutral-400">Anota tus horas de sueño en el check-in de cada mañana y aquí verás cómo duermes y cómo te afecta.</p>
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
                <span key={d.iso} className={`flex-1 text-center text-[10px] ${d.iso === dayIso ? 'font-semibold text-white' : 'text-neutral-600'}`}>
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
