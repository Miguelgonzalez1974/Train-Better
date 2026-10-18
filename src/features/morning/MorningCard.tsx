import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Bell, Brain, Check, Equal, Flame, Frown, HeartPulse, Meh, Minus, Moon, Plus, Shield, ShieldCheck, Smile, Sun, TrendingDown, TrendingUp } from 'lucide-react';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { SoreLevelNum, SoreZoneId } from '../../data/athlete/types';
import { formatSleep, SLEEP_OK_FROM } from '../../engine/habits';
import { hasAnyAnswer, answersFromCheck, restingHrBaseline, type CardAnswers, type MorningIcon, type MorningLine, type MorningTone } from '../../engine/morningCheckIn';
import { getActivePainFlags, PAIN_AREA_LABEL, type PainFollowUp } from '../../engine/painFlags';
import type { CheckInOverall } from '../../engine/readiness';
import { getReadinessCheckForDate } from '../../engine/readiness';
import { toLocalIsoDate } from '../../engine/periodization';
import { recoveryColor } from '../dashboard/RecoveryCard';
import { ACCENT as EFFORT } from '../dashboard/StrainRing';
import { BodyMap, SORE_COLOR } from './BodyMap';
import { commitMorning, type MorningResult } from './morningCommit';

const GOOD = 'rgb(var(--c-state-good))';
const MID = 'rgb(var(--c-state-mid))';
const LOW = 'rgb(var(--c-state-low))';
const HOT = 'rgb(var(--c-state-hot))';
const SLEEP = 'rgb(var(--c-sleep))';
const DEFAULT_HOURS = 7.5;
const DEFAULT_HR = 55;

const OVERALL: { value: CheckInOverall; label: string; Icon: typeof Smile; color: string }[] = [
  { value: 'bien', label: 'Bien', Icon: Smile, color: GOOD },
  { value: 'normal', label: 'Normal', Icon: Meh, color: MID },
  { value: 'mal', label: 'Mal', Icon: Frown, color: LOW },
];

const FOLLOW_UP: { value: PainFollowUp; label: string }[] = [
  { value: 'sigue', label: 'Sigue' },
  { value: 'mejor', label: 'Mejor' },
  { value: 'paso', label: 'Ya pasó' },
];

const TONE_COLOR: Record<MorningTone, string> = { good: GOOD, mid: MID, warn: HOT, bad: LOW, sleep: SLEEP, info: EFFORT, neutral: 'rgb(var(--c-n-400))' };
const LINE_ICON: Record<MorningIcon, typeof Check> = {
  'trend-up': TrendingUp,
  'trend-down': TrendingDown,
  equal: Equal,
  moon: Moon,
  shield: Shield,
  'shield-check': ShieldCheck,
  flame: Flame,
  brain: Brain,
  heart: HeartPulse,
  bell: Bell,
  check: Check,
};

const DAY_FORMAT = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });
const greeting = () => {
  const h = new Date().getHours();
  return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};

const LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.1em] text-neutral-500';

function Section({ icon, label, color, aside, children, className = '' }: { icon: ReactNode; label: string; color?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 ${className}`} aria-label={label}>
      <p className={`mb-2 flex items-center gap-1.5 ${LABEL}`} style={color ? { color } : undefined}>
        {icon}
        {label}
        {aside && <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-neutral-500">{aside}</span>}
      </p>
      {children}
    </section>
  );
}

function RoundButton({ onClick, label, children, small }: { onClick: () => void; label: string; children: ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition-colors hover:bg-white/5 ${small ? 'h-[30px] w-[30px]' : 'h-[34px] w-[34px]'}`}
    >
      {children}
    </button>
  );
}

/** Cinco tramos que se rellenan hasta el elegido (0 = muy bajo … 4 = muy alto). */
function Scale({ label, words, value, onChange }: { label: string; words: string[]; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-neutral-100">{label}</span>
        <span className="text-[11.5px] text-neutral-500">{value === undefined ? '—' : words[value]}</span>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {words.map((w, i) => (
          <button
            key={w}
            role="radio"
            aria-checked={value === i}
            aria-label={w}
            onClick={() => onChange(i)}
            className={`h-[22px] flex-1 rounded-md transition-colors duration-200 ${value !== undefined && i <= value ? 'bg-neutral-200' : 'bg-white/[0.07]'}`}
          />
        ))}
      </div>
    </div>
  );
}

