import type { NutritionDayType } from '../../engine/nutritionPlan';

/** Color del tipo de día (el mismo en la pantalla de Nutrición y en el resumen del Dashboard): descanso gris, ligero verde, normal dorado, carga alta naranja. */
export const DAY_TYPE_STYLE: Record<NutritionDayType, string> = {
  descanso: 'bg-white/5 text-neutral-400',
  ligero: 'bg-good/15 text-good',
  normal: 'bg-brand-gold/15 text-brand-gold',
  alto: 'bg-warn/20 text-warn',
};
