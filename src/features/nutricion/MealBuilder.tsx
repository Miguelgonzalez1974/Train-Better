import { useMemo, useState } from 'react';
import { Check, CircleAlert, CircleCheck, Minus, Plus, RotateCcw, Search, Trash2, Utensils, X } from 'lucide-react';
import { FOODS, getFood } from '../../data/nutrition/foods';
import type { CustomMealItem } from '../../data/athlete/types';
import {
  autoGrams,
  BUILDER_GROUPS,
  builderFoods,
  builderGroup,
  foodBounds,
  materialize,
  MEAL_STATE_LABEL,
  mealStatus,
  snapGrams,
  totalsOf,
  type BuilderGroup,
} from '../../engine/mealBuilder';
import { macrosOf, quantityText, type PlannedMeal } from '../../engine/mealPlan';
import { formatServing } from '../../engine/nutritionPlan';
import { MacroRing } from './MacroRing';

const STATUS_STYLE = {
  ok: { box: 'bg-emerald-500/10 text-emerald-300', Icon: CircleCheck },
  low: { box: 'bg-brand-gold/10 text-brand-gold', Icon: CircleAlert },
  over: { box: 'bg-brand-orange/10 text-brand-orange', Icon: CircleAlert },
} as const;

function handRange(x: number): { lo: number; hi: number } {
  return Number.isInteger(x) || x === 0.5 ? { lo: x, hi: x } : { lo: Math.floor(x), hi: Math.ceil(x) };
}

type Mode = 'auto' | 'manual';

interface MealBuilderProps {
  meal: PlannedMeal;
  /** El menú automático "de verdad", sin lo montado a mano — lo que se ve en la pestaña Automático. */
  autoMeal: PlannedMeal;
  excludedFoodIds: string[];
  done: boolean;
  /** Se llama con la lista completa cada vez que el atleta añade, quita o cambia una cantidad. */
  onChange: (items: CustomMealItem[]) => void;
  /** Descarta lo montado a mano y vuelve al menú automático. */
  onAuto: () => void;
  onToggleDone: () => void;
}

/**
 * Montar una comida, con un interruptor arriba entre dos modos: "Automático" (lo que calcula la app, de solo
 * lectura) y "A mi manera" (una tarjeta limpia — se abre vacía, salvo que el atleta ya la hubiera montado antes —
 * para elegir alimentos uno a uno; con cada uno, los anillos de proteína e hidratos suben). Cambiar de pestaña solo
 * mira: lo montado no se pierde hasta que se pulsa el botón de dentro de "Automático" que lo dice explícitamente.
 * Ver `engine/mealBuilder.ts`.
 */
