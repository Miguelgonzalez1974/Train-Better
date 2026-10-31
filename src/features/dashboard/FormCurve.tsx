import { useMemo, useState } from 'react';
import { Sparkles, Trophy, TrendingUp } from 'lucide-react';
import {
  ENERGY_LOW,
  ENERGY_TOP,
  addDays,
  energyOf,
  formAdvice,
  formDecision,
  formMissing,
  formToday,
  stateByDay,
  FORM_STATE_WORD,
  type CompetitionWindow,
  type FormSeries,
  type FormState,
  type FormWindow,
} from '../../engine/formCurve';
import { Fold } from '../shell/Fold';
import { Term } from '../shell/Term';
import { fmtDay } from './ChartKit';
import { shortDay, windowCause, type FormModel } from './formModel';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const FIT = 'rgb(var(--c-state-cool))';
const FAT = 'rgb(var(--c-state-mid))';
const GOLD = 'rgb(var(--c-brand-gold))';
const INK = 'rgb(var(--c-white))';
const BG = 'rgb(var(--c-brand-bg))';
const SURFACE = 'rgb(var(--c-brand-surface))';

/** El color de cada estado de la energía: a tope en verde, cansado en rojo y normal neutro. */
export const FORM_TONE: Record<FormState, string> = { ventana: GOOD, equilibrio: 'rgb(var(--c-white) / 0.75)', cargado: LOW };
/** El color de una barra: normal en gris, para que lo que importa (a tope y cansado) destaque. */
const BAR_TONE: Record<FormState, string> = { ventana: GOOD, equilibrio: 'rgb(var(--c-white) / 0.4)', cargado: LOW };

/** El gráfico enseña dos semanas que avanzan con los días: tres atrás (para ver de dónde vienes), hoy y diez por delante. */
const PAST_DAYS = 3;
const FUTURE_DAYS = 10;

/**
 * La insignia de la fila "Tu forma": una pequeña batería (el recuadro se llena de abajo arriba según tu energía de hoy) con el número
 * dentro, en el color de su estado. Es la misma idea que la insignia de esfuerzo de la sesión.
 */
