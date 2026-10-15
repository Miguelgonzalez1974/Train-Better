import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { FOODS, FOOD_TAG_LABEL, SHOPPING_CATEGORY_LABEL, SHOPPING_CATEGORY_ORDER, type FoodRole, type FoodTag } from '../../data/nutrition/foods';
import { poolForRole } from '../../engine/mealPlan';
import { SectionLabel } from '../shell/SectionLabel';
import { withCustomFood, withoutCustomFood } from './nutritionData';
import type { NutritionShared } from './shared';
import type { CustomFoodGroup } from '../../data/athlete/types';

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

/**
 * Alimentos: los tuyos (los das de alta con su proteína e hidratos por 100 g), el catálogo predefinido con lo que aporta
 * cada uno, y cuáles no quieres ver en tus menús. Lo que añadas aquí sale al apuntar en el diario y al montar comidas.
 */
export function AlimentosView({ shared }: { shared: NutritionShared }) {
  const { prefs, updatePrefs } = shared;
  const excluded = useMemo(() => new Set(prefs.excludedFoodIds ?? []), [prefs.excludedFoodIds]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newFood, setNewFood] = useState<{ name: string; p: string; c: string; group: CustomFoodGroup | null }>({ name: '', p: '', c: '', group: null });
  const customFoods = prefs.customFoods ?? [];
  const q = query.trim().toLowerCase();

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
    setCreating(false);
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

  const emptyRoles = (Object.keys(ROLE_LABEL) as FoodRole[]).filter((r) => poolForRole(r, excluded).length === 0);
  const myFoods = customFoods.filter((f) => !q || f.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar alimento"
          aria-label="Buscar alimento"
          className="w-full rounded-lg border border-brand-border bg-brand-bg py-2.5 pl-9 pr-3 text-sm text-white focus:border-brand-gold focus:outline-none"
        />
      </div>

      {/* Mis alimentos */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Mis alimentos</SectionLabel>
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-brand-gold underline-offset-2 hover:underline"
          >
            <Plus size={13} aria-hidden="true" /> {creating ? 'Cancelar' : 'Crear alimento'}
          </button>
        </div>

        {creating && (
          <div className="mb-3 flex flex-col gap-2 rounded-2xl bg-white/[0.03] p-3.5">
            <input
              type="text"
              value={newFood.name}
              onChange={(e) => setNewFood((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre (ej. Batido de proteína casero)"
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-brand-gold focus:outline-none"
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
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-orange px-3 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              Guardar alimento
            </button>
          </div>
        )}

        {customFoods.length === 0 && !creating ? (
          <p className="rounded-2xl bg-white/[0.03] px-4 py-4 text-xs leading-relaxed text-neutral-500">
            Aquí van los alimentos que no están en el catálogo. Con su proteína e hidratos por 100 g calculamos las cantidades igual que con el resto.
          </p>
        ) : (
          myFoods.length > 0 && (
            <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] px-4">
              {myFoods.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-100">{f.name}</span>
                    <span className="num block text-[11px] text-neutral-500">
                      {f.group} · {f.proteinPer100} g prot · {f.carbsPer100} g hid. /100 g
                    </span>
                  </span>
                  <button
                    onClick={() => updatePrefs((p) => withoutCustomFood(p, f.id))}
                    aria-label={`Borrar ${f.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {/* Lo que no quiero */}
      <section>
        <SectionLabel className="mb-2">No quiero ver</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
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
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-orange/10 p-2.5 text-xs text-brand-orange">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Te quedas sin {emptyRoles.map((r) => ROLE_LABEL[r]).join(', ')}: esas comidas de los menús saldrán incompletas.
          </p>
        )}
        <p className="mt-2 text-[11px] text-neutral-600">Los quito de los menús. Para quitar uno solo, tócalo en el catálogo de abajo.</p>
      </section>

      {/* Catálogo */}
      <section>
        <SectionLabel className="mb-2">Catálogo</SectionLabel>
        <div className="flex flex-col gap-4">
          {SHOPPING_CATEGORY_ORDER.map((cat) => {
            const foods = FOODS.filter((f) => f.category === cat && (!q || f.name.toLowerCase().includes(q)));
            if (foods.length === 0) return null;
            return (
              <div key={cat}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{SHOPPING_CATEGORY_LABEL[cat]}</p>
                <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] px-4">
                  {foods.map((f) => {
                    const out = excluded.has(f.id);
                    return (
                      <li key={f.id} className="flex items-center gap-2 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${out ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>{f.name}</span>
                          <span className="num block text-[11px] text-neutral-500">
                            {f.per100.p} g prot · {f.per100.c} g hid. /100 g
                          </span>
                        </span>
                        <button
                          onClick={() => toggleFood(f.id)}
                          aria-pressed={out}
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            out ? 'border-red-400/50 bg-red-400/10 text-red-300' : 'border-brand-border text-neutral-400 hover:text-white'
                          }`}
                        >
                          {out ? 'Fuera' : 'No lo como'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
