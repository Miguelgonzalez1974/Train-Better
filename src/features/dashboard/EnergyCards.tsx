import { useLayoutEffect, useState } from 'react';
import { Moon, Plus } from 'lucide-react';
import type { NightFeel } from '../../data/athlete/types';
import { hoursText, NIGHT_LABEL } from '../../engine/energy';
import type { ReadinessScore } from '../../engine/readinessScore';
import { PartGuard } from '../shell/PartGuard';
import type { DayEnergy, EnergyItem } from './dayEnergy';
import { MorningBreakdown } from './MorningBreakdown';

/** Las tarjetas de «Tu día» que cuentan la energía: la noche, la mañana, los entrenos sueltos y cómo ha ido bajando. */

const FEELS: NightFeel[] = ['reventado', 'cansado', 'normal', 'bien'];

/** «13:30» a partir de las horas decimales. */
export const timeText = (h: number): string => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** «¿Cómo acabas el día?»: un toque que corrige la energía con la que te vas a dormir y dice con cuánta podrías amanecer. */
export function NightCard({ energy, onPick, estimates }: { energy: DayEnergy; onPick: (feel: NightFeel) => void; estimates: { hours: number; energy: number }[] }) {
  return (
    <section className="day-card px-[13px] py-3" aria-label="¿Cómo acabas el día?" data-testid="night-card">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
        <Moon size={14} className="shrink-0 text-sleep" aria-hidden="true" />
        <span className="flex-1">¿Cómo acabas el día?</span>
        <span className="text-[11px] font-normal text-neutral-500">opcional</span>
      </p>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Cómo acabas el día">
        {FEELS.map((feel) => {
          const on = energy.nightFeel === feel;
          return (
            <button
              key={feel}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(feel)}
              className={`rounded-xl border px-1 py-2 text-xs font-semibold transition-colors ${on ? 'border-brand-orange bg-brand-orange/15 text-white' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}
            >
              {NIGHT_LABEL[feel]}
            </button>
          );
        })}
      </div>
      {estimates.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">
          {estimates.map((e, i) => `${i === 0 ? 'Si duermes' : 'con'} ${hoursText(e.hours)}${i === 0 ? ' amanecerás sobre ' : ', sobre '}${e.energy} %`).join('; ')}.
        </p>
      )}
    </section>
  );
}

/** «De anoche a hoy»: de dónde sale la energía con la que sales, antes de entrenar. */
export function MorningCard({ readiness }: { readiness: ReadinessScore }) {
  return (
    <PartGuard name="la mañana" fallback={null}>
      <section className="day-card px-[13px] py-3" aria-label="De anoche a hoy" data-testid="morning-card">
        <p className="mb-2.5 text-[13px] font-semibold text-white">De anoche a hoy</p>
        <MorningBreakdown readiness={readiness} />
      </section>
    </PartGuard>
  );
}

/** Una cosa entrenada que no es la sesión (el programa de fuerza o un entreno añadido), o el programa que aún falta. */
export function ActivityCard({ item, onClick }: { item: EnergyItem; onClick?: () => void }) {
  const facts = [item.start !== null ? timeText(item.start) : null, item.done ? null : 'previsto', `${Math.round(item.minutes)} min`, item.done ? `RPE ${item.rpe}` : null].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] font-semibold ${item.done ? 'text-white' : 'text-neutral-400'}`}>{item.name}</span>
        <span className="mt-0.5 block text-[11px] text-neutral-500">{facts}</span>
      </span>
      <span className={`num shrink-0 text-[17px] font-semibold ${item.done ? 'text-white' : 'text-neutral-500'}`}>−{item.cost}</span>
    </>
  );
  const cls = 'day-card flex w-full items-center gap-3 border-l-[3px] px-[13px] py-2.5 text-left';
  const style = { borderLeftColor: item.color, ...(item.done ? {} : { borderStyle: 'dashed', borderLeftStyle: 'solid' as const }) };
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors`} style={style} data-testid="activity-card">
      {body}
    </button>
  ) : (
    <div className={cls} style={style} data-testid="activity-card">
      {body}
    </div>
  );
}

export function AddWorkoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/20 py-2.5 text-[13px] font-semibold text-brand-orange transition-colors hover:bg-white/5"
      data-testid="add-workout"
    >
      <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
      Entreno
    </button>
  );
}

const H = 92;
const LEFT = 20;

/** El ancho en píxeles del hueco del gráfico: se dibuja a escala 1:1, así la letra no crece en pantallas anchas. */
function useBoxWidth(fallback: number) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!box) return;
    const read = () => box.clientWidth > 0 && setWidth(box.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);
  return [setBox, width] as const;
}

/** Cómo ha bajado la energía a lo largo del día: plana entre medias, un escalón por entreno (con su color) y, discontinuo, lo que falta. */
export function EnergyChart({ energy }: { energy: DayEnergy }) {
  const [boxRef, W] = useBoxWidth(320);
  const { morning, computed } = energy;
  const done = energy.items.filter((i) => i.done);
  if (morning === null || computed === null || done.length === 0) return null;
  const pending = energy.items.filter((i) => !i.done);

  // Sin hora anotada, cada entreno se coloca detrás del anterior (el orden es lo que cuenta). Si dos horas se pisan, el segundo empieza donde
  // acaba el primero: la línea nunca vuelve atrás.
  let cursor = 0;
  const placed = done.map((item) => {
    const start = Math.min(23.4, Math.max(cursor, item.start ?? Math.max(cursor + 1, 18)));
    const end = Math.min(23.5, start + Math.max(0.4, item.minutes / 60));
    cursor = end;
    return { item, start, end };
  });
  const from = Math.max(0, Math.floor(Math.min(7, ...placed.map((p) => p.start)) - 0.01));
  const to = 24;
  const x = (h: number) => LEFT + ((Math.min(to, Math.max(from, h)) - from) / (to - from)) * (W - LEFT - 6);
  const y = (v: number) => 6 + (1 - v / 100) * (H - 24);

  let value = morning;
  let path = `M ${x(Math.min(from + 0.5, placed[0].start))} ${y(value)}`;
  const steps = placed.map(({ item, start, end }) => {
    const before = value;
    value = Math.max(0, value - item.cost);
    path += ` L ${x(start)} ${y(before)} L ${x(end)} ${y(value)}`;
    return { id: item.id, color: item.color, x1: x(start), y1: y(before), x2: x(end), y2: y(value) };
  });
  const lastEnd = Math.min(to - 0.5, cursor + 0.4);
  path += ` L ${x(lastEnd)} ${y(value)}`;
  const night = energy.nightFeel && energy.energy !== null && energy.energy !== computed ? energy.energy : null;
  const rest = pending.reduce((s, i) => s + i.cost, 0);

  return (
    <section className="day-card px-[13px] py-3" aria-label="Cómo ha bajado tu energía" data-testid="energy-chart">
      <p className="mb-1.5 text-[13px] font-semibold text-white">Cómo ha bajado</p>
      <div ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block" role="img" aria-label={`Has salido con ${morning} % y te queda un ${energy.energy ?? computed} %`}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={W - 6} y1={y(v)} y2={y(v)} style={{ stroke: 'rgb(var(--c-white) / 0.09)' }} />
              <text x={0} y={y(v) + 3.5} className="fill-neutral-500" fontSize="9.5">
                {v}
              </text>
            </g>
          ))}
          {[8, 12, 16, 20].filter((h) => h > from).map((h) => (
            <text key={h} x={x(h)} y={H - 3} textAnchor="middle" className="fill-neutral-500" fontSize="9.5">
              {h}h
            </text>
          ))}
          <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: 'rgb(var(--c-white))' }} />
          {steps.map((s) => (
            <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} strokeWidth="3.4" strokeLinecap="round" style={{ stroke: s.color }} />
          ))}
          {rest > 0 && <path d={`M ${x(lastEnd)} ${y(value)} L ${x(to - 0.2)} ${y(Math.max(0, value - rest))}`} fill="none" strokeWidth="1.6" strokeDasharray="3.5 3.5" style={{ stroke: 'rgb(var(--c-white) / 0.45)' }} />}
          {night !== null ? (
            <>
              <line x1={x(lastEnd)} x2={x(lastEnd)} y1={y(value)} y2={y(night)} strokeWidth="2" strokeDasharray="2.5 2.5" style={{ stroke: 'rgb(var(--c-brand-orange))' }} />
              <circle cx={x(lastEnd)} cy={y(night)} r="3.4" style={{ fill: 'rgb(var(--c-brand-orange))' }} />
            </>
          ) : (
            <circle cx={x(lastEnd)} cy={y(value)} r="3.4" style={{ fill: 'rgb(var(--c-white))' }} />
          )}
        </svg>
      </div>
    </section>
  );
}
