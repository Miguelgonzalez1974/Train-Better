import { useEffect, useState, type ReactNode } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { DayAdvice } from '../../engine/dayAdvice';
import { dayBalance, type DayBalance } from '../../engine/dayBalance';
import type { ReadinessScore } from '../../engine/readinessScore';
import { isTraining, type DayEnergy } from './dayEnergy';
import { ACCENT as EFFORT, OVER, PLAN, type StrainView } from './StrainRing';
import type { ExplainId } from '../../engine/explainNumbers';
import { ZONE_WORD } from './loadWords';

/** El color de la preparación: los mismos tramos que recoveryColor, con tonos propios del aro (en el tema claro, más cercanos a los del oscuro). */
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
/** La palabra bajo la cifra de Preparación (las mismas del apartado Preparación: con ganas / normal / cansado). */
const PREP_WORD: Record<NonNullable<ReadinessScore['level']>, string> = { alta: 'Con ganas', normal: 'Normal', baja: 'Cansado' };

/** El aro de la energía: el círculo entero son 100 puntos. */
const R = 42;
const STROKE = 9;
const AROUND = 2 * Math.PI * R;

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

/**
 * El cierre del día: con qué esfuerzo previsto se partía y cuál fue el real, en una barra de 0 a 100 con el objetivo como banda y
 * la marca de lo previsto.
 */
export function BalanceBox({ balance, target, isToday, notDone }: { balance: DayBalance; target: { low: number; high: number }; isToday: boolean; notDone?: string | null }) {
  const over = balance.tone === 'mid';
  const color = over ? OVER : ADVICE_COLOR[balance.tone];
  const { planned, real, diff } = balance;
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
    </div>
  );
}

/** El signo de la energía: más pequeño que la cifra a la que acompaña. */
function Percent() {
  return <span className="ml-px text-[0.52em] font-semibold">%</span>;
}

/** Un tramo del aro, de `from` a `to` puntos (0 a 100), empezando arriba. */
function Arc({ from, to, color, opacity = 1, show }: { from: number; to: number; color: string; opacity?: number; show: boolean }) {
  const length = show ? (Math.max(0, to - from) / 100) * AROUND : 0;
  return (
    <circle
      cx="50"
      cy="50"
      r={R}
      fill="none"
      strokeWidth={STROKE}
      stroke={color}
      style={{ stroke: color }}
      opacity={opacity}
      strokeDasharray={`${length} ${AROUND}`}
      strokeDashoffset={-((from / 100) * AROUND)}
      className="transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none"
    />
  );
}

/**
 * El estado del día: un solo aro de energía, de un solo color. Lo fuerte es lo que te queda y el tramo suave, lo que ya no tienes de la energía
 * con la que saliste (el reparto por bloques va en las tarjetas). A la izquierda la preparación de la mañana (que no cambia) y la carga; a la
 * derecha el esfuerzo del día frente a tu objetivo. Todo lo que lleva % es energía. Tocar un número le pregunta a Rex de dónde sale.
 */
