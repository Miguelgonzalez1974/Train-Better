import { useEffect, useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { StrainTarget } from '../../data/athlete/types';
import type { PlannedStrain, PlanFit } from '../../engine/plannedStrain';
import type { StrainStatus } from '../../engine/strain';
import type { StrainLearning } from '../../engine/strainLearning';
import { SectionLabel } from '../shell/SectionLabel';

/** Todo lo que el anillo y su detalle necesitan saber del esfuerzo de hoy. */
export interface StrainView {
  target: StrainTarget;
  /** Esfuerzo que cuesta la sesión de hoy (null si no hay sesión o ya se entrenó). */
  planned: PlannedStrain | null;
  fit: { fit: PlanFit; diff: number } | null;
  /** Esfuerzo real de hoy, una vez entrenado. */
  real: number | null;
  status: StrainStatus;
  /** Lo que el coach ha aprendido de tus aciertos y fallos (ver `learnStrain`). */
  learning: StrainLearning;
}

const STATUS_COLOR: Record<StrainStatus, string> = {
  'sin-entrenar': 'rgb(var(--c-white) / 0.5)',
  'por-debajo': 'rgb(var(--c-state-cool))',
  dentro: 'rgb(var(--c-state-good))',
  pasado: 'rgb(var(--c-state-hot))',
};
const FIT_COLOR: Record<PlanFit, string> = {
  dentro: 'rgb(var(--c-state-good))',
  'se-pasa': 'rgb(var(--c-state-hot))',
  'se-queda-corta': 'rgb(var(--c-state-cool))',
};

/** El color que manda: el del resultado real si ya entrenaste; si no, el de cómo encaja la sesión prevista. */
export function strainColor(v: StrainView): string {
  if (v.real !== null) return STATUS_COLOR[v.status];
  return v.fit ? FIT_COLOR[v.fit.fit] : STATUS_COLOR['sin-entrenar'];
}

/** La palabra de estado bajo el anillo. */
export function strainWord(v: StrainView): string {
  if (v.real !== null) {
    if (v.status === 'dentro') return 'Dentro del objetivo';
    if (v.status === 'por-debajo') return 'Por debajo';
    return 'Te pasaste';
  }
  if (!v.fit) return 'Sin sesión';
  if (v.fit.fit === 'dentro') return 'Encaja';
  if (v.fit.fit === 'se-pasa') return `Se pasa ${v.fit.diff}`;
  return 'Con margen';
}

const R = 45;
const C = 2 * Math.PI * R;
const R_INNER = 34;
const C_INNER = 2 * Math.PI * R_INNER;

type Token = 'cool' | 'good' | 'mid' | 'low';
const tok = (t: Token) => `rgb(var(--c-state-${t}))`;
const mix = (from: Token, to: Token, pctTo: number) => `color-mix(in srgb, ${tok(to)} ${Math.round(pctTo)}%, ${tok(from)})`;

/**
 * El color de cada punto de la escala de esfuerzo según el objetivo: verde desde cero hasta el mínimo, y desde ahí se va
 * degradando (verde, amarillo, rojo) hasta el máximo; por encima del máximo, rojo. Los dos anillos usan la misma escala,
 * así que el color donde acaba tu esfuerzo dice de un vistazo cuánto margen queda.
 */
function scaleColor(value: number, low: number, high: number): string {
  if (value < low) return tok('good');
  if (value >= high) return tok('low');
  const t = high > low ? (value - low) / (high - low) : 0;
  return t < 0.5 ? mix('good', 'mid', t * 200) : mix('mid', 'low', (t - 0.5) * 200);
}

/** Trocitos de la escala entre `from` y `to` (en puntos 0-100), cada uno con su color; el solape evita rendijas entre ellos. */
function scaleSegments(from: number, to: number, step: number, r: number, c: number, strokeWidth: number, low: number, high: number) {
  const out = [];
  for (let v = from; v < to; v += step) {
    const end = Math.min(to, v + step);
    const len = ((end - v) / 100) * c + 0.4;
    out.push(
      <circle
        key={`${r}-${v}`}
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        style={{ stroke: scaleColor(v + step / 2, low, high) }}
        strokeDasharray={`${len} ${c}`}
        strokeDashoffset={-((v / 100) * c)}
      />,
    );
  }
  return out;
}

/** Una marca fina que cruza el anillo exterior en el punto `value`. */
function tick(value: number) {
  const a = (value / 100) * 2 * Math.PI;
  const x = (r: number) => 50 + r * Math.cos(a);
  const y = (r: number) => 50 + r * Math.sin(a);
  return <line key={value} x1={x(40)} y1={y(40)} x2={x(50)} y2={y(50)} stroke="rgb(var(--c-white))" strokeOpacity={0.75} strokeWidth={1.2} strokeLinecap="round" />;
}

/**
 * Anillo doble del esfuerzo de hoy, como el de preparación; los dos arrancan de cero, a las 12 y en el sentido del reloj.
 * Por fuera el objetivo que el coach fijó por la mañana, de cero hasta tu máximo: verde hasta el mínimo y degradado
 * hacia rojo hasta el máximo, con una marca en el mínimo y otra en el máximo. Por dentro tu esfuerzo, que se llena desde
 * cero hasta lo previsto de la sesión (más tenue) y, una vez entrenado, hasta lo real, con la misma escala de color. Si el
 * anillo interior llega más lejos que el exterior, te pasas. El número del centro es el previsto (con ~) hasta que
 * entrenas y el real después.
 */
export function StrainRing({ view }: { view: StrainView }) {
  const { target, planned, real } = view;
  const maskId = useId();
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const shown = real !== null ? real : planned?.strain ?? null;
  const innerFraction = filled && shown !== null ? Math.min(1, shown / 100) : 0;

  return (
    <div className="relative aspect-square w-full">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Esfuerzo de hoy, objetivo ${target.low} a ${target.high}`}>
        <defs>
          <mask id={maskId}>
            <circle
              cx="50"
              cy="50"
              r={R_INNER}
              fill="none"
              stroke="white"
              strokeWidth={8}
              strokeDasharray={C_INNER}
              strokeDashoffset={C_INNER * (1 - innerFraction)}
              className="transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none"
            />
          </mask>
        </defs>
        <g transform="rotate(-90 50 50)">
          {/* Anillo exterior: el objetivo, de cero (las 12) hasta el máximo; verde hasta el mínimo y degradado hacia rojo. */}
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth={8} className="stroke-white/[0.07]" />
          {scaleSegments(0, target.high, 1.5, R, C, 8, target.low, target.high)}
          {/* Anillo interior: tu esfuerzo, con la escala completa revelada hasta donde llegas. */}
          <circle cx="50" cy="50" r={R_INNER} fill="none" strokeWidth={6} className="stroke-white/[0.06]" />
          {shown !== null && (
            <g mask={`url(#${maskId})`} opacity={real !== null ? 1 : 0.75}>
              {scaleSegments(0, 100, 2, R_INNER, C_INNER, 6, target.low, target.high)}
            </g>
          )}
          {tick(target.low)}
          {tick(target.high)}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[clamp(1.3rem,6.4vw,1.95rem)] font-semibold leading-none tracking-tight text-white">
          {shown !== null ? `${real === null ? '~' : ''}${shown}` : '—'}
        </span>
        <span className="mt-1 text-[9px] uppercase tracking-[0.14em] text-neutral-500">{real !== null ? 'hoy' : 'previsto'}</span>
      </div>
    </div>
  );
}

