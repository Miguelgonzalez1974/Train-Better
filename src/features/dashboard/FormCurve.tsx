import { useMemo, useState, type ReactNode } from 'react';
import { Activity, Dumbbell, Moon, Sparkles, Sun, Trophy, TrendingUp } from 'lucide-react';
import {
  ENERGY_LOW,
  ENERGY_TOP,
  addDays,
  sleepSummary,
  energyOf,
  pointEnergy,
  pointState,
  signed,
  formAdvice,
  formMissing,
  formToday,
  type CompetitionWindow,
  type FormSeries,
  type FormState,
  type FormWindow,
} from '../../engine/formCurve';
import { Fold } from '../shell/Fold';
import { Term } from '../shell/Term';
import { fmtDay } from './ChartKit';
import { getDayPlan, getWeekdayIndex } from '../../engine/periodization';
import { nextWindowInfo, shortDay, type FormModel } from './formModel';

const GOOD = 'rgb(var(--c-state-good))';
const LOW = 'rgb(var(--c-state-low))';
const FIT = 'rgb(var(--c-state-cool))';
const FAT = 'rgb(var(--c-state-mid))';
const GOLD = 'rgb(var(--c-brand-gold))';
const INK = 'rgb(var(--c-white))';
const BG = 'rgb(var(--c-brand-bg))';
const SURFACE = 'rgb(var(--c-brand-surface))';
/** El morado del sueño (el mismo de la pestaña Sueño). */
const SLEEP = 'rgb(var(--c-sleep))';
/** El color del coste real de las sesiones: el del esfuerzo de la sesión, naranja de acción. */
const COST = 'rgb(var(--c-brand-orange))';

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
  const energy = pts.map((p) => pointEnergy(p));
  const baseEnergy = pts.map((p) => energyOf(p.form, p.fitness));
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
  const runs = windows.flatMap((w): Array<{ a: number; b: number; peak: number }> => {
    const a = idx.get(w.start);
    const b = idx.get(w.end);
    return a !== undefined && b !== undefined && !(c0 >= 0 && a <= c1 && b >= c0) ? [{ a, b, peak: w.peak }] : [];
  });
  // Los días en ventana (sin la competición) llevan borde verde, y el mejor día de cada ventana una ★.
  const inRun = (i: number) => runs.some((r) => i >= r.a && i <= r.b);
  const peakDays = new Set(windows.map((w) => w.peakIso));
  const today = pts[t];

  // La pastilla de la competición: arriba, centrada en su franja y sin salirse del dibujo.
  const compLabel = comp ? `Competición · ${dayNum(comp.eventStart)}${comp.eventEnd !== comp.eventStart ? `–${dayNum(comp.eventEnd)}` : ''} ${fmtDay(comp.eventStart).split(' ').pop()}` : '';
  const pillW = compLabel.length * 6.4 + 22;
  const pillX = c0 >= 0 ? Math.min(Math.max(PAD.l, (x(c0) + x(c1)) / 2 - pillW / 2), W - PAD.r - pillW) : 0;
  const dotted = { strokeDasharray: '1 5', strokeLinecap: 'round' as const };

  const peakFat = Math.min(...pts.slice(0, t + 1).map((p) => yLine(p.fatigue)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Tu energía hoy ${today ? `${energy[t]} %` : ''}: dos semanas atrás y la previsión de tu plan, con tus ventanas de supercompensación${comp ? ' y la competición' : ''}.`}>
      {/* Las ventanas: una franja verde con un corchete arriba y su nombre con el pico. */}
      {runs.map(({ a, b, peak }) => {
        const left = x(a) - step * 0.4;
        const right = x(b) + step * 0.4;
        const text = `ventana · ${peak}%`;
        const tx = Math.min(Math.max((left + right) / 2, PAD.l + text.length * 3.1), W - PAD.r - text.length * 3.1);
        return (
          <g key={a}>
            <rect x={x(a) - step / 2} y={P1.y0 - 8} width={(b - a + 1) * step} height={P2.y1 - P1.y0 + 16} rx={7} fill={GOOD} fillOpacity={0.12} />
            <path d={`M${left} ${P1.y0 - 10} V${P1.y0 - 16} H${right} V${P1.y0 - 10}`} fill="none" stroke={GOOD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <text x={tx} y={P1.y0 - 22} textAnchor="middle" fontSize={11} fontWeight={800} fill={GOOD}>
              {text}
            </text>
          </g>
        );
      })}
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
            // La barra es la carga; si hubo sueño que contar, su tramo va aparte: sólido y morado si suma, recuadro discontinuo si resta.
            const low = Math.min(baseEnergy[i], energy[i]);
            const high = Math.max(baseEnergy[i], energy[i]);
            const adj = p.sleep ?? 0;
            return (
              <g key={p.iso}>
                <rect
                  x={x(i) - bw / 2}
                  y={yBar(low)}
                  width={bw}
                  height={Math.max(1.5, P2.y1 - yBar(low))}
                  rx={3}
                  fill={isComp ? GOLD : BAR_TONE[state]}
                  fillOpacity={p.future ? 0.55 : 0.95}
                  stroke={inRun(i) && !isComp ? GOOD : undefined}
                  strokeWidth={inRun(i) && !isComp ? 1.5 : undefined}
                />
                {adj > 0 && high > low && <rect x={x(i) - bw / 2} y={yBar(high)} width={bw} height={yBar(low) - yBar(high)} rx={3} fill={SLEEP} fillOpacity={0.95} />}
                {adj < 0 && high > low && <rect x={x(i) - bw / 2 + 0.75} y={yBar(high)} width={bw - 1.5} height={yBar(low) - yBar(high)} rx={3} fill="none" stroke={SLEEP} strokeWidth={1.5} strokeDasharray="3 2" />}
                {/* El porcentaje de cada día, escrito sobre su barra. */}
                <text
                  x={x(i)}
                  y={yBar(high) - 5}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={i === t ? 800 : 700}
                  fill={isComp ? GOLD : state === 'equilibrio' ? INK : FORM_TONE[state]}
                  fillOpacity={state === 'equilibrio' && !isComp && i !== t ? 0.7 : 1}
                  stroke={SURFACE}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {peakDays.has(p.iso) ? '★' : ''}
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
 * Una línea del desglose de la energía de hoy: su icono, qué es, de dónde sale y su valor. Si lleva `onClick` se puede tocar (la del
 * sueño lleva a la pestaña Sueño).
 */
function CalcLine({ label, sub, value, tone, icon, total = false, onClick }: { label: string; sub?: string; value: string; tone?: string; icon?: ReactNode; total?: boolean; onClick?: () => void }) {
  const body = (
    <>
      {icon !== undefined && (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tone ?? 'rgb(var(--c-white))'} 14%, transparent)`, color: tone ?? 'rgb(var(--c-n-300))' }} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={`min-w-0 text-left text-[13px] ${total ? 'font-bold text-white' : 'text-neutral-200'}`} style={tone ? { color: tone } : undefined}>
        {label}
        {sub && <span className="mt-0.5 block text-[11px] font-normal text-neutral-400">{sub}</span>}
      </span>
      <span className={`num ${total ? 'text-lg font-extrabold text-white' : 'text-[15px] font-extrabold'}`} style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </>
  );
  const cls = `grid items-center gap-2.5 ${icon !== undefined ? 'grid-cols-[auto_1fr_auto]' : 'grid-cols-[1fr_auto]'} ${total ? 'border-t border-dashed border-white/[0.18] pt-2' : ''}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} w-full rounded-lg text-left transition-colors duration-200 hover:bg-white/[0.04]`} aria-label={`${label}: ${value}. Ver la pestaña Sueño`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * "Lo que cuestan tus sesiones": de cada una de las últimas, lo que dice su RPE × duración (barra clara) frente a lo que desgasta de
 * verdad según su trabajo mecánico (barra de color) y la diferencia. Es lo que explica la línea "Coste real" de la cabecera.
 */
function CostRows({ rows }: { rows: FormModel['recentSessions'] }) {
  return (
    <div>
      <ul>
        {rows.map((r) => {
          const color = r.pct > 0 ? COST : r.pct < 0 ? GOOD : 'rgb(var(--c-white) / 0.4)';
          return (
            <li key={r.date} className="grid grid-cols-[2.6rem_1fr_auto] items-center gap-2.5 border-t border-white/[0.07] py-2.5 first:border-t-0">
              <span className="text-[11px] leading-tight text-neutral-400">
                {shortDay(r.date).split(' ')[0]}
                <b className="num block text-sm text-white">{dayNum(r.date)}</b>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-snug text-white">{r.title}</span>
                <span className="block text-[11px] leading-snug text-neutral-400">{r.detail}</span>
                <span className="mt-1.5 flex flex-col gap-[3px]" aria-hidden="true">
                  <i className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, r.base)}%`, background: 'rgb(var(--c-white) / 0.22)' }} />
                  <i className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, r.real)}%`, background: color }} />
                </span>
              </span>
              <span className="num text-[13px] font-extrabold" style={{ color }}>
                {r.pct === 0 ? '±0' : `${r.pct > 0 ? '+' : '−'}${Math.abs(r.pct)}%`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-neutral-500">La barra clara es lo que dice el RPE × duración; la de color, lo que desgasta de verdad según el trabajo mecánico (barra, impacto, agarre, hombro). Es una estimación.</p>
    </div>
  );
}
/**
 * "Tu próxima ventana": la cuenta atrás hasta que se abre (o hasta cuándo dura si ya estás en ella), sus fechas, su pico y un consejo.
 * Solo la primera ventana: cada una de las siguientes traerá su consejo cuando le toque.
 */
function NextWindowCard({ model }: { model: FormModel }) {
  const info = nextWindowInfo(model);
  if (!info) {
    return (
      <section className="rounded-2xl bg-white/[0.045] p-4" aria-label="Tu próxima ventana">
        <p className="text-[15px] font-extrabold text-white">Ninguna ventana a la vista</p>
        <p className="mt-1.5 text-[13px] leading-snug text-neutral-300">Con tu plan no se abre ninguna ventana en las próximas semanas. Se abren tras unos días de menos carga: un descanso, una descarga o un taper.</p>
      </section>
    );
  }
  const isComp = info.kind === 'competicion';
  const tone = isComp ? GOLD : GOOD;
  // La barrita de días hasta que se abre (solo si falta poco: con más, el título ya lo dice).
  const dots = !info.open && info.daysToOpen <= 14 ? info.daysToOpen + 1 : 0;
  return (
    <section
      className="rounded-2xl border p-4"
      style={{ borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`, background: `linear-gradient(160deg, color-mix(in srgb, ${tone} 14%, transparent), color-mix(in srgb, ${tone} 3%, transparent))` }}
      aria-label="Tu próxima ventana"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-extrabold leading-tight text-white">{info.title}</p>
          <p className="mt-1.5 text-[12px] leading-snug text-neutral-300">{info.detail}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}>
          {isComp ? <Trophy size={18} strokeWidth={2.25} aria-hidden="true" /> : <TrendingUp size={18} strokeWidth={2.25} aria-hidden="true" />}
        </span>
      </div>
      {dots > 0 && (
        <div className="mt-3 flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => (
            <span key={i} className="h-2 flex-1 rounded-full" style={{ background: i === dots - 1 ? tone : i === 0 ? 'rgb(var(--c-white) / 0.5)' : 'rgb(var(--c-white) / 0.12)' }} />
          ))}
        </div>
      )}
      <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-neutral-200">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
        <span>{info.advice}</span>
      </p>
    </section>
  );
}

const RIBBON = { W: 340, H: 196, pl: 8, pr: 8, top: 22, bottom: 176 };

/**
 * La cinta de 5 semanas: tu energía prevista como una línea, las ventanas como columnas verdes (la competición en dorado) con su pico y
 * sus fechas debajo, y los entrenos de tu plan como puntos (verdes si caen dentro de una ventana). Para ver de un vistazo cuándo vuelve
 * a abrirse una ventana y cuánto dura; más allá de dos semanas es orientativo.
 */
function FormRibbon({ model }: { model: FormModel }) {
  const { plan, comp, todayIso } = model;
  const pts = useMemo(() => plan.points.slice(plan.todayIndex, plan.todayIndex + 35), [plan]);
  const n = pts.length;
  const { W, H, pl, pr, top, bottom } = RIBBON;
  const dx = (W - pl - pr) / Math.max(1, n);
  const x = (i: number) => pl + i * dx;
  const yE = (v: number) => 96 - v * 0.58;
  const energy = pts.map((p) => pointEnergy(p));
  const idx = useMemo(() => new Map(pts.map((p, i) => [p.iso, i])), [pts]);
  const wins = model.windows.flatMap((w) => {
    const a = Math.max(0, idx.get(w.start) ?? (w.start < todayIso ? 0 : -1));
    const b = idx.get(w.end) ?? (w.end > (pts[n - 1]?.iso ?? '') ? n - 1 : -1);
    return a >= 0 && b >= 0 ? [{ w, a, b, comp: Boolean(comp && w.start <= comp.eventEnd && w.end >= addDays(comp.eventStart, -2) && w.start >= addDays(comp.eventStart, -2)) }] : [];
  });
  const inWin = (i: number) => wins.find((q) => i >= q.a && i <= q.b);
  const mondays = pts.map((p, i) => ({ p, i })).filter(({ p }) => new Date(`${p.iso}T12:00:00`).getDay() === 1);
  const range = (a: number, b: number) => (a === b ? `${dayNum(pts[a].iso)}` : `${dayNum(pts[a].iso)}–${dayNum(pts[b].iso)}`);
  const line = pts.map((_, i) => `${(x(i) + dx / 2).toFixed(1)},${yE(energy[i]).toFixed(1)}`);
  const label = (a: number, b: number) => Math.min(Math.max(x(a) + ((b - a + 1) * dx) / 2, 24), W - 24);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Tus próximas cinco semanas: energía prevista, ventanas de supercompensación y entrenos de tu plan">
      {mondays.map(({ p, i }) => (
        <g key={p.iso}>
          <line x1={x(i)} x2={x(i)} y1={top} y2={bottom} stroke={INK} strokeOpacity={0.07} />
          <text x={x(i) + 3} y={14} fontSize={11} className="fill-neutral-500">
            {fmtDay(p.iso)}
          </text>
        </g>
      ))}
      {wins.map(({ w, a, b, comp: isComp }) => (
        <rect key={w.start} x={x(a)} y={top} width={(b - a + 1) * dx} height={bottom - top} rx={6} fill={isComp ? GOLD : GOOD} fillOpacity={isComp ? 0.2 : 0.13} />
      ))}
      <path d={`M${x(0) + dx / 2},96 L${line.join(' L')} L${x(n - 1) + dx / 2},96 Z`} fill={INK} fillOpacity={0.07} />
      <path d={`M${line.join(' L')}`} fill="none" stroke={INK} strokeOpacity={0.75} strokeWidth={1.8} strokeLinejoin="round" />
      <line x1={pl} x2={W - pr} y1={yE(ENERGY_TOP)} y2={yE(ENERGY_TOP)} stroke={GOOD} strokeOpacity={0.5} strokeDasharray="2 3" />
      <text x={W - pr - 2} y={yE(ENERGY_TOP) - 3} textAnchor="end" fontSize={11} fontWeight={700} fill={GOOD}>
        a tope
      </text>
      <text x={pl + 2} y={118} fontSize={11} className="fill-neutral-500">
        entrenos del plan
      </text>
      {pts.map((p, i) => {
        if (!getDayPlan(getWeekdayIndex(new Date(`${p.iso}T12:00:00`)), model.trainingDaysPerWeek).isTrainingDay) return null;
        const q = inWin(i);
        return <circle key={p.iso} cx={x(i) + dx / 2} cy={134} r={3.4} fill={q ? (q.comp ? GOLD : GOOD) : INK} fillOpacity={q ? 1 : 0.42} />;
      })}
      {wins.map(({ w, a, b, comp: isComp }) => {
        const c = isComp ? GOLD : GOOD;
        return (
          <g key={`b${w.start}`}>
            <rect x={x(a) + 1} y={148} width={(b - a + 1) * dx - 2} height={8} rx={4} fill={c} />
            <text x={label(a, b)} y={170} textAnchor="middle" fontSize={12} fontWeight={800} fill={c}>
              {w.peak}%
            </text>
            <text x={label(a, b)} y={183} textAnchor="middle" fontSize={11} className="fill-neutral-400">
              {range(a, b)}
            </text>
          </g>
        );
      })}
      <line x1={x(0) + dx / 2} x2={x(0) + dx / 2} y1={top} y2={bottom} stroke={INK} strokeOpacity={0.6} strokeDasharray="3 3" />
      <circle cx={x(0) + dx / 2} cy={yE(energy[0])} r={4} fill={INK} />
      <text x={x(0) + dx / 2 + 4} y={34} fontSize={11} fontWeight={800} className="fill-white">
        hoy
      </text>
    </svg>
  );
}

/**
 * La ventana "Tu forma", en forma de batería: arriba cuánta energía tienes hoy (con de dónde sale y qué hacer), después cuándo se abre tu
 * próxima ventana con su consejo, el gráfico de dos semanas (curvas y barras de energía) y la cinta de cinco semanas con las
 * ventanas que vienen. Todo sale de tus sesiones, tu check-in y tu plan: es una estimación y, pasadas dos semanas, orientativa.
 */
export function FormView({ model, onOpenMorning, onOpenSleep }: { model: FormModel; onOpenMorning?: () => void; onOpenSleep?: () => void }) {
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
  const todayPoint = plan.points[plan.todayIndex];
  const prevPoint = plan.todayIndex > 0 ? plan.points[plan.todayIndex - 1] : undefined;
  // Las tres piezas de la energía de hoy: la carga pura, lo que suma o resta el coste real de las sesiones y lo que suma o resta el sueño.
  const withCost = energyOf(todayPoint.form, todayPoint.fitness);
  const baseToday = todayPoint.energyNoCost ?? withCost;
  const costToday = withCost - baseToday;
  const sleepToday = todayPoint.sleep ?? 0;
  const hasSleep = todayPoint.sleepNights !== undefined;
  // ¿Hay algún sueño a la vista en el gráfico? Entonces la leyenda explica el morado.
  const anySleep = plan.points.slice(Math.max(0, plan.todayIndex - PAST_DAYS), plan.todayIndex + 1).some((p) => (p.sleep ?? 0) !== 0);
  const costRows = model.recentSessions.filter((r) => r.pct !== 0 || r.base > 0);
  const hasCostInfo = costRows.some((r) => r.pct !== 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Cuánta energía tienes hoy, de dónde sale y qué hacer hoy. */}
      <section className="rounded-2xl border border-brand-gold/25 bg-gradient-to-br from-brand-gold/[0.13] to-brand-gold/[0.03] p-4" aria-label="Tu energía hoy">
        <div className="flex items-center gap-3.5">
          <Battery value={today.value} tone={tone} />
          <p className="flex items-baseline gap-2">
            <span className="num text-4xl font-extrabold leading-none" style={{ color: tone }}>
              {today.value}%
            </span>
            <span className="text-sm font-bold" style={{ color: tone }}>
              {today.title} hoy
            </span>
          </p>
        </div>
        {/* De dónde sale el número: la carga acumulada, el coste real de las sesiones y el sueño. */}
        <div className="mt-3 flex flex-col gap-2.5 border-t border-white/[0.08] pt-3">
          <CalcLine
            icon={<Activity size={14} aria-hidden="true" />}
            label="Carga acumulada"
            sub={prevPoint && prevPoint.load > 0 ? 'ayer entrenaste: esa fatiga cuenta hoy' : 'sin carga ayer: amaneces descansado'}
            value={`${baseToday}%`}
          />
          {costToday !== 0 && (
            <CalcLine
              icon={<Dumbbell size={14} aria-hidden="true" />}
              tone={COST}
              label="Coste real de las sesiones"
              sub={costToday < 0 ? 'tus últimas sesiones desgastan más que su RPE' : 'tus últimas sesiones desgastan menos que su RPE'}
              value={costToday > 0 ? `+${costToday}` : `−${Math.abs(costToday)}`}
            />
          )}
          {hasSleep ? (
            <CalcLine
              icon={<Moon size={14} aria-hidden="true" />}
              tone={SLEEP}
              label="Sueño"
              sub={sleepSummary({ points: sleepToday, avgHours: todayPoint.sleepAvg ?? 0, nights: todayPoint.sleepNights ?? 1 })}
              value={sleepToday === 0 ? '±0' : signed(sleepToday)}
              onClick={onOpenSleep}
            />
          ) : (
            <div className="text-[12px] leading-snug text-neutral-400">
              Sin el check-in de hoy no cuento tu sueño: dormir bien o mal no se nota.
              {onOpenMorning && (
                <button type="button" onClick={onOpenMorning} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-white/[0.16] bg-white/[0.05] px-3 py-2 text-xs font-semibold text-neutral-100 transition-colors duration-200 hover:border-brand-gold hover:text-brand-gold">
                  <Sun size={13} aria-hidden="true" /> Hacer el check-in de hoy
                </button>
              )}
            </div>
          )}
          {(costToday !== 0 || hasSleep) && <CalcLine total label="Energía de hoy" value={`${today.value}%`} />}
        </div>
        <p className="mt-3 flex items-start gap-2 border-t border-white/[0.08] pt-3 text-[13px] leading-snug text-neutral-300">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
          <span>{formAdvice(today.state, comp, todayIso)}</span>
        </p>
      </section>

      {/* Ayer y hoy: así se entiende por qué un día de descanso puede amanecer con menos energía que el de ayer. */}
      {prevPoint && (
        <section className="flex items-center justify-around rounded-2xl bg-white/[0.045] px-4 py-3" aria-label="Ayer y hoy">
          <div className="text-center">
            <p className="text-[11px] text-neutral-400">Ayer · {shortDay(prevPoint.iso).split(' ').slice(0, 2).join(' ')}</p>
            <p className="num text-2xl font-extrabold leading-tight" style={{ color: FORM_TONE[pointState(prevPoint)] }}>
              {pointEnergy(prevPoint)}%
            </p>
          </div>
          <span className="text-lg text-neutral-500" aria-hidden="true">
            {today.value >= pointEnergy(prevPoint) ? '↗' : '↘'}
          </span>
          <div className="text-center">
            <p className="text-[11px] text-neutral-400">Hoy · {shortDay(todayIso).split(' ').slice(0, 2).join(' ')}</p>
            <p className="num text-2xl font-extrabold leading-tight" style={{ color: tone }}>
              {today.value}%
            </p>
            {sleepToday !== 0 && <p className="text-[11px] text-neutral-500">sin el sueño: {withCost}%</p>}
          </div>
        </section>
      )}

      <NextWindowCard model={model} />

      {/* El detalle del coste real, a un toque: la línea de la cabecera dice cuánto resta, aquí se ve de qué sesiones sale. */}
      {hasCostInfo && (
        <Fold
          title="Coste de tus sesiones"
          summary={
            <span style={{ color: costRows[0].pct > 0 ? COST : costRows[0].pct < 0 ? GOOD : undefined }}>
              última {costRows[0].pct > 0 ? '+' : costRows[0].pct < 0 ? '−' : '±'}
              {Math.abs(costRows[0].pct)}%
            </span>
          }
        >
          <CostRows rows={costRows} />
        </Fold>
      )}

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
              {anySleep && <Key color={SLEEP} label="tu sueño" shape="bar" />}
            </>
          ) : (
            <>
              <Key color={FIT} label="forma física" shape="bar" />
              <Key color={FAT} label="fatiga" shape="bar" />
              <Key color={GOOD} label="ventana" shape="bar" />
            </>
          )}
          {comp && <Key color={GOLD} label="competición" shape="bar" />}
          <span>{mode === 'energia' ? 'barras claras = previsión · ★ mejor día de la ventana' : 'puntos = previsión de tu plan'}</span>
        </div>
      </section>

      <section aria-label="Las próximas semanas" className="rounded-2xl bg-white/[0.035] px-4 pb-4 pt-3.5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Cinta de ventanas · 5 semanas</p>
        <FormRibbon model={model} />
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
          <Key color={GOOD} label="ventana" shape="bar" />
          {comp && <Key color={GOLD} label="competición" shape="bar" />}
          <span>● entreno de tu plan (en color si cae en ventana)</span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">Pasadas dos semanas es orientativo: cambia según cómo entrenes.</p>
      </section>

      <Fold title="Cómo se calcula">
        <p className="text-xs leading-relaxed text-neutral-400">
          Cada sesión suma a tu <Term k="fitness">forma física</Term>, que sube y baja despacio, y a tu fatiga, que lo hace deprisa (míralas en la vista «Forma física y fatiga»). Tu forma es la diferencia, y la energía es esa forma pasada a una escala de 0 a 100: a tope desde el {ENERGY_TOP} %, cansado hasta el {ENERGY_LOW} %. Entrenando siempre igual oscilas entre el 30 y el 70 % según el día de la semana; solo llegas a tope cuando bajas la carga unos días. Cuando la fatiga cae antes que la forma física queda un hueco a tu favor, la ventana de{' '}
          <Term k="supercompensacion">supercompensación</Term>. La previsión usa tu calendario: los días que entrenas, las semanas de descarga de tu macrociclo y, si hay competición, su cuenta atrás. Se recalcula con cada sesión que registras. Solo cuenta lo que apuntas: si haces bici, entrenos de equipo u otro deporte y no lo registras (vale «Registrar este día» con su RPE y duración), el cálculo te verá más descansado de lo que estás. La energía suma tres cosas: la carga acumulada de tus entrenos, el coste real de cada sesión (una sesión de barra, agarre y hombro desgasta más de lo que dice su RPE × duración, y una ligera menos) y tu sueño: la media ponderada de las horas de hoy y de las dos noches anteriores frente a 7 h 30 (a 8 puntos por hora, de −15 a +8; en morado en el gráfico). Cómo te sientes (agujetas, estrés, ánimo, HRV, molestias) no cambia la energía: eso es tu Preparación. La previsión de los días que vienen no incluye el sueño, porque aún no sabes cómo dormirás. Es una estimación.
        </p>
      </Fold>
    </div>
  );
}
