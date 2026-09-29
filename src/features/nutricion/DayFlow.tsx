import { Fragment } from 'react';
import { Check, Dumbbell, Plus, X } from 'lucide-react';
import type { DayFlow as DayFlowData, FlowExtra } from '../../engine/dayFlow';
import type { MealKey } from '../../engine/mealPlan';
import { MacroRing } from './MacroRing';

const AXIS_START = 7;
const AXIS_END = 23;

const pos = (hour: number) => Math.max(0, Math.min(100, ((hour - AXIS_START) / (AXIS_END - AXIS_START)) * 100));

function fmt(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round(((hour - h) * 60) / 15) * 15;
  return m === 60 ? `${String(h + 1).padStart(2, '0')}:00` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface DayFlowProps {
  flow: DayFlowData;
  onOpenMeal: (meal: MealKey) => void;
  onAddExtra: () => void;
  onRemoveExtra: (id: string) => void;
}

/**
 * "Línea del día" (ver `engine/dayFlow.ts`): las cinco comidas en su hora sobre un eje de 07:00 a 23:00, con la hora
 * de entreno como referencia y "ahora" si es hoy — tocar un punto la abre para montarla. Los alimentos añadidos
 * fuera de las 5 comidas salen como rombos en la línea y en una lista aparte, debajo. Debajo de todo, dos donuts
 * (proteína e hidratos) con lo que llevas frente al objetivo del día — incluye lo marcado hecho más los extras.
 * Sin antes/después: con el donut ya se ve cómo vas, sin necesitar esa distinción.
 */
export function DayFlow({ flow, onOpenMeal, onAddExtra, onRemoveExtra }: DayFlowProps) {
  const { meals, extras, trainingHour, nowHour, done, objective } = flow;

  return (
    <div className="flex flex-col gap-4">
      {/* Eje del día */}
      <div>
        <div className="relative mx-3 h-[4.5rem]" aria-hidden="true">
          <div className="absolute inset-x-0 top-8 h-0.5 rounded-full bg-white/15" />
          {trainingHour !== null && (
            <div className="absolute bottom-4 top-0 border-l-2 border-dashed border-brand-orange/80" style={{ left: `${pos(trainingHour)}%` }}>
              <span className="absolute -top-0.5 left-1.5 flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-brand-orange">
                <Dumbbell size={10} aria-hidden="true" /> {fmt(trainingHour)}
              </span>
            </div>
          )}
          {nowHour !== null && (
            <div className="absolute bottom-5 top-4 w-0.5 rounded-full bg-white/50" style={{ left: `${pos(nowHour)}%` }}>
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400">ahora</span>
            </div>
          )}
          {meals.map((m) => (
            <Fragment key={m.key}>
              <div className="absolute left-0 top-8 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos(m.hour)}%` }}>
                <button
                  onClick={() => onOpenMeal(m.key)}
                  aria-label={`${m.label} · ${fmt(m.hour)}${m.done ? ' · hecha' : ''}. Tocar para montarla.`}
                  title={`${m.label} · ${fmt(m.hour)}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                      m.done ? 'border-emerald-400 bg-emerald-400' : 'border-white/30 bg-brand-surface hover:border-brand-gold'
                    }`}
                  >
                    {m.done && <Check size={11} strokeWidth={3.5} className="text-black" aria-hidden="true" />}
                  </span>
                </button>
              </div>
              <span className="num absolute top-14 -translate-x-1/2 whitespace-nowrap text-[9px] text-neutral-500" style={{ left: `${pos(m.hour)}%` }}>
                {fmt(m.hour)}
              </span>
            </Fragment>
          ))}
          {extras.map((e) => (
            <div
              key={e.id}
              className="absolute left-0 top-8 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos(e.hour)}%` }}
              title={`${e.label} · ${fmt(e.hour)} · extra`}
            >
              <span className="block h-3.5 w-3.5 rotate-45 rounded-[3px] border-2 border-violet-300 bg-violet-400" />
            </div>
          ))}
        </div>
        <div className="mx-3 mt-0.5 flex justify-between text-[10px] text-neutral-600">
          <span>07:00</span>
          <span>15:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* Lo que llevas del día */}
      <div className="flex items-center justify-around">
        <MacroRing label="Proteína" value={done.protein} target={objective.protein} strokeClass="stroke-red-400" size={112} />
        <MacroRing label="Hidratos" value={done.carbs} target={objective.carbs} strokeClass="stroke-brand-gold" size={112} />
      </div>

      {extras.length > 0 && (
        <div className="flex flex-col divide-y divide-white/5 rounded-lg bg-white/[0.03]">
          {extras.map((e) => (
            <ExtraRow key={e.id} extra={e} onRemove={() => onRemoveExtra(e.id)} />
          ))}
        </div>
      )}

      <button
        onClick={onAddExtra}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border px-3 py-2.5 text-xs font-semibold text-neutral-300 transition-colors hover:border-brand-gold hover:text-white"
      >
        <Plus size={14} aria-hidden="true" /> Añadir un alimento ahora
      </button>

      <p className="text-[11px] leading-relaxed text-neutral-600">Toca un punto para montar esa comida. Los donuts cuentan lo que marques como hecho, más los extras.</p>
    </div>
  );
}

function ExtraRow({ extra, onRemove }: { extra: FlowExtra; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="block h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] bg-violet-400" aria-hidden="true" />
      <span className="num shrink-0 text-[11px] text-neutral-500">{fmt(extra.hour)}</span>
      <span className="flex-1 truncate text-sm text-neutral-200">{extra.label}</span>
      <span className="num shrink-0 text-[11px] text-neutral-500">
        {extra.protein} g · {extra.carbs} g
      </span>
      <button onClick={onRemove} aria-label={`Quitar ${extra.label}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400">
        <X size={14} />
      </button>
    </div>
  );
}
