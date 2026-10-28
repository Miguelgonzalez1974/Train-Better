import type { NutritionDayType } from '../../engine/nutritionPlan';

/** Color del tipo de día (el mismo en el plan completo, el calendario y el icono de Planificación): descanso gris, ligero verde, normal dorado, carga alta naranja. */
export const DAY_TYPE_STYLE: Record<NutritionDayType, string> = {
  descanso: 'bg-white/5 text-neutral-400',
  ligero: 'bg-good/15 text-good',
  normal: 'bg-brand-gold/15 text-brand-gold',
  alto: 'bg-warn/20 text-warn',
};

/** Punto de color del tipo de día. */
export const DAY_TYPE_DOT: Record<NutritionDayType, string> = {
  descanso: 'bg-neutral-500',
  ligero: 'bg-good',
  normal: 'bg-brand-gold',
  alto: 'bg-warn',
};
