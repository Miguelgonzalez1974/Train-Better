import { useMemo, useState } from 'react';
import { Check, CircleAlert, CircleCheck, Minus, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { FOODS, getFood } from '../../data/nutrition/foods';
import type { CustomMealItem } from '../../data/athlete/types';
import {
  autoGrams,
  BUILDER_GROUPS,
  builderFoods,
  builderGroup,
  foodBounds,
  materialize,
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

interface MealBuilderProps {
  meal: PlannedMeal;
  excludedFoodIds: string[];
  done: boolean;
  /** Se llama con la lista completa cada vez que el atleta añade, quita o cambia una cantidad. */
  onChange: (items: CustomMealItem[]) => void;
  /** Quita lo montado a mano y devuelve la sugerencia automática de esa comida. */
  onAuto: () => void;
  onToggleDone: () => void;
}

/**
 * Montar una comida a mano: arriba lo que aporta frente al objetivo de la toma (anillos y un aviso), en medio los
 * alimentos elegidos con su cantidad, y abajo el selector para añadir más. Al añadir un alimento entra ya con la
 * cantidad que cubre lo que falta. Ver `engine/mealBuilder.ts`.
 */
export function MealBuilder({ meal, excludedFoodIds, done, onChange, onAuto, onToggleDone }: MealBuilderProps) {
  const [items, setItems] = useState<CustomMealItem[]>(() => materialize(meal));
  const [group, setGroup] = useState<BuilderGroup>(() => (materialize(meal).length === 0 ? 'Proteína' : 'Hidrato'));
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
      {/* Objetivo de la toma */}
      <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 p-3.5">
        <div className="flex items-center justify-around">
          <MacroRing label="Proteína" value={totals.protein} target={target.protein} strokeClass="stroke-red-400" />
          <MacroRing label="Hidratos" value={totals.carbs} target={target.carbs} strokeClass="stroke-brand-gold" />
        </div>
        <p className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${box}`} role="status">
          <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {status.text}
        </p>
        <p className="mt-2 text-[11px] text-neutral-500">
          {formatServing(handRange(Math.max(0.5, Math.round((totals.protein / 27) * 2) / 2)), 'palma', 'palmas')} de proteína ·{' '}
          {formatServing(handRange(Math.max(0.5, Math.round((totals.carbs / 35) * 2) / 2)), 'puño', 'puños')} de hidrato
        </p>
      </div>

      {/* Alimentos elegidos */}
      <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 px-3.5 py-1">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">Aún no hay alimentos. Elige abajo y se rellena con lo que falta.</p>
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
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Grupo de alimentos">
            {BUILDER_GROUPS.filter((g) => foodsByGroup[g].length > 0).map((g) => (
              <button
                key={g}
                role="tab"
                aria-selected={group === g}
                onClick={() => setGroup(g)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
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

      <div className="flex gap-2">
        <button
          onClick={onAuto}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:text-white"
        >
          <RotateCcw size={13} aria-hidden="true" /> {meal.custom ? 'Volver a la sugerencia' : 'Restaurar sugerencia'}
        </button>
        <button
          onClick={() => commit([])}
          disabled={items.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:text-white disabled:opacity-40"
        >
          <Trash2 size={13} aria-hidden="true" /> Vaciar
        </button>
      </div>
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
        Las cantidades son aproximadas y solo cuentan proteína e hidratos: el aceite, los frutos secos y los quesos suman grasa que aquí no se ve. El aviso
        orienta, no bloquea.
      </p>
    </div>
  );
}
