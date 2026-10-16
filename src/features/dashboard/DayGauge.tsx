import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { ReadinessScore } from '../../engine/readinessScore';
import type { ReadinessLearning } from '../../engine/readinessLearning';
import { LearnedInsights } from './LearnedInsights';
import { AcwrGauge } from './AcwrGauge';
import { RecoveryDetail } from './RecoveryCard';
import { StrainDetail, strainColor, strainVerdict, tok, type StrainView } from './StrainRing';

type Open = 'prep' | 'objective' | 'strain' | 'load';

const LEVEL_SHORT = { alta: 'Con ganas', normal: 'Normal', baja: 'Cansado' } as const;
const ZONE_COLOR: Record<AcwrResult['zone'], string> = {
  baja: 'rgb(var(--c-state-cool))',
  optima: 'rgb(var(--c-state-good))',
  moderada: 'rgb(var(--c-state-hot))',
  alta: 'rgb(var(--c-state-low))',
};
const ZONE_WORD: Record<AcwrResult['zone'], string> = { baja: 'Carga baja', optima: 'Carga óptima', moderada: 'Carga alta', alta: 'Carga muy alta' };

// Medidor abierto de 270° (la abertura queda abajo). Un valor 0-100 recorre el arco de -135° a +135° desde las 12.
const SWEEP = 270;
const START_DEG = -135;
const R_OBJ = 45;
const R_EFF = 37;
const R_PREP = 30;
const circ = (r: number) => 2 * Math.PI * r;
const arcLen = (r: number) => (SWEEP / 360) * circ(r);
const valueDeg = (v: number) => START_DEG + (Math.min(100, Math.max(0, v)) / 100) * SWEEP;

/** Color del objetivo en un punto: verde hasta el mínimo y de ahí degradado (verde, amarillo, rojo) hasta el máximo. */
function objectiveColor(value: number, low: number, high: number): string {
  if (value < low) return tok('good');
  const t = high > low ? Math.min(1, (value - low) / (high - low)) : 1;
  const mix = (from: 'good' | 'mid', to: 'mid' | 'low', p: number) => `color-mix(in srgb, ${tok(to)} ${Math.round(p)}%, ${tok(from)})`;
  return t < 0.5 ? mix('good', 'mid', t * 200) : mix('mid', 'low', (t - 0.5) * 200);
}

/** Trocitos del arco entre `from` y `to` (puntos 0-100) con el color de cada uno; el solape evita rendijas. */
function arcSegments(from: number, to: number, r: number, strokeWidth: number, color: (v: number) => string) {
  const out = [];
  const step = 1.5;
  for (let v = from; v < to; v += step) {
    const end = Math.min(to, v + step);
    const len = ((end - v) / 100) * arcLen(r) + 0.3;
    out.push(
      <circle
        key={`${r}-${v}`}
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        style={{ stroke: color(v + step / 2) }}
        strokeDasharray={`${len} ${circ(r)}`}
        strokeDashoffset={-((v / 100) * arcLen(r))}
      />,
    );
  }
  return out;
}

/** Una marca fina que cruza un anillo en el punto `value`. */
function mark(value: number, r: number, half: number) {
  const a = (valueDeg(value) * Math.PI) / 180;
  const x = (rr: number) => 50 + rr * Math.sin(a);
  const y = (rr: number) => 50 - rr * Math.cos(a);
  return <line key={value} x1={x(r - half)} y1={y(r - half)} x2={x(r + half)} y2={y(r + half)} stroke="rgb(var(--c-white))" strokeOpacity={0.8} strokeWidth={1} strokeLinecap="round" />;
}

/**
 * El estado del día en un medidor abierto de 270°, de fuera hacia dentro: el objetivo (de cero a tu máximo, fino, verde
 * hasta el mínimo y degradado a rojo, con una marca en cada extremo), tu esfuerzo (azul, con un punto luminoso donde
 * llegas) y tu preparación (blanco, muy fino). Debajo, el veredicto en una cápsula y una franja con los tres números
 * (tocar uno abre su detalle). La carga es un botón.
 */
