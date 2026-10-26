import { useMemo } from 'react';
import { RECOVERY_GOOD as GOOD, RECOVERY_LOW as LOW, RECOVERY_MID as MID, recoveryColor } from './RecoveryCard';
import { ACCENT as EFFORT, OVER } from './StrainRing';
import { ChartHeader, ChartLegend, LegendItem, fmtDay, xTickIndexes } from './ChartKit';
import type { WeekDayPoint } from './pastDay';

const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const initialOf = (iso: string) => DAY_INITIAL[new Date(`${iso}T12:00:00`).getDay()];
const dayNum = (iso: string) => Number(iso.slice(8, 10));

/**
 * La semana de esfuerzo: una columna por día con la banda del objetivo (translúcida, entre su mínimo y su máximo) y,
 * encima, la barra de lo que hiciste (azul; coral si rebasaste el máximo; rayada si es lo previsto de hoy), con su número.
 * Tocar una columna lleva a ese día. Arriba, cuántos días con sesión cayeron dentro del objetivo.
 */
export function WeekEffortChart({ points, selectedIso, todayIso, onSelect }: { points: WeekDayPoint[]; selectedIso: string; todayIso: string; onSelect: (iso: string) => void }) {
  const H = 120;
  const summary = useMemo(() => {
    const done = points.filter((p) => p.real !== null && p.target);
    const dentro = done.filter((p) => p.real! >= p.target!.low && p.real! <= p.target!.high).length;
    const pasado = done.filter((p) => p.real! > p.target!.high).length;
    const corto = done.length - dentro - pasado;
    return { n: done.length, dentro, pasado, corto };
  }, [points]);
  const below = [summary.pasado > 0 ? `${summary.pasado} por encima` : null, summary.corto > 0 ? `${summary.corto} por debajo` : null].filter(Boolean).join(' · ');

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Esfuerzo de la semana">
      <ChartHeader title="Esfuerzo · tu semana" value={summary.n > 0 ? `${summary.dentro}/${summary.n}` : undefined} unit="en objetivo" />
      <div className="relative mt-4 pl-7">
        {/* Las tres líneas de referencia, detrás de las columnas. */}
        <div className="pointer-events-none absolute left-7 right-0 top-0" style={{ height: H }} aria-hidden="true">
          {[100, 50, 0].map((g) => (
            <div key={g} className={`absolute inset-x-0 border-t border-white/10 ${g === 0 ? '' : 'border-dashed'}`} style={{ bottom: `${g}%` }}>
              <span className="num absolute right-full top-0 mr-1.5 -translate-y-1/2 text-[9px] text-neutral-500">{g}</span>
            </div>
          ))}
        </div>
        <div className="relative flex gap-1.5">
          {points.map((p) => {
            const selected = p.iso === selectedIso;
            const over = p.real !== null && p.target !== null && p.real > p.target.high;
            return (
              <button key={p.iso} onClick={() => onSelect(p.iso)} aria-label={`Ver ${p.iso}`} aria-pressed={selected} className="flex flex-1 flex-col items-center">
                <span className="relative block w-full" style={{ height: H }}>
                  {p.target && (
                    <span
                      className="absolute inset-x-0 rounded border border-dashed border-white/40 bg-white/[0.12]"
                      style={{ bottom: `${p.target.low}%`, height: `${Math.max(2, p.target.high - p.target.low)}%` }}
                    />
                  )}
                  {p.real !== null && (
                    <>
                      <span className="absolute inset-x-[22%] bottom-0 rounded-md" style={{ height: `${Math.max(3, p.real)}%`, backgroundColor: over ? OVER : EFFORT }} />
                      <span className="num absolute inset-x-0 text-center text-[9px] font-bold text-neutral-300" style={{ bottom: `calc(${Math.max(3, p.real)}% + 3px)` }}>
                        {Math.round(p.real)}
                      </span>
                    </>
                  )}
                  {p.planned !== null && (
                    <span
                      className="absolute inset-x-[22%] bottom-0 rounded-md"
                      style={{
                        height: `${Math.max(3, p.planned)}%`,
                        backgroundImage: `repeating-linear-gradient(135deg, ${p.target && p.planned > p.target.high ? OVER : EFFORT} 0 4px, transparent 4px 8px)`,
                        border: `1px dashed ${p.target && p.planned > p.target.high ? OVER : EFFORT}`,
                      }}
                    />
                  )}
                </span>
                <span className={`mt-2 text-[11px] font-semibold ${selected ? 'text-white' : 'text-neutral-500'}`}>{initialOf(p.iso)}</span>
                <span className={`num text-[10px] ${selected ? 'text-neutral-300' : 'text-neutral-600'}`}>{dayNum(p.iso)}</span>
                <span className={`mt-1 h-1 w-1 rounded-full ${p.iso === todayIso ? 'bg-white' : 'bg-transparent'}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      <ChartLegend right={below || undefined}>
        <LegendItem color="rgb(var(--c-white) / 0.5)" label="objetivo" shape="line" />
        <LegendItem color={EFFORT} label="esfuerzo" />
        <LegendItem color={OVER} label="te pasaste" />
      </ChartLegend>
      {summary.n === 0 && <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">Aún no hay sesiones esta semana.</p>}
    </section>
  );
}

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