function Ring({ readiness, target }: { readiness: number | null; target: { low: number; high: number } | null }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const R_OUT = 50;
  const R_IN = 34;
  const circ = (r: number) => 2 * Math.PI * r;
  const tint = readiness !== null ? recoveryColor(readiness) : 'rgb(var(--c-n-600))';
  const arc = (r: number, from: number, to: number) => ({ strokeDasharray: `${filled ? ((to - from) / 100) * circ(r) : 0} ${circ(r)}`, strokeDashoffset: -((from / 100) * circ(r)) });
  const slide = 'transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none';
  return (
    <div className="relative mx-auto h-[128px] w-[128px]">
      <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={`Preparación ${readiness ?? 'sin datos'}${target ? `, objetivo de esfuerzo ${target.low} a ${target.high}` : ''}`}>
        <g transform="rotate(-90 60 60)">
          <circle cx="60" cy="60" r={R_OUT} fill="none" strokeWidth={9} className="stroke-white/[0.07]" />
          {target && <circle cx="60" cy="60" r={R_OUT} fill="none" strokeWidth={9} strokeLinecap="round" style={{ stroke: EFFORT, ...arc(R_OUT, target.low, target.high) }} className={slide} />}
          <circle cx="60" cy="60" r={R_IN} fill="none" strokeWidth={9} className="stroke-white/[0.07]" />
          {readiness !== null && <circle cx="60" cy="60" r={R_IN} fill="none" strokeWidth={9} strokeLinecap="round" style={{ stroke: tint, ...arc(R_IN, 0, readiness) }} className={slide} />}
        </g>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="num text-2xl font-semibold leading-none" style={{ color: tint }}>
          {readiness ?? '—'}
          {readiness !== null && <span className="text-[0.55em] font-medium">%</span>}
        </span>
      </div>
    </div>
  );
}

