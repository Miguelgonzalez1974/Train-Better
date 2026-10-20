import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Food } from '../../data/nutrition/foods';
import { gramsFromTyped, MIN_TYPED_GRAMS, stepGrams } from '../../engine/mealBuilder';

interface QuantityStepperProps {
  food: Food;
  grams: number;
  onChange: (grams: number) => void;
  /** `sm` para listas apretadas (diario), `md` para el constructor de comidas. */
  size?: 'sm' | 'md';
}

/** Lo que se ve en el campo (piezas o gramos/ml) y la unidad que lo acompaña. */
function shown(food: Food, grams: number): { value: number; unit: string } {
  if (food.unit) {
    const units = Math.max(1, Math.round(grams / food.unit.grams));
    return { value: units, unit: units === 1 ? food.unit.singular : food.unit.plural };
  }
  return { value: Math.round(grams), unit: food.liquid || food.id === 'aceite' ? 'ml' : 'g' };
}

/**
 * Cantidad de un alimento: botones − y + para ajustar rápido y un campo donde teclear CUALQUIER cantidad (sin mínimo
 * de catálogo ni máximo). Mientras se teclea se guarda cada número válido; al salir del campo vuelve a lo guardado.
 */
export function QuantityStepper({ food, grams, onChange, size = 'md' }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const { value, unit } = shown(food, grams);
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const atMin = food.unit ? value <= 1 : grams <= MIN_TYPED_GRAMS;

  function type(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 5);
    setDraft(digits);
    const next = digits === '' ? null : gramsFromTyped(food, Number(digits));
    if (next !== null) onChange(next);
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => {
          setDraft(null);
          onChange(stepGrams(food, grams, -1));
        }}
        disabled={atMin}
        aria-label={`Menos ${food.name}`}
        className={`flex ${box} items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors hover:text-white disabled:opacity-30`}
      >
        <Minus size={size === 'sm' ? 13 : 14} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? String(value)}
        onChange={(e) => type(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        aria-label={`Cantidad de ${food.name} en ${unit}`}
        className={`num ${size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm'} w-12 rounded-lg border border-brand-border bg-transparent text-center font-semibold text-white outline-none transition-colors focus:border-brand-gold`}
      />
      <span className={`${size === 'sm' ? 'w-9 text-[11px]' : 'w-10 text-xs'} truncate text-neutral-400`}>{unit}</span>
      <button
        onClick={() => {
          setDraft(null);
          onChange(stepGrams(food, grams, 1));
        }}
        aria-label={`Más ${food.name}`}
        className={`flex ${box} items-center justify-center rounded-lg border border-brand-border text-neutral-300 transition-colors hover:text-white`}
      >
        <Plus size={size === 'sm' ? 13 : 14} />
      </button>
    </span>
  );
}
