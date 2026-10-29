import { RECOVERY_GOOD as GOOD, RECOVERY_LOW as LOW, RECOVERY_MID as MID, recoveryColor } from './RecoveryCard';
import { ChartHeader, ChartLegend, LegendItem, fmtDay, xTickIndexes } from './ChartKit';

const W = 300;
const H = 150;
const PAD = { l: 30, r: 38, t: 12, b: 24 };

/**
 * La preparación de los últimos 14 días en una línea: un punto por día con el color de su nivel, y el día elegido
 * resaltado. Tocar un punto lleva a ese día.
 */
export function ReadinessTrendChart({ series, selectedIso, onSelect }: { series: { iso: string; total: number | null }[]; selectedIso: string; onSelect: (iso: string) => void }) {
  const n = series.length;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const known = series.map((s, i) => (s.total === null ? null : { i, v: s.total, iso: s.iso }));
  const valid = known.filter((k): k is { i: number; v: number; iso: string } => k !== null);
  const path = valid.map((k, m) => `${m === 0 ? 'M' : 'L'} ${x(k.i).toFixed(1)} ${y(k.v).toFixed(1)}`).join(' ');
  const avg = valid.length > 0 ? Math.round(valid.reduce((s, k) => s + k.v, 0) / valid.length) : null;
  const selectedIndex = series.findIndex((s) => s.iso === selectedIso);
  const shown = valid.find((k) => k.iso === selectedIso) ?? valid[valid.length - 1];
  const last = valid[valid.length - 1];

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Preparación de los últimos días">
      <ChartHeader title="Preparación · 14 días" value={shown ? `${Math.round(shown.v)} %` : undefined} unit={shown ? fmtDay(shown.iso) : undefined} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full overflow-visible" role="img" aria-label="Preparación por día">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-white/10" strokeWidth={1} strokeDasharray={g === 0 ? undefined : '2 3'} />
            <text x={PAD.l - 5} y={y(g) + 3} textAnchor="end" className="fill-neutral-500" fontSize={9}>
              {g}
            </text>
          </g>
        ))}
        {xTickIndexes(n).map((i, k, all) => (
          <text key={series[i].iso} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'} className="fill-neutral-500" fontSize={9}>
            {fmtDay(series[i].iso)}
          </text>
        ))}
        {selectedIndex >= 0 && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={PAD.t - 4} y2={H - PAD.b} stroke="rgb(var(--c-white))" strokeOpacity={0.18} />}
        {path && <path d={path} fill="none" stroke="rgb(var(--c-white))" strokeOpacity={0.55} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {valid.map((k) => (
          <g key={k.iso} onClick={() => onSelect(k.iso)} className="cursor-pointer">
            <circle cx={x(k.i)} cy={y(k.v)} r={12} fill="transparent" />
            <circle cx={x(k.i)} cy={y(k.v)} r={k.iso === selectedIso ? 4.5 : 3} fill={recoveryColor(k.v)} stroke={k.iso === selectedIso ? 'rgb(var(--c-white))' : 'none'} strokeWidth={1.75} />
          </g>
        ))}
        {last && (
          <text x={x(last.i) + 8} y={y(last.v) + 3} fontSize={10} fontWeight={700} fill={recoveryColor(last.v)}>
            {Math.round(last.v)}
          </text>
        )}
      </svg>
      <ChartLegend right={avg !== null ? <>media <strong className="font-semibold text-neutral-100">{avg} %</strong></> : undefined}>
        <LegendItem color={GOOD} label="con ganas" />
        <LegendItem color={MID} label="normal" />
        <LegendItem color={LOW} label="cansancio" />
      </ChartLegend>
      {avg === null && <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">Aún no hay datos de preparación.</p>}
    </section>
  );
}
