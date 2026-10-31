import { useMemo } from 'react';
import { Sparkles, Trophy, TrendingUp } from 'lucide-react';
import {
  addDays,
  atCompetition,
  formAdvice,
  formDecision,
  formMissing,
  formToday,
  signed,
  stateByDay,
  FORM_STATE_WORD,
  type CompetitionWindow,
  type FormSeries,
  type FormState,
  type FormWindow,
} from '../../engine/formCurve';
import { Fold } from '../shell/Fold';
import { Term } from '../shell/Term';
import { ChartLegend, LegendItem, fmtDay, xTickIndexes } from './ChartKit';
import { windowCause, type FormModel } from './formModel';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const FIT = 'rgb(var(--c-state-cool))';
const FAT = 'rgb(var(--c-state-mid))';
const GOLD = 'rgb(var(--c-brand-gold))';

/** El color de cada estado de la forma: ventana abierta en verde, cargado en rojo, en equilibrio neutro. */
export const FORM_TONE: Record<FormState, string> = { ventana: GOOD, equilibrio: 'rgb(var(--c-white) / 0.75)', cargado: LOW };

const W = 340;
const H = 236;
const PAD = { l: 10, r: 10 };
const TOP = { y0: 16, y1: 124 }; // panel de las dos curvas
const BARS = { y0: 150, y1: 208 }; // panel de las barras de forma
const AXIS_Y = 228;
/** Cuántos días se dibujan: dos semanas atrás y tres por delante. */
const PAST_DAYS = 14;
const FUTURE_DAYS = 21;

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

/** "jue 5 nov". */
const shortDay = (iso: string) => new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace(',', '').replace('.', '');

/** El tramo que se dibuja: dos semanas atrás, hoy y tres semanas por delante. */
function visible(series: FormSeries) {
  const t = series.todayIndex;
  const from = Math.max(0, t - PAST_DAYS);
  return { pts: series.points.slice(from, t + FUTURE_DAYS + 1), todayIdx: t - from };
}

/**
 * La curva: arriba la forma física (azul) y la fatiga (ámbar), abajo la forma de cada día en barras. Franja verde en las ventanas de
 * supercompensación, dorada en la competición; lo ya vivido en continuo y la previsión en discontinuo. Con competición cerca, la
 * línea blanca de puntos es la forma que tendrías sin bajar la carga: la comparación vive en el propio dibujo.
 */
