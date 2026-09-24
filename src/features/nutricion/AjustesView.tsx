import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { FOODS, FOOD_TAG_LABEL, SHOPPING_CATEGORY_LABEL, SHOPPING_CATEGORY_ORDER, type FoodRole, type FoodTag } from '../../data/nutrition/foods';
import { defaultTrainingHour, poolForRole, TRAINING_HOUR_OPTIONS } from '../../engine/mealPlan';
import { BodyweightCard } from '../dashboard/BodyweightCard';
import { WEEKDAY_LONG } from './nutritionData';
import type { NutritionShared } from './shared';
import type { BodyweightEntry } from '../../data/athlete/types';

const TAGS: FoodTag[] = ['pescado', 'lacteo', 'huevo', 'carne', 'gluten'];

const ROLE_LABEL: Partial<Record<FoodRole, string>> = {
  proteinMain: 'proteína de comida y cena',
  proteinBreakfast: 'proteína de desayuno',
  proteinLight: 'proteína de media mañana',
  proteinSnack: 'proteína de merienda',
  carbMain: 'hidrato de comida y cena',
  carbBreakfast: 'hidrato de desayuno',
  carbSnack: 'hidrato de merienda',
  fruit: 'fruta',
  veg: 'verdura',
};

interface AjustesViewProps {
  shared: NutritionShared;
  bodyweightLog: BodyweightEntry[];
  onBodyweightChange: (log: BodyweightEntry[]) => void;
}

/** Peso, hora de entreno de cada día y alimentos que el atleta no quiere ver en sus menús. */
export function AjustesView({ shared, bodyweightLog, onBodyweightChange }: AjustesViewProps) {
  const { prefs, updatePrefs } = shared;
  const excluded = new Set(prefs.excludedFoodIds ?? []);
  const [open, setOpen] = useState(false);

  function setExcluded(ids: string[]) {
    updatePrefs((p) => ({ ...p, excludedFoodIds: [...new Set(ids)] }));
  }

  function toggleFood(id: string) {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcluded([...next]);
  }

  function toggleTag(tag: FoodTag) {
    const ids = FOODS.filter((f) => f.tags?.includes(tag)).map((f) => f.id);
    const allOut = ids.every((id) => excluded.has(id));
    const next = new Set(excluded);
    for (const id of ids) {
      if (allOut) next.delete(id);
      else next.add(id);
    }
    setExcluded([...next]);
  }

  function setHour(weekdayIndex: number, hour: number) {
    updatePrefs((p) => ({ ...p, trainingHours: { ...(p.trainingHours ?? {}), [String(weekdayIndex)]: hour } }));
  }

  const emptyRoles = (Object.keys(ROLE_LABEL) as FoodRole[]).filter((r) => poolForRole(r, excluded).length === 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-3.5">
        <p className="mb-2 text-sm font-semibold text-white">Tu peso</p>
        <p className="mb-2 text-xs text-neutral-500">Las cantidades de los menús se calculan por kilo de peso corporal.</p>
        <BodyweightCard log={bodyweightLog} onChange={onBodyweightChange} embedded />
      </section>

      <section className="card p-3.5">
        <p className="mb-1 text-sm font-semibold text-white">Hora de entreno</p>
        <p className="mb-3 text-xs text-neutral-500">Ajusta cuándo va la merienda (previa al entreno) y cuándo cae la comida de después.</p>
        <div className="grid grid-cols-2 gap-2">
          {WEEKDAY_LONG.map((name, idx) => {
            const value = prefs.trainingHours?.[String(idx)] ?? defaultTrainingHour(idx);
            return (
              <label key={name} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-300">
                <span className="capitalize">{name}</span>
                <select
                  value={value}
                  onChange={(e) => setHour(idx, Number(e.target.value))}
                  className="num rounded-md border border-brand-border bg-brand-bg px-1.5 py-1 text-xs text-white focus:border-brand-gold focus:outline-none"
                >
                  {TRAINING_HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </section>

      <section className="card p-3.5">
        <p className="mb-1 text-sm font-semibold text-white">Alimentos que no quiero</p>
        <p className="mb-3 text-xs text-neutral-500">Los quito de todos los menús y de la lista de la compra. Si solo quieres cambiar uno un día, toca el alimento en el menú.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TAGS.map((tag) => {
            const ids = FOODS.filter((f) => f.tags?.includes(tag)).map((f) => f.id);
            const active = ids.length > 0 && ids.every((id) => excluded.has(id));
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active ? 'border-red-400/50 bg-red-400/10 text-red-300' : 'border-brand-border text-neutral-400 hover:text-white'
                }`}
              >
                {active ? 'Sin ' : ''}
                {FOOD_TAG_LABEL[tag].toLowerCase()}
              </button>
            );
          })}
        </div>

        {emptyRoles.length > 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-brand-orange/10 p-2.5 text-xs text-brand-orange">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Te quedas sin {emptyRoles.map((r) => ROLE_LABEL[r]).join(', ')}: esas tomas saldrán incompletas.
          </p>
        )}

        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand-gold underline decoration-dotted">
          {open ? 'Ocultar la lista' : `Elegir alimento a alimento (${excluded.size} fuera)`}
        </button>
        {open && (
          <div className="mt-3 flex flex-col gap-3">
            {SHOPPING_CATEGORY_ORDER.map((cat) => {
              const foods = FOODS.filter((f) => f.category === cat);
              if (foods.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{SHOPPING_CATEGORY_LABEL[cat]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {foods.map((f) => {
                      const out = excluded.has(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggleFood(f.id)}
                          aria-pressed={out}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            out ? 'border-red-400/50 bg-red-400/10 text-red-300 line-through' : 'border-brand-border text-neutral-300 hover:text-white'
                          }`}
                        >
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
