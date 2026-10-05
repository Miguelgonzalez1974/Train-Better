import { useState } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { FOODS, FOOD_TAG_LABEL, SHOPPING_CATEGORY_LABEL, SHOPPING_CATEGORY_ORDER, STAPLES, type FoodRole, type FoodTag } from '../../data/nutrition/foods';
import { defaultTrainingHour, poolForRole, TRAINING_HOUR_OPTIONS } from '../../engine/mealPlan';
import { BodyweightCard } from '../dashboard/BodyweightCard';
import { withCustomFood, withoutCustomFood, WEEKDAY_LONG } from './nutritionData';
import type { NutritionShared } from './shared';
import type { BodyweightEntry, CustomFoodGroup } from '../../data/athlete/types';

const TAGS: FoodTag[] = ['pescado', 'lacteo', 'huevo', 'carne', 'gluten'];
const CUSTOM_FOOD_GROUPS: CustomFoodGroup[] = ['Proteína', 'Hidrato', 'Fruta', 'Verdura', 'Bebida', 'Extra'];

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
  const [newFood, setNewFood] = useState<{ name: string; p: string; c: string; group: CustomFoodGroup | null }>({ name: '', p: '', c: '', group: null });

  function saveCustomFood() {
    const name = newFood.name.trim();
    if (!name || !newFood.group) return;
    updatePrefs((p) =>
      withCustomFood(p, {
        id: `custom${Date.now()}`,
        name,
        proteinPer100: Math.max(0, Number(newFood.p) || 0),
        carbsPer100: Math.max(0, Number(newFood.c) || 0),
        group: newFood.group as CustomFoodGroup,
      }),
    );
    setNewFood({ name: '', p: '', c: '', group: null });
  }

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
        <p className="mb-1 text-sm font-semibold text-white">Básicos de despensa</p>
        <p className="mb-3 text-xs text-neutral-500">Cosas que usas pero no llevan cantidad en el menú. Las que actives salen siempre en tu lista de la compra.</p>
        <div className="flex flex-wrap gap-1.5">
          {STAPLES.map((s) => {
            const on = prefs.staples?.includes(s.id) ?? false;
            return (
              <button
                key={s.id}
                onClick={() =>
                  updatePrefs((p) => {
                    const current = p.staples ?? [];
                    return { ...p, staples: on ? current.filter((id) => id !== s.id) : [...current, s.id] };
                  })
                }
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  on ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-3.5">
        <p className="mb-1 text-sm font-semibold text-white">Mis alimentos</p>
        <p className="mb-3 text-xs text-neutral-500">
          Alimentos que no están en el catálogo. Con proteína e hidratos por 100 g te calculamos la cantidad igual que con el resto, cuando los añadas a una
          comida o como extra del día.
        </p>

        <div className="mb-3 flex flex-col gap-2 rounded-lg bg-white/[0.03] p-3">
          <input
            type="text"
            value={newFood.name}
            onChange={(e) => setNewFood((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nombre (ej. Batido de proteína casero)"
            className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-brand-gold focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
              Proteína /100 g
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={newFood.p}
                onChange={(e) => setNewFood((f) => ({ ...f, p: e.target.value }))}
                placeholder="0"
                className="num rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
              Hidratos /100 g
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={newFood.c}
                onChange={(e) => setNewFood((f) => ({ ...f, c: e.target.value }))}
                placeholder="0"
                className="num rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_FOOD_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setNewFood((f) => ({ ...f, group: g }))}
                aria-pressed={newFood.group === g}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  newFood.group === g ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={saveCustomFood}
            disabled={!newFood.name.trim() || !newFood.group}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-gold/15 px-3 py-2 text-xs font-semibold text-brand-gold transition-colors hover:bg-brand-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} aria-hidden="true" /> Guardar alimento
          </button>
        </div>

        {(prefs.customFoods ?? []).length > 0 && (
          <ul className="flex flex-col divide-y divide-white/5">
            {(prefs.customFoods ?? []).map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm text-neutral-100">
                  {f.name}
                  <span className="block text-[11px] text-neutral-500">{f.group}</span>
                </span>
                <span className="num shrink-0 text-[11px] text-neutral-500">
                  {f.proteinPer100} g prot · {f.carbsPer100} g hid. /100 g
                </span>
                <button
                  onClick={() => updatePrefs((p) => withoutCustomFood(p, f.id))}
                  aria-label={`Borrar ${f.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
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
              const foods = FOODS.filter((f) => f.category === cat && f.roles.length > 0);
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

