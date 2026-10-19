import { useMemo } from 'react';
import type { ReadinessCheck } from '../../data/athlete/types';
import { computeHrvStatus, HRV_PROVISIONAL_MIN } from '../../engine/hrv';
import { SectionLabel } from '../shell/SectionLabel';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const INFO = 'rgb(var(--c-state-cool))';
const DAYS = 30;

const W = 300;
const H = 120;
const PAD = 14;

/**
 * Tu HRV de la mañana de los últimos 30 días frente a tu rango normal: la banda es el rango (media ± 0,75 desviaciones de
 * tus últimos 60 días) y cada punto una medición, en verde si cae dentro, en rojo por debajo y en azul por encima. Debajo, la
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

  if (known.length === 0) {
    return (
      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="HRV de la mañana">
        <SectionLabel>HRV</SectionLabel>
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
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const x = (i: number) => PAD + (i / (DAYS - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - PAD * 2);
  const path = known.map((p, n) => `${n === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const tint = (v: number) => (!status.range ? 'rgb(var(--c-white) / 0.7)' : v < status.range.low ? LOW : v > status.range.high ? INFO : GOOD);

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="HRV de la mañana">
      <SectionLabel>HRV · últimos 30 días</SectionLabel>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible" role="img" aria-label="HRV por día frente a tu rango normal">
        {status.range && (
          <g>
            <rect x={PAD} y={y(status.range.high)} width={W - PAD * 2} height={Math.max(2, y(status.range.low) - y(status.range.high))} rx={4} fill="rgb(var(--c-white))" fillOpacity={0.07} />
            <line x1={PAD} x2={W - PAD} y1={y(status.range.high)} y2={y(status.range.high)} stroke="rgb(var(--c-white))" strokeOpacity={0.18} strokeDasharray="3 4" />
            <line x1={PAD} x2={W - PAD} y1={y(status.range.low)} y2={y(status.range.low)} stroke="rgb(var(--c-white))" strokeOpacity={0.18} strokeDasharray="3 4" />
          </g>
        )}
        <path d={path} fill="none" stroke="rgb(var(--c-white))" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {known.map((p) => (
          <circle key={p.iso} cx={x(p.i)} cy={y(p.v)} r={p.iso === dayIso ? 5 : 3} fill={tint(p.v)} stroke={p.iso === dayIso ? 'rgb(var(--c-white))' : 'none'} strokeWidth={1.5} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-600">
        <span className="num">{Number(points[0].iso.slice(8))}</span>
        <span className="num">{Number(points[DAYS - 1].iso.slice(8))}</span>
      </div>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">
        {status.range && status.week ? (
          <>
            Media de 7 días: <strong className="font-semibold text-neutral-100">{status.week.avg} ms</strong>, {status.week.vs === 'bajo' ? 'por debajo de' : status.week.vs === 'alto' ? 'por encima de' : 'dentro de'} tu rango
            ({status.range.low}–{status.range.high} ms{status.provisional ? `, provisional: ${status.n} de ${status.needed} mediciones` : ''}).
          </>
        ) : status.range ? (
          <>
            Tu rango normal{status.provisional ? ' (provisional)' : ''}: {status.range.low}–{status.range.high} ms. Con 3 mediciones en la semana te enseño su media.
          </>
        ) : (
          <>
            Llevas <strong className="font-semibold text-neutral-100">{status.n}</strong> de {HRV_PROVISIONAL_MIN} mediciones para un primer rango ({status.needed} para el completo).
          </>
        )}
      </p>
    </section>
  );
}
