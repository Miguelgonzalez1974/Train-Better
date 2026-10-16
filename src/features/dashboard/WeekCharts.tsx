import { useMemo } from 'react';
import { SectionLabel } from '../shell/SectionLabel';
import { recoveryColor } from './RecoveryCard';
import { ACCENT as EFFORT, OVER } from './StrainRing';
import type { WeekDayPoint } from './pastDay';

const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const initialOf = (iso: string) => DAY_INITIAL[new Date(`${iso}T12:00:00`).getDay()];
const dayNum = (iso: string) => Number(iso.slice(8, 10));

/**
 * La semana de esfuerzo: una columna por día con la banda del objetivo (translúcida, entre su mínimo y su máximo) y,
 * encima, la barra de lo que hiciste (azul; coral si rebasaste el máximo; rayada si es lo previsto de hoy). Tocar una
 * columna lleva a ese día. Debajo, cuántos días con sesión cayeron dentro del objetivo.
 */
export function WeekEffortChart({ points, selectedIso, todayIso, onSelect }: { points: WeekDayPoint[]; selectedIso: string; todayIso: string; onSelect: (iso: string) => void }) {
  const H = 112;
  const summary = useMemo(() => {
    const done = points.filter((p) => p.real !== null && p.target);
    const dentro = done.filter((p) => p.real! >= p.target!.low && p.real! <= p.target!.high).length;
    const pasado = done.filter((p) => p.real! > p.target!.high).length;
    const corto = done.length - dentro - pasado;
    return { n: done.length, dentro, pasado, corto };
  }, [points]);

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Esfuerzo de la semana">
      <SectionLabel>Tu semana</SectionLabel>
      <div className="mt-4 flex gap-1.5">
        {points.map((p) => {
          const selected = p.iso === selectedIso;
          const over = p.real !== null && p.target !== null && p.real > p.target.high;
          return (
            <button key={p.iso} onClick={() => onSelect(p.iso)} aria-label={`Ver ${p.iso}`} aria-pressed={selected} className="flex flex-1 flex-col items-center">
              <span className="relative block w-full rounded-lg bg-white/[0.06]" style={{ height: H }}>
                {p.target && (
                  <span
                    className="absolute inset-x-0 rounded-md border border-white/30 bg-white/[0.14]"
                    style={{ bottom: `${p.target.low}%`, height: `${Math.max(2, p.target.high - p.target.low)}%` }}
                  />
                )}
                {p.real !== null && (
                  <span className="absolute inset-x-[22%] bottom-0 rounded-md" style={{ height: `${Math.max(3, p.real)}%`, backgroundColor: over ? OVER : EFFORT }} />
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
      <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm border border-white/30 bg-white/[0.14]" /> objetivo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: EFFORT }} /> esfuerzo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: OVER }} /> te pasaste
        </span>
      </div>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">
        {summary.n === 0 ? (
          'Aún no hay sesiones esta semana.'
        ) : (
          <>
            <strong className="font-semibold text-neutral-100">{summary.dentro}</strong> de <strong className="font-semibold text-neutral-100">{summary.n}</strong>{' '}
            {summary.n === 1 ? 'día con sesión' : 'días con sesión'} dentro de tu objetivo
            {summary.pasado > 0 && <> · {summary.pasado} por encima</>}
            {summary.corto > 0 && <> · {summary.corto} por debajo</>}.
          </>
        )}
      </p>
    </section>
  );
}

/**
 * La preparación de los últimos 14 días en una línea: un punto por día con el color de su nivel, y el día elegido
 * resaltado. Tocar un punto lleva a ese día.
 */
export function ReadinessTrendChart({ series, selectedIso, onSelect }: { series: { iso: string; total: number | null }[]; selectedIso: string; onSelect: (iso: string) => void }) {
  const W = 300;
  const H = 110;
  const pad = 14;
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const known = series.map((s, i) => (s.total === null ? null : { i, v: s.total, iso: s.iso }));
  const valid = known.filter((k): k is { i: number; v: number; iso: string } => k !== null);
  const path = valid.map((k, n) => `${n === 0 ? 'M' : 'L'} ${x(k.i).toFixed(1)} ${y(k.v).toFixed(1)}`).join(' ');
  const avg = valid.length > 0 ? Math.round(valid.reduce((s, k) => s + k.v, 0) / valid.length) : null;
  const selectedIndex = series.findIndex((s) => s.iso === selectedIso);

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Preparación de los últimos días">
      <SectionLabel>Últimos 14 días</SectionLabel>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible" role="img" aria-label="Preparación por día">
        {[33, 66].map((g) => (
          <line key={g} x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke="rgb(var(--c-white))" strokeOpacity={0.08} strokeDasharray="3 4" />
        ))}
        {selectedIndex >= 0 && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={pad - 4} y2={H - pad + 4} stroke="rgb(var(--c-white))" strokeOpacity={0.18} />}
        {path && <path d={path} fill="none" stroke="rgb(var(--c-white))" strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
        {valid.map((k) => (
          <g key={k.iso} onClick={() => onSelect(k.iso)} className="cursor-pointer">
            <circle cx={x(k.i)} cy={y(k.v)} r={12} fill="transparent" />
            <circle cx={x(k.i)} cy={y(k.v)} r={k.iso === selectedIso ? 5.5 : 3.5} fill={recoveryColor(k.v)} stroke={k.iso === selectedIso ? 'rgb(var(--c-white))' : 'none'} strokeWidth={1.5} />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-600">
        <span className="num">{dayNum(series[0].iso)}</span>
        <span className="num">{dayNum(series[series.length - 1].iso)}</span>
      </div>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-neutral-400">
        {avg === null ? (
          'Aún no hay datos de preparación.'
        ) : (
          <>
            Media de estos días: <strong className="font-semibold text-neutral-100">{avg} %</strong>. Los puntos verdes son días con ganas, los ámbar normales y los rojos de cansancio.
          </>
        )}
      </p>
    </section>
  );
}
