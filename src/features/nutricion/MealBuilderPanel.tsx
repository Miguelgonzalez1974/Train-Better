import { useMemo, useState } from 'react';
import type { NutritionPrefs } from '../../data/athlete/types';
import { MEAL_ORDER, type MealKey } from '../../engine/mealPlan';
import type { NutritionDayType } from '../../engine/nutritionPlan';
import { MealBuilder } from './MealBuilder';
import { autoPlanFor, planFor, withCustomMeal, withoutCustomMeal } from './nutritionData';

interface MealBuilderPanelProps {
  prefs: NutritionPrefs;
  weightKg: number;
  updatePrefs: (update: (prefs: NutritionPrefs) => NutritionPrefs) => void;
  iso: string;
  dayType: NutritionDayType;
  mealKey: MealKey;
}

/**
 * Una comida montada a mano de un día concreto: lee la comida del plan (con lo que ya hubiera montado), guarda cada
 * cambio y permite volver a la sugerencia automática o marcarla como hecha. Solo necesita las preferencias de
 * nutrición y el peso, así que se usa desde cualquier sitio de la app que ya los tenga — la pestaña Nutrición, el
 * calendario y el icono de nutrición de Planificación.
 */
export function MealBuilderPanel({ prefs, weightKg, updatePrefs, iso, dayType, mealKey }: MealBuilderPanelProps) {
  const [resetCount, setResetCount] = useState(0);
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg), [prefs, iso, dayType, weightKg]);
  const meal = plan.meals.find((m) => m.key === mealKey);
  // El menú automático "de verdad" (sin lo montado a mano) — para la pestaña Automático, que compara contra él.
  const autoPlan = useMemo(() => autoPlanFor(prefs, iso, dayType, weightKg), [prefs, iso, dayType, weightKg]);
  const autoMeal = autoPlan.meals.find((m) => m.key === mealKey);
  const excluded = useMemo(() => prefs.excludedFoodIds ?? [], [prefs.excludedFoodIds]);
  if (!meal || !autoMeal) return null;

  const mealIndex = MEAL_ORDER.indexOf(mealKey);
  const done = prefs.doneMeals?.[iso]?.includes(mealIndex) ?? false;

  return (
    <MealBuilder
      key={`${iso}|${mealKey}|${resetCount}`}
      meal={meal}
      autoMeal={autoMeal}
      excludedFoodIds={excluded}
      done={done}
      onChange={(items) => updatePrefs((p) => withCustomMeal(p, iso, mealKey, items))}
      onAuto={() => {
        updatePrefs((p) => withoutCustomMeal(p, iso, mealKey));
        setResetCount((n) => n + 1);
      }}
      onToggleDone={() =>
        updatePrefs((p) => {
          const current = p.doneMeals?.[iso] ?? [];
          const next = current.includes(mealIndex) ? current.filter((i) => i !== mealIndex) : [...current, mealIndex].sort();
          return { ...p, doneMeals: { ...(p.doneMeals ?? {}), [iso]: next } };
        })
      }
    />
  );
}
