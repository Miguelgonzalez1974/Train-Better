import { useEffect, useId, useState, type ReactNode } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { DayAdvice } from '../../engine/dayAdvice';
import { dayBalance, type DayBalance } from '../../engine/dayBalance';
import type { ReadinessScore } from '../../engine/readinessScore';
import { ACCENT as EFFORT, OVER, PLAN, type StrainView } from './StrainRing';
import type { ExplainAction, ExplainId, Explanation } from '../../engine/explainNumbers';
import { RexExplainBubble, RexHint } from './RexExplainBubble';
import { markRingHintSeen, ringHintSeen } from '../../lib/ringHint';

export type DashTab = 'resumen' | 'esfuerzo' | 'preparacion' | 'sueno';
/** Lo que se abre al tocar un número del anillo: una pestaña, o la carga (que vive en el icono de arriba). */
export type RingTarget = 'esfuerzo' | 'preparacion' | 'carga';

const NEUTRAL = '#525252';

/** El color del aro de preparación: los mismos tramos que recoveryColor, con tonos propios del aro (en el tema claro, más cercanos a los del oscuro). */
function ringPrepColor(score: number): string {
  return score >= 65 ? 'rgb(var(--c-ring-good))' : score <= 40 ? 'rgb(var(--c-ring-low))' : 'rgb(var(--c-ring-mid))';
}
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

// Dos anillos completos que arrancan a las 12: el exterior es el esfuerzo (amarillo, con lo previsto como línea azul) y el interior la preparación (con el color
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

/** Grosor de la línea del previsto y de su borde oscuro (para que se lea sobre el azul de lo hecho). */
const PLAN_LINE = 1.8;
const PLAN_HALO = 3.6;
const RING_BG = 'rgb(var(--c-brand-bg))';

