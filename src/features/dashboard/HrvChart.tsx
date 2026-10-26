import { useMemo } from 'react';
import type { ReadinessCheck } from '../../data/athlete/types';
import { computeHrvStatus, HRV_PROVISIONAL_MIN } from '../../engine/hrv';
import { Term } from '../shell/Term';
import { ChartHeader, ChartLegend, LegendItem, fmtDay, xTickIndexes } from './ChartKit';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const INFO = 'rgb(var(--c-state-cool))';
const DAYS = 30;

const W = 300;
const H = 160;
const PAD = { l: 30, r: 38, t: 12, b: 24 };

/**
 * Tu HRV de la mañana de los últimos 30 días frente a tu rango normal: la banda es el rango (media ± 0,75 desviaciones de
 * tus últimos 60 días) y cada punto una medición, en verde si cae dentro, en rojo por debajo y en azul por encima. Arriba, la
 * media de 7 días, que es lo que cuenta. Sin mediciones, una invitación a empezar.
 */
export function HrvChart({ log, dayIso }: { log: ReadinessCheck[]; dayIso: string }) {
  const status = useMemo(() => computeHrvStatus(log, dayIso), [log, dayIso]);
  const points = useMemo(() => {
    const byDate = new Map(log.filter((c) => c.hrv !== undefined).map((c) => [c.date, c.hrv as number]));
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(`${dayIso}T12:00:00`);
      d.setDate(d.getDate() - (DAYS - 1 - i));
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { i, iso, v: byDate.get(iso) ?? null };
    });
  }, [log, dayIso]);
  const known = points.filter((p): p is { i: number; iso: string; v: number } => p.v !== null);
  const title = (
    <>
      <Term k="hrv">HRV</Term> · 30 días
    </>
  );

  if (known.length === 0) {
    return (
      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="HRV de la mañana">
        <ChartHeader title={title} />
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">
          Anota tu HRV (el rMSSD en ms, p. ej. el de HRV4Training) en la tarjeta de cada mañana. Con 7 mediciones el coach tiene un primer rango (provisional) y con 14 el completo, y te avisa cuando llegas por debajo.
        </p>
      </section>
    );
  }

  const values = known.map((p) => p.v);
  const lo = Math.min(...values, status.range?.low ?? Infinity);
  const hi = Math.max(...values, status.range?.high ?? -Infinity);
  const span = Math.max(hi - lo, 10);
  const yMin = Math.floor(lo - span * 0.15);
  const yMax = Math.ceil(hi + span * 0.15);
  const x = (i: number) => PAD.l + (i / (DAYS - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = known.map((p, n) => `${n === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const tint = (v: number) => (!status.range ? 'rgb(var(--c-white) / 0.7)' : v < status.range.low ? LOW : v > status.range.high ? INFO : GOOD);
  const lastKnown = known[known.length - 1];
  // Los valores del eje: los extremos y los límites de tu rango normal (sin pisarse si quedan casi a la misma altura).
  const ticks = [yMin, ...(status.range ? [Math.round(status.range.low), Math.round(status.range.high)] : [Math.round((yMin + yMax) / 2)]), yMax]
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || Math.abs(y(t) - y(all[i - 1])) >= 13);
  const tickIdx = xTickIndexes(DAYS);
  const headline = status.week ? { value: String(Math.round(status.week.avg)), unit: 'ms · media 7 d' } : { value: String(Math.round(lastKnown.v)), unit: `ms · ${fmtDay(lastKnown.iso)}` };

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="HRV de la mañana">
      <ChartHeader title={title} value={headline.value} unit={headline.unit} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full overflow-visible" role="img" aria-label="HRV por día frente a tu rango normal">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-white/10" strokeWidth={1} strokeDasharray={t === yMin ? undefined : '2 3'} />
            <text x={PAD.l - 5} y={y(t) + 3} textAnchor="end" className="fill-neutral-500" fontSize={9}>
              {t}
            </text>
          </g>
        ))}
        {tickIdx.map((i, k, all) => (
          <text key={points[i].iso} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'} className="fill-neutral-500" fontSize={9}>
            {fmtDay(points[i].iso)}
          </text>
        ))}
        {status.range && (
          <rect x={PAD.l} y={y(status.range.high)} width={W - PAD.l - PAD.r} height={Math.max(2, y(status.range.low) - y(status.range.high))} rx={3} fill={GOOD} fillOpacity={0.09} />
        )}
        <path d={path} fill="none" stroke="rgb(var(--c-white))" strokeOpacity={0.55} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {known.map((p) => (
          <circle key={p.iso} cx={x(p.i)} cy={y(p.v)} r={p.iso === dayIso ? 4.5 : 3} fill={tint(p.v)} stroke={p.iso === dayIso ? 'rgb(var(--c-white))' : 'none'} strokeWidth={1.75} />
        ))}
        <text x={x(lastKnown.i) + 8} y={y(lastKnown.v) + 3} fontSize={10} fontWeight={700} fill={tint(lastKnown.v)}>
          {Math.round(lastKnown.v)}
        </text>
      </svg>
      <ChartLegend right={status.range && status.week ? `tu media de 7 días está ${status.week.vs === 'bajo' ? 'por debajo' : status.week.vs === 'alto' ? 'por encima' : 'dentro'}` : undefined}>
        {status.range && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm opacity-50" style={{ background: GOOD }} aria-hidden="true" />
            tu rango normal {status.range.low}–{status.range.high}
            {status.provisional ? ' (provisional)' : ''}
          </span>
        )}
        <LegendItem color={GOOD} label="dentro" />
        <LegendItem color={LOW} label="por debajo" />
        <LegendItem color={INFO} label="por encima" />
      </ChartLegend>
      {!(status.range && status.week) && (
        <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">
          {status.range ? (
            <>
              Tu rango normal{status.provisional ? ' (provisional)' : ''}: {status.range.low}–{status.range.high} ms. Con 3 mediciones en la semana te enseño su media.
            </>
          ) : (
            <>
              Llevas <strong className="font-semibold text-neutral-100">{status.n}</strong> de {HRV_PROVISIONAL_MIN} mediciones para un primer rango ({status.needed} para el completo).
            </>
          )}
        </p>
      )}
    </section>
  );
}