export function DayRing({
  readiness,
  acwr,
  strain,
  energy,
  start,
  notDone,
  dayKey,
  resting = false,
  isToday,
  onAsk,
  hintPending,
  onHintSeen,
}: {
  /** Rex aún no ha avisado de que los aros se tocan (lo dice el globo de la esquina): el aro late un par de veces. */
  hintPending: boolean;
  /** Se tocó algo por primera vez: la pista ya no hace falta. */
  onHintSeen: () => void;
  readiness: ReadinessScore;
  acwr: AcwrResult;
  strain: StrainView;
  /** El día contado en energía (ver `dayEnergy.ts`). */
  energy: DayEnergy;
  /** Con qué se partió un día pasado (esfuerzo previsto anotado): «partías con X y hiciste Y». */
  start?: { planned: number | null } | null;
  /** Lo que no se hizo de la sesión ya cerrada, en una frase ("Sin el WOD, por la molestia."); null si se hizo todo. */
  notDone?: string | null;
  /** El día que se enseña: al cambiar, el aro se vuelve a llenar. */
  dayKey: string;
  /** Hoy es un descanso elegido: no hay esfuerzo previsto que enseñar. */
  resting?: boolean;
  isToday: boolean;
  /** Tocar el aro o un número es preguntar a Rex de dónde sale: el Dashboard abre el panel de Rex con esa pregunta y su respuesta. */
  onAsk: (id: ExplainId) => void;
}) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    setFilled(false);
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, [dayKey]);
  const ask = (id: ExplainId) => {
    onAsk(id);
    if (hintPending) onHintSeen();
  };

  const { total } = readiness;
  const prepTint = total !== null ? ringPrepColor(total) : undefined;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;
  const { target, planned } = strain;
  const trained = energy.items.some((i) => i.done && isTraining(i));
  const effort = trained ? energy.effort : strain.real;
  const over = effort !== null && effort > target.high;
  const plannedValue = planned?.strain ?? null;
  const estimated = isToday && readiness.estimated && !trained && energy.gained === 0;
  const now = energy.energy;
  const word = now === null ? 'Sin datos' : estimated ? 'Estimada' : 'Energía';
  /** Con cuánta se salió, si ya queda menos: es el tramo suave del aro. */
  const started = now !== null && !estimated && energy.morning !== null && energy.morning > now ? energy.morning : null;
  const prepEstimated = isToday && readiness.estimated;
  const balance = !isToday && start ? dayBalance({ planned: start.planned, real: strain.real, target, status: strain.status, isToday, prepMorning: null, prepNow: total }) : null;

  return (
    <section>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 sm:gap-x-5">
        {/* Preparación */}
        <div className="flex flex-col items-end text-right">
          <button onClick={() => ask('preparacion')} className="-mx-1 flex flex-col items-end px-1 py-0.5">
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em] underline decoration-dotted decoration-1 underline-offset-[3px]" style={{ color: prepTint }}>
              Preparación
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: prepTint }} data-testid="prep-number">
              {total !== null ? (
                <>
                  {prepEstimated ? '~' : ''}
                  {total}
                  <Percent />
                </>
              ) : (
                '—'
              )}
            </span>
            {total !== null && readiness.level && (
              <span className="mt-1 text-[11px] font-semibold leading-tight" style={{ color: prepTint }} data-testid="prep-word">
                {PREP_WORD[readiness.level]}
              </span>
            )}
          </button>
          {hasLoad ? (
            <button onClick={() => ask('carga')} className="-mx-1 mt-3 flex flex-col items-end px-1 py-0.5">
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

        {/* El aro de la energía */}
        <button
          type="button"
          onClick={() => ask('energia')}
          aria-label={now === null ? 'Energía sin datos. Rex lo explica' : `Energía ${now} %${started === null ? '' : `, has salido con ${started} %`}. Rex lo explica`}
          className={`relative aspect-square w-[min(46vw,11rem)] rounded-full ${hintPending ? 'animate-ring-hint motion-reduce:animate-none' : ''}`}
          data-testid="energy-ring"
        >
          <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
            <g transform="rotate(-90 50 50)">
              <circle cx="50" cy="50" r={R} fill="none" strokeWidth={STROKE} className="stroke-white/[0.07]" />
              {now !== null && estimated && <circle cx="50" cy="50" r={R} fill="none" strokeWidth={STROKE} strokeDasharray="1.6 3" pathLength={100 * 4.6} style={{ stroke: 'rgb(var(--c-white) / 0.28)' }} />}
              {now !== null && !estimated && (
                <>
                  <Arc from={0} to={now} color="rgb(var(--c-white))" show={filled} />
                  {started !== null && <Arc from={now} to={started} color="rgb(var(--c-white))" opacity={0.28} show={filled} />}
                </>
              )}
            </g>
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-[2.75rem] font-bold leading-none tracking-tight text-white" data-testid="energy-number">
              {now === null ? (
                '—'
              ) : (
                <>
                  {estimated ? '~' : ''}
                  {now}
                  <Percent />
                </>
              )}
            </span>
            <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{word}</span>
          </span>
        </button>

        {/* Esfuerzo del día frente al objetivo */}
        <div className="flex flex-col items-start text-left">
          <button onClick={() => ask(effort === null ? 'esfuerzo' : 'realizado')} className="-mx-1 flex flex-col items-start px-1 py-0.5 text-left">
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.03em] underline decoration-dotted decoration-1 underline-offset-[3px]" style={{ color: over ? OVER : EFFORT }}>
              Esfuerzo
            </span>
            <span className="num mt-1 text-[2rem] font-semibold leading-none tracking-tight" style={{ color: over ? OVER : EFFORT }} data-testid="effort-number">
              {effort ?? 0}
            </span>
          </button>
          <button onClick={() => ask('objetivo')} className="-mx-1 flex w-full flex-col items-start px-1 py-0.5 text-left">
            <span className="relative mt-0.5 block h-[5px] w-full max-w-[4.5rem] rounded-full bg-white/[0.09]" aria-hidden="true">
              <span className="absolute inset-y-0 rounded-full bg-white/25" style={{ left: `${target.low}%`, width: `${target.high - target.low}%` }} />
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, effort ?? 0)}%`, background: over ? OVER : EFFORT }} />
            </span>
            <span className="mt-1 whitespace-nowrap text-[11px] text-neutral-500">
              obj. {target.low}–{target.high}
            </span>
          </button>
          {!resting && strain.real === null && plannedValue !== null && (
            <button onClick={() => ask('previsto')} className="-mx-1 mt-2 flex flex-col items-start px-1 py-0.5 text-left">
              <span className="text-[11px] font-semibold uppercase tracking-[0.03em] underline decoration-dotted decoration-1 underline-offset-[3px]" style={{ color: PLAN }}>
                Previsto
              </span>
              <span className="num text-lg font-semibold leading-none" style={{ color: PLAN }}>
                ~{plannedValue}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Hoy, Rex dice el consejo y el cierre del día. Un día pasado conserva el balance y la frase. */}
      {!isToday &&
        (balance ? (
          <BalanceBox balance={balance} target={target} isToday={isToday} notDone={notDone} />
        ) : (
          <p className="mx-auto mt-5 max-w-[23rem] text-center text-[13px] leading-relaxed text-neutral-400">
            {strain.real === null && energy.items.some((i) => i.kind === 'descanso') ? 'Ese día descansaste.' : sentence(strain, isToday)}
            {strain.real !== null && notDone ? <> {notDone}</> : null}
          </p>
        ))}
    </section>
  );
}
