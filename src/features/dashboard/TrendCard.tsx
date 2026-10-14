import { useState } from 'react';
import type { TrendDay } from '../../engine/strain';
import { SectionLabel } from '../shell/SectionLabel';

const W = 320;
const H = 132;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;

const RANGES: { days: number; label: string }[] = [
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
  { days: 30, label: '30 días' },
];

const fmtDay = (iso: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.round(v.reduce((s, x) => s + x, 0) / v.length);
}

/**
 * Tendencia de esfuerzo (barras) y preparación (línea) de los últimos días: de un vistazo se ve si empujas cuando estás
 * mal o si recuperas bien tras un día fuerte. Tocar un día enseña sus dos cifras.
 */
export function TrendCard({ series }: { series: (days: number) => TrendDay[] }) {
  const [days, setDays] = useState(14);
  const [selected, setSelected] = useState<number | null>(null);
  const data = series(days);
  const n = data.length;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(14, slot * 0.55));
  const x = (i: number) => PAD_X + slot * i + slot / 2;
  const y = (v: number) => PAD_TOP + plotH * (1 - v / 100);

  const recoveryPoints = data.map((d, i) => (d.recovery === null ? null : { x: x(i), y: y(d.recovery) }));
  // La línea se corta en los días sin check-in en vez de inventar un tramo.
  const segments: { x: number; y: number }[][] = [];
  for (const p of recoveryPoints) {
    if (p === null) segments.push([]);
    else if (segments.length === 0) segments.push([p]);
    else segments[segments.length - 1].push(p);
  }

  const sel = selected !== null ? data[selected] : null;
  const avgStrain = mean(data.map((d) => d.strain));
  const avgRecovery = mean(data.map((d) => d.recovery));
  const hasData = data.some((d) => d.strain !== null || d.recovery !== null);

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Tendencias">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Tendencias</SectionLabel>
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-white/5 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => {
                setDays(r.days);
                setSelected(null);
              }}
              className={`whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-200 ${days === r.days ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-h-[2.5rem] items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] text-neutral-500">{sel ? fmtDay(sel.date) : `Media de ${days} días`}</p>
        </div>
        <div className="flex gap-5">
          <div className="text-right">
            <p className="num text-xl font-semibold leading-none text-white">{(sel ? sel.strain : avgStrain) ?? '—'}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Esfuerzo</p>
          </div>
          <div className="text-right">
            <p className="num text-xl font-semibold leading-none" style={{ color: 'rgb(var(--c-state-good))' }}>
              {(sel ? sel.recovery : avgRecovery) ?? '—'}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">Preparación</p>
          </div>
        </div>
      </div>

      {hasData ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Esfuerzo y preparación de los últimos días">
          {[25, 50, 75].map((g) => (
            <line key={g} x1={PAD_X} x2={W - PAD_X} y1={y(g)} y2={y(g)} stroke="rgb(var(--c-white) / 0.06)" strokeDasharray="2 4" />
          ))}
          {data.map((d, i) =>
            d.strain !== null ? (
              <rect
                key={`b${d.date}`}
                x={x(i) - barW / 2}
                y={y(d.strain)}
                width={barW}
                height={Math.max(2, y(0) - y(d.strain))}
                rx={Math.min(3, barW / 2)}
                fill={selected === i ? 'rgb(var(--c-white) / 0.85)' : 'rgb(var(--c-white) / 0.38)'}
              />
            ) : null,
          )}
          {segments.map((seg, i) =>
            seg.length > 1 ? (
              <polyline key={`l${i}`} points={seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="rgb(var(--c-state-good))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ) : null,
          )}
          {recoveryPoints.map((p, i) => (p ? <circle key={`p${i}`} cx={p.x} cy={p.y} r={selected === i ? 4 : n <= 14 ? 2.6 : 1.8} fill="rgb(var(--c-state-good))" /> : null))}
          {data.map((d, i) => (
            <rect key={`t${d.date}`} x={PAD_X + slot * i} y={0} width={slot} height={H} fill="transparent" onClick={() => setSelected((cur) => (cur === i ? null : i))} style={{ cursor: 'pointer' }}>
              <title>{fmtDay(d.date)}</title>
            </rect>
          ))}
        </svg>
      ) : (
        <p className="py-8 text-center text-xs text-neutral-500">Todavía no hay datos de estos días.</p>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-600">
        <span>{fmtDay(data[0].date)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: 'rgb(var(--c-white) / 0.45)' }} aria-hidden="true" />
            Esfuerzo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: 'rgb(var(--c-state-good))' }} aria-hidden="true" />
            Preparación
          </span>
        </span>
        <span>{fmtDay(data[n - 1].date)}</span>
      </div>
    </section>
  );
}
