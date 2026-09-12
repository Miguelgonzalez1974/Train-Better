import type { AcwrResult } from '../../engine/loadMetrics';

export type GaugeTarget = 'acwr' | 'heatmap' | 'weak' | 'energy' | 'imbalances' | 'prs';

export interface GaugeSpec {
  label: string;
  valueLabel: string;
  fraction: number;
  strokeClass: string;
  target?: GaugeTarget;
}

const ACWR_ZONE_STROKE: Record<AcwrResult['zone'], string> = {
  baja: 'stroke-sky-400',
  optima: 'stroke-emerald-400',
  moderada: 'stroke-brand-orange',
  alta: 'stroke-red-400',
};

/** Semicírculo de arco — r=40, así que su longitud (para el dasharray/offset) es siempre 40·π. */
const ARC_LENGTH = 40 * Math.PI;

function Gauge({ spec, onClick }: { spec: GaugeSpec; onClick?: () => void }) {
  const clamped = Math.max(0, Math.min(1, spec.fraction));
  const offset = ARC_LENGTH * (1 - clamped);
  const body = (
    <>
      <svg width="100" height="62" viewBox="0 0 100 62" role="img" aria-label={`${spec.label}: ${spec.valueLabel}`}>
        <path d="M 10 56 A 40 40 0 0 1 90 56" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-white/[0.08]" />
        <path
          d="M 10 56 A 40 40 0 0 1 90 56"
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={spec.strokeClass}
          style={{ strokeDasharray: ARC_LENGTH, strokeDashoffset: offset, transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="50" y="46" textAnchor="middle" className="num fill-white" style={{ fontSize: 18, fontWeight: 700 }}>
          {spec.valueLabel}
        </text>
      </svg>
      <span className="-mt-1 block truncate px-1 text-center text-[10px] leading-tight text-neutral-400">{spec.label}</span>
    </>
  );

  if (!onClick) {
    return <div className="flex flex-1 flex-col items-center">{body}</div>;
  }
  return (
    <button
      onClick={onClick}
      title={`Ver ${spec.label}`}
      className="flex flex-1 flex-col items-center rounded-xl py-1 transition-colors duration-200 hover:bg-white/[0.05]"
    >
      {body}
    </button>
  );
}

/**
 * 6 arcos, 2 filas de 3 — "cómo vas ahora mismo" (carga, constancia, dominios energéticos) y "qué
 * tal progresas" (salud de patrones, desequilibrios, PRs). Cada uno es un botón: toca y salta
 * directo a su tarjeta de detalle (`onJumpTo`), en vez de tener que bucear por "Más detalle" para
 * encontrarla. Solo métricas que ya se calculan en algún sitio de la app — ninguna se inventa aquí.
 */
export function MetricsGauges({
  row1,
  row2,
  onJumpTo,
}: {
  row1: GaugeSpec[];
  row2: GaugeSpec[];
  onJumpTo: (target: GaugeTarget) => void;
}) {
  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <div className="flex items-stretch gap-1">
        {row1.map((spec) => (
          <Gauge key={spec.label} spec={spec} onClick={spec.target ? () => onJumpTo(spec.target!) : undefined} />
        ))}
      </div>
      <div className="flex items-stretch gap-1 border-t border-white/5 pt-2">
        {row2.map((spec) => (
          <Gauge key={spec.label} spec={spec} onClick={spec.target ? () => onJumpTo(spec.target!) : undefined} />
        ))}
      </div>
    </div>
  );
}

export { ACWR_ZONE_STROKE };