/** El final de la línea del previsto: una marca que cruza el aro, con borde oscuro (dentro del grupo girado, como los arcos). */
function PlannedEnd({ planned }: { planned: number }) {
  const a = (Math.min(100, Math.max(0, planned)) / 100) * 2 * Math.PI;
  const point = (r: number) => ({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
  const from = point(R_EFF - STROKE / 2 - 0.7);
  const to = point(R_EFF + STROKE / 2 + 0.7);
  return (
    <>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={RING_BG} strokeWidth={PLAN_HALO} strokeLinecap="round" />
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={PLAN} strokeWidth={PLAN_LINE + 0.2} strokeLinecap="round" />
    </>
  );
}

/** Ancho aproximado de un carácter del texto del arco, en unidades del aro (para saber si «Obj.» cabe). */
const CHAR_WIDTH = 7.2 * 0.56;

/**
 * El rango del objetivo escrito sobre su corchete, siguiendo la curva del aro. En la mitad de arriba se lee por fuera del aro; en la de
 * abajo, por dentro de la curva (si no, saldría del revés). Va fuera del grupo girado: los ángulos se miden desde las 12 en sentido horario.
 */
function ObjectiveLabel({ id, low, high, onTap }: { id: string; low: number; high: number; onTap: () => void }) {
  const lower = Math.cos(((low + high) / 2 / 100) * 2 * Math.PI) < 0;
  const r = lower ? 56.5 : 51.6;
  const at = (pct: number) => {
    const a = (pct / 100) * 2 * Math.PI;
    return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
  };
  const start = at(lower ? high : low);
  const end = at(lower ? low : high);
  const large = high - low > 50 ? 1 : 0;
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${lower ? 0 : 1} ${end.x} ${end.y}`;
  // «Obj. 10–30» si cabe en el arco (con un poco de holgura); con un rango muy estrecho, solo los números.
  const numbers = `${low}–${high}`;
  const arcLength = r * ((high - low) / 100) * 2 * Math.PI;
  const text = arcLength >= (numbers.length + 5) * CHAR_WIDTH * 1.15 ? `Obj. ${numbers}` : numbers;
  return (
    <>
      <defs>
        <path id={id} d={d} />
      </defs>
      {/* Zona táctil del texto del objetivo: Rex lo explica */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        strokeLinecap="round"
        pointerEvents="stroke"
        role="button"
        tabIndex={0}
        aria-label="Rex explica el objetivo"
        onClick={onTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTap();
          }
        }}
        className="cursor-pointer outline-none"
      />
      <text fontSize={7.2} fontWeight={500} fill="rgb(var(--c-white) / 0.85)" className="num">
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
    </>
  );
}

/**
 * El cierre del día: con qué esfuerzo previsto se partía y cuál fue el real, en una barra de 0 a 100 con el objetivo como banda y
 * la marca de lo previsto; y, si cambió, la preparación de la mañana frente a la de ahora.
 */
export function BalanceBox({ balance, target, isToday, notDone }: { balance: DayBalance; target: { low: number; high: number }; isToday: boolean; notDone?: string | null }) {
  const over = balance.tone === 'mid';
  const color = over ? OVER : ADVICE_COLOR[balance.tone];
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
          Partías con <strong className="font-semibold" style={{ color: PLAN }}>~{planned}</strong> de esfuerzo y {isToday ? 'has hecho' : 'hiciste'} <strong className={STRONG}>{real}</strong>
          {diff === 0 ? ' (justo lo previsto).' : ` (${sign}${Math.abs(diff)}).`}
        </p>
      </div>
      <div className="relative mx-0.5 mb-1.5 mt-8 h-2 rounded-full bg-white/[0.08]" role="img" aria-label={`Previsto ${planned}, hecho ${real}, objetivo ${target.low} a ${target.high}`}>
        <div className="absolute -bottom-1 -top-1 rounded-md border-[1.5px]" style={{ left: `${target.low}%`, width: `${target.high - target.low}%`, borderColor: 'rgb(var(--c-white) / 0.8)' }} />
        <div className="absolute bottom-0 left-0 top-0 rounded-full" style={{ width: `${Math.min(100, real)}%`, backgroundColor: over ? OVER : EFFORT }} />
        <div className="absolute -bottom-[5px] -top-[5px] w-0 border-l-2 border-dashed" style={{ left: `${Math.min(100, planned)}%`, borderColor: PLAN }}>
          <span className="absolute -top-[17px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold" style={{ color: PLAN }}>previsto {planned}</span>
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
 * El estado del día al estilo Whoop: dos anillos completos (esfuerzo por fuera en amarillo, preparación por dentro con el color
 * de su nivel), el número de cada uno a su lado, y debajo una frase que lo cuenta. El objetivo es un corchete fino por
 * fuera del anillo del esfuerzo: si el amarillo pasa de su final, te pasas (y ese tramo se pinta rojo). Tocar un número abre su
 * pestaña con el detalle.
 */
export function DayRing({
  readiness,
  acwr,
  strain,
  start,
  notDone,
  centerLabel,
  isToday,
  explanations,
  onExplainAction,
}: {
  readiness: ReadinessScore;
  acwr: AcwrResult;
  strain: StrainView;
  /** Con qué se partió el día (esfuerzo previsto anotado y preparación de la mañana): al cerrar el día se cuenta "partías con X y has hecho Y". */
  start?: { planned: number | null; prep: number | null } | null;
  /** Lo que no se hizo de la sesión ya cerrada, en una frase ("Sin el WOD, por la molestia."); null si se hizo todo. */
  notDone?: string | null;
  /** Lo que va en el centro del anillo: "Hoy", "Ayer" o el día. */
  centerLabel: string;
  isToday: boolean;
  /** Lo que Rex cuenta de cada número al tocarlo («Pregúntale a Rex»). */
  explanations: Partial<Record<ExplainId, Explanation>>;
  /** Lo que hace cada botón de la explicación (abrir una pestaña, la carga o Planificación). */
  onExplainAction: (action: ExplainAction) => void;
}) {
  const [filled, setFilled] = useState(false);
  // El número por el que se ha preguntado a Rex (su globo sale bajo los anillos); se cierra al cambiar de día.
  const [asked, setAsked] = useState<ExplainId | null>(null);
  useEffect(() => {
    setFilled(false);
    setAsked(null);
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, [centerLabel]);
  // La pista de Rex («Toca un aro o un número…») sale hasta el primer toque y no vuelve.
  const [hintSeen, setHintSeen] = useState(() => ringHintSeen(typeof window !== 'undefined' ? window.localStorage : null));
  const ask = (id: ExplainId) => {
    setAsked((cur) => (cur === id ? null : id));
    if (!hintSeen) {
      setHintSeen(true);
      markRingHintSeen(typeof window !== 'undefined' ? window.localStorage : null);
    }
  };
  const askedExplanation = asked ? explanations[asked] : undefined;
  const askedAnchor: 'left' | 'center' | 'right' = asked === 'preparacion' || asked === 'carga' ? 'left' : asked === 'objetivo' ? 'center' : 'right';
  /** Un aro tocable: la zona táctil es un círculo transparente más ancho que el aro, y se maneja también con el teclado. */
  const ringHit = (r: number, id: ExplainId, label: string) => (
    <circle
      cx="50"
      cy="50"
      r={r}
      fill="none"
      stroke="transparent"
      strokeWidth={13}
      pointerEvents="stroke"
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={asked === id}
      onClick={() => ask(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ask(id);
        }
      }}
      className="cursor-pointer outline-none focus-visible:stroke-white/20"
    />
  );
  const asking = (id: ExplainId) => (asked === id ? 'rounded-lg bg-white/10' : '');

  const { total } = readiness;
  const prepTint = total !== null ? ringPrepColor(total) : NEUTRAL;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;
  const { target, planned, real } = strain;
  const labelId = `obj${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // Lo hecho (aro amarillo, y rojo lo que pasa del objetivo) y lo previsto (línea fina azul por el centro del aro, del 0 a su valor).
  const within = real !== null ? Math.min(real, target.high) : 0;
  const beyond = real !== null && real > target.high ? real - target.high : 0;
  const balance = start ? dayBalance({ planned: start.planned, real, target, status: strain.status, isToday, prepMorning: start.prep, prepNow: total }) : null;
  const plannedLine = real !== null ? (balance ? balance.planned : null) : planned?.strain ?? null;
  /** El color de lo realizado: amarillo, y rojo si ya pasa del máximo del objetivo. */
  const doneColor = beyond > 0 ? OVER : EFFORT;
  /** Hasta dónde llega lo hecho sobre el aro (0 antes de entrenar): la línea del previsto solo se ve a partir de ahí. */
  const doneTo = real ?? 0;

  const dash = (r: number, from: number, to: number) => {
    const len = filled ? (Math.max(0, to - from) / 100) * circ(r) : 0;
    return { strokeDasharray: `${len} ${circ(r)}`, strokeDashoffset: -((from / 100) * circ(r)) };
  };
  const slide = 'transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none';

  return (
    <section>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-5 gap-y-2.5">
        {/* Preparación */}
        <div className="flex flex-col items-end text-right">
          <button onClick={() => ask('preparacion')} aria-expanded={asked === 'preparacion'} className={`flex flex-col items-end -mx-1 px-1 py-0.5 ${asking('preparacion')}`}>
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em] underline decoration-dotted decoration-1 underline-offset-[3px]" style={{ color: prepTint }}>
              Preparación
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: prepTint }}>
              {total !== null ? total : '—'}
              {total !== null && <span className="text-[0.5em] font-medium">%</span>}
            </span>
            {balance?.prep && <span className="mt-1.5 text-[11px] leading-tight text-neutral-500">{balance.prep.morning} por la mañana</span>}
          </button>
          {hasLoad ? (
            <button onClick={() => ask('carga')} aria-expanded={asked === 'carga'} className={`mt-3 flex flex-col items-end -mx-1 px-1 py-0.5 ${asking('carga')}`}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-neutral-500 underline decoration-dotted decoration-1 underline-offset-[3px]">Carga</span>
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
          <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" role="group" aria-label={`Preparación ${total ?? 'sin datos'}, esfuerzo ${real ?? 'sin entrenar'}${plannedLine !== null ? `, previsto ${plannedLine}` : ''}, objetivo ${target.low} a ${target.high}`}>
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
              {/* Lo hecho: el aro azul (y en ámbar lo que pasa del máximo del objetivo). Antes de entrenar, vacío. */}
              {real !== null && real > 0 && (
                <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: EFFORT }} {...dash(R_EFF, 0, within)} className={slide} />
              )}
              {beyond > 0 && (
                <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: OVER }} {...dash(R_EFF, target.high - 0.6, real ?? target.high)} className={slide} />
              )}
              {/* Lo previsto: una línea fina fucsia que solo se ve donde el azul aún no llega (lo que falta); donde el azul la cubre, el aro es
                  macizo. La marca del final se queda siempre, también cuando lo hecho la pasa. */}
              {plannedLine !== null && plannedLine > 0 && (
                <>
                  {plannedLine > doneTo && (
                    <>
                      <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={PLAN_HALO} strokeLinecap={doneTo > 0 ? 'butt' : 'round'} style={{ stroke: RING_BG }} {...dash(R_EFF, doneTo, plannedLine)} className={slide} />
                      <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={PLAN_LINE} strokeLinecap={doneTo > 0 ? 'butt' : 'round'} style={{ stroke: PLAN }} {...dash(R_EFF, doneTo, plannedLine)} className={slide} />
                    </>
                  )}
                  <PlannedEnd planned={plannedLine} />
                </>
              )}
              {/* Preparación (interior) */}
              <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={STROKE} className="stroke-white/[0.07]" />
              {total !== null && (
                <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: prepTint }} {...dash(R_PREP, 0, total)} className={slide} />
              )}
            </g>
            {/* Objetivo: el rango escrito sobre su corchete, girando con él */}
            <ObjectiveLabel id={labelId} low={target.low} high={target.high} onTap={() => ask('objetivo')} />
            {/* Zonas táctiles de los aros: el de dentro explica la preparación y el de fuera, el esfuerzo entero (realizado, previsto y objetivo) */}
            {ringHit(R_PREP, 'preparacion', 'Rex explica la preparación')}
            {ringHit(R_EFF, 'esfuerzo', 'Rex explica el esfuerzo')}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{centerLabel}</span>
          </div>
        </div>

        {/* Esfuerzo: lo realizado y lo previsto, siempre a la vista, cada uno con el color que tiene en el aro. El objetivo va escrito sobre el arco. */}
        <div className="flex flex-col items-start text-left">
          <button onClick={() => ask('realizado')} aria-expanded={asked === 'realizado'} className={`flex flex-col items-start text-left -mx-1 px-1 py-0.5 ${asking('realizado')}`}>
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em] underline decoration-dotted decoration-1 underline-offset-[3px]" style={{ color: doneColor }}>
              Realizado
            </span>
            <span className="num text-[2rem] font-semibold leading-none tracking-tight" style={{ color: doneColor }}>
              {real !== null ? real : '—'}
            </span>
          </button>
          <button onClick={() => ask('previsto')} aria-expanded={asked === 'previsto'} className={`mt-2.5 flex flex-col items-start text-left -mx-1 px-1 py-0.5 ${asking('previsto')}`}>
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em] underline decoration-dotted decoration-1 underline-offset-[3px]" style={{ color: PLAN }}>
              Previsto
            </span>
            <span className="num text-xl font-semibold leading-none tracking-tight" style={{ color: PLAN }}>
              {plannedLine !== null ? `~${plannedLine}` : '—'}
            </span>
          </button>
        </div>
      </div>

      {/* Pregúntale a Rex: el globo con la explicación del número tocado */}
      {!askedExplanation && !hintSeen && <RexHint />}
      {askedExplanation && <RexExplainBubble explanation={askedExplanation} anchor={askedAnchor} onAction={onExplainAction} onClose={() => setAsked(null)} />}

      {/* Hoy, Rex dice el consejo y el cierre del día (RexBar): aquí solo quedan los anillos. Un día pasado conserva el balance y la frase. */}
      {!isToday &&
        (balance ? (
          <BalanceBox balance={balance} target={target} isToday={isToday} notDone={notDone} />
        ) : (
          <p className="mx-auto mt-5 max-w-[23rem] text-center text-[13px] leading-relaxed text-neutral-400">
            {sentence(strain, isToday)}
            {real !== null && notDone ? <> {notDone}</> : null}
          </p>
        ))}
    </section>
  );
}
