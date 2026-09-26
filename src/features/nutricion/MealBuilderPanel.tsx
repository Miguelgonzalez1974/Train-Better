import { useMemo, useState } from 'react';
import { MEAL_ORDER, type MealKey } from '../../engine/mealPlan';
import type { NutritionDayType } from '../../engine/nutritionPlan';
import { MealBuilder } from './MealBuilder';
import { planFor, withCustomMeal, withoutCustomMeal } from './nutritionData';
import type { NutritionShared } from './shared';

interface MealBuilderPanelProps {
  shared: NutritionShared;
  iso: string;
  dayType: NutritionDayType;
  mealKey: MealKey;
}

/**
 * Una comida montada a mano de un día concreto, conectada a las preferencias del atleta: lee la comida del plan (con
 * lo que ya hubiera montado), guarda cada cambio y permite volver a la sugerencia automática o marcarla como hecha.
 * La usan la pestaña Hoy y el calendario dentro de una ventana.
 */
export function MealBuilderPanel({ shared, iso, dayType, mealKey }: MealBuilderPanelProps) {
  const { prefs, weightKg, updatePrefs } = shared;
  const [resetCount, setResetCount] = useState(0);
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg), [prefs, iso, dayType, weightKg]);
  const meal = plan.meals.find((m) => m.key === mealKey);
  const excluded = useMemo(() => prefs.excludedFoodIds ?? [], [prefs.excludedFoodIds]);
  if (!meal) return null;

  const mealIndex = MEAL_ORDER.indexOf(mealKey);
  const done = prefs.doneMeals?.[iso]?.includes(mealIndex) ?? false;

  return (
    <MealBuilder
      key={`${iso}|${mealKey}|${resetCount}`}
      meal={meal}
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
