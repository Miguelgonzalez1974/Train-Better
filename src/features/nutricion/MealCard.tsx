import { useState } from 'react';
import { Check, Grab, Hand, Repeat } from 'lucide-react';
import { poolForRole, previewSwap, type MealPlanInput, type PlannedItem, type PlannedMeal } from '../../engine/mealPlan';
import { formatServing } from '../../engine/nutritionPlan';

const KIND_LABEL: Record<PlannedItem['kind'], string> = {
  protein: 'Proteína',
  carb: 'Hidrato',
  fruit: 'Fruta',
  veg: 'Verdura',
  fat: 'Grasa',
};

const TAG_STYLE: Record<string, string> = {
  'post-entreno': 'bg-emerald-500/15 text-emerald-300',
};
const PRE_STYLE = 'bg-brand-gold/15 text-brand-gold';

/** 1.5 → "1-2", 0.5 → "½", 2 → "2" (mismo criterio que la guía por manos). */
function handRange(x: number): { lo: number; hi: number } {
  return Number.isInteger(x) || x === 0.5 ? { lo: x, hi: x } : { lo: Math.floor(x), hi: Math.ceil(x) };
}

interface MealCardProps {
  meal: PlannedMeal;
  done: boolean;
  onToggleDone: () => void;
  /** Datos del día para calcular la cantidad de cada alternativa al cambiar un alimento. */
  input: MealPlanInput;
  excludedFoodIds: string[];
  onSwap: (swapKey: string, foodId: string) => void;
}

/**
 * Una comida del día: hora, etiqueta respecto al entreno, alimentos con su cantidad y cuánto aporta.
 * Tocar un alimento abre las alternativas del mismo hueco, ya con la cantidad recalculada.
 */
export function MealCard({ meal, done, onToggleDone, input, excludedFoodIds, onSwap }: MealCardProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const tagStyle = meal.pre ? PRE_STYLE : (TAG_STYLE[meal.tag] ?? 'bg-white/5 text-neutral-400');

  return (
    <section className={`card p-3.5 transition-opacity duration-200 ${done ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold text-white">{meal.label}</p>
        {meal.tag && <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tagStyle}`}>{meal.tag}</span>}
        <span className="num text-xs text-neutral-500">{meal.time}</span>
      </div>

      <ul className="mt-2 flex flex-col divide-y divide-white/5">
        {meal.items.map((item) => {
          const open = openKey === item.swapKey;
          const options = poolForRole(item.role, excludedFoodIds, true);
          const canSwap = options.length > 1;
          return (
            <li key={item.swapKey} className="py-1.5">
              <button
                type="button"
                onClick={() => canSwap && setOpenKey(open ? null : item.swapKey)}
                aria-expanded={canSwap ? open : undefined}
                className={`flex w-full items-center gap-2 text-left ${canSwap ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="flex-1">
                  <span className="block text-sm text-neutral-100">{item.name}</span>
                  <span className="block text-[11px] text-neutral-500">{KIND_LABEL[item.kind]}</span>
                </span>
                <span className="num text-sm font-semibold text-white">{item.quantity}</span>
                {canSwap && <Repeat size={14} className={`shrink-0 ${open ? 'text-brand-gold' : 'text-neutral-600'}`} aria-label="Cambiar alimento" />}
              </button>

              {open && (
                <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/[0.03] p-1.5" role="listbox" aria-label={`Cambiar ${item.name}`}>
                  {options.map((food) => {
                    const preview = previewSwap(input, meal.key, item.kind, food.id);
                    const selected = food.id === item.foodId;
                    return (
                      <button
                        key={food.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onSwap(item.swapKey, food.id);
                          setOpenKey(null);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          selected ? 'bg-brand-gold/15 text-brand-gold' : 'text-neutral-300 hover:bg-white/5'
                        }`}
                      >
                        <span>{food.name}</span>
                        <span className="num text-xs">{preview?.quantity ?? ''}</span>
                      </button>
                    );
                  })}
                  <p className="px-2 pt-1 text-[11px] text-neutral-600">La cantidad se recalcula para que la toma siga cuadrando.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
        <p className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
          <span className="num">≈ {meal.protein} g prot · {meal.carbs} g hidratos</span>
          <span className="flex items-center gap-1">
            <Hand size={12} aria-hidden="true" />
            {formatServing(handRange(meal.palms), 'palma', 'palmas')}
          </span>
          <span className="flex items-center gap-1">
            <Grab size={12} aria-hidden="true" />
            {formatServing(handRange(meal.fists), 'puño', 'puños')}
          </span>
        </p>
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-brand-border text-neutral-400 hover:text-white'
          }`}
        >
          {done && <Check size={13} strokeWidth={3} aria-hidden="true" />}
          {done ? 'Hecho' : 'Marcar'}
        </button>
      </div>
    </section>
  );
}
