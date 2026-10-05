import { useMemo, useState } from 'react';
import { Minus, Plus, Search, X } from 'lucide-react';
import { FOODS } from '../../data/nutrition/foods';
import type { CustomFood, CustomMealItem, ExtraFoodEntry, NutritionPrefs } from '../../data/athlete/types';
import { customFoodToCatalogFood } from '../../engine/customFoods';
import { BUILDER_GROUPS, builderFoods, foodBounds, snapGrams, totalsOf, type BuilderGroup } from '../../engine/mealBuilder';
import { fixedPortion, quantityText } from '../../engine/mealPlan';
import { withExtra } from './nutritionData';

function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseTimeInput(value: string, fallback: number): number {
  const [h, m] = value.split(':').map(Number);
  return Number.isFinite(h) ? h + (Number.isFinite(m) ? m : 0) / 60 : fallback;
}

interface ExtraFoodPanelProps {
  prefs: NutritionPrefs;
  updatePrefs: (update: (prefs: NutritionPrefs) => NutritionPrefs) => void;
  iso: string;
  defaultHour: number;
  onDone: () => void;
}

/**
 * Añadir un alimento fuera de las 5 comidas ("me lo como ahora"): elegir uno o varios alimentos, ajustar la
 * cantidad y decir a qué hora. Sin objetivo que cubrir — es un antojo, no una toma planificada — así que no hay
 * anillos ni estado, solo lo que suma. Al confirmar se guarda como ya tomado. Ver `engine/dayFlow.ts` (`ExtraInput`).
 */
export function ExtraFoodPanel({ prefs, updatePrefs, iso, defaultHour, onDone }: ExtraFoodPanelProps) {
  const [items, setItems] = useState<CustomMealItem[]>([]);
  const [hourText, setHourText] = useState(fmtHour(defaultHour));
  const [group, setGroup] = useState<BuilderGroup>('Proteína');
  const [query, setQuery] = useState('');

  const customFoods: CustomFood[] = prefs.customFoods ?? [];
  const allFoods = useMemo(() => (customFoods.length === 0 ? FOODS : [...FOODS, ...customFoods.map(customFoodToCatalogFood)]), [customFoods]);
  const foodMap = useMemo(() => new Map(allFoods.map((f) => [f.id, f])), [allFoods]);
  const resolve = (id: string) => foodMap.get(id);
  const foodsByGroup = useMemo(() => builderFoods(allFoods, prefs.excludedFoodIds ?? []), [allFoods, prefs.excludedFoodIds]);

  const totals = totalsOf(items, resolve);
  const hour = parseTimeInput(hourText, defaultHour);

  function add(foodId: string) {
    const food = resolve(foodId);
    if (!food) return;
    setItems((prev) => [...prev, { foodId, grams: fixedPortion(food).grams }]);
  }

  function step(index: number, dir: 1 | -1) {
    const it = items[index];
    const food = resolve(it.foodId);
    if (!food) return;
    const b = foodBounds(food);
    const next = snapGrams(food, it.grams + dir * b.step);
    setItems((prev) => prev.map((x, i) => (i === index ? { ...x, grams: next } : x)));
  }

  function confirm() {
    if (items.length === 0) return;
    const entry: ExtraFoodEntry = { id: `extra${Date.now()}`, hour, items };
    updatePrefs((p) => withExtra(p, iso, entry));
    onDone();
  }

  const chosen = new Set(items.map((i) => i.foodId));
  const q = query.trim().toLowerCase();
  const list = q ? BUILDER_GROUPS.flatMap((g) => foodsByGroup[g]).filter((f) => f.name.toLowerCase().includes(q)) : foodsByGroup[group];
  const available = list.filter((f) => !chosen.has(f.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 px-3.5 py-1">
        {items.length === 0 ? (
          <p className="py-5 text-center text-sm text-neutral-500">¿Qué te has tomado? Elígelo abajo.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {items.map((it, index) => {
              const food = resolve(it.foodId);
              if (!food) return null;
              const b = foodBounds(food);
              const units = food.unit ? Math.max(1, Math.round(it.grams / food.unit.grams)) : undefined;
              const fixed = b.min === b.max;
              return (
                <li key={`${it.foodId}-${index}`} className="flex items-center gap-2 py-2.5">
                  <span className="flex-1 text-sm text-neutral-100">{food.name}</span>
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
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`Quitar ${food.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <X size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar (fruta, café, algo dulce...)"
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
                  group === g ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
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

      <label className="flex items-center justify-between gap-3 rounded-lg border border-brand-border px-3.5 py-2.5">
        <span className="text-sm text-neutral-300">Hora</span>
        <input
          type="time"
          value={hourText}
          onChange={(e) => setHourText(e.target.value)}
          className="num rounded-md border border-brand-border bg-brand-bg px-2 py-1 text-sm text-white focus:border-brand-gold focus:outline-none"
        />
      </label>

      {items.length > 0 && (
        <p className="text-center text-xs text-neutral-500">
          ≈ {totals.protein} g proteína · {totals.carbs} g hidratos
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg border border-brand-border px-4 py-2.5 text-sm font-semibold text-neutral-300 transition-colors hover:text-white">
          Cancelar
        </button>
        <button
          onClick={confirm}
          disabled={items.length === 0}
          className="flex-[2] rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Añadir al día
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-600">Se cuenta como ya tomado — no hay un estado pendiente para un antojo.</p>
    </div>
  );
}
