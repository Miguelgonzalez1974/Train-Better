import { Fragment, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { MIN_HISTOGRAM_DAYS, MIN_TREND_DAYS, dataDays, effortFit, readinessBand, trendBins, trendSentence, type EffortFit, type ReadinessBand, type TrendPoint } from '../../engine/weekTrend';
import { SectionLabel } from '../shell/SectionLabel';
import { fmtDay, xTickIndexes } from './ChartKit';

const BLUE = 'rgb(var(--c-state-cool))';
const GOOD = 'rgb(var(--c-state-good))';
const MID = 'rgb(var(--c-state-mid))';
const LOW = 'rgb(var(--c-state-low))';
const BAND_COLOR: Record<ReadinessBand, string> = { good: GOOD, mid: MID, low: LOW };
const BAND_WORD: Record<ReadinessBand, string> = { good: 'con ganas', mid: 'normal', low: 'cansancio' };
const FIT_WORD: Record<EffortFit, string> = { rest: 'descanso', below: 'por debajo', within: 'dentro', over: 'te pasas', unknown: '' };

const RANGES = [7, 14, 30];
const DAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const dow = (iso: string) => new Date(`${iso}T12:00:00`).getDay();

const W = 340;
const H = 200;
const PAD = { l: 32, r: 50, t: 10, b: 38 };

/**
 * "Tu semana": el esfuerzo (azul, con la franja de tu objetivo de cada día) y la preparación (puntos del color de su nivel) sobre
 * los mismos días, para ver de un vistazo si empujas cuando el cuerpo está listo. Los días de descanso cuentan como esfuerzo 0.
 * Arriba, una frase que lee la semana; abajo, cuántos días cayeron en cada tramo. Tocar un día lo elige en todo el Dashboard.
 */
export function WeekTrendCard({ build, selectedIso, todayIso, onSelect }: { build: (days: number) => TrendPoint[]; selectedIso: string; todayIso: string; onSelect: (iso: string) => void }) {
  const [range, setRange] = useState(7);
  const points = useMemo(() => build(range), [build, range]);
  const n = points.length;
  const enough = dataDays(points) >= MIN_TREND_DAYS;
  const sentence = useMemo(() => trendSentence(points), [points]);
  const bins = useMemo(() => trendBins(points), [points]);
  const showHistograms = dataDays(points) >= MIN_HISTOGRAM_DAYS;
  const selected = points.find((p) => p.iso === selectedIso) ?? null;

  const x = (i: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + 14 + ((W - PAD.r - PAD.l - 28) * i) / (n - 1));
  const slot = n > 1 ? (W - PAD.r - PAD.l - 28) / (n - 1) : 40;
  const y = (v: number) => PAD.t + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - PAD.t - PAD.b);
  const r = n <= 8 ? 5.5 : n <= 16 ? 4 : 2.8;

  const line = (key: 'strain' | 'readiness') => {
    const out: string[] = [];
    let cur: string[] = [];
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) {
        if (cur.length > 1) out.push(cur.join(' '));
        cur = [];
      } else cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    });
    if (cur.length > 1) out.push(cur.join(' '));
    return out;
  };

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Esfuerzo y preparación de la semana">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Tendencia</SectionLabel>
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-white/5 p-0.5">
          {RANGES.map((d) => (
            <button key={d} onClick={() => setRange(d)} aria-pressed={range === d} className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${range === d ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}>
              {d} días
            </button>
          ))}
        </div>
      </div>

      {!enough ? (
        <div className="px-2 pb-1 pt-7 text-center">
          <p className="text-sm font-semibold text-white">Aún pocos días para dibujar la tendencia</p>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-[13px] leading-relaxed text-neutral-400">
            Con el check-in de cada mañana y tus sesiones, aquí verás cómo se cruzan tu esfuerzo y tu preparación. Hacen falta al menos {MIN_TREND_DAYS} días con datos; llevas {dataDays(points)}.
          </p>
        </div>
      ) : (
        <>
          {sentence && (
            <div className="mt-4 flex items-start gap-3">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-white/10 text-neutral-200" aria-hidden="true">
                <Sparkles size={14} strokeWidth={2.25} />
              </span>
              <p className="text-[13.5px] leading-snug text-neutral-100">{sentence}</p>
            </div>
          )}

          {/* El día elegido: sus dos cifras con cómo cayeron. */}
          <div className="mt-4 flex min-h-[3.1rem] items-end justify-between gap-3">
            <p className="text-[11px] leading-tight text-neutral-500">
              {selected ? (
                <>
                  {DAY_LONG[dow(selected.iso)]}
                  <br />
                  {fmtDay(selected.iso)}
                </>
              ) : (
                'Toca un día'
              )}
            </p>
            {selected && (
              <div className="flex gap-5">
                <div className="text-right">
                  <p className="num text-[22px] font-extrabold leading-none" style={{ color: BLUE }}>
                    {selected.strain ?? '—'}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">Esfuerzo{FIT_WORD[effortFit(selected)] ? ` · ${FIT_WORD[effortFit(selected)]}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="num text-[22px] font-extrabold leading-none" style={{ color: selected.readiness !== null ? BAND_COLOR[readinessBand(selected.readiness)] : undefined }}>
                    {selected.readiness !== null ? Math.round(selected.readiness) : '—'}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">Preparación{selected.readiness !== null ? ` · ${BAND_WORD[readinessBand(selected.readiness)]}` : ''}</p>
                </div>
              </div>
            )}
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full overflow-visible" role="img" aria-label="Esfuerzo y preparación por día">
            {/* Tu objetivo de cada día, detrás de todo. */}
            {points.map((p, i) =>
              p.target ? (
                <rect key={`t${p.iso}`} x={x(i) - Math.min(slot * 0.4, 16)} y={y(p.target.high)} width={Math.min(slot * 0.8, 32)} height={Math.max(3, y(p.target.low) - y(p.target.high))} rx={3} fill="rgb(var(--c-state-cool) / 0.14)" stroke="rgb(var(--c-state-cool) / 0.4)" strokeDasharray="3 3" />
              ) : null,
            )}
            {[0, 25, 50, 75, 100].map((g) => (
              <line key={g} x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="rgb(var(--c-white) / 0.07)" strokeDasharray={g === 0 ? undefined : '2 5'} />
            ))}
            {/* Eje del esfuerzo, a la izquierda. */}
            <line x1={PAD.l - 8} x2={PAD.l - 8} y1={y(100)} y2={y(0)} stroke={BLUE} strokeWidth={2} strokeLinecap="round" />
            {[0, 25, 50, 75, 100].map((g) => (
              <text key={g} x={PAD.l - 14} y={y(g) + 4} textAnchor="end" fontSize={11} fontWeight={700} fill={BLUE}>
                {g}
              </text>
            ))}
            {/* Eje de la preparación, a la derecha: una barra con sus tres niveles. */}
            <rect x={W - PAD.r + 8} y={y(100)} width={3} height={y(65) - y(100)} rx={1.5} fill={GOOD} />
            <rect x={W - PAD.r + 8} y={y(65)} width={3} height={y(40) - y(65)} fill={MID} />
            <rect x={W - PAD.r + 8} y={y(40)} width={3} height={y(0) - y(40)} rx={1.5} fill={LOW} />
            {[
              [100, GOOD],
              [65, GOOD],
              [40, LOW],
              [0, LOW],
            ].map(([g, c]) => (
              <text key={g as number} x={W - PAD.r + 16} y={y(g as number) + 4} fontSize={11} fontWeight={700} fill={c as string}>
                {g}%
              </text>
            ))}

            {selected && n > 0 && points.findIndex((p) => p.iso === selected.iso) >= 0 && (
              <line x1={x(points.findIndex((p) => p.iso === selected.iso))} x2={x(points.findIndex((p) => p.iso === selected.iso))} y1={y(100)} y2={y(0)} stroke="rgb(var(--c-white) / 0.2)" strokeDasharray="3 4" />
            )}
            {line('readiness').map((pts, k) => (
              <polyline key={`r${k}`} points={pts} fill="none" stroke="rgb(var(--c-n-500) / 0.7)" strokeWidth={1.5} strokeLinejoin="round" />
            ))}
            {line('strain').map((pts, k) => (
              <polyline key={`s${k}`} points={pts} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {points.map((p, i) => {
              const on = p.iso === selectedIso;
              const rr = on ? r + 1.8 : r;
              return (
                <Fragment key={p.iso}>
                  {p.readiness !== null && <circle cx={x(i)} cy={y(p.readiness)} r={rr} fill="rgb(var(--c-brand-bg))" stroke={BAND_COLOR[readinessBand(p.readiness)]} strokeWidth={n <= 16 ? 2.5 : 2} />}
                  {p.strain !== null && <circle cx={x(i)} cy={y(p.strain)} r={rr} fill="rgb(var(--c-brand-bg))" stroke={BLUE} strokeWidth={n <= 16 ? 2.5 : 2} />}
                </Fragment>
              );
            })}
            {/* Eje de los días: con una semana, cada día; con más, cuatro fechas. */}
            {n <= 7
              ? points.map((p, i) => (
                  <g key={`x${p.iso}`}>
                    <text x={x(i)} y={H - PAD.b + 18} textAnchor="middle" fontSize={12} fontWeight={p.iso === selectedIso ? 800 : 600} className={p.iso === selectedIso ? 'fill-white' : 'fill-neutral-500'}>
                      {DAY_INITIAL[dow(p.iso)]}
                    </text>
                    <text x={x(i)} y={H - PAD.b + 33} textAnchor="middle" fontSize={11} className="fill-neutral-500">
                      {Number(p.iso.slice(8, 10))}
                    </text>
                    {p.iso === todayIso && <circle cx={x(i)} cy={H - PAD.b + 41} r={1.8} fill="rgb(var(--c-white))" />}
                  </g>
                ))
              : xTickIndexes(n).map((i, k, all) => (
                  <text key={points[i].iso} x={x(i)} y={H - PAD.b + 20} textAnchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'} fontSize={11} className="fill-neutral-500">
                    {fmtDay(points[i].iso)}
                  </text>
                ))}
            {points.map((p, i) => (
              <rect key={`h${p.iso}`} x={x(i) - Math.max(slot, 14) / 2} y={0} width={Math.max(slot, 14)} height={H} fill="transparent" className="cursor-pointer" onClick={() => onSelect(p.iso)} aria-label={`Ver ${fmtDay(p.iso)}`} />
            ))}
          </svg>

          {showHistograms && (
            <div className="mt-4 grid grid-cols-2 gap-5 border-t border-white/10 pt-4">
              <Histogram title="Esfuerzo" counts={bins.effort} colors={[BLUE, GOOD, MID]} labels={['debajo', 'dentro', 'encima']} />
              <Histogram title="Preparación" counts={bins.readiness} colors={[LOW, MID, GOOD]} labels={['0–40', '41–64', '65–100']} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: BLUE }} aria-hidden="true" />
              Esfuerzo
            </span>
            <span className="flex items-center gap-1.5">
              {[GOOD, MID, LOW].map((c) => (
                <span key={c} className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: c }} aria-hidden="true" />
              ))}
              Preparación
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3.5 rounded-sm border border-dashed" style={{ borderColor: 'rgb(var(--c-state-cool) / 0.55)', background: 'rgb(var(--c-state-cool) / 0.14)' }} aria-hidden="true" />
              Tu objetivo
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** Cuántos días cayeron en cada tramo, como columnas de cuadraditos (uno por día). */
function Histogram({ title, counts, colors, labels }: { title: string; counts: [number, number, number]; colors: string[]; labels: string[] }) {
  const max = Math.max(1, ...counts);
  const unit = Math.min(13, 64 / max);
  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">{title}</p>
      <div className="mt-2 grid h-[4.5rem] grid-cols-3 items-end gap-1">
        {counts.map((c, i) => (
          <div key={i} className="flex flex-col-reverse gap-[2px]" aria-label={`${labels[i]}: ${c} ${c === 1 ? 'día' : 'días'}`}>
            {Array.from({ length: c }, (_, k) => (
              <span key={k} className="block rounded-[2px]" style={{ height: unit - 2, background: colors[i] }} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[11px] leading-tight text-neutral-500">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
