import { useId, useMemo } from 'react';
import { Sparkles, Trophy, TrendingUp } from 'lucide-react';
import { addDays, formAdvice, formDecision, formMissing, formToday, signed, stateByDay, type CompetitionWindow, type FormSeries, type FormState, type FormWindow } from '../../engine/formCurve';
import { Fold } from '../shell/Fold';
import { Term } from '../shell/Term';
import { fmtDay, xTickIndexes } from './ChartKit';
import { windowCause, type FormModel } from './formModel';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const FIT = 'rgb(var(--c-state-cool))';
const FAT = 'rgb(var(--c-state-mid))';
const GOLD = 'rgb(var(--c-brand-gold))';
const INK = 'rgb(var(--c-white))';

/** El color de cada estado de la forma: ventana abierta en verde, cargado en rojo, en equilibrio neutro. */
export const FORM_TONE: Record<FormState, string> = { ventana: GOOD, equilibrio: 'rgb(var(--c-white) / 0.75)', cargado: LOW };

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
const dayNum = (iso: string) => Number(iso.slice(8));

/** El tramo que se dibuja: dos semanas atrás, hoy y tres semanas por delante. */
function visible(series: FormSeries) {
  const t = series.todayIndex;
  const from = Math.max(0, t - PAST_DAYS);
  return { pts: series.points.slice(from, t + FUTURE_DAYS + 1), todayIdx: t - from };
}

const W = 340;
const PAD = { l: 10, r: 10 };

/**
 * La curva de tu forma, una sola: por encima de la línea del cero estás fresco (verde) y por debajo, cargado (rojo). Lo ya vivido en
 * continuo y la previsión de tu plan en discontinuo. Las ventanas son franjas verdes y la competición una franja dorada con su
 * marcador sobre la curva y su etiqueta arriba, para encontrarla de un vistazo.
 */