function FormChart({ plan, ghost, comp, windows }: { plan: FormSeries; ghost: FormSeries | null; comp: CompetitionWindow | null; windows: FormWindow[] }) {
  const { pts, todayIdx: t } = useMemo(() => visible(plan), [plan]);
  const ghostByIso = useMemo(() => (ghost ? new Map(ghost.points.map((p) => [p.iso, p.form])) : null), [ghost]);
  const n = pts.length;
  const step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
  const x = (i: number) => PAD.l + i * step;
  const lineMax = Math.max(...pts.flatMap((p) => [p.fitness, p.fatigue]), 10) * 1.08;
  const lineMin = Math.max(0, Math.min(...pts.flatMap((p) => [p.fitness, p.fatigue])) * 0.85);
  const yLine = (v: number) => TOP.y1 - ((v - lineMin) / Math.max(1, lineMax - lineMin)) * (TOP.y1 - TOP.y0);
  const ghostValues = ghostByIso ? pts.map((p) => Math.abs(ghostByIso.get(p.iso) ?? 0)) : [];
  const formMax = Math.max(...pts.map((p) => Math.abs(p.form)), ...ghostValues, 8);
  const zeroY = (BARS.y0 + BARS.y1) / 2;
  const yBar = (v: number) => zeroY - (v / formMax) * ((BARS.y1 - BARS.y0) / 2);

  const path = (k: 'fitness' | 'fatigue', from: number, to: number) =>
    pts
      .slice(from, to + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)} ${yLine(p[k]).toFixed(1)}`)
      .join(' ');

  const compFrom = comp ? pts.findIndex((p) => p.iso === comp.eventStart) : -1;
  const compTo = comp ? pts.reduce((acc, p, i) => (p.iso === comp.eventEnd ? i : acc), -1) : -1;
  // Las ventanas (las mismas de la lista), con su nombre solo en las que caben sin pisarse.
  const runs = useMemo(() => {
    const idx = new Map(pts.map((p, i) => [p.iso, i]));
    return windows.flatMap((w): Array<[number, number]> => {
      const a = idx.get(w.start);
      const b = idx.get(w.end);
      return a !== undefined && b !== undefined ? [[a, b]] : [];
    });
  }, [pts, windows]);
  let lastLabel = -Infinity;
  const ticks = xTickIndexes(n).filter((i) => Math.abs(i - t) >= 5 && (compFrom < 0 || Math.abs(i - compFrom) >= 5));
  const today = pts[t];
  const label = today ? `Forma de hoy ${signed(today.form)}` : 'Curva de forma';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${label}. Forma física, fatiga y forma de dos semanas atrás a tres por delante.`}>
      {runs.map(([a, b]) => {
        const label = x(a) - lastLabel > 58 && b >= t;
        if (label) lastLabel = x(a);
        return (
          <g key={a}>
            <rect x={x(a) - step / 2} y={TOP.y0 - 8} width={(b - a + 1) * step} height={BARS.y1 - TOP.y0 + 16} rx={8} fill={GOOD} fillOpacity={0.1} />
            {label && (
              <text x={x(a) + ((b - a) * step) / 2} y={TOP.y0 - 11} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOOD}>
                ventana
              </text>
            )}
          </g>
        );
      })}
      {compFrom >= 0 && (
        <rect x={x(compFrom) - step / 2} y={TOP.y0 - 8} width={(Math.max(compTo, compFrom) - compFrom + 1) * step} height={BARS.y1 - TOP.y0 + 16} rx={8} fill={GOLD} fillOpacity={0.2} />
      )}
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
      <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} className="stroke-white/20" strokeWidth={1} />
      {pts.map((p, i) => {
        const h = Math.max(1.5, Math.abs(yBar(p.form) - zeroY));
        const barW = Math.max(3, step * 0.62);
        return <rect key={p.iso} x={x(i) - barW / 2} y={p.form >= 0 ? zeroY - h : zeroY} width={barW} height={h} rx={2} fill={p.form >= 0 ? GOOD : LOW} fillOpacity={p.future ? 0.4 : 0.9} />;
      })}
      {ghostByIso && t < n - 1 && (
        <path
          d={pts
            .slice(t)
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(t + i).toFixed(1)} ${yBar(ghostByIso.get(p.iso) ?? p.form).toFixed(1)}`)
            .join(' ')}
          fill="none"
          stroke="rgb(var(--c-white))"
          strokeOpacity={0.65}
          strokeWidth={1.5}
          strokeDasharray="1.5 3"
          strokeLinecap="round"
        />
      )}
      <text x={PAD.l} y={BARS.y0 - 6} fontSize={11} className="fill-neutral-500">
        forma
      </text>
      {t >= 0 && (
        <g>
          <line x1={x(t)} x2={x(t)} y1={TOP.y0 - 8} y2={BARS.y1 + 8} stroke="rgb(var(--c-white))" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 3" />
          <text x={x(t)} y={AXIS_Y} fontSize={11} fontWeight={700} textAnchor="middle" className="fill-white">
            hoy
          </text>
        </g>
      )}
      {compFrom >= 0 && (
        <text x={(x(compFrom) + x(Math.max(compTo, compFrom))) / 2} y={AXIS_Y} fontSize={11} fontWeight={700} textAnchor="middle" fill={GOLD}>
          {Number(comp!.eventStart.slice(8))}
          {comp!.eventEnd !== comp!.eventStart ? `–${Number(comp!.eventEnd.slice(8))}` : ''}
        </text>
      )}
      {ticks.map((i, k, all) => (
        <text key={pts[i].iso} x={x(i)} y={AXIS_Y} fontSize={11} textAnchor={k === 0 ? 'start' : k === all.length - 1 && i === n - 1 ? 'end' : 'middle'} className="fill-neutral-500">
          {fmtDay(pts[i].iso)}
        </text>
      ))}
    </svg>
  );
}

const DAY_HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Cinco semanas desde el lunes de esta: cada día pintado como ventana, cargado, competición o en equilibrio. */
function WindowCalendar({ model }: { model: FormModel }) {
  const { plan, comp, todayIso } = model;
  const states = useMemo(() => stateByDay(plan), [plan]);
  const inWindow = useMemo(() => {
    const set = new Set<string>();
    for (const w of model.allWindows) {
      for (let iso = w.start; iso <= w.end; iso = addDays(iso, 1)) set.add(iso);
    }
    return set;
  }, [model.allWindows]);
  const monday = addDays(todayIso, -((new Date(`${todayIso}T12:00:00`).getDay() + 6) % 7));
  const cells = Array.from({ length: 35 }, (_, i) => addDays(monday, i));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="Calendario de las próximas cinco semanas con tus ventanas de supercompensación">
        {DAY_HEAD.map((d) => (
          <p key={d} className="pb-0.5 text-center text-[11px] text-neutral-500">
            {d}
          </p>
        ))}
        {cells.map((iso) => {
          const isComp = comp && iso >= comp.eventStart && iso <= comp.eventEnd;
          const past = iso < todayIso;
          const known = states.has(iso);
          const win = inWindow.has(iso);
          const loaded = known && states.get(iso) === 'cargado' && !past;
          const style = isComp
            ? { background: 'rgb(var(--c-brand-gold) / 0.28)', color: GOLD, fontWeight: 700 }
            : win
              ? { background: 'rgb(var(--c-state-good) / 0.22)', color: GOOD, fontWeight: 700 }
              : loaded
                ? { background: 'rgb(var(--c-state-low) / 0.14)', color: LOW }
                : undefined;
          return (
            <div
              key={iso}
              className={`num flex aspect-square items-center justify-center rounded-lg text-[11px] ${style ? '' : 'bg-white/[0.045] text-neutral-400'} ${past ? 'opacity-45' : ''} ${iso === todayIso ? 'outline outline-[1.5px] outline-white/70' : ''}`}
              style={style}
              aria-label={`${shortDay(iso)}${isComp ? ', competición' : win ? ', ventana' : ''}`}
            >
              {Number(iso.slice(8))}
            </div>
          );
        })}
      </div>
      <ChartLegend>
        <LegendItem color={GOOD} label="ventana" shape="bar" />
        <LegendItem color={LOW} label="cargado" shape="bar" />
        {comp && <LegendItem color={GOLD} label="competición" shape="bar" />}
      </ChartLegend>
    </div>
  );
}

/**
 * La ventana "Tu forma". Arriba, qué hacer (la decisión, con cómo llegarías con tu plan frente a no bajar la carga); después la curva,
 * las próximas ventanas con su motivo y un calendario de cinco semanas para ver cuándo vuelve a abrirse. Todo sale de tus sesiones y
 * de tu plan: es una estimación y, pasadas dos semanas, orientativa.
 */
export function FormView({ model }: { model: FormModel }) {
  const { plan, steady, comp, todayIso } = model;
  const today = useMemo(() => formToday(plan), [plan]);
  const missing = formMissing(plan);

  if (!plan.ready || !today) {
    return (
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-neutral-300">
        <p>
          Esta curva necesita algo de historial para decir algo de fiar. Llevas <strong className="font-semibold text-white">{plan.sessions}</strong> sesiones registradas
          {missing.sessions > 0 ? `: faltan ${missing.sessions}` : ''}
          {missing.days > 0 ? `${missing.sessions > 0 ? ' y' : ':'} ${missing.days} ${missing.days === 1 ? 'día' : 'días'} más de historial` : ''}.
        </p>
        <p className="text-xs text-neutral-500">Mientras tanto, cada sesión que apuntas (también las de días pasados) la va afinando.</p>
      </div>
    );
  }

  const tone = FORM_TONE[today.state];
  const withPlan = atCompetition(plan, comp);
  const without = model.hasScenarios ? atCompetition(steady, comp) : null;
  const windows = model.windows.slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      {/* La decisión: cómo estás hoy, qué hacer y cómo llegarías con tu plan frente a no bajar la carga. */}
      <section className="rounded-[18px] border border-brand-gold/25 bg-gradient-to-br from-brand-gold/[0.14] to-brand-gold/[0.03] p-4" aria-label="Tu forma hoy">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="num text-4xl font-extrabold leading-none" style={{ color: tone }}>
              {signed(today.value)}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-white">{today.title}</p>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">hoy · {shortDay(todayIso)}</p>
        </div>
        <p className="mt-3.5 text-[15px] font-semibold leading-snug text-white">{formDecision(plan, model.hasScenarios ? steady : null, comp, todayIso)}</p>
        {withPlan && comp && (
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-white/[0.07] px-3 py-2.5">
              <p className="text-[11px] text-neutral-400">Con tu plan, el {Number(comp.eventStart.slice(8))} {shortDay(comp.eventStart).split(' ').pop()}</p>
              <p className="num mt-0.5 text-xl font-bold" style={{ color: FORM_TONE[withPlan.state] }}>
                {signed(withPlan.form)}
              </p>
              <p className="text-[11px] text-neutral-400">{FORM_STATE_WORD[withPlan.state]}</p>
            </div>
            {without && (
              <div className="rounded-[14px] bg-white/[0.07] px-3 py-2.5">
                <p className="text-[11px] text-neutral-400">Si no bajas la carga</p>
                <p className="num mt-0.5 text-xl font-bold" style={{ color: FORM_TONE[without.state] }}>
                  {signed(without.form)}
                </p>
                <p className="text-[11px] text-neutral-400">{FORM_STATE_WORD[without.state]}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2.5 rounded-[14px] bg-white/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-neutral-200">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
        <span>
          <b className="font-semibold text-white">Hoy:</b> {formAdvice(today.state, comp, todayIso)}
        </span>
      </p>

      <section aria-label="Curva de forma">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Tu forma · 2 semanas atrás, 3 por delante</p>
        <FormChart plan={plan} ghost={model.hasScenarios ? steady : null} comp={comp} windows={model.allWindows} />
        <ChartLegend>
          <LegendItem color={FIT} label="forma física" shape="line" />
          <LegendItem color={FAT} label="fatiga" shape="line" />
          <LegendItem color={GOOD} label="forma +" shape="bar" />
          <LegendItem color={LOW} label="forma −" shape="bar" />
          {model.hasScenarios && <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-3.5 border-t-2 border-dotted border-white/60" aria-hidden="true" />si no bajas la carga</span>}
          {comp && <LegendItem color={GOLD} label="competición" shape="bar" />}
        </ChartLegend>
      </section>

      {/* Cuándo vuelve: las próximas ventanas con su motivo, y el calendario de cinco semanas. */}
      <section aria-label="Próximas ventanas">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Próximas ventanas</p>
        {windows.length > 0 ? (
          <ul className="mt-1">
            {windows.map((w) => {
              const cause = windowCause(w, model);
              const isComp = cause.kind === 'competicion';
              return (
                <li key={w.start} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-white/[0.07] py-3 first:border-t-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: isComp ? 'rgb(var(--c-brand-gold) / 0.16)' : 'rgb(var(--c-state-good) / 0.14)', color: isComp ? GOLD : GOOD }}>
                    {isComp ? <Trophy size={17} strokeWidth={2.25} aria-hidden="true" /> : <TrendingUp size={17} strokeWidth={2.25} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{w.start === w.end ? shortDay(w.start) : `${shortDay(w.start)} → ${shortDay(w.end)}`}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{cause.label}</span>
                  </span>
                  <span className="num text-right text-lg font-extrabold leading-none" style={{ color: isComp ? GOLD : GOOD }}>
                    {signed(w.peak)}
                    <span className="mt-1 block text-[11px] font-medium text-neutral-500">máx.</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-300">Con tu plan no se abre ninguna ventana en las próximas semanas: se abren al bajar la carga unos días seguidos.</p>
        )}
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">Una ventana se abre cada vez que bajas la carga unos días (un descanso, una descarga, un taper). Con la carga siempre alta no aparece.</p>
      </section>

      <section aria-label="Las próximas semanas">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Las próximas semanas</p>
        <WindowCalendar model={model} />
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">Pasadas dos semanas es orientativo: se calcula con tu plan previsto y cambia según cómo entrenes.</p>
      </section>

      <Fold title="Cómo se calcula">
        <p className="text-xs leading-relaxed text-neutral-400">
          Cada sesión suma a tu <Term k="fitness">forma física</Term>, que sube y baja despacio, y a tu fatiga, que lo hace deprisa. Tu forma es la diferencia: si la fatiga cae antes que la forma física, queda un hueco a tu favor, la ventana de{' '}
          <Term k="supercompensacion">supercompensación</Term>. La previsión usa tu calendario: los días que entrenas, las semanas de descarga de tu macrociclo y, si hay competición, su cuenta atrás. Es una estimación a partir de tus sesiones; el check-in de cada mañana manda sobre ella.
        </p>
      </Fold>
    </div>
  );
}