export function EnergyBadge({ value, tone }: { value: number; tone: string }) {
  return (
    <span className="relative flex h-12 w-14 shrink-0 items-end overflow-hidden rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 10%, transparent)` }} aria-hidden="true">
      <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.max(6, value)}%`, background: `color-mix(in srgb, ${tone} 36%, transparent)` }} />
      <span className="num relative flex h-full w-full items-center justify-center text-lg font-semibold" style={{ color: tone }}>
        {value}
        <span className="text-[0.55em] font-medium">%</span>
      </span>
    </span>
  );
}

/** La batería grande de la cabecera: se llena según la energía y cambia de color con el estado. */
function Battery({ value, tone }: { value: number; tone: string }) {
  const fill = Math.round((92 * Math.max(4, value)) / 100);
  return (
    <svg width="46" height="70" viewBox="0 0 74 112" className="shrink-0" aria-hidden="true">
      <rect x="22" y="2" width="30" height="8" rx="3" fill={INK} fillOpacity={0.35} />
      <rect x="4" y="10" width="66" height="100" rx="14" fill="none" stroke={INK} strokeOpacity={0.4} strokeWidth={4} />
      <rect x="10" y={16 + (92 - fill)} width="54" height={fill} rx="8" fill={tone} />
    </svg>
  );
}

const dayNum = (iso: string) => Number(iso.slice(8));

/** El tramo que se dibuja: dos semanas que avanzan con los días (la ventana se desplaza cada día con "hoy"). Más allá, el calendario. */
function visible(series: FormSeries) {
  const t = series.todayIndex;
  const from = Math.max(0, t - PAST_DAYS);
  return { pts: series.points.slice(from, t + FUTURE_DAYS + 1), todayIdx: t - from };
}

const WEEKDAY_INITIAL = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const weekdayInitial = (iso: string) => WEEKDAY_INITIAL[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7];

const W = 340;
const PAD = { l: 10, r: 10 };
const H = 346;
const P1 = { y0: 50, y1: 150 }; // las curvas
const P2 = { y0: 178, y1: 290 }; // las barras de energía

type ChartMode = 'energia' | 'fisica';

/**
 * Dos paneles sobre dos semanas que avanzan con los días. Arriba, tu forma física (azul) y tu fatiga (ámbar), con su nombre escrito
 * junto a la línea; abajo, una barra de energía por día (verde a tope, gris normal, roja cansado) con su porcentaje escrito encima y
 * la zona "a tope" marcada. Bajo cada barra, la letra del día y su número (hoy, resaltado). Lo previsto va más claro (barras) o en
 * puntos (curvas). Las ventanas son franjas verdes que cruzan los dos paneles y la competición, una franja dorada con su pastilla
 * arriba. En la vista "Forma física y fatiga" las curvas ocupan todo el alto.
 */
function FormChart({ plan, comp, windows, mode }: { plan: FormSeries; comp: CompetitionWindow | null; windows: FormWindow[]; mode: ChartMode }) {
  const { pts, todayIdx: t } = useMemo(() => visible(plan), [plan]);
  const n = pts.length;
  const step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
  const x = (i: number) => PAD.l + i * step;
  const bottom = P2.y1;
  const energy = pts.map((p) => energyOf(p.form, p.fitness));
  const yBar = (v: number) => P2.y1 - (v / 100) * (P2.y1 - P2.y0);

  // La escala de las curvas: en la vista de energía ocupan el panel de arriba; en la otra, todo el alto.
  const top = P1.y0;
  const bot = mode === 'fisica' ? P2.y1 : P1.y1;
  const both = pts.flatMap((p) => [p.fitness, p.fatigue]);
  const lo = Math.min(...both) * 0.85;
  const hi = Math.max(...both, 10) * 1.08;
  const yLine = (v: number) => bot - ((v - lo) / Math.max(1, hi - lo)) * (bot - top);
  const path = (key: 'fitness' | 'fatigue', from: number, to: number) =>
    pts
      .slice(from, to + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)} ${yLine(p[key]).toFixed(1)}`)
      .join(' ');

  const idx = useMemo(() => new Map(pts.map((p, i) => [p.iso, i])), [pts]);
  const c0 = comp ? (idx.get(comp.eventStart) ?? -1) : -1;
  const c1 = comp ? (idx.get(comp.eventEnd) ?? c0) : -1;
  const runs = windows.flatMap((w): Array<[number, number]> => {
    const a = idx.get(w.start);
    const b = idx.get(w.end);
    return a !== undefined && b !== undefined && !(c0 >= 0 && a <= c1 && b >= c0) ? [[a, b]] : [];
  });
  const today = pts[t];

  // La pastilla de la competición: arriba, centrada en su franja y sin salirse del dibujo.
  const compLabel = comp ? `Competición · ${dayNum(comp.eventStart)}${comp.eventEnd !== comp.eventStart ? `–${dayNum(comp.eventEnd)}` : ''} ${fmtDay(comp.eventStart).split(' ').pop()}` : '';
  const pillW = compLabel.length * 6.4 + 22;
  const pillX = c0 >= 0 ? Math.min(Math.max(PAD.l, (x(c0) + x(c1)) / 2 - pillW / 2), W - PAD.r - pillW) : 0;
  const dotted = { strokeDasharray: '1 5', strokeLinecap: 'round' as const };

  const peakFat = Math.min(...pts.slice(0, t + 1).map((p) => yLine(p.fatigue)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Tu energía hoy ${today ? `${energy[t]} %` : ''}: dos semanas atrás y la previsión de tu plan, con tus ventanas de supercompensación${comp ? ' y la competición' : ''}.`}>
      {/* Las ventanas: franjas verdes con su nombre. */}
      {runs.map(([a, b]) => (
        <g key={a}>
          <rect x={x(a) - step / 2} y={P1.y0 - 8} width={(b - a + 1) * step} height={P2.y1 - P1.y0 + 16} rx={7} fill={GOOD} fillOpacity={0.1} />
          <text x={x(a) + ((b - a) * step) / 2} y={P1.y0 - 14} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOOD}>
            ventana
          </text>
        </g>
      ))}
      {/* La competición: franja dorada, línea y su pastilla arriba. */}
      {c0 >= 0 && (
        <g>
          <rect x={x(c0) - step / 2} y={P1.y0 - 8} width={(c1 - c0 + 1) * step} height={P2.y1 - P1.y0 + 16} rx={7} fill={GOLD} fillOpacity={0.22} />
          <line x1={x(c0)} x2={x(c0)} y1={22} y2={P2.y1 + 4} stroke={GOLD} strokeWidth={1.5} />
          <rect x={pillX} y={1} width={pillW} height={20} rx={10} fill={GOLD} fillOpacity={0.22} stroke={GOLD} strokeOpacity={0.6} />
          <text x={pillX + pillW / 2} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill={GOLD}>
            {compLabel}
          </text>
        </g>
      )}

      {/* Las dos curvas (arriba en la vista de energía, a todo el alto en la otra). */}
      {mode === 'fisica' &&
        [P1.y0, (P1.y0 + P2.y1) / 2, P2.y1].map((yy) => <line key={yy} x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke={INK} strokeOpacity={0.07} />)}
      {([['fitness', FIT], ['fatigue', FAT]] as const).map(([key, color]) => (
        <g key={key}>
          <path d={path(key, 0, t)} fill="none" stroke={color} strokeWidth={mode === 'fisica' ? 2.5 : 2.25} strokeLinecap="round" strokeLinejoin="round" />
          {t < n - 1 && <path d={path(key, t, n - 1)} fill="none" stroke={color} strokeWidth={mode === 'fisica' ? 2.5 : 2.25} {...dotted} />}
          {today && <circle cx={x(t)} cy={yLine(today[key])} r={4.5} fill={color} stroke={BG} strokeWidth={2} />}
        </g>
      ))}
      <text x={x(1)} y={peakFat - 7} fontSize={11} fontWeight={700} fill={FAT}>
        fatiga
      </text>
      <text x={x(1)} y={yLine(pts[1]?.fitness ?? 0) + 18} fontSize={11} fontWeight={700} fill={FIT}>
        forma física
      </text>
      {mode === 'fisica' && c0 >= 0 && <circle cx={x(c0)} cy={yLine(pts[c0].fatigue)} r={5.5} fill={GOLD} stroke={BG} strokeWidth={2} />}

      {/* Las barras de energía, con su zona "a tope". */}
      {mode === 'energia' && (
        <>
          <rect x={PAD.l} y={yBar(100)} width={W - PAD.l - PAD.r} height={yBar(ENERGY_TOP) - yBar(100)} fill={GOOD} fillOpacity={0.1} />
          <line x1={PAD.l} x2={W - PAD.r} y1={yBar(ENERGY_TOP)} y2={yBar(ENERGY_TOP)} stroke={GOOD} strokeOpacity={0.5} strokeDasharray="2 3" />
          <text x={PAD.l + 3} y={yBar(ENERGY_TOP) - 4} fontSize={11} fontWeight={700} fill={GOOD}>
            a tope
          </text>
          <line x1={PAD.l} x2={W - PAD.r} y1={P2.y1} y2={P2.y1} stroke={INK} strokeOpacity={0.25} />
          {pts.map((p, i) => {
            const isComp = c0 >= 0 && i >= c0 && i <= c1;
            const bw = Math.max(3, step * 0.7);
            const state = stateOfEnergy(energy[i]);
            return (
              <g key={p.iso}>
                <rect
                  x={x(i) - bw / 2}
                  y={yBar(energy[i])}
                  width={bw}
                  height={Math.max(1.5, P2.y1 - yBar(energy[i]))}
                  rx={3}
                  fill={isComp ? GOLD : BAR_TONE[state]}
                  fillOpacity={p.future ? 0.55 : 0.95}
                />
                {/* El porcentaje de cada día, escrito sobre su barra. */}
                <text
                  x={x(i)}
                  y={yBar(energy[i]) - 5}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={i === t ? 800 : 700}
                  fill={isComp ? GOLD : state === 'equilibrio' ? INK : FORM_TONE[state]}
                  fillOpacity={state === 'equilibrio' && !isComp && i !== t ? 0.7 : 1}
                  stroke={SURFACE}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {energy[i]}
                </text>
              </g>
            );
          })}
        </>
      )}

      {/* Hoy, y bajo cada barra la letra del día y su número: así se ve qué día es cada una según avanzan los días. */}
      {today && <line x1={x(t)} x2={x(t)} y1={P1.y0 - 8} y2={bottom + 6} stroke={INK} strokeOpacity={0.5} strokeDasharray="3 3" />}
      {pts.map((p, i) => {
        const isToday = i === t;
        const isComp = c0 >= 0 && i >= c0 && i <= c1;
        const color = isComp ? GOLD : isToday ? INK : 'rgb(var(--c-n-500))';
        return (
          <g key={`d${p.iso}`}>
            {isToday && <rect x={x(i) - step * 0.46} y={bottom + 8} width={step * 0.92} height={30} rx={8} fill={INK} fillOpacity={0.14} />}
            <text x={x(i)} y={bottom + 22} textAnchor="middle" fontSize={11} fontWeight={isToday ? 800 : 600} fill={color}>
              {isToday ? 'hoy' : weekdayInitial(p.iso)}
            </text>
            <text x={x(i)} y={bottom + 35} textAnchor="middle" fontSize={11} fontWeight={isToday || isComp ? 800 : 500} fill={color}>
              {dayNum(p.iso)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** El estado que le toca a una energía (las mismas reglas que `formStateOf`). */
function stateOfEnergy(e: number): FormState {
  return e >= ENERGY_TOP ? 'ventana' : e <= ENERGY_LOW ? 'cargado' : 'equilibrio';
}

const DAY_HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Cinco semanas desde el lunes de esta: cada día pintado como a tope (ventana), cansado, competición o normal. */
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
  const energyByDay = useMemo(() => new Map(plan.points.map((p) => [p.iso, energyOf(p.form, p.fitness)])), [plan]);
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
        const tired = !past && states.get(iso) === 'cargado';
        const style = isComp
          ? { background: 'rgb(var(--c-brand-gold) / 0.3)', color: GOLD, fontWeight: 700 }
          : win
            ? { background: 'rgb(var(--c-state-good) / 0.22)', color: GOOD, fontWeight: 700 }
            : tired
              ? { background: 'rgb(var(--c-state-low) / 0.14)', color: LOW }
              : undefined;
        const energy = energyByDay.get(iso);
        // El número del día arriba y su energía (%) debajo, en el color de su estado.
        const energyColor = isComp ? GOLD : win ? GOOD : tired ? LOW : undefined;
        return (
          <div
            key={iso}
            className={`num flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] leading-none ${style ? '' : 'bg-white/[0.045] text-neutral-400'} ${past ? 'opacity-45' : ''} ${iso === todayIso ? 'outline outline-[1.5px] outline-white/70' : ''}`}
            style={style}
            aria-label={`${shortDay(iso)}${energy !== undefined ? `, energía ${energy} %` : ''}${isComp ? ', competición' : win ? ', a tope' : ''}`}
          >
            <span className="opacity-80">{dayNum(iso)}</span>
            {energy !== undefined && (
              <span className="text-[12px] font-bold" style={energyColor ? { color: energyColor } : undefined}>
                {energy}%
              </span>
            )}
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

/** Una tarjeta pequeña con una cifra: hoy, la competición o la próxima ventana. */
function Tile({ label, value, tone, sub }: { label: string; value: string; tone: string; sub: string }) {
  return (
    <div className="rounded-[14px] bg-white/[0.05] px-2.5 py-2">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="num mt-0.5 text-lg font-extrabold leading-tight" style={{ color: tone }}>
        {value}
      </p>
      <p className="truncate text-[11px] text-neutral-400">{sub}</p>
    </div>
  );
}

/**
 * La ventana "Tu forma", en forma de batería: arriba cuánta energía tienes hoy y qué hacer según tu plan; después el gráfico de dos
 * paneles (curvas y barras de energía), tres cifras clave, las próximas ventanas con su motivo y un calendario de cinco semanas para ver
 * cuándo vuelve a abrirse. Todo sale de tus sesiones y de tu plan: es una estimación y, pasadas dos semanas, orientativa.
 */
export function FormView({ model }: { model: FormModel }) {
  const { plan, comp, todayIso } = model;
  const [mode, setMode] = useState<ChartMode>('energia');
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
  // La próxima ventana que no es la de la competición (esa ya tiene su propia tarjeta).
  const upcoming = model.windows.find((w) => windowCause(w, model).kind !== 'competicion');
  const week = plan.points[plan.todayIndex + 7];
  const weekEnergy = week ? energyOf(week.form, week.fitness) : null;
  const atEvent = comp ? plan.points.find((p) => p.iso === comp.eventStart && p.future) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Cuánta energía tienes y qué hacer, en una tarjeta con su batería. */}
      <section className="rounded-2xl border border-brand-gold/25 bg-gradient-to-br from-brand-gold/[0.13] to-brand-gold/[0.03] p-4" aria-label="Tu energía hoy">
        <div className="flex items-center gap-3.5">
          <Battery value={today.value} tone={tone} />
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="num text-4xl font-extrabold leading-none" style={{ color: tone }}>
                {today.value}%
              </span>
              <span className="text-sm font-bold" style={{ color: tone }}>
                {today.title} hoy
              </span>
            </p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-white">{formDecision(plan, comp, todayIso)}</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 border-t border-white/[0.08] pt-3 text-[13px] leading-snug text-neutral-300">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
          <span>{formAdvice(today.state, comp, todayIso)}</span>
        </p>
      </section>

      <section aria-label="Gráfico de energía">
        <div role="group" aria-label="Qué ver" className="mb-3 flex rounded-full bg-white/[0.06] p-0.5 text-xs font-semibold">
          {([['energia', 'Energía'], ['fisica', 'Forma física y fatiga']] as const).map(([m, text]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full px-3 py-1.5 transition-colors duration-200 ${mode === m ? 'bg-white/[0.14] text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              {text}
            </button>
          ))}
        </div>
        <FormChart plan={plan} comp={comp} windows={model.allWindows} mode={mode} />
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
          {mode === 'energia' ? (
            <>
              <Key color={GOOD} label="a tope" shape="bar" />
              <Key color="rgb(var(--c-white) / 0.4)" label="normal" shape="bar" />
              <Key color={LOW} label="cansado" shape="bar" />
            </>
          ) : (
            <>
              <Key color={FIT} label="forma física" shape="bar" />
              <Key color={FAT} label="fatiga" shape="bar" />
              <Key color={GOOD} label="ventana" shape="bar" />
            </>
          )}
          {comp && <Key color={GOLD} label="competición" shape="bar" />}
          <span>{mode === 'energia' ? 'barras claras = previsión de tu plan' : 'puntos = previsión de tu plan'}</span>
        </div>
      </section>

      {/* Tres cifras clave: hoy, la competición (o dentro de una semana) y la próxima ventana. */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Hoy" value={`${today.value}%`} tone={tone} sub={FORM_STATE_WORD[today.state]} />
        {atEvent && comp ? (
          <Tile label="Competición" value={`${energyOf(atEvent.form, atEvent.fitness)}%`} tone={GOLD} sub={shortDay(comp.eventStart).split(' ').slice(1).join(' ')} />
        ) : (
          <Tile label="En 7 días" value={weekEnergy !== null ? `${weekEnergy}%` : '—'} tone={week ? FORM_TONE[stateOfEnergy(weekEnergy ?? 0)] : INK} sub={week ? shortDay(week.iso).split(' ').slice(1).join(' ') : 'sin previsión'} />
        )}
        <Tile
          label="Próxima ventana"
          value={upcoming ? `${upcoming.peak}%` : '—'}
          tone={upcoming ? GOOD : INK}
          sub={upcoming ? (upcoming.start === upcoming.end ? `${dayNum(upcoming.start)} ${shortDay(upcoming.start).split(' ').pop()}` : `${dayNum(upcoming.start)}–${dayNum(upcoming.end)} ${shortDay(upcoming.end).split(' ').pop()}`) : 'ninguna aún'}
        />
      </div>

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
                    {w.peak}%
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
        <p className="text-xs leading-relaxed text-neutral-400">
          Cada sesión suma a tu <Term k="fitness">forma física</Term>, que sube y baja despacio, y a tu fatiga, que lo hace deprisa (míralas en la vista «Forma física y fatiga»). Tu forma es la diferencia, y la energía es esa forma pasada a una escala de 0 a 100: a tope desde el {ENERGY_TOP} %, cansado hasta el {ENERGY_LOW} %. Entrenando siempre igual oscilas entre el 30 y el 70 % según el día de la semana; solo llegas a tope cuando bajas la carga unos días. Cuando la fatiga cae antes que la forma física queda un hueco a tu favor, la ventana de{' '}
          <Term k="supercompensacion">supercompensación</Term>. La previsión usa tu calendario: los días que entrenas, las semanas de descarga de tu macrociclo y, si hay competición, su cuenta atrás. Se recalcula con cada sesión que registras. Solo cuenta lo que apuntas: si haces bici, entrenos de equipo u otro deporte y no lo registras (vale «Registrar este día» con su RPE y duración), el cálculo te verá más descansado de lo que estás. Es una estimación; el check-in de cada mañana manda sobre ella.
        </p>
      </Fold>
    </div>
  );
}
