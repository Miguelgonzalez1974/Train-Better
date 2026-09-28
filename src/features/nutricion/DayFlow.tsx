import { Fragment } from 'react';
import { Check, Dumbbell, Plus, X } from 'lucide-react';
import type { DayFlow as DayFlowData, FlowExtra, FlowMeal } from '../../engine/dayFlow';
import type { MealKey } from '../../engine/mealPlan';

const AXIS_START = 7;
const AXIS_END = 23;

const pos = (hour: number) => Math.max(0, Math.min(100, ((hour - AXIS_START) / (AXIS_END - AXIS_START)) * 100));

function fmt(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round(((hour - h) * 60) / 15) * 15;
  return m === 60 ? `${String(h + 1).padStart(2, '0')}:00` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const HATCH = 'repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.07) 4px 8px)';

const g = (n: number) => `${n} g`;

interface MacroBarProps {
  label: string;
  meals: FlowMeal[];
  value: (m: FlowMeal) => number;
  extraValue: number;
  doneTotal: number;
  plannedTotal: number;
  fillClass: string;
  onOpenMeal: (meal: MealKey) => void;
}

/**
 * Una barra por macro, partida en un trozo por comida (del tamaño de lo que aporta): en color las hechas, con trama
 * las previas al entreno aún sin hacer. Cada trozo se toca para montar esa comida. Si hay extras del día, se añade un
 * trozo más al final (morado), sin tocar — su detalle está en la lista de extras, debajo.
 */
function MacroBar({ label, meals, value, extraValue, doneTotal, plannedTotal, fillClass, onOpenMeal }: MacroBarProps) {
  const total = plannedTotal + extraValue;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="num text-xs text-neutral-400">
          <b className="text-white">{doneTotal}</b> / {plannedTotal} g
        </span>
      </div>
      <div className="mt-1 flex h-6 gap-0.5">
        {meals.map((m) => {
          const v = value(m);
          const pre = m.beforeTraining === true && !m.done;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onOpenMeal(m.key)}
              title={`${m.label} · ${v} g${m.done ? ' · hecha' : ''}`}
              aria-label={`${m.label}: ${v} g de ${label.toLowerCase()}${m.done ? ', hecha' : ''}. Tocar para montarla.`}
              style={{ flex: `${Math.max(v, 1)} 1 0`, backgroundImage: pre ? HATCH : undefined }}
              className={`flex min-w-0 items-center justify-center overflow-hidden rounded-md text-[10px] transition-colors duration-300 ${
                m.done ? `${fillClass} font-semibold text-black/80` : 'border border-white/10 bg-white/[0.03] text-neutral-500 hover:border-brand-gold/50'
              }`}
            >
              {plannedTotal > 0 && (v / plannedTotal) * 100 > 9 ? v : ''}
            </button>
          );
        })}
        {extraValue > 0 && (
          <div
            title={`Extras del día · ${extraValue} g`}
            aria-label={`Extras del día: ${extraValue} g de ${label.toLowerCase()}`}
            style={{ flex: `${extraValue} 1 0` }}
            className="flex min-w-0 items-center justify-center overflow-hidden rounded-md bg-violet-400 text-[10px] font-semibold text-black/80"
          >
            {total > 0 && (extraValue / total) * 100 > 9 ? extraValue : ''}
          </div>
        )}
      </div>
    </div>
  );
}

interface DayFlowProps {
  flow: DayFlowData;
  onOpenMeal: (meal: MealKey) => void;
  onAddExtra: () => void;
  onRemoveExtra: (id: string) => void;
}

/**
 * "Línea del día" (ver `engine/dayFlow.ts`): las cinco comidas en su hora sobre un eje de 07:00 a 23:00, con el entreno
 * como línea de corte y "ahora" si es hoy; debajo, dos barras (proteína e hidratos) partidas por comida. Es solo
 * visual: sin frases de consejo. Tocar el punto de una comida, o su trozo de barra, la abre para montarla. Los
 * alimentos añadidos fuera de las 5 comidas salen como rombos en la línea y en una lista aparte, debajo.
 */
export function DayFlow({ flow, onOpenMeal, onAddExtra, onRemoveExtra }: DayFlowProps) {
  const { meals, extras, trainingHour, nowHour } = flow;
  const extraProtein = extras.reduce((s, e) => s + e.protein, 0);
  const extraCarbs = extras.reduce((s, e) => s + e.carbs, 0);

  return (
    <div className="flex flex-col gap-3">
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

      <MacroBar
        label="Proteína"
        meals={meals}
        value={(m) => m.protein}
        extraValue={extraProtein}
        doneTotal={flow.done.protein}
        plannedTotal={flow.planned.protein}
        fillClass="bg-red-400"
        onOpenMeal={onOpenMeal}
      />
      <MacroBar
        label="Hidratos"
        meals={meals}
        value={(m) => m.carbs}
        extraValue={extraCarbs}
        doneTotal={flow.done.carbs}
        plannedTotal={flow.planned.carbs}
        fillClass="bg-brand-gold"
        onOpenMeal={onOpenMeal}
      />

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" aria-hidden="true" /> hecha
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border border-white/20" aria-hidden="true" /> prevista
        </span>
        {trainingHour !== null && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-white/20" style={{ backgroundImage: HATCH }} aria-hidden="true" /> previa al entreno
          </span>
        )}
        {extras.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-violet-400" aria-hidden="true" /> extra
          </span>
        )}
      </p>

      {/* Resumen antes / después */}
      {flow.before && flow.after ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/[0.04] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Antes de entrenar</p>
            <p className="num mt-0.5 text-sm text-neutral-200">
              <b className="text-white">{flow.before.done.carbs}</b> / {g(flow.before.planned.carbs)} hid.
            </p>
            <p className="num text-sm text-neutral-200">
              <b className="text-white">{flow.before.done.protein}</b> / {g(flow.before.planned.protein)} prot.
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.04] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Después</p>
            <p className="num mt-0.5 text-sm text-neutral-200">
              quedan <b className="text-white">{g(flow.after.remaining.carbs)}</b> hid.
            </p>
            <p className="num text-sm text-neutral-200">
              quedan <b className="text-white">{g(flow.after.remaining.protein)}</b> prot.
            </p>
          </div>
        </div>
      ) : null}

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

      <p className="text-[11px] leading-relaxed text-neutral-600">Toca un punto o un trozo de barra para montar esa comida. Solo cuenta lo que marques como hecho.</p>
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
