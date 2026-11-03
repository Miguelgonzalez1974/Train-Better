import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, Check, CircleAlert, Moon, Sun, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { DayAdvice } from '../../engine/dayAdvice';
import { dayBalance, type DayBalance } from '../../engine/dayBalance';
import type { ReadinessScore } from '../../engine/readinessScore';
import { recoveryColor } from './RecoveryCard';
import { ACCENT as EFFORT, OVER, type StrainView } from './StrainRing';

export type DashTab = 'resumen' | 'esfuerzo' | 'preparacion' | 'sueno';
/** Lo que se abre al tocar un número del anillo: una pestaña, o la carga (que vive en el icono de arriba). */
export type RingTarget = 'esfuerzo' | 'preparacion' | 'carga';

const NEUTRAL = '#525252';
/** Variable de color de cada zona de carga (para componer `rgb(var(...) / alfa)` donde haga falta). */
export const ZONE_TOKEN: Record<AcwrResult['zone'], string> = {
  baja: '--c-state-cool',
  optima: '--c-state-good',
  moderada: '--c-state-mid',
  alta: '--c-state-low',
};
export const ZONE_COLOR: Record<AcwrResult['zone'], string> = {
  baja: `rgb(var(${ZONE_TOKEN.baja}))`,
  optima: `rgb(var(${ZONE_TOKEN.optima}))`,
  moderada: `rgb(var(${ZONE_TOKEN.moderada}))`,
  alta: `rgb(var(${ZONE_TOKEN.alta}))`,
};
export const ZONE_WORD: Record<AcwrResult['zone'], string> = { baja: 'Baja', optima: 'Óptima', moderada: 'Alta', alta: 'Muy alta' };

// Dos anillos completos que arrancan a las 12: el exterior es el esfuerzo (azul) y el interior la preparación (con el color
// de su nivel). El objetivo es un corchete fino por fuera del anillo del esfuerzo, entre tu mínimo y tu máximo.
const R_EFF = 40;
const R_PREP = 27;
const R_ZONE = 47.5;
const STROKE = 9;
const circ = (r: number) => 2 * Math.PI * r;

const STRONG = 'font-semibold text-neutral-100';

/** La frase de debajo del anillo, en lenguaje natural: dónde estás frente a tu objetivo y qué hacer con ello. */
function sentence(strain: StrainView, isToday: boolean): ReactNode {
  const { target, real, planned, fit, status } = strain;
  const range = (
    <strong className={STRONG}>
      {target.low}–{target.high}
    </strong>
  );
  let first: ReactNode;
  if (real !== null) {
    if (status === 'dentro')
      first = (
        <>
          {isToday ? 'Has cerrado el día' : 'Cerraste el día'} con <strong className={STRONG}>{real}</strong> de esfuerzo, dentro de tu objetivo ({range}).
        </>
      );
    else if (status === 'por-debajo')
      first = (
        <>
          {isToday ? 'Has cerrado' : 'Cerraste'} con <strong className={STRONG}>{real}</strong>, por debajo de tu objetivo ({range}): había margen.
        </>
      );
    else
      first = (
        <>
          {isToday ? 'Has llegado' : 'Llegaste'} a <strong className={STRONG}>{real}</strong>, <strong className={STRONG}>{real - target.high}</strong> por encima de tu objetivo ({range}).
          {isToday ? ' Mañana, con cuidado.' : ''}
        </>
      );
  } else if (planned && fit) {
    if (fit.fit === 'dentro')
      first = (
        <>
          Con <strong className={STRONG}>~{planned.strain}</strong> de esfuerzo previsto, la sesión de hoy encaja con tu objetivo ({range}).
        </>
      );
    else if (fit.fit === 'se-pasa')
      first = (
        <>
          La sesión de hoy se pasa <strong className={STRONG}>{fit.diff}</strong> de tu objetivo ({range}). Puedes ajustarla.
        </>
      );
    else first = <>La sesión de hoy te deja margen sobre tu objetivo ({range}).</>;
  } else if (isToday) {
    first = <>Hoy no hay sesión prevista. Si entrenas, tu objetivo es {range}.</>;
  } else {
    first = <>Ese día no registraste sesión. Tu objetivo habría sido {range}.</>;
  }

  return first;
}

const ADVICE_COLOR: Record<DayAdvice['tone'], string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  bad: 'rgb(var(--c-state-low))',
  info: 'rgb(var(--c-state-cool))',
  gold: 'rgb(var(--c-brand-gold))',
};