/** El detalle que se abre al tocar el anillo: objetivo, previsto, real y el porqué. */
export function StrainDetail({ view, onAdjust }: { view: StrainView; onAdjust: () => void }) {
  const { target, planned, fit, real } = view;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Esfuerzo de hoy</SectionLabel>
        <p className="mt-1 text-[11px] text-neutral-500">Los dos anillos arrancan a las 12. Exterior: tu objetivo, hasta tu máximo (de verde a rojo). Interior: tu esfuerzo, que acaba donde llegas.</p>
        <p className="mt-1.5 text-base font-semibold text-white">
          Objetivo <span className="num">{target.low}–{target.high}</span>
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {target.provisional && real === null ? 'Provisional: haz el check-in y se fija.' : 'Fijado esta mañana · no cambia durante el día.'}
        </p>
      </div>

      {planned && fit && (
        <div>
          <p className="text-sm font-semibold" style={{ color: strainColor(view) }}>
            Sesión prevista <span className="num">~{planned.strain}</span>
            <span className="font-normal text-neutral-400">
              {' · '}
              {fit.fit === 'dentro'
                ? 'encaja con tu objetivo.'
                : fit.fit === 'se-pasa'
                  ? `se pasa unos ${fit.diff} puntos.`
                  : 'te deja margen: si te encuentras bien, puedes apretar un poco más.'}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-600">
            Estimado con ~{planned.minutes} min y un RPE de {String(planned.rpe).replace('.', ',')}, como te suelen salir estas semanas.
          </p>
          {fit.fit === 'se-pasa' && (
            <button
              onClick={onAdjust}
              className="mt-3 flex items-center gap-1.5 rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              Ajustar sesión <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {real !== null && (
        <p className="text-sm font-semibold" style={{ color: strainColor(view) }}>
          Esfuerzo real <span className="num">{real}</span>
          <span className="font-normal text-neutral-400">
            {' · '}
            {view.status === 'dentro'
              ? 'justo lo que tocaba.'
              : view.status === 'por-debajo'
                ? `${target.low - real} puntos por debajo del objetivo: aún tenías margen.`
                : `${real - target.high} puntos por encima del objetivo: mañana, con cuidado.`}
          </span>
        </p>
      )}

      <div>
        <p className="text-xs font-medium text-neutral-300">Por qué este objetivo</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed text-neutral-400">
          {target.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">Estimación del esfuerzo percibido (RPE × duración), no una medida fisiológica.</p>
      </div>

      <LearnedStrain learning={view.learning} />
    </div>
  );
}

/** "Lo que aprendo": cómo te van saliendo los días frente al objetivo y cuánto se corrige la previsión. Solo con muestra suficiente. */
function LearnedStrain({ learning }: { learning: StrainLearning }) {
  const { outcomes, bias, biasSample } = learning;
  const showTally = outcomes.total >= 3;
  const showBias = biasSample >= 4 && Math.abs(bias) >= 3;
  if (!showTally && !showBias) return null;
  return (
    <div>
      <p className="text-xs font-medium text-neutral-300">Lo que aprendo de ti</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed text-neutral-400">
        {showTally && (
          <li>
            Dentro del objetivo en <span className="num font-semibold text-neutral-200">{outcomes.dentro}</span> de tus últimos{' '}
            <span className="num">{outcomes.total}</span> días con sesión
            {outcomes.pasado > 0 && ` · por encima ${outcomes.pasado}`}
            {outcomes.corto > 0 && ` · por debajo ${outcomes.corto}`}.
          </li>
        )}
        {showBias && (
          <li>
            Tus sesiones suelen salirte unos <span className="num font-semibold text-neutral-200">{Math.abs(bias)}</span> puntos{' '}
            {bias > 0 ? 'por encima' : 'por debajo'} de lo que el coach prevé: ya lo tengo en cuenta en el esfuerzo previsto.
          </li>
        )}
      </ul>
    </div>
  );
}
