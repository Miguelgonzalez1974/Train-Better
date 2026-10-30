import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { formStateOf, formSentence, formToday, formMissing, signed, type CompetitionWindow, type FormSeries, type FormState } from '../../engine/formCurve';
import { Term } from '../shell/Term';
import { ChartLegend, LegendItem, fmtDay, xTickIndexes } from './ChartKit';
import type { FormModel } from './formModel';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const FIT = 'rgb(var(--c-state-cool))';
const FAT = 'rgb(var(--c-state-mid))';
const GOLD = 'rgb(var(--c-brand-gold))';

/** El color de cada estado de la forma: ventana abierta en verde, cargado en rojo, en equilibrio neutro. */
export const FORM_TONE: Record<FormState, string> = { ventana: GOOD, equilibrio: 'rgb(var(--c-white) / 0.75)', cargado: LOW };

const W = 320;
const H = 232;
const PAD = { l: 10, r: 10 };
const TOP = { y0: 14, y1: 124 }; // panel de las dos curvas
const BARS = { y0: 150, y1: 208 }; // panel de las barras de forma
const AXIS_Y = 226;

/**
 * La insignia de la fila "Tu forma": las dos curvas de los últimos 14 días en pequeño (forma física en azul, fatiga en ámbar) y,
 * entre ellas, el hueco que es la forma. Sin color de estado: la fila ya lo dice con el título.
 */
