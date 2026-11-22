import type { HrvStatus } from '../../engine/hrv';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const INFO = 'rgb(var(--c-state-cool))';

const W = 260;
const H = 84;
const PAD = { l: 8, r: 8, t: 24, b: 16 };

export interface HrvMiniPoint {
  iso: string;
  /** rMSSD en ms, o null si ese día no hay medición. */
  v: number | null;
}

/**
 * Tus últimos siete días de HRV sobre la banda de tu rango normal: un punto por día (verde dentro, rojo por debajo, azul por encima), el de
 * hoy con un aro blanco. Las etiquetas del rango van en la unidad que se esté usando (`fmt`). Sin rango aún, solo los puntos.
 */
export function HrvMini({ points, status, todayIso, fmt, unitLabel }: { points: HrvMiniPoint[]; status: HrvStatus; todayIso: string; fmt: (ms: number) => string; unitLabel: string }) {
  const known = points.filter((p): p is { iso: string; v: number } => p.v !== null);
  if (known.length === 0) return null;
  const values = known.map((p) => p.v);
  const lo = Math.min(...values, status.range?.low ?? Infinity);
  const hi = Math.max(...values, status.range?.high ?? -Infinity);
  const span = Math.max(hi - lo, 8);
  const yMin = lo - span * 0.2;
  const yMax = hi + span * 0.2;
  const x = (i: number) => PAD.l + (i / Math.max(1, points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const tint = (v: number) => (!status.range ? 'rgb(var(--c-white) / 0.7)' : v < status.range.low ? LOW : v > status.range.high ? INFO : GOOD);
  const path = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.v !== null)
    .map(({ p, i }, n) => `${n === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.v as number).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`HRV de los últimos ${points.length} días${status.range ? `, tu rango normal ${fmt(status.range.low)} a ${fmt(status.range.high)} ${unitLabel}` : ''}`} data-testid="hrv-mini">
      {status.range && (
        <>
          <rect x={PAD.l} y={y(status.range.high)} width={W - PAD.l - PAD.r} height={Math.max(3, y(status.range.low) - y(status.range.high))} rx={4} fill={GOOD} fillOpacity={0.14} />
          <text x={PAD.l} y={10} fontSize={10} className="fill-neutral-400">
            tu rango {fmt(status.range.low)}–{fmt(status.range.high)} {unitLabel}
            {status.provisional ? ' (provisional)' : ''}
          </text>
        </>
      )}
      <path d={path} fill="none" stroke="rgb(var(--c-white))" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="3 3" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.v === null ? null : <circle key={p.iso} cx={x(i)} cy={y(p.v)} r={p.iso === todayIso ? 5.5 : 4} fill={tint(p.v)} stroke={p.iso === todayIso ? 'rgb(var(--c-white))' : 'none'} strokeWidth={2} />,
      )}
      {points.map((p, i) => (
        <text key={`d${p.iso}`} x={x(i)} y={H - 3} textAnchor="middle" fontSize={9} className="fill-neutral-500">
          {p.iso === todayIso ? 'hoy' : Number(p.iso.slice(8, 10))}
        </text>
      ))}
    </svg>
  );
}