const ADVICE_ICON: Record<DayAdvice['icon'], LucideIcon> = {
  check: Check,
  bolt: Zap,
  down: ArrowDown,
  alert: CircleAlert,
  sun: Sun,
  moon: Moon,
  trophy: Trophy,
};

function AdviceGlyph({ icon }: { icon: DayAdvice['icon'] }) {
  const Icon = ADVICE_ICON[icon];
  return <Icon size={14} strokeWidth={2.75} />;
}

/** La marca del esfuerzo previsto sobre el anillo del esfuerzo: una raya discontinua que lo cruza (dentro del grupo girado, como los arcos). */
function PlannedTick({ planned }: { planned: number }) {
  const a = (Math.min(100, Math.max(0, planned)) / 100) * 2 * Math.PI;
  const point = (r: number) => ({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
  const from = point(R_EFF - STROKE / 2 - 0.3);
  const to = point(R_EFF + STROKE / 2 + 0.3);
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgb(var(--c-white) / 0.95)" strokeWidth={2} strokeLinecap="round" strokeDasharray="2.2 2.2" />;
}

/**
 * El cierre del día: con qué esfuerzo previsto se partía y cuál fue el real, en una barra de 0 a 100 con el objetivo como banda y
 * la marca de lo previsto; y, si cambió, la preparación de la mañana frente a la de ahora.
 */
function BalanceBox({ balance, target, isToday, notDone }: { balance: DayBalance; target: { low: number; high: number }; isToday: boolean; notDone?: string | null }) {
  const over = balance.tone === 'mid';
  const color = ADVICE_COLOR[balance.tone];
  const { planned, real, diff, prep } = balance;
  const sign = diff > 0 ? '+' : '−';
  return (
    <div className="mx-auto mt-5 max-w-[26rem] rounded-[14px] border border-white/10 bg-white/[0.06] px-3.5 py-3 text-[13px] leading-relaxed text-neutral-300">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
          aria-hidden="true"
        >
          {over ? <CircleAlert size={14} strokeWidth={2.75} /> : <Check size={14} strokeWidth={2.75} />}
        </span>
        <p>
          <strong className="font-bold" style={{ color }}>
            {balance.lead}
          </strong>{' '}
          Partías con <strong className={STRONG}>~{planned}</strong> de esfuerzo y {isToday ? 'has hecho' : 'hiciste'} <strong className={STRONG}>{real}</strong>
          {diff === 0 ? ' (justo lo previsto).' : ` (${sign}${Math.abs(diff)}).`}
        </p>
      </div>
      <div className="relative mx-0.5 mb-1.5 mt-8 h-2 rounded-full bg-white/[0.08]" role="img" aria-label={`Previsto ${planned}, hecho ${real}, objetivo ${target.low} a ${target.high}`}>
        <div className="absolute -bottom-1 -top-1 rounded-md border-[1.5px]" style={{ left: `${target.low}%`, width: `${target.high - target.low}%`, borderColor: 'rgb(var(--c-white) / 0.8)' }} />
        <div className="absolute bottom-0 left-0 top-0 rounded-full" style={{ width: `${Math.min(100, real)}%`, backgroundColor: over ? 'rgb(var(--c-state-mid))' : 'rgb(var(--c-state-cool))' }} />
        <div className="absolute -bottom-[5px] -top-[5px] w-0 border-l-2 border-dashed" style={{ left: `${Math.min(100, planned)}%`, borderColor: 'rgb(var(--c-white) / 0.9)' }}>
          <span className="absolute -top-[17px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-neutral-300">previsto {planned}</span>
        </div>
      </div>
      <div className="mx-0.5 flex justify-between text-[10px] text-neutral-500">
        <span>0</span>
        <span>
          objetivo {target.low}–{target.high}
        </span>
        <span>100</span>
      </div>
      {notDone && <p className="mt-3 border-t border-white/[0.08] pt-3 text-[12.5px] font-semibold text-neutral-300">{notDone}</p>}
      {prep && (
        <p className="mt-3 border-t border-white/[0.08] pt-3 text-[12.5px] text-neutral-400">
          Preparación <strong className={STRONG}>{prep.morning}</strong> por la mañana → <strong className={STRONG}>{prep.now}</strong> ahora.{' '}
          {prep.now < prep.morning ? 'La sesión suma carga, por eso baja.' : 'Se recalcula con la sesión de hoy.'}
        </p>
      )}
    </div>
  );
}

/**
 * El estado del día al estilo Whoop: dos anillos completos (esfuerzo por fuera en azul, preparación por dentro con el color
 * de su nivel), el número de cada uno a su lado, y debajo una frase que lo cuenta. El objetivo es un corchete fino por
 * fuera del anillo del esfuerzo: si el azul pasa de su final, te pasas (y ese tramo se pinta coral). Tocar un número abre su
 * pestaña con el detalle.
 */
export function DayRing({
  readiness,
  acwr,
  strain,
  start,
  notDone,
  checkIn,
  advice,
  rest,
  centerLabel,
  isToday,
  onOpenTab,
  onAdjust,
}: {
  readiness: ReadinessScore;
  acwr: AcwrResult;
  strain: StrainView;
  /** Con qué se partió el día (esfuerzo previsto anotado y preparación de la mañana): al cerrar el día se cuenta "partías con X y has hecho Y". */
  start?: { planned: number | null; prep: number | null } | null;
  /** Lo que no se hizo de la sesión ya cerrada, en una frase ("Sin el WOD, por la molestia."); null si se hizo todo. */
  notDone?: string | null;
  checkIn?: ReactNode;
  /** El consejo de hoy (ver `engine/dayAdvice.ts`); sin él, o en un día pasado, la frase habla del esfuerzo. */
  advice?: DayAdvice | null;
  /** El botón "Hoy descanso" (o su deshacer); sin él no se enseña. */
  rest?: { marked: boolean; onToggle: () => void };
  /** Lo que va en el centro del anillo: "Hoy", "Ayer" o el día. */
  centerLabel: string;
  isToday: boolean;
  onOpenTab: (target: RingTarget) => void;
  /** "Ajustar sesión": lleva a Planificación (otro WOD o una sesión ligera). */
  onAdjust?: () => void;
}) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    setFilled(false);
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, [centerLabel]);

  const { total } = readiness;
  const prepTint = total !== null ? recoveryColor(total) : NEUTRAL;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;
  const { target, planned, real } = strain;
  const shown = real !== null ? real : planned?.strain ?? null;
  const within = shown !== null ? Math.min(shown, target.high) : 0;
  const beyond = shown !== null && shown > target.high ? shown - target.high : 0;
  const opacity = real !== null ? 1 : 0.85;
  const balance = start ? dayBalance({ planned: start.planned, real, target, status: strain.status, isToday, prepMorning: start.prep, prepNow: total }) : null;

  const dash = (r: number, from: number, to: number) => {
    const len = filled ? (Math.max(0, to - from) / 100) * circ(r) : 0;
    return { strokeDasharray: `${len} ${circ(r)}`, strokeDashoffset: -((from / 100) * circ(r)) };
  };
  const slide = 'transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none';

  return (
    <section>
      {checkIn && <div className="mb-4">{checkIn}</div>}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        {/* Preparación */}
        <div className="flex flex-col items-end text-right">
          <button onClick={() => onOpenTab('preparacion')} className="flex flex-col items-end">
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em]" style={{ color: prepTint }}>
              Preparación
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: prepTint }}>
              {total !== null ? total : '—'}
              {total !== null && <span className="text-[0.5em] font-medium">%</span>}
            </span>
            {balance?.prep && <span className="mt-1.5 text-[11px] leading-tight text-neutral-500">{balance.prep.morning} por la mañana</span>}
          </button>
          {hasLoad ? (
            <button onClick={() => onOpenTab('carga')} className="mt-3 flex flex-col items-end">
              <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-neutral-500">Carga</span>
              <span className="flex items-center gap-1 text-sm font-semibold text-neutral-200">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ZONE_COLOR[acwr.zone] }} />
                {ZONE_WORD[acwr.zone]}
              </span>
            </button>
          ) : (
            total === null && <span className="mt-3 text-[11px] text-neutral-600">Sin datos</span>
          )}
        </div>

        {/* Los dos anillos */}
        <div className="relative aspect-square w-[min(44vw,9.5rem)]">
          <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" role="img" aria-label={`Preparación ${total ?? 'sin datos'}, esfuerzo ${shown ?? 'sin datos'}, objetivo ${target.low} a ${target.high}`}>
            <g transform="rotate(-90 50 50)">
              {/* Objetivo: corchete fino por fuera, de tu mínimo a tu máximo */}
              <circle
                cx="50"
                cy="50"
                r={R_ZONE}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                stroke="rgb(var(--c-white) / 0.85)"
                strokeDasharray={`${((target.high - target.low) / 100) * circ(R_ZONE)} ${circ(R_ZONE)}`}
                strokeDashoffset={-((target.low / 100) * circ(R_ZONE))}
              />
              {/* Esfuerzo (exterior) */}
              <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={STROKE} className="stroke-white/[0.07]" />
              {shown !== null && shown > 0 && (
                <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: EFFORT, opacity }} {...dash(R_EFF, 0, within)} className={slide} />
              )}
              {beyond > 0 && (
                <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: OVER, opacity }} {...dash(R_EFF, target.high - 0.6, shown ?? target.high)} className={slide} />
              )}
              {balance && <PlannedTick planned={balance.planned} />}
              {/* Preparación (interior) */}
              <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={STROKE} className="stroke-white/[0.07]" />
              {total !== null && (
                <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: prepTint }} {...dash(R_PREP, 0, total)} className={slide} />
              )}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{centerLabel}</span>
          </div>
        </div>

        {/* Esfuerzo y objetivo */}
        <div className="flex flex-col items-start text-left">
          <button onClick={() => onOpenTab('esfuerzo')} className="flex flex-col items-start">
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em]" style={{ color: EFFORT }}>
              Esfuerzo
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: beyond > 0 ? OVER : EFFORT }}>
              {shown !== null ? `${real === null ? '~' : ''}${shown}` : '—'}
            </span>
            {balance && (
              <span className="mt-1.5 text-[11px] leading-tight text-neutral-500">
                previsto <strong className="font-semibold text-neutral-300">~{balance.planned}</strong>
              </span>
            )}
          </button>
          <button onClick={() => onOpenTab('esfuerzo')} className="mt-3 flex flex-col items-start">
            <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-neutral-500">Objetivo</span>
            <span className="num text-sm font-semibold text-neutral-200">
              {target.low}–{target.high}
            </span>
          </button>
        </div>
      </div>

      {/* El consejo del día (solo hoy y antes de entrenar): una caja neutra con el icono y el verbo en el color del estado, y el motivo.
          Cerrado el día, o en un día pasado, el balance de esfuerzo. */}
      {balance ? (
        <BalanceBox balance={balance} target={target} isToday={isToday} notDone={notDone} />
      ) : advice && isToday && real === null ? (
        <div className="mx-auto mt-5 flex max-w-[26rem] items-start gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.06] px-3.5 py-3 text-[13px] leading-relaxed">
          <span
            className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ color: ADVICE_COLOR[advice.tone], backgroundColor: `color-mix(in srgb, ${ADVICE_COLOR[advice.tone]} 16%, transparent)` }}
            aria-hidden="true"
          >
            <AdviceGlyph icon={advice.icon} />
          </span>
          <p className="text-neutral-300">
            <strong className="font-bold" style={{ color: ADVICE_COLOR[advice.tone] }}>
              {advice.lead}
            </strong>
            {advice.reason && <> {advice.reason}</>}
          </p>
        </div>
      ) : (
        <p className="mx-auto mt-5 max-w-[23rem] text-center text-[13px] leading-relaxed text-neutral-400">
          {sentence(strain, isToday)}
          {real !== null && notDone ? <> {notDone}</> : null}
        </p>
      )}

      {/* "Hoy descanso": marca el día como descanso a propósito (no cuenta como día olvidado). Solo hoy y antes de entrenar. */}
      {rest && isToday && real === null && (
        <div className="mt-2.5 flex justify-center">
          <button
            onClick={rest.onToggle}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors duration-200 hover:bg-white/5 hover:text-neutral-200"
          >
            <Moon size={13} strokeWidth={2.5} aria-hidden="true" />
            {rest.marked ? 'Deshacer: voy a entrenar' : 'Hoy descanso'}
          </button>
        </div>
      )}

      {/* Si la sesión de hoy se pasa del objetivo, la decisión está aquí, no escondida en otra pestaña. */}
      {onAdjust && isToday && real === null && strain.fit?.fit === 'se-pasa' && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={onAdjust}
            className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors duration-200 hover:bg-white/5"
            style={{ borderColor: 'rgb(var(--c-state-mid) / 0.6)', color: OVER }}
          >
            Ajustar sesión <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
