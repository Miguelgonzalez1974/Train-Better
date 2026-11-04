import type { NutritionPrefs } from './types';

/**
 * Campos de los menús del día y de la semana (alimentos excluidos, cambios de alimento, comidas hechas, horas de
 * entreno, básicos de la compra, comidas montadas a mano). Los menús ya no existen: no los lee ninguna pantalla.
 */
const LEGACY_MENU_FIELDS = ['excludedFoodIds', 'swaps', 'doneMeals', 'trainingHours', 'staples', 'customMeals'] as const;

/**
 * Devuelve las preferencias de nutrición sin los campos de los menús antiguos. Si no traían ninguno devuelve el mismo
 * objeto, así quien lo llama puede saber con `===` si hubo algo que limpiar.
 */
export function stripLegacyNutritionPrefs(prefs: NutritionPrefs | undefined): NutritionPrefs | undefined {
  if (!prefs) return prefs;
  const raw = prefs as Record<string, unknown>;
  if (!LEGACY_MENU_FIELDS.some((k) => k in raw)) return prefs;
  const clean: Record<string, unknown> = { ...raw };
  for (const k of LEGACY_MENU_FIELDS) delete clean[k];
  return clean as NutritionPrefs;
}
