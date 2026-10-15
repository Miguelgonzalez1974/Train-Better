import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { StrainTarget } from '../../data/athlete/types';
import type { PlannedStrain, PlanFit } from '../../engine/plannedStrain';
import type { StrainStatus } from '../../engine/strain';
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

/**
 * Anillo doble del esfuerzo de hoy, como el de preparación: por fuera el objetivo que el coach fijó por la mañana (la
 * banda verde es el rango que toca) y por dentro tu esfuerzo, que se llena hasta lo previsto de la sesión (más tenue) y,
 * una vez entrenado, hasta lo real. Si el anillo interior acaba a la altura de la banda verde, encaja. El número del
 * centro es el previsto (con ~) hasta que entrenas y el real después.
 */
export function StrainRing({ view }: { view: StrainView }) {
  const { target, planned, real } = view;
  const color = strainColor(view);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const bandLen = ((target.high - target.low) / 100) * C;
  const bandStart = (target.low / 100) * C;
  const shown = real !== null ? real : planned?.strain ?? null;
  const innerFraction = filled && shown !== null ? Math.min(1, shown / 100) : 0;

  return (
    <div className="relative aspect-square w-full">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Esfuerzo de hoy, objetivo ${target.low} a ${target.high}`}>
        <g transform="rotate(-90 50 50)">
          {/* Anillo exterior: el objetivo (la banda verde es el rango que toca hoy). */}
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth={8} className="stroke-white/[0.07]" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth={8}
            style={{ stroke: 'rgb(var(--c-state-good))' }}
            strokeDasharray={`${bandLen} ${C - bandLen}`}
            strokeDashoffset={-bandStart}
          />
          {/* Anillo interior: tu esfuerzo (previsto antes de entrenar, real después). Si termina bajo la banda verde, encaja. */}
          <circle cx="50" cy="50" r={R_INNER} fill="none" strokeWidth={6} className="stroke-white/[0.06]" />
          {shown !== null && (
            <circle
              cx="50"
              cy="50"
              r={R_INNER}
              fill="none"
              strokeWidth={6}
              strokeLinecap="round"
              style={{ stroke: color, opacity: real !== null ? 1 : 0.7 }}
              strokeDasharray={C_INNER}
              strokeDashoffset={C_INNER * (1 - innerFraction)}
              className="transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none"
            />
          )}
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
        <p className="mt-1 text-[11px] text-neutral-500">Anillo exterior: tu objetivo (banda verde). Anillo interior: tu esfuerzo.</p>
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
    </div>
  );
}
