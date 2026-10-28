import { ArrowRight } from 'lucide-react';
import type { StrainTarget } from '../../data/athlete/types';
import type { PlannedStrain, PlanFit } from '../../engine/plannedStrain';
import type { StrainStatus } from '../../engine/strain';
import type { StrainLearning } from '../../engine/strainLearning';
import { SectionLabel } from '../shell/SectionLabel';

/** Todo lo que el medidor y su detalle necesitan saber del esfuerzo de hoy. */
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

/** El esfuerzo es azul (su color en todo el Dashboard) y pasa a coral cuando rebasa el máximo del objetivo. */
export const ACCENT = 'rgb(var(--c-state-cool))';
export const OVER = 'rgb(var(--c-state-mid))';
const NEUTRAL = 'rgb(var(--c-white) / 0.5)';

const STATUS_COLOR: Record<StrainStatus, string> = {
  'sin-entrenar': NEUTRAL,
  'por-debajo': ACCENT,
  dentro: ACCENT,
  pasado: OVER,
};
const FIT_COLOR: Record<PlanFit, string> = {
  dentro: ACCENT,
  'se-pasa': OVER,
  'se-queda-corta': ACCENT,
};

/** El color que manda: el del resultado real si ya entrenaste; si no, el de cómo encaja la sesión prevista. */
export function strainColor(v: StrainView): string {
  if (v.real !== null) return STATUS_COLOR[v.status];
  return v.fit ? FIT_COLOR[v.fit.fit] : STATUS_COLOR['sin-entrenar'];
}

/** La frase de veredicto de una línea sobre el esfuerzo de hoy (real si ya entrenaste; si no, cómo encaja la sesión prevista). */
export function strainVerdict(v: StrainView): string {
  if (v.real !== null) {
    if (v.status === 'dentro') return 'Dentro del objetivo · justo lo que tocaba';
    if (v.status === 'por-debajo') return 'Por debajo del objetivo · aún tenías margen';
    return 'Te pasaste del objetivo · mañana, con cuidado';
  }
  if (!v.fit) return 'Sin sesión prevista hoy';
  if (v.fit.fit === 'dentro') return 'Encaja con tu objetivo';
  if (v.fit.fit === 'se-pasa') return `Se pasa ${v.fit.diff} de tu objetivo`;
  return 'Te deja margen: puedes apretar un poco más';
}

/** El detalle que se abre al tocar una columna del medidor: objetivo, previsto, real y el porqué. */
export function StrainDetail({
  view,
  onAdjust,
  dayLabel = 'hoy',
  isToday = true,
}: {
  view: StrainView;
  onAdjust: () => void;
  dayLabel?: string;
  /** Un día pasado se cuenta en pasado y no ofrece "mañana, con cuidado". */
  isToday?: boolean;
}) {
  const { target, planned, fit, real } = view;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Esfuerzo de {dayLabel.toLowerCase()}</SectionLabel>
        <p className="mt-1 text-[11px] text-neutral-500">
          Anillo exterior (azul): tu esfuerzo. El corchete blanco de fuera marca tu objetivo, del mínimo al máximo; si el azul pasa de su final, te pasas.
        </p>
        <p className="mt-1.5 text-base font-semibold text-white">
          Objetivo <span className="num">{target.low}–{target.high}</span>
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {!isToday
            ? 'Lo que se pedía ese día.'
            : target.provisional && real === null
              ? 'Provisional: haz el check-in y se fija.'
              : 'Fijado esta mañana · no cambia durante el día.'}
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
                ? `${target.low - real} puntos por debajo del objetivo: ${isToday ? 'aún tenías margen' : 'había margen'}.`
                : `${real - target.high} puntos por encima del objetivo${isToday ? ': mañana, con cuidado.' : '.'}`}
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