function FormChart({ plan, comp, windows }: { plan: FormSeries; comp: CompetitionWindow | null; windows: FormWindow[] }) {
  const id = useId().replace(/:/g, '');
  const { pts, todayIdx: t } = useMemo(() => visible(plan), [plan]);
  const n = pts.length;
  const H = 236;
  const plot = { y0: 40, y1: 196 };
  const step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
  const x = (i: number) => PAD.l + i * step;
  const formMax = Math.max(...pts.map((p) => Math.abs(p.form)), 8) * 1.15;
  const zeroY = (plot.y0 + plot.y1) / 2;
  const y = (v: number) => zeroY - (v / formMax) * ((plot.y1 - plot.y0) / 2);

  const line = (from: number, to: number) =>
    pts
      .slice(from, to + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)} ${y(p.form).toFixed(1)}`)
      .join(' ');
  const area = `${line(0, n - 1)} L${x(n - 1).toFixed(1)} ${zeroY} L${x(0).toFixed(1)} ${zeroY} Z`;

  const idx = useMemo(() => new Map(pts.map((p, i) => [p.iso, i])), [pts]);
  const c0 = comp ? (idx.get(comp.eventStart) ?? -1) : -1;
  const c1 = comp ? (idx.get(comp.eventEnd) ?? c0) : -1;
  const runs = windows.flatMap((w): Array<[number, number]> => {
    const a = idx.get(w.start);
    const b = idx.get(w.end);
    return a !== undefined && b !== undefined && !(c0 >= 0 && a <= c1 && b >= c0) ? [[a, b]] : [];
  });
  const today = pts[t];
  const ticks = xTickIndexes(n).filter((i) => Math.abs(i - t) >= 5 && (c0 < 0 || Math.abs(i - c0) >= 5));

  // La etiqueta de la competición: una pastilla arriba, centrada en su franja y sin salirse del dibujo.
  const compLabel = comp ? `Competición · ${dayNum(comp.eventStart)}${comp.eventEnd !== comp.eventStart ? `–${dayNum(comp.eventEnd)}` : ''} ${fmtDay(comp.eventStart).split(' ').pop()}` : '';
  const pillW = compLabel.length * 6.4 + 22;
  const pillX = c0 >= 0 ? Math.min(Math.max(PAD.l, (x(c0) + x(c1)) / 2 - pillW / 2), W - PAD.r - pillW) : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Tu forma ${today ? signed(today.form) : ''}: dos semanas atrás y tres por delante, con tus ventanas de supercompensación${comp ? ' y la competición' : ''}.`}>
      <defs>
        <clipPath id={`${id}up`}>
          <rect x={0} y={plot.y0 - 4} width={W} height={zeroY - plot.y0 + 4} />
        </clipPath>
        <clipPath id={`${id}dn`}>
          <rect x={0} y={zeroY} width={W} height={plot.y1 - zeroY + 4} />
        </clipPath>
      </defs>
      {/* Las ventanas: franjas verdes con su nombre. */}
      {runs.map(([a, b]) => (
        <g key={a}>
          <rect x={x(a) - step / 2} y={plot.y0 - 6} width={(b - a + 1) * step} height={plot.y1 - plot.y0 + 12} rx={7} fill={GOOD} fillOpacity={0.12} />
          <text x={x(a) + ((b - a) * step) / 2} y={plot.y0 - 11} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOOD}>
            ventana
          </text>
        </g>
      ))}
      {/* La competición: franja dorada, línea y marcador sobre la curva, y su etiqueta arriba. */}
      {c0 >= 0 && (
        <g>
          <rect x={x(c0) - step / 2} y={plot.y0 - 6} width={(c1 - c0 + 1) * step} height={plot.y1 - plot.y0 + 12} rx={7} fill={GOLD} fillOpacity={0.24} />
          <line x1={x(c0)} x2={x(c0)} y1={22} y2={plot.y1 + 6} stroke={GOLD} strokeWidth={1.5} strokeOpacity={0.9} />
          <rect x={pillX} y={1} width={pillW} height={20} rx={10} fill={GOLD} fillOpacity={0.22} stroke={GOLD} strokeOpacity={0.6} />
          <text x={pillX + pillW / 2} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOLD}>
            {compLabel}
          </text>
        </g>
      )}
      {/* Fresco por encima del cero (verde), cargado por debajo (rojo). */}
      <g clipPath={`url(#${id}up)`}>
        <path d={area} fill={GOOD} fillOpacity={0.28} />
      </g>
      <g clipPath={`url(#${id}dn)`}>
        <path d={area} fill={LOW} fillOpacity={0.28} />
      </g>
      <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} stroke={INK} strokeOpacity={0.3} strokeWidth={1} />
      <path d={line(0, t)} fill="none" stroke={INK} strokeOpacity={0.92} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {t < n - 1 && <path d={line(t, n - 1)} fill="none" stroke={INK} strokeOpacity={0.92} strokeWidth={2.25} strokeDasharray="1 5" strokeLinecap="round" />}
      {c0 >= 0 && <circle cx={x(c0)} cy={y(pts[c0].form)} r={5.5} fill={GOLD} stroke="rgb(var(--c-brand-bg))" strokeWidth={2} />}
      {today && (
        <g>
          <line x1={x(t)} x2={x(t)} y1={plot.y0 - 6} y2={plot.y1 + 6} stroke={INK} strokeOpacity={0.5} strokeDasharray="3 3" />
          <circle cx={x(t)} cy={y(today.form)} r={5} fill={INK} stroke="rgb(var(--c-brand-bg))" strokeWidth={2} />
          <text x={x(t)} y={H - 10} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">
            hoy
          </text>
        </g>
      )}
      {ticks.map((i, k, all) => (
        <text key={pts[i].iso} x={x(i)} y={H - 10} fontSize={11} textAnchor={k === 0 ? 'start' : k === all.length - 1 && i === n - 1 ? 'end' : 'middle'} className="fill-neutral-500">
          {fmtDay(pts[i].iso)}
        </text>
      ))}
    </svg>
  );
}