export function DayGauge({
  readiness,
  learning,
  acwr,
  trend,
  strain,
  checkIn,
  onAdjustSession,
}: {
  readiness: ReadinessScore;
  learning: ReadinessLearning;
  acwr: AcwrResult;
  trend: (number | null)[];
  strain: StrainView;
  checkIn?: ReactNode;
  onAdjustSession: () => void;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const toggle = (k: Open) => setOpen((cur) => (cur === k ? null : k));
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { total, level } = readiness;
  const hasLoad = acwr.acwr !== null && !acwr.coldStart;
  const { target, planned, real } = strain;
  const shown = real !== null ? real : planned?.strain ?? null;
  const verdictColor = strainColor(strain);

  const grow = (r: number, v: number) => (filled ? (Math.min(100, Math.max(0, v)) / 100) * arcLen(r) : 0);
  const slide = 'transition-[stroke-dasharray] duration-[900ms] ease-out motion-reduce:transition-none';

  return (
    <section>
      {checkIn && <div className="mb-4">{checkIn}</div>}

      <div className="relative mx-auto aspect-[100/92] w-full max-w-[19rem]">
        <svg viewBox="0 0 100 92" className="h-full w-full overflow-visible" role="img" aria-label={`Preparación ${total ?? 'sin datos'}, objetivo de esfuerzo ${target.low} a ${target.high}, esfuerzo ${shown ?? 'sin datos'}`}>
          {/* El arco empieza abajo a la izquierda (-135° desde las 12): se rota 135° (el trazo del círculo nace a las 3). */}
          <g transform="rotate(135 50 50)">
            {/* Objetivo: de cero al máximo */}
            <circle cx="50" cy="50" r={R_OBJ} fill="none" strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${arcLen(R_OBJ)} ${circ(R_OBJ)}`} className="stroke-white/[0.07]" />
            {arcSegments(0, target.high, R_OBJ, 3.5, (v) => objectiveColor(v, target.low, target.high))}
            {/* Esfuerzo */}
            <circle cx="50" cy="50" r={R_EFF} fill="none" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${arcLen(R_EFF)} ${circ(R_EFF)}`} className="stroke-white/[0.07]" />
            {shown !== null && (
              <circle
                cx="50"
                cy="50"
                r={R_EFF}
                fill="none"
                strokeWidth={5}
                strokeLinecap="round"
                style={{ stroke: tok('cool'), opacity: real !== null ? 1 : 0.75, filter: 'drop-shadow(0 0 2.5px rgb(var(--c-state-cool) / 0.55))' }}
                strokeDasharray={`${grow(R_EFF, shown)} ${circ(R_EFF)}`}
                className={slide}
              />
            )}
            {/* Preparación */}
            <circle cx="50" cy="50" r={R_PREP} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${arcLen(R_PREP)} ${circ(R_PREP)}`} className="stroke-white/[0.07]" />
            {total !== null && (
              <circle
                cx="50"
                cy="50"
                r={R_PREP}
                fill="none"
                strokeWidth={2.5}
                strokeLinecap="round"
                style={{ stroke: 'rgb(var(--c-white) / 0.9)' }}
                strokeDasharray={`${grow(R_PREP, total)} ${circ(R_PREP)}`}
                className={slide}
              />
            )}
          </g>
          {/* Marcas del objetivo (mínimo y máximo) */}
          {mark(target.low, R_OBJ, 4.5)}
          {mark(target.high, R_OBJ, 4.5)}
        </svg>

        {/* Número central y, en la abertura de abajo, qué es */}
        <div className="absolute inset-x-0 top-[34%] flex flex-col items-center">
          <span className="num text-[clamp(2.4rem,13vw,3.4rem)] font-semibold leading-none tracking-tight text-white">
            {shown !== null ? `${real === null ? '~' : ''}${shown}` : '—'}
          </span>
          <span className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-500">{real !== null ? 'esfuerzo hoy' : 'esfuerzo previsto'}</span>
        </div>
      </div>

      {/* Veredicto en una cápsula */}
      <div className="-mt-1 flex justify-center">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold" style={{ color: verdictColor }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: verdictColor }} aria-hidden="true" />
          {strainVerdict(strain)}
        </p>
      </div>

      {/* Franja con los tres números */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] rounded-2xl bg-white/[0.03]">
        <Stat
          selected={open === 'prep'}
          onClick={() => toggle('prep')}
          label="Preparación"
          value={total !== null ? `${total}` : '—'}
          unit={total !== null ? '%' : undefined}
          note={level ? LEVEL_SHORT[level] : 'Sin datos'}
          line={<span className="block h-[3px] w-8 rounded-full bg-white/90" />}
        />
        <Stat
          selected={open === 'objective'}
          onClick={() => toggle('objective')}
          label="Objetivo"
          value={`${target.low}–${target.high}`}
          note={target.provisional && real === null ? 'provisional' : 'fijado hoy'}
          line={<span className="block h-[3px] w-8 rounded-full" style={{ background: `linear-gradient(90deg, ${tok('good')}, ${tok('mid')}, ${tok('low')})` }} />}
        />
        <Stat
          selected={open === 'strain'}
          onClick={() => toggle('strain')}
          label="Esfuerzo"
          value={shown !== null ? `${real === null ? '~' : ''}${shown}` : '—'}
          note={real !== null ? 'hecho hoy' : planned ? 'previsto' : 'sin sesión'}
          line={<span className="block h-[3px] w-8 rounded-full" style={{ backgroundColor: tok('cool') }} />}
        />
      </div>

      {hasLoad && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => toggle('load')}
            aria-pressed={open === 'load'}
            className="flex items-center gap-2 rounded-full border border-brand-border px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-white/5"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ZONE_COLOR[acwr.zone] }} />
            <span style={{ color: ZONE_COLOR[acwr.zone] }}>{ZONE_WORD[acwr.zone]}</span>
            <ChevronDown size={13} className={`text-neutral-500 transition-transform duration-200 ${open === 'load' ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
      )}

      {open && (
        <div className="mt-3 animate-section-in rounded-2xl bg-white/[0.03] p-5 motion-reduce:animate-none">
          {open === 'prep' && (
            <div className="flex flex-col gap-7">
              <RecoveryDetail readiness={readiness} />
              <LearnedInsights learning={learning} />
            </div>
          )}
          {(open === 'objective' || open === 'strain') && <StrainDetail view={strain} onAdjust={onAdjustSession} />}
          {open === 'load' && <AcwrGauge result={acwr} trend={trend} />}
        </div>
      )}
    </section>
  );
}

function Stat({
  selected,
  onClick,
  label,
  value,
  unit,
  note,
  line,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  value: string;
  unit?: string;
  note: string;
  line: ReactNode;
}) {
  return (
    <button onClick={onClick} aria-pressed={selected} className={`flex flex-col items-center px-1.5 py-3.5 transition-colors first:rounded-l-2xl last:rounded-r-2xl ${selected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{label}</span>
      <span className="num mt-1.5 text-[1.45rem] font-semibold leading-none tracking-tight text-white">
        {value}
        {unit && <span className="ml-0.5 text-[0.55em] font-medium text-neutral-400">{unit}</span>}
      </span>
      <span className="mt-2 flex h-[3px] items-center">{line}</span>
      <span className="mt-1.5 text-[11px] text-neutral-500">{note}</span>
    </button>
  );
}