export function MealBuilder({ meal, autoMeal, excludedFoodIds, done, onChange, onAuto, onToggleDone }: MealBuilderProps) {
  const [mode, setMode] = useState<Mode>(() => (meal.custom ? 'manual' : 'auto'));
  const [items, setItems] = useState<CustomMealItem[]>(() => (meal.custom ? materialize(meal) : []));
  const [group, setGroup] = useState<BuilderGroup>('Proteína');
  const [query, setQuery] = useState('');

  const target = meal.target;
  const totals = totalsOf(items);
  const status = mealStatus(items, target);
  const { box, Icon } = STATUS_STYLE[status.state];
  const foodsByGroup = useMemo(() => builderFoods(FOODS, excludedFoodIds), [excludedFoodIds]);

  function commit(next: CustomMealItem[]) {
    setItems(next);
    onChange(next);
  }

  function add(foodId: string) {
    const food = getFood(foodId);
    if (!food) return;
    commit([...items, { foodId, grams: autoGrams(food, items, target) }]);
  }

  function step(index: number, dir: 1 | -1) {
    const it = items[index];
    const food = getFood(it.foodId);
    if (!food) return;
    const b = foodBounds(food);
    const next = snapGrams(food, it.grams + dir * b.step);
    commit(items.map((x, i) => (i === index ? { ...x, grams: next } : x)));
  }

  const chosen = new Set(items.map((i) => i.foodId));
  const q = query.trim().toLowerCase();
  const list = q
    ? BUILDER_GROUPS.flatMap((g) => foodsByGroup[g]).filter((f) => f.name.toLowerCase().includes(q))
    : foodsByGroup[group];
  const available = list.filter((f) => !chosen.has(f.id));

  return (
    <div className="flex flex-col gap-3">
      {/* Interruptor: automático (solo lectura) o a mi manera (construir) */}
      <div className="flex gap-1 rounded-lg bg-white/5 p-1" role="tablist" aria-label="Modo de esta comida">
        <button
          role="tab"
          aria-selected={mode === 'auto'}
          onClick={() => setMode('auto')}
          className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
            mode === 'auto' ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Automático
        </button>
        <button
          role="tab"
          aria-selected={mode === 'manual'}
          onClick={() => setMode('manual')}
          className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${
            mode === 'manual' ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          A mi manera{meal.custom ? ' •' : ''}
        </button>
      </div>

      {mode === 'auto' ? (
        <>
          <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 p-3.5">
            <p className="mb-2 text-xs text-neutral-500">Esto es lo que calcula la app para esta comida.</p>
            <ul className="divide-y divide-white/5">
              {autoMeal.items.map((item) => (
                <li key={item.swapKey} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-neutral-100">{item.name}</span>
                  <span className="num shrink-0 font-semibold text-white">{item.quantity}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs text-neutral-500">
              ≈ {autoMeal.protein} g proteína · {autoMeal.carbs} g hidratos
            </p>
          </div>
          {meal.custom ? (
            <button
              onClick={onAuto}
              className="flex items-center justify-center gap-2 rounded-lg border border-brand-gold bg-brand-gold/10 px-4 py-2.5 text-sm font-semibold text-brand-gold transition-colors hover:bg-brand-gold/20"
            >
              <RotateCcw size={14} aria-hidden="true" /> Usar este menú (descarta lo que montaste)
            </button>
          ) : (
            <p className="text-center text-xs text-neutral-600">Ya se está usando. Toca «A mi manera» si prefieres elegir tú los alimentos.</p>
          )}
        </>
      ) : (
        <>
          {/* Objetivo de la toma */}
          <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 p-3.5">
            <div className="flex items-center justify-around">
              <MacroRing label="Proteína" value={totals.protein} target={target.protein} strokeClass="stroke-red-400" />
              <MacroRing label="Hidratos" value={totals.carbs} target={target.carbs} strokeClass="stroke-brand-gold" />
            </div>
            <p className="mt-2.5 flex justify-center" role="status" aria-label={status.text}>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${box}`}>
                <Icon size={13} aria-hidden="true" /> {MEAL_STATE_LABEL[status.state]}
              </span>
            </p>
            <p className="mt-2 text-center text-[11px] text-neutral-500">
              {formatServing(handRange(Math.max(0.5, Math.round((totals.protein / 27) * 2) / 2)), 'palma', 'palmas')} de proteína ·{' '}
              {formatServing(handRange(Math.max(0.5, Math.round((totals.carbs / 35) * 2) / 2)), 'puño', 'puños')} de hidrato
            </p>
          </div>

          {/* Alimentos elegidos */}
          <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 px-3.5 py-1">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-7 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-neutral-500">
                  <Utensils size={19} aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-neutral-300">Elige tu primer alimento</p>
                <p className="max-w-[15rem] text-xs text-neutral-600">Cada uno que añadas entra con la cantidad que cubre lo que falta de esta comida.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((it, index) => {
                  const food = getFood(it.foodId);
                  if (!food) return null;
                  const b = foodBounds(food);
                  const units = food.unit ? Math.max(1, Math.round(it.grams / food.unit.grams)) : undefined;
                  const m = macrosOf(food, it.grams);
                  const fixed = b.min === b.max;
                  return (
                    <li key={`${it.foodId}-${index}`} className="py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug text-neutral-100">{food.name}</p>
                        <button
                          onClick={() => commit(items.filter((_, i) => i !== index))}
                          aria-label={`Quitar ${food.name}`}
                          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-neutral-500">
                          {builderGroup(food)}
                          {m.p >= 1 || m.c >= 1 ? ` · ${Math.round(m.p)} g prot · ${Math.round(m.c)} g hid.` : ''}
                        </p>
                        <div className="flex items-center gap-1">
                          {!fixed && (
                            <button
                              onClick={() => step(index, -1)}
                              disabled={it.grams <= b.min}
                              aria-label={`Menos ${food.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors hover:text-white disabled:opacity-30"
                            >
                              <Minus size={14} />
                            </button>
                          )}
                          <span className="num min-w-[4.5rem] text-center text-sm font-semibold text-white">{quantityText(food, it.grams, units)}</span>
                          {!fixed && (
                            <button
                              onClick={() => step(index, 1)}
                              disabled={it.grams >= b.max}
                              aria-label={`Más ${food.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors hover:text-white disabled:opacity-30"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Selector */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Añadir alimento</p>
            <div className="relative mb-2">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar (avena, pollo, café...)"
                aria-label="Buscar alimento"
                className="w-full rounded-lg border border-brand-border bg-brand-bg py-2 pl-9 pr-3 text-sm text-white focus:border-brand-gold focus:outline-none"
              />
            </div>
            {!q && (
              <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Grupo de alimentos">
                {BUILDER_GROUPS.filter((g) => foodsByGroup[g].length > 0).map((g) => (
                  <button
                    key={g}
                    role="tab"
                    aria-selected={group === g}
                    onClick={() => setGroup(g)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      group === g ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-400 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
            {available.length === 0 ? (
              <p className="text-xs text-neutral-500">{q ? 'Ningún alimento coincide.' : 'Ya has añadido todos los de este grupo.'}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      add(f.id);
                      setQuery('');
                    }}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg border border-brand-border px-2.5 py-1.5 text-left text-xs text-neutral-200 transition-colors hover:border-brand-gold hover:text-white"
                  >
                    <Plus size={12} className="shrink-0 text-brand-gold" aria-hidden="true" />
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <button
              onClick={() => commit([])}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:text-white"
            >
              <Trash2 size={13} aria-hidden="true" /> Vaciar
            </button>
          )}
        </>
      )}

      <button
        onClick={onToggleDone}
        aria-pressed={done}
        className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
          done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-brand-gold bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20'
        }`}
      >
        {done && <Check size={16} strokeWidth={3} aria-hidden="true" />}
        {done ? 'Hecha (tocar para deshacer)' : 'Marcar como hecha'}
      </button>
      <p className="text-[11px] leading-relaxed text-neutral-600">
        Las cantidades son aproximadas y solo cuentan proteína e hidratos: el aceite, los frutos secos y los quesos suman grasa que aquí no se ve.
      </p>
    </div>
  );
}
