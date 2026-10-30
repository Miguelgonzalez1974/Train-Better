import { Fragment, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { MIN_TREND_DAYS, dataDays, effortFit, readinessBand, type EffortFit, type ReadinessBand, type TrendPoint } from '../../engine/weekTrend';
import { trendSummary, type SummaryRow, type SummarySeg } from '../../engine/trendSummary';
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
const H = 190;
const PAD = { l: 26, r: 40, t: 8, b: 30 };
/** Los ejes hablan bajito: el dato manda, los números de los ejes son del color de su serie pero apagados y sin negrita. */
const AXIS_OPACITY = 0.75;

/**
 * "Tu semana": el esfuerzo (azul, con la franja de tu objetivo de cada día) y la preparación (puntos del color de su nivel) sobre
 * los mismos días, para ver de un vistazo si empujas cuando el cuerpo está listo. Los días de descanso cuentan como esfuerzo 0 y el
 * esfuerzo previsto de hoy sale como un anillo discontinuo hasta que entrenas. Arriba, una frase que lee la semana; abajo, cuántos
 * días cayeron en cada tramo. Tocar un día lo elige en todo el Dashboard.
 */
export function WeekTrendCard({ build, selectedIso, todayIso, competitionDays, onSelect }: { build: (days: number, offsetDays?: number) => TrendPoint[]; selectedIso: string; todayIso: string; competitionDays?: number | null; onSelect: (iso: string) => void }) {
  const [range, setRange] = useState(7);
  const points = useMemo(() => build(range), [build, range]);
  const n = points.length;
  const enough = dataDays(points) >= MIN_TREND_DAYS;
  // El periodo anterior, de la misma longitud, para comparar.
  const prev = useMemo(() => build(range, range), [build, range]);
  const summary = useMemo(() => trendSummary(points, prev, { range, todayIso, competitionDays }), [points, prev, range, todayIso, competitionDays]);
  const [showMore, setShowMore] = useState(false);
  const selectedIndex = points.findIndex((p) => p.iso === selectedIso);
  const selected = selectedIndex >= 0 ? points[selectedIndex] : null;

  const x = (i: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + 12 + ((W - PAD.r - PAD.l - 24) * i) / (n - 1));
  const slot = n > 1 ? (W - PAD.r - PAD.l - 24) / (n - 1) : 40;
  const y = (v: number) => PAD.t + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - PAD.t - PAD.b);
  const r = n <= 8 ? 3.6 : n <= 16 ? 3 : 2.2;

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

  // El día elegido: lo real, o lo previsto si aún no hay esfuerzo (hoy antes de entrenar).
  const shownStrain = selected ? (selected.strain ?? selected.planned ?? null) : null;
  const isPlanned = Boolean(selected && selected.strain === null && selected.planned !== null);
  const fit = selected && shownStrain !== null ? effortFit({ strain: shownStrain, target: selected.target }) : 'unknown';
  // Hoy el día no ha terminado: un esfuerzo bajo es lo que llevas, no un veredicto.
  const todayRunning = Boolean(selected && selected.iso === todayIso && !isPlanned && fit === 'below');
  const shownFit: EffortFit = todayRunning ? 'unknown' : fit;

  return (
    <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Esfuerzo y preparación de la semana">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Tendencia</SectionLabel>
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-white/5 p-0.5">
          {RANGES.map((d) => (
            <button key={d} onClick={() => setRange(d)} aria-pressed={range === d} className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-200 ${range === d ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}>
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
          {summary.headline && (
            <div className="mt-4 flex items-start gap-2.5">
              <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-neutral-300" aria-hidden="true">
                <Sparkles size={12} strokeWidth={2.25} />
              </span>
              <p className="text-[13px] leading-snug text-neutral-200">{summary.headline}</p>
            </div>
          )}
          {/* Solo la frase a la vista; las líneas con los números (días dentro del objetivo, medias, comparación) a un toque. */}
          {summary.rows.length > 0 && (
            <div className="mt-2.5">
              {showMore && (
                <div className="mb-1 border-t border-white/[0.07]">
                  <SummaryRows rows={[...summary.rows, ...summary.more]} />
                </div>
              )}
              <button onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="text-[11px] font-medium text-neutral-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-neutral-300">
                {showMore ? 'Ocultar el detalle' : 'Ver el detalle'}
              </button>
            </div>
          )}

          {/* El día elegido: sus dos cifras, grandes y ligeras, con cómo cayeron. */}
          <div className="mt-5 flex min-h-[3.25rem] items-end justify-between gap-3">
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
              <div className="flex gap-6">
                <div className="text-right">
                  <p className="num text-[28px] font-medium leading-none" style={{ color: BLUE }}>
                    {shownStrain !== null ? `${isPlanned ? '~' : ''}${shownStrain}` : '—'}
                  </p>
                  <p className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-neutral-500">
                    {isPlanned ? 'Previsto' : 'Esfuerzo'}
                    {todayRunning ? ' · hasta ahora' : FIT_WORD[shownFit] ? ` · ${FIT_WORD[shownFit]}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-[28px] font-medium leading-none" style={{ color: selected.readiness !== null ? BAND_COLOR[readinessBand(selected.readiness)] : undefined }}>
                    {selected.readiness !== null ? Math.round(selected.readiness) : '—'}
                  </p>
                  <p className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-neutral-500">
                    Preparación{selected.readiness !== null ? ` · ${BAND_WORD[readinessBand(selected.readiness)]}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full overflow-visible" role="img" aria-label="Esfuerzo y preparación por día">
            {/* Tu objetivo de cada día, detrás de todo, como una franja suave. */}
            {points.map((p, i) =>
              p.target ? (
                <rect key={`t${p.iso}`} x={x(i) - Math.min(slot * 0.38, 14)} y={y(p.target.high)} width={Math.min(slot * 0.76, 28)} height={Math.max(3, y(p.target.low) - y(p.target.high))} rx={3} fill="rgb(var(--c-state-cool) / 0.13)" />
              ) : null,
            )}
            {[0, 25, 50, 75, 100].map((g) => (
              <line key={g} x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="rgb(var(--c-white) / 0.055)" />
            ))}
            {/* Escala del esfuerzo, a la izquierda: solo números. */}
            {[0, 25, 50, 75, 100].map((g) => (
              <text key={g} x={PAD.l - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill={BLUE} fillOpacity={AXIS_OPACITY}>
                {g}
              </text>
            ))}
            {/* Escala de la preparación, a la derecha: una barra fina con sus tres niveles. */}
            <rect x={W - PAD.r + 8} y={y(100)} width={2} height={y(65) - y(100)} rx={1} fill={GOOD} />
            <rect x={W - PAD.r + 8} y={y(65)} width={2} height={y(40) - y(65)} fill={MID} />
            <rect x={W - PAD.r + 8} y={y(40)} width={2} height={y(0) - y(40)} rx={1} fill={LOW} />
            {[
              [100, GOOD],
              [65, GOOD],
              [40, LOW],
              [0, LOW],
            ].map(([g, c]) => (
              <text key={g as number} x={W - PAD.r + 15} y={y(g as number) + 4} fontSize={11} fill={c as string} fillOpacity={AXIS_OPACITY}>
                {g}%
              </text>
            ))}

            {selectedIndex >= 0 && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={y(100)} y2={y(0)} stroke="rgb(var(--c-white) / 0.18)" />}
            {line('readiness').map((pts, k) => (
              <polyline key={`r${k}`} points={pts} fill="none" stroke="rgb(var(--c-n-500) / 0.55)" strokeWidth={1} strokeLinejoin="round" />
            ))}
            {line('strain').map((pts, k) => (
              <polyline key={`s${k}`} points={pts} fill="none" stroke={BLUE} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {points.map((p, i) => {
              const on = p.iso === selectedIso;
              const rr = on ? r + 1.6 : r;
              const sw = on ? 2 : 1.5;
              return (
                <Fragment key={p.iso}>
                  {p.readiness !== null && <circle cx={x(i)} cy={y(p.readiness)} r={rr} fill="rgb(var(--c-brand-bg))" stroke={BAND_COLOR[readinessBand(p.readiness)]} strokeWidth={sw} />}
                  {p.strain !== null && <circle cx={x(i)} cy={y(p.strain)} r={rr} fill="rgb(var(--c-brand-bg))" stroke={BLUE} strokeWidth={sw} />}
                  {p.strain === null && p.planned !== null && <circle cx={x(i)} cy={y(p.planned)} r={rr} fill="rgb(var(--c-brand-bg))" stroke={BLUE} strokeWidth={sw} strokeDasharray="1.6 1.6" />}
                </Fragment>
              );
            })}
            {/* Eje de los días: con una semana, cada día en una línea; con más, cuatro fechas. */}
            {n <= 7
              ? points.map((p, i) => (
                  <text key={`x${p.iso}`} x={x(i)} y={H - PAD.b + 19} textAnchor="middle" fontSize={11} fontWeight={p.iso === selectedIso ? 700 : 400} className={p.iso === selectedIso ? 'fill-white' : 'fill-neutral-500'}>
                    {DAY_INITIAL[dow(p.iso)]} {Number(p.iso.slice(8, 10))}
                  </text>
                ))
              : xTickIndexes(n).map((i, k, all) => (
                  <text key={points[i].iso} x={x(i)} y={H - PAD.b + 19} textAnchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'} fontSize={11} className="fill-neutral-500">
                    {fmtDay(points[i].iso)}
                  </text>
                ))}
            {points.map((p, i) => (
              <rect key={`h${p.iso}`} x={x(i) - Math.max(slot, 14) / 2} y={0} width={Math.max(slot, 14)} height={H} fill="transparent" className="cursor-pointer" onClick={() => onSelect(p.iso)} aria-label={`Ver ${fmtDay(p.iso)}`} />
            ))}
          </svg>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full border-[1.5px]" style={{ borderColor: BLUE }} aria-hidden="true" />
              Esfuerzo
            </span>
            <span className="flex items-center gap-1">
              {[GOOD, MID, LOW].map((c) => (
                <span key={c} className="inline-block h-2 w-2 rounded-full border-[1.5px]" style={{ borderColor: c }} aria-hidden="true" />
              ))}
              <span className="ml-0.5">Preparación</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-[2px]" style={{ background: 'rgb(var(--c-state-cool) / 0.22)' }} aria-hidden="true" />
              Tu objetivo
            </span>
          </div>
        </>
      )}
    </section>
  );
}

const DELTA_STYLE = { up: 'bg-good/10 text-good', eq: 'bg-white/[0.07] text-neutral-400', down: 'bg-warn/10 text-warn' } as const;
const DELTA_MARK = { up: '▲', eq: '▬', down: '▼' } as const;

function Seg({ seg }: { seg: SummarySeg }) {
  if (typeof seg === 'string') return <>{seg}</>;
  if ('b' in seg) return <b className="font-semibold text-white">{seg.b}</b>;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold ${DELTA_STYLE[seg.delta]}`}>
      {DELTA_MARK[seg.delta]} {seg.t}
    </span>
  );
}

/** Las líneas del resumen del coach: etiqueta pequeña a la izquierda, el dato a la derecha. */
function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[5.6rem_1fr] items-baseline gap-2.5 border-b border-white/[0.07] py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-500">{row.label}</p>
          <p className="text-[13px] leading-snug text-neutral-200">
            {row.segs.map((seg, i) => (
              <Seg key={i} seg={seg} />
            ))}
          </p>
        </div>
      ))}
    </>
  );
}
