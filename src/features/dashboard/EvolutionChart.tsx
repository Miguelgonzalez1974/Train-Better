import { daysBetweenIso, niceAxis, type StrengthEvolution } from '../../engine/strengthEvolution';

const W = 320;
const H = 200;
const PAD = { l: 32, r: 38, t: 14, b: 22 };

function fmtDay(iso: string, withYear = false): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', ...(withYear ? { year: '2-digit' } : {}) }).format(new Date(`${iso}T12:00:00`));
}

export function fmtKg(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Gráfico de un levantamiento: la línea de PR en escalones y los puntos de tu 1RM estimado con las series de trabajo. */
export function EvolutionChart({ evo }: { evo: StrengthEvolution }) {
  const axis = niceAxis(evo.minKg, evo.maxKg);
  const total = Math.max(1, daysBetweenIso(evo.from, evo.to));
  const x = (iso: string) => PAD.l + (Math.max(0, daysBetweenIso(evo.from, iso)) / total) * (W - PAD.l - PAD.r);
  const y = (kg: number) => PAD.t + (1 - (kg - axis.lo) / (axis.hi - axis.lo)) * (H - PAD.t - PAD.b);

  // Línea de PR en escalones: el valor vigente se mantiene hasta que cambia.
  const step = evo.pr.reduce((d, p, i) => (i === 0 ? `M${x(p.date)},${y(p.kg)}` : `${d} H${x(p.date)} V${y(p.kg)}`), '');
  const lastPr = evo.pr[evo.pr.length - 1];
  const prLabelY = y(lastPr.kg);
  const ticks = [0, 1, 2, 3].map((i) => {
    const d = new Date(`${evo.from}T12:00:00`);
    d.setDate(d.getDate() + Math.round((total * i) / 3));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, left: i === 0, right: i === 3 };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolución de tu PR y de tu 1RM estimado">
      {axis.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-white/10" strokeWidth={1} strokeDasharray={t === axis.lo ? undefined : '2 3'} />
          <text x={PAD.l - 5} y={y(t) + 3} textAnchor="end" className="fill-neutral-500" fontSize={9}>
            {fmtKg(t)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t.iso} x={x(t.iso)} y={H - 6} textAnchor={t.left ? 'start' : t.right ? 'end' : 'middle'} className="fill-neutral-500" fontSize={9}>
          {fmtDay(t.iso)}
        </text>
      ))}

      {evo.e1rm.length > 1 && (
        <polyline points={evo.e1rm.map((p) => `${x(p.date)},${y(p.kg)}`).join(' ')} fill="none" className="stroke-brand-neon/40" strokeWidth={1.5} strokeLinejoin="round" />
      )}
      <path d={step} fill="none" className="stroke-brand-gold" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      {evo.prChanges.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={3.5} className="fill-brand-gold stroke-brand-bg" strokeWidth={1.5} />
      ))}
      {evo.e1rm.map((p) => (
        <circle
          key={`${p.date}-${p.source}`}
          cx={x(p.date)}
          cy={y(p.kg)}
          r={p.source === 'rpe' ? 3.2 : 2.6}
          className={p.source === 'rpe' ? 'fill-brand-neon' : 'fill-brand-bg stroke-brand-neon'}
          strokeWidth={p.source === 'rpe' ? 0 : 1.5}
        />
      ))}

      <text x={W - PAD.r + 5} y={prLabelY + 3} className="fill-brand-gold" fontSize={10} fontWeight={700}>
        {fmtKg(lastPr.kg)}
      </text>
    </svg>
  );
}