/** La forma física (azul) y la fatiga (ámbar), de las que sale la forma: el detalle que explica la curva, para el plegable. */
function FormLines({ plan }: { plan: FormSeries }) {
  const { pts, todayIdx: t } = useMemo(() => visible(plan), [plan]);
  const n = pts.length;
  const H = 104;
  const step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
  const x = (i: number) => PAD.l + i * step;
  const all = pts.flatMap((p) => [p.fitness, p.fatigue]);
  const lo = Math.max(0, Math.min(...all) * 0.85);
  const hi = Math.max(...all, 10) * 1.08;
  const y = (v: number) => 90 - ((v - lo) / Math.max(1, hi - lo)) * 76;
  const path = (k: 'fitness' | 'fatigue', from: number, to: number) =>
    pts
      .slice(from, to + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)} ${y(p[k]).toFixed(1)}`)
      .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Forma física y fatiga de dos semanas atrás a tres por delante">
      {[14, 52, 90].map((yy) => (
        <line key={yy} x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke={INK} strokeOpacity={0.07} />
      ))}
      <path d={path('fitness', 0, t)} fill="none" stroke={FIT} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path('fatigue', 0, t)} fill="none" stroke={FAT} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {t < n - 1 && (
        <>
          <path d={path('fitness', t, n - 1)} fill="none" stroke={FIT} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" />
          <path d={path('fatigue', t, n - 1)} fill="none" stroke={FAT} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" />
        </>
      )}
      <line x1={x(t)} x2={x(t)} y1={8} y2={96} stroke={INK} strokeOpacity={0.4} strokeDasharray="3 3" />
      <circle cx={x(t)} cy={y(pts[t].fitness)} r={3.5} fill={FIT} stroke="rgb(var(--c-brand-bg))" strokeWidth={1.5} />
      <circle cx={x(t)} cy={y(pts[t].fatigue)} r={3.5} fill={FAT} stroke="rgb(var(--c-brand-bg))" strokeWidth={1.5} />
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
    <div className="grid grid-cols-7 gap-1" role="img" aria-label="Calendario de las próximas cinco semanas con tus ventanas de supercompensación">
      {DAY_HEAD.map((d) => (
        <p key={d} className="text-center text-[11px] leading-4 text-neutral-500">
          {d}
        </p>
      ))}
      {cells.map((iso) => {
        const isComp = comp && iso >= comp.eventStart && iso <= comp.eventEnd;
        const past = iso < todayIso;
        const win = inWindow.has(iso);
        const loaded = !past && states.get(iso) === 'cargado';
        const style = isComp
          ? { background: 'rgb(var(--c-brand-gold) / 0.3)', color: GOLD, fontWeight: 700 }
          : win
            ? { background: 'rgb(var(--c-state-good) / 0.22)', color: GOOD, fontWeight: 700 }
            : loaded
              ? { background: 'rgb(var(--c-state-low) / 0.14)', color: LOW }
              : undefined;
        return (
          <div
            key={iso}
            className={`num flex h-7 items-center justify-center rounded-md text-[11px] ${style ? '' : 'bg-white/[0.045] text-neutral-400'} ${past ? 'opacity-45' : ''} ${iso === todayIso ? 'outline outline-[1.5px] outline-white/70' : ''}`}
            style={style}
            aria-label={`${shortDay(iso)}${isComp ? ', competición' : win ? ', ventana' : ''}`}
          >
            {dayNum(iso)}
          </div>
        );
      })}
    </div>
  );
}

/** Un punto de color y su nombre, para la leyenda en una sola línea. */
function Key({ color, label, shape = 'dot' }: { color: string; label: string; shape?: 'dot' | 'bar' | 'dots' }) {
  return (
    <span className="flex items-center gap-1.5">
      {shape === 'dots' ? (
        <span className="inline-block h-0 w-3.5 border-t-2 border-dotted" style={{ borderColor: color }} aria-hidden="true" />
      ) : (
        <span className={`inline-block ${shape === 'bar' ? 'h-2 w-3 rounded-sm' : 'h-2 w-2 rounded-full'}`} style={{ background: color }} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

/**
 * La ventana "Tu forma", compacta: arriba cómo estás y qué hacer según tu plan; después la curva, las próximas ventanas con su motivo
 * y un calendario de cinco semanas para ver cuándo vuelve a abrirse. Todo sale de tus sesiones y de tu plan: es una estimación y,
 * pasadas dos semanas, orientativa.
 */
export function FormView({ model }: { model: FormModel }) {
  const { plan, comp, todayIso } = model;
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
  const windows = model.windows.slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      {/* Cómo estás y qué hacer, en una tarjeta. */}
      <section className="rounded-2xl border border-brand-gold/25 bg-gradient-to-br from-brand-gold/[0.13] to-brand-gold/[0.03] p-4" aria-label="Tu forma hoy">
        <div className="flex items-center gap-3.5">
          <p className="num text-[40px] font-extrabold leading-none" style={{ color: tone }}>
            {signed(today.value)}
          </p>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{today.title}</p>
            <p className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">hoy · {shortDay(todayIso)}</p>
          </div>
        </div>
        <p className="mt-3 text-[15px] font-semibold leading-snug text-white">{formDecision(plan, comp, todayIso)}</p>
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-snug text-neutral-300">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
          <span>{formAdvice(today.state, comp, todayIso)}</span>
        </p>
      </section>

      <section aria-label="Curva de forma">
        <FormChart plan={plan} comp={comp} windows={model.allWindows} />
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
          <Key color={GOOD} label="fresco / ventana" shape="bar" />
          <Key color={LOW} label="cargado" shape="bar" />
          {comp && <Key color={GOLD} label="competición" shape="bar" />}
          <Key color="rgb(var(--c-white) / 0.7)" label="previsión de tu plan" shape="dots" />
        </div>
      </section>

      {/* Cuándo vuelve: las próximas ventanas con su motivo, y el calendario de cinco semanas. */}
      <section aria-label="Próximas ventanas" className="rounded-2xl bg-white/[0.035] px-4 pb-4 pt-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Próximas ventanas</p>
        {windows.length > 0 ? (
          <ul>
            {windows.map((w) => {
              const cause = windowCause(w, model);
              const isComp = cause.kind === 'competicion';
              return (
                <li key={w.start} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/[0.07] py-2.5 last:border-b-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: isComp ? 'rgb(var(--c-brand-gold) / 0.18)' : 'rgb(var(--c-state-good) / 0.14)', color: isComp ? GOLD : GOOD }}>
                    {isComp ? <Trophy size={16} strokeWidth={2.25} aria-hidden="true" /> : <TrendingUp size={16} strokeWidth={2.25} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-white">{w.start === w.end ? shortDay(w.start) : `${shortDay(w.start)} → ${shortDay(w.end)}`}</span>
                    <span className="block text-[11px] leading-snug text-neutral-400">{cause.label}</span>
                  </span>
                  <span className="num text-right text-base font-extrabold leading-none" style={{ color: isComp ? GOLD : GOOD }}>
                    {signed(w.peak)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-300">Con tu plan no se abre ninguna ventana en las próximas semanas.</p>
        )}
        <div className="mt-2.5">
          <WindowCalendar model={model} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">Pasadas dos semanas es orientativo: cambia según cómo entrenes.</p>
      </section>

      <Fold title="Cómo se calcula">
        <div className="flex flex-col gap-3">
          <FormLines plan={plan} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
            <Key color={FIT} label="forma física" shape="bar" />
            <Key color={FAT} label="fatiga" shape="bar" />
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Cada sesión suma a tu <Term k="fitness">forma física</Term>, que sube y baja despacio, y a tu fatiga, que lo hace deprisa. Tu forma es la diferencia: cuando la fatiga cae antes que la forma física queda un hueco a tu favor, la ventana de{' '}
            <Term k="supercompensacion">supercompensación</Term>. La previsión usa tu calendario: los días que entrenas, las semanas de descarga de tu macrociclo y, si hay competición, su cuenta atrás. Es una estimación a partir de tus sesiones; el check-in de cada mañana manda sobre ella.
          </p>
        </div>
      </Fold>
    </div>
  );
}