export function FormSpark({ series, tone }: { series: FormSeries; tone: string }) {
  const pts = series.points.filter((p) => !p.future).slice(-14);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.flatMap((p) => [p.fitness, p.fatigue]), 1);
  const min = Math.min(...pts.flatMap((p) => [p.fitness, p.fatigue]), max - 1);
  const w = 56;
  const h = 48;
  const x = (i: number) => 5 + (i / (pts.length - 1)) * (w - 10);
  const y = (v: number) => 6 + (1 - (v - min) / Math.max(1, max - min)) * (h - 12);
  const line = (k: 'fitness' | 'fatigue') => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-14 shrink-0 rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 10%, transparent)` }} aria-hidden="true">
      <path d={line('fitness')} fill="none" stroke={FIT} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <path d={line('fatigue')} fill="none" stroke={FAT} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].fitness)} r={2} fill={FIT} />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].fatigue)} r={2} fill={FAT} />
    </svg>
  );
}

/** Los tramos seguidos de días en ventana de supercompensación (índices de la serie). */
function windowRuns(series: FormSeries): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  series.points.forEach((p, i) => {
    const inWindow = formStateOf(p.form, p.fitness) === 'ventana';
    if (inWindow && start < 0) start = i;
    if ((!inWindow || i === series.points.length - 1) && start >= 0) {
      runs.push([start, inWindow ? i : i - 1]);
      start = -1;
    }
  });
  return runs;
}

function FormChart({ series, comp }: { series: FormSeries; comp: CompetitionWindow | null }) {
  const pts = series.points;
  const n = pts.length;
  const step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
  const x = (i: number) => PAD.l + i * step;
  const lineMax = Math.max(...pts.flatMap((p) => [p.fitness, p.fatigue]), 10) * 1.08;
  const lineMin = Math.max(0, Math.min(...pts.flatMap((p) => [p.fitness, p.fatigue])) * 0.85);
  const yLine = (v: number) => TOP.y1 - ((v - lineMin) / Math.max(1, lineMax - lineMin)) * (TOP.y1 - TOP.y0);
  const formMax = Math.max(...pts.map((p) => Math.abs(p.form)), 8);
  const zeroY = (BARS.y0 + BARS.y1) / 2;
  const yBar = (v: number) => zeroY - (v / formMax) * ((BARS.y1 - BARS.y0) / 2);

  const t = series.todayIndex;
  const path = (k: 'fitness' | 'fatigue', from: number, to: number) =>
    pts
      .slice(from, to + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)} ${yLine(p[k]).toFixed(1)}`)
      .join(' ');

  const compFrom = comp ? pts.findIndex((p) => p.iso === comp.eventStart) : -1;
  const compTo = comp ? pts.reduce((acc, p, i) => (p.iso === comp.eventEnd ? i : acc), -1) : -1;
  const runs = windowRuns(series);
  const ticks = xTickIndexes(n).filter((i) => Math.abs(i - t) >= 5);
  const today = pts[t];
  const label = today ? `Forma de hoy ${signed(today.form)}` : 'Curva de forma';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${label}. Forma física, fatiga y forma de los últimos 28 días y la previsión.`}>
      {/* La ventana de supercompensación: una franja verde suave que cruza los dos paneles. */}
      {runs.map(([a, b]) => (
        <g key={a}>
          <rect x={x(a) - step / 2} y={TOP.y0 - 6} width={(b - a + 1) * step} height={BARS.y1 - TOP.y0 + 12} rx={8} fill={GOOD} fillOpacity={0.09} />
          {b - a >= 1 && a >= t && (
            <text x={x(a) + ((b - a) * step) / 2} y={TOP.y0 - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOOD}>
              ventana
            </text>
          )}
        </g>
      ))}
      {/* La competición: franja dorada con su nombre. */}
      {compFrom >= 0 && (
        <g>
          <rect x={x(compFrom) - step / 2} y={TOP.y0 - 6} width={(Math.max(compTo, compFrom) - compFrom + 1) * step} height={BARS.y1 - TOP.y0 + 12} rx={8} fill={GOLD} fillOpacity={0.14} />
        </g>
      )}
      {/* Panel de arriba: forma física (azul) y fatiga (ámbar); lo ya vivido en continuo y la previsión en discontinuo. */}
      {[TOP.y0, (TOP.y0 + TOP.y1) / 2, TOP.y1].map((yy) => (
        <line key={yy} x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} className="stroke-white/[0.07]" strokeWidth={1} />
      ))}
      <path d={path('fitness', 0, t)} fill="none" stroke={FIT} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path('fatigue', 0, t)} fill="none" stroke={FAT} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {t < n - 1 && (
        <>
          <path d={path('fitness', t, n - 1)} fill="none" stroke={FIT} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
          <path d={path('fatigue', t, n - 1)} fill="none" stroke={FAT} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
        </>
      )}
      {today && (
        <>
          <circle cx={x(t)} cy={yLine(today.fitness)} r={3.5} fill={FIT} stroke="rgb(var(--c-brand-bg))" strokeWidth={1.5} />
          <circle cx={x(t)} cy={yLine(today.fatigue)} r={3.5} fill={FAT} stroke="rgb(var(--c-brand-bg))" strokeWidth={1.5} />
        </>
      )}
      {/* Panel de abajo: la forma de cada día (forma física menos fatiga). */}
      <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} className="stroke-white/20" strokeWidth={1} />
      {pts.map((p, i) => {
        const h = Math.max(1.5, Math.abs(yBar(p.form) - zeroY));
        const barW = Math.max(3, step * 0.62);
        return (
          <rect
            key={p.iso}
            x={x(i) - barW / 2}
            y={p.form >= 0 ? zeroY - h : zeroY}
            width={barW}
            height={h}
            rx={2}
            fill={p.form >= 0 ? GOOD : LOW}
            fillOpacity={p.future ? 0.4 : 0.9}
          />
        );
      })}
      <text x={PAD.l} y={BARS.y0 - 6} fontSize={11} className="fill-neutral-500">
        forma
      </text>
      {/* Hoy. */}
      {t >= 0 && (
        <g>
          <line x1={x(t)} x2={x(t)} y1={TOP.y0 - 6} y2={BARS.y1 + 6} stroke="rgb(var(--c-white))" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 3" />
          <text x={x(t)} y={AXIS_Y} fontSize={11} fontWeight={700} textAnchor="middle" className="fill-white">
            hoy
          </text>
        </g>
      )}
      {ticks.map((i, k, all) => (
        <text key={pts[i].iso} x={x(i)} y={AXIS_Y} fontSize={11} textAnchor={k === 0 ? 'start' : k === all.length - 1 && i === n - 1 ? 'end' : 'middle'} className="fill-neutral-500">
          {fmtDay(pts[i].iso)}
        </text>
      ))}
    </svg>
  );
}

/**
 * La ventana "Tu forma": la curva de supercompensación en grande. Con una competición cerca se puede comparar tu plan (con el taper)
 * con seguir al mismo ritmo; sin competición, la previsión supone que sigues como las últimas cuatro semanas.
 */
export function FormView({ model }: { model: FormModel }) {
  const [scenario, setScenario] = useState<'plan' | 'steady'>('plan');
  const series = scenario === 'plan' ? model.plan : model.steady;
  const today = useMemo(() => formToday(series), [series]);
  const missing = formMissing(series);

  if (!series.ready || !today) {
    return (
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-neutral-300">
        <p>
          Esta curva necesita algo de historial para decir algo de fiar. Llevas <strong className="font-semibold text-white">{series.sessions}</strong> sesiones registradas
          {missing.sessions > 0 ? `: faltan ${missing.sessions}` : ''}
          {missing.days > 0 ? `${missing.sessions > 0 ? ' y' : ':'} ${missing.days} ${missing.days === 1 ? 'día' : 'días'} más de historial` : ''}.
        </p>
        <p className="text-xs text-neutral-500">Mientras tanto, cada sesión que apuntas (también las de días pasados) la va afinando.</p>
      </div>
    );
  }

  const tone = FORM_TONE[today.state];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="num text-4xl font-extrabold leading-none" style={{ color: tone }}>
            {signed(today.value)}
          </p>
          <p className="mt-1.5 text-sm font-semibold text-white">{today.title}</p>
        </div>
        {model.hasScenarios && (
          <div role="group" aria-label="Escenario de la previsión" className="flex rounded-full bg-white/[0.06] p-0.5 text-xs font-semibold">
            {(['plan', 'steady'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scenario === s}
                onClick={() => setScenario(s)}
                className={`rounded-full px-3 py-1.5 transition-colors duration-200 ${scenario === s ? 'bg-white/[0.14] text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                {s === 'plan' ? 'Mi plan' : 'Sin bajar'}
              </button>
            ))}
          </div>
        )}
      </div>
      <FormChart series={series} comp={model.comp} />
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-neutral-200">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
        <span>{formSentence(series, scenario, model.comp)}</span>
      </p>
      <ChartLegend>
        <LegendItem color={FIT} label="forma física" shape="line" />
        <LegendItem color={FAT} label="fatiga" shape="line" />
        <LegendItem color={GOOD} label="forma +" shape="bar" />
        <LegendItem color={LOW} label="forma −" shape="bar" />
        {model.comp && <LegendItem color={GOLD} label="competición" shape="bar" />}
      </ChartLegend>
      <p className="text-xs leading-relaxed text-neutral-500">
        Cada sesión suma a tu <Term k="fitness">forma física</Term>, que sube y baja despacio, y a tu fatiga, que lo hace deprisa. Tu forma es la
        diferencia: si la fatiga cae antes que la forma física, queda un hueco a tu favor, la ventana de <Term k="supercompensacion">supercompensación</Term>. Es una estimación a
        partir de tus sesiones; el check-in de cada mañana manda sobre ella.
      </p>
    </div>
  );
}
