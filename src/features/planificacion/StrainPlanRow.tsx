import type { StrainTarget } from '../../data/athlete/types';
import type { PlannedStrain, PlanFit } from '../../engine/plannedStrain';

const FIT_COLOR: Record<PlanFit, string> = {
  dentro: 'rgb(var(--c-state-good))',
  'se-pasa': 'rgb(var(--c-state-hot))',
  'se-queda-corta': 'rgb(var(--c-state-cool))',
};

/**
 * Una línea bajo la cabecera de Planificación con el esfuerzo previsto de la sesión frente al objetivo del día (el detalle
 * vive en el círculo de esfuerzo del Dashboard). Solo si la sesión se pasa ofrece bajarla — otro WOD o una sesión ligera —,
 * porque eso cambia la sesión y tiene que poder hacerse aquí.
 */
export function StrainPlanRow({
  planned,
  target,
  fit,
  diff,
  canSwapWod,
  onSwapWod,
  onLighter,
}: {
  planned: PlannedStrain;
  target: StrainTarget;
  fit: PlanFit;
  diff: number;
  canSwapWod: boolean;
  onSwapWod: () => void;
  onLighter: () => void;
}) {
  const color = FIT_COLOR[fit];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-400">
        Esfuerzo previsto <span className="num font-semibold" style={{ color }}>~{planned.strain}</span> · objetivo{' '}
        <span className="num font-semibold text-neutral-200">{target.low}–{target.high}</span>
        {fit === 'se-pasa' && <span style={{ color }}> · se pasa {diff}</span>}
      </p>
      {fit === 'se-pasa' && (
        <div className="flex flex-wrap gap-2">
          {canSwapWod && (
            <button
              onClick={onSwapWod}
              className="rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
            >
              Probar otro WOD
            </button>
          )}
          <button
            onClick={onLighter}
            className="rounded-full border border-brand-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold"
          >
            Sesión ligera
          </button>
        </div>
      )}
    </div>
  );
}