function Lines({ title, lines }: { title: string; lines: MorningLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className={`mb-2 ${LABEL}`}>{title}</p>
      <ul className="flex flex-col gap-2">
        {lines.map((l) => {
          const Icon = LINE_ICON[l.icon];
          return (
            <li key={l.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-neutral-200">
              <Icon size={15} strokeWidth={2.25} className="mt-px shrink-0" style={{ color: TONE_COLOR[l.tone] }} aria-hidden="true" />
              <span>{l.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface MorningCardProps {
  /** `auto`: salta al abrir la app (la pregunta de la mañana); `edit`: se abre desde la pestaña Preparación para corregir. */
  mode: 'auto' | 'edit';
  /** Cierra la tarjeta. `changed` = si se guardó algo (hay que refrescar lo que enseñan las pestañas). */
  onClose: (changed: boolean) => void;
}

/**
 * La tarjeta de la mañana: una sola pantalla compacta con todo lo que el coach necesita saber de hoy — cómo amaneces, cómo
 * siguen tus molestias, sueño, agujetas por zona, estrés, motivación y pulso en reposo — y, al terminar, los anillos del día y la
 * lista honesta de qué cambia hoy y qué solo se apunta. Sale al abrir la app cada día (también en descanso) y "Más tarde" la
 * deja como una pastilla en el Resumen.
 */
export function MorningCard({ mode, onClose }: MorningCardProps) {
  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);
  const profile = useMemo(() => athleteRepository.getProfile(), []);
  const history = useMemo(() => athleteRepository.getHistory(), []);
  const activeFlags = useMemo(() => getActivePainFlags(profile.painFlags, todayIso), [profile.painFlags, todayIso]);
  const baseline = useMemo(() => restingHrBaseline(profile.readinessLog, todayIso), [profile.readinessLog, todayIso]);

  const [answers, setAnswers] = useState<CardAnswers>(() => answersFromCheck(getReadinessCheckForDate(profile.readinessLog, todayIso)));
  const [followUps, setFollowUps] = useState<Record<string, PainFollowUp>>({});
  const [result, setResult] = useState<MorningResult | null>(null);
  const [committed, setCommitted] = useState(false);

  const patch = (p: Partial<CardAnswers>) => setAnswers((a) => ({ ...a, ...p }));
  const answered = hasAnyAnswer(answers) || Object.keys(followUps).length > 0;
  const close = () => onClose(committed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(committed);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [committed, onClose]);

  function save(next: CardAnswers) {
    setResult(commitMorning(next, followUps, history, todayIso));
    setCommitted(true);
  }

  function stepHours(delta: number) {
    setAnswers((a) => ({ ...a, hours: Math.min(12, Math.max(3, (a.hours ?? DEFAULT_HOURS) + delta)) }));
  }
  function stepHr(delta: number) {
    setAnswers((a) => ({ ...a, restingHr: Math.min(120, Math.max(30, (a.restingHr ?? baseline ?? DEFAULT_HR) + delta)) }));
  }
  /** Tocar una zona: sin agujetas → leves → fuertes → sin agujetas. */
  function cycleZone(id: SoreZoneId) {
    setAnswers((a) => {
      const zones = { ...(a.soreZones ?? {}) };
      const next = (((zones[id] ?? 0) + 1) % 3) as 0 | SoreLevelNum;
      if (next === 0) delete zones[id];
      else zones[id] = next;
      return { ...a, soreZones: zones };
    });
  }

  const dateLabel = DAY_FORMAT.format(new Date()).replace(/\./g, '');

  return (
    <div role="dialog" aria-modal="true" aria-label="Tu mañana" className="fixed inset-0 z-[60] overflow-y-auto bg-brand-bg">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-4 pt-5">
        {result ? (
          <div className="animate-section-in flex flex-1 flex-col gap-5 motion-reduce:animate-none">
            <div className="pt-2">
              <Ring readiness={result.readiness} target={result.target} />
              <p className={`mt-2 text-center ${LABEL}`} style={{ color: result.readiness !== null ? recoveryColor(result.readiness) : undefined }}>
                Preparación
              </p>
              <p className="mt-1 text-center text-[13px]">
                {result.target ? (
                  <>
                    <span className={LABEL} style={{ color: EFFORT }}>
                      Objetivo de esfuerzo
                    </span>{' '}
                    <b className="num text-[15px] font-semibold" style={{ color: EFFORT }}>
                      {result.target.low}–{result.target.high}
                    </b>
                  </>
                ) : result.day === 'rest' ? (
                  <span className="text-neutral-400">Hoy descansas. Descansar bien suma para mañana.</span>
                ) : null}
              </p>
            </div>
            <Lines title="Lo que cambia hoy" lines={result.changes} />
            <Lines title="Solo lo apunto" lines={result.notes} />
            <div className="mt-auto flex flex-col gap-1 pt-2">
              <button onClick={close} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-orange text-[15px] font-semibold text-black shadow-md shadow-brand-orange/20 transition-colors hover:bg-brand-orange-dark">
                Empezar el día <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button onClick={() => setResult(null)} className="py-2 text-[12.5px] text-neutral-500 transition-colors hover:text-white">
                Editar respuestas
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-baseline justify-between px-0.5">
              <h1 className="text-xl font-semibold tracking-tight text-white">{mode === 'edit' ? 'Tu check-in de hoy' : greeting()}</h1>
              <div className="flex items-baseline gap-3">
                <span className="text-[11.5px] text-neutral-500">{dateLabel}</span>
                <button onClick={close} className="text-[12.5px] text-neutral-500 transition-colors hover:text-white">
                  {mode === 'edit' ? 'Cancelar' : 'Más tarde'}
                </button>
              </div>
            </div>

            <Section icon={<Sun size={13} aria-hidden="true" />} label="Cómo amaneces" color="rgb(var(--c-brand-gold))">
              <div className="flex gap-2">
                {OVERALL.map(({ value, label, Icon, color }) => {
                  const on = answers.overall === value;
                  return (
                    <button
                      key={value}
                      onClick={() => patch({ overall: on ? null : value })}
                      aria-pressed={on}
                      className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-medium transition-colors duration-200 ${on ? 'bg-white/[0.07] text-white' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}
                      style={on ? { borderColor: color } : undefined}
                    >
                      <Icon size={19} strokeWidth={2} style={{ color }} aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
              {answers.overall === 'bien' && (
                <button
                  onClick={() => save(answers)}
                  className="animate-section-in mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold motion-reduce:animate-none"
                  style={{ backgroundColor: 'rgb(var(--c-state-good) / 0.14)', color: GOOD }}
                >
                  Todo bien, empezar el día <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </Section>

            {activeFlags.map((flag) => (
              <section key={flag.id} className="flex items-center gap-2.5 rounded-2xl border bg-white/[0.03] px-3 py-2.5" style={{ borderColor: 'rgb(var(--c-state-hot) / 0.4)' }} aria-label={`Molestia: ${PAIN_AREA_LABEL[flag.area]}`}>
                <div className="shrink-0">
                  <p className={`flex items-center gap-1.5 ${LABEL}`} style={{ color: HOT }}>
                    <AlertTriangle size={12} aria-hidden="true" />
                    Molestia
                  </p>
                  <p className="mt-0.5 max-w-[5.5rem] text-sm font-semibold leading-tight text-neutral-100">{PAIN_AREA_LABEL[flag.area]}</p>
                </div>
                <div className="flex flex-1 gap-1.5" role="radiogroup" aria-label={`¿Cómo sigue ${PAIN_AREA_LABEL[flag.area].toLowerCase()}?`}>
                  {FOLLOW_UP.map(({ value, label }) => {
                    const on = followUps[flag.id] === value;
                    return (
                      <button
                        key={value}
                        role="radio"
                        aria-checked={on}
                        onClick={() =>
                          setFollowUps((f) => {
                            const next = { ...f };
                            if (on) delete next[flag.id];
                            else next[flag.id] = value;
                            return next;
                          })
                        }
                        className={`h-[34px] flex-1 rounded-full border px-1 text-[12.5px] font-medium transition-colors duration-200 ${on ? 'font-semibold text-black' : 'border-white/10 text-neutral-400 hover:text-white'}`}
                        style={on ? { backgroundColor: HOT, borderColor: HOT } : undefined}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            <Section icon={<Moon size={13} aria-hidden="true" />} label="Sueño" color={SLEEP} aside={answers.hours === undefined ? undefined : answers.hours >= SLEEP_OK_FROM ? 'Ideal' : `Menos de ${SLEEP_OK_FROM} h`}>
              <div className="flex items-center justify-between gap-2">
                <RoundButton onClick={() => stepHours(-0.5)} label="Menos horas">
                  <Minus size={15} />
                </RoundButton>
                <span className="num min-w-[4.75rem] text-center text-2xl font-semibold leading-none" style={{ color: answers.hours === undefined ? 'rgb(var(--c-white) / 0.3)' : 'rgb(var(--c-white))' }}>
                  {formatSleep(answers.hours ?? DEFAULT_HOURS)}
                </span>
                <RoundButton onClick={() => stepHours(0.5)} label="Más horas">
                  <Plus size={15} />
                </RoundButton>
                <span className="mx-0.5 h-7 w-px bg-white/10" aria-hidden="true" />
                <div className="flex gap-px" role="radiogroup" aria-label="Calidad del sueño">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} role="radio" aria-checked={answers.quality === n} aria-label={`${n} de 5`} onClick={() => patch({ quality: n })} className="flex p-0.5" style={{ color: answers.quality !== undefined && n <= answers.quality ? SLEEP : 'rgb(var(--c-white) / 0.2)' }}>
                      <Moon size={18} fill={answers.quality !== undefined && n <= answers.quality ? 'currentColor' : 'none'} strokeWidth={2} />
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <div className="flex gap-2">
              <Section icon={<Flame size={13} aria-hidden="true" />} label="Agujetas" color={MID} className="flex w-[148px] shrink-0 flex-col items-center !px-2">
                <BodyMap zones={answers.soreZones ?? {}} onCycle={cycleZone} />
                <p className="mt-1.5 flex gap-2.5 text-[11px] text-neutral-500">
                  <span>
                    <span style={{ color: SORE_COLOR[1] }}>●</span> leves
                  </span>
                  <span>
                    <span style={{ color: SORE_COLOR[2] }}>●</span> fuertes
                  </span>
                </p>
              </Section>
              <Section icon={<Brain size={13} aria-hidden="true" />} label="Mente" className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
                <Scale label="Estrés" words={['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto']} value={answers.stress} onChange={(v) => patch({ stress: v })} />
                <Scale label="Motivación" words={['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta']} value={answers.motivation} onChange={(v) => patch({ motivation: v })} />
                <div className="border-t border-white/[0.07] pt-2">
                  <p className={`mb-1.5 flex items-center gap-1.5 ${LABEL}`}>
                    <HeartPulse size={12} aria-hidden="true" />
                    Pulso en reposo
                  </p>
                  <div className="flex items-center justify-between">
                    <RoundButton onClick={() => stepHr(-1)} label="Menos pulsaciones" small>
                      <Minus size={14} />
                    </RoundButton>
                    <div className="text-center">
                      <p className="num text-lg font-semibold leading-none" style={{ color: answers.restingHr === undefined ? 'rgb(var(--c-white) / 0.3)' : 'rgb(var(--c-white))' }}>
                        {answers.restingHr ?? '—'} <span className="text-[11px] font-normal text-neutral-500">ppm</span>
                      </p>
                      {baseline !== null && <p className="mt-0.5 text-[10.5px] text-neutral-500">Tu media: {baseline}</p>}
                    </div>
                    <RoundButton onClick={() => stepHr(1)} label="Más pulsaciones" small>
                      <Plus size={14} />
                    </RoundButton>
                  </div>
                </div>
              </Section>
            </div>

            <div className="mt-auto pt-2">
              {answered ? (
                <button onClick={() => save(answers)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-orange text-[15px] font-semibold text-black shadow-md shadow-brand-orange/20 transition-colors hover:bg-brand-orange-dark">
                  Ver mi día <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <button onClick={close} className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 text-[15px] font-medium text-neutral-300 transition-colors hover:bg-white/5">
                  {mode === 'edit' ? 'Cerrar' : 'Más tarde'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
