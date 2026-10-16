import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { ReadinessScore } from '../../engine/readinessScore';
import { recoveryColor } from './RecoveryCard';
import { ACCENT as EFFORT, OVER, type StrainView } from './StrainRing';

export type DashTab = 'resumen' | 'esfuerzo' | 'preparacion' | 'carga';

const NEUTRAL = '#525252';
const ZONE_COLOR: Record<AcwrResult['zone'], string> = {
  baja: 'rgb(var(--c-state-cool))',
  optima: 'rgb(var(--c-state-good))',
  moderada: 'rgb(var(--c-state-hot))',
  alta: 'rgb(var(--c-state-low))',
};
const ZONE_WORD: Record<AcwrResult['zone'], string> = { baja: 'Baja', optima: 'Óptima', moderada: 'Alta', alta: 'Muy alta' };

// Dos anillos completos que arrancan a las 12: el exterior es el esfuerzo (azul) y el interior la preparación (con el color
// de su nivel). El objetivo es un corchete fino por fuera del anillo del esfuerzo, entre tu mínimo y tu máximo.
const R_EFF = 40;
const R_PREP = 27;
const R_ZONE = 47.5;
const STROKE = 9;
const circ = (r: number) => 2 * Math.PI * r;

const STRONG = 'font-semibold text-neutral-100';

/** La frase de debajo del anillo, en lenguaje natural: dónde estás frente a tu objetivo y qué hacer con ello. */
function sentence(strain: StrainView, readiness: ReadinessScore, acwr: AcwrResult, isToday: boolean): ReactNode {
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

  const total = readiness.total;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;
  const second =
    !isToday
      ? null
      : total !== null && total >= 65 && hasLoad && (acwr.zone === 'baja' || acwr.zone === 'optima')
        ? 'Buen día para apretar.'
        : (total !== null && total <= 40) || (hasLoad && acwr.zone === 'alta')
          ? 'Hoy, mejor con cuidado.'
          : null;
  return (
    <>
      {first}
      {second && <> {second}</>}
    </>
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
  checkIn,
  centerLabel,
  isToday,
  onOpenTab,
  onAdjust,
}: {
  readiness: ReadinessScore;
  acwr: AcwrResult;
  strain: StrainView;
  checkIn?: ReactNode;
  /** Lo que va en el centro del anillo: "Hoy", "Ayer" o el día. */
  centerLabel: string;
  isToday: boolean;
  onOpenTab: (tab: Exclude<DashTab, 'resumen'>) => void;
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

  const dash = (r: number, from: number, to: number) => {
    const len = filled ? (Math.max(0, to - from) / 100) * circ(r) : 0;
    return { strokeDasharray: `${len} ${circ(r)}`, strokeDashoffset: -((from / 100) * circ(r)) };
  };
  const slide = 'transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none';

  return (
    <section>
      {checkIn && <div className="mb-4">{checkIn}</div>}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3.5">
        {/* Preparación */}
        <div className="flex flex-col items-end text-right">
          <button onClick={() => onOpenTab('preparacion')} className="flex flex-col items-end">
            <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: prepTint }}>
              Preparación
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: prepTint }}>
              {total !== null ? total : '—'}
              {total !== null && <span className="text-[0.5em] font-medium">%</span>}
            </span>
          </button>
          {hasLoad ? (
            <button onClick={() => onOpenTab('carga')} className="mt-3 flex flex-col items-end">
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Carga</span>
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
        <div className="relative aspect-square w-[min(50vw,10.25rem)]">
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
              {/* Preparación (interior) */}
              <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={STROKE} className="stroke-white/[0.07]" />
              {total !== null && (
                <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={STROKE} strokeLinecap="round" style={{ stroke: prepTint }} {...dash(R_PREP, 0, total)} className={slide} />
              )}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{centerLabel}</span>
          </div>
        </div>

        {/* Esfuerzo y objetivo */}
        <div className="flex flex-col items-start text-left">
          <button onClick={() => onOpenTab('esfuerzo')} className="flex flex-col items-start">
            <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: EFFORT }}>
              Esfuerzo
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: beyond > 0 ? OVER : EFFORT }}>
              {shown !== null ? `${real === null ? '~' : ''}${shown}` : '—'}
            </span>
          </button>
          <button onClick={() => onOpenTab('esfuerzo')} className="mt-3 flex flex-col items-start">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Objetivo</span>
            <span className="num text-sm font-semibold text-neutral-200">
              {target.low}–{target.high}
            </span>
          </button>
        </div>
      </div>

      <p className="mx-auto mt-5 max-w-[22rem] text-center text-[13px] leading-relaxed text-neutral-400">{sentence(strain, readiness, acwr, isToday)}</p>

      {/* Si la sesión de hoy se pasa del objetivo, la decisión está aquí, no escondida en otra pestaña. */}
      {onAdjust && isToday && real === null && strain.fit?.fit === 'se-pasa' && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={onAdjust}
            className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors duration-200 hover:bg-white/5"
            style={{ borderColor: 'rgb(var(--c-over) / 0.6)', color: OVER }}
          >
            Ajustar sesión <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
