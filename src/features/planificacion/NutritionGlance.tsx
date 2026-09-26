import type { NutritionDayType } from '../../engine/nutritionPlan';

/** Color del tipo de día (el mismo en el plan completo, el calendario y el icono de Planificación): descanso gris, ligero verde, normal dorado, carga alta naranja. */
export const DAY_TYPE_STYLE: Record<NutritionDayType, string> = {
  descanso: 'bg-white/5 text-neutral-400',
  ligero: 'bg-emerald-500/15 text-emerald-300',
  normal: 'bg-brand-gold/15 text-brand-gold',
  alto: 'bg-brand-orange/20 text-brand-orange',
};

/** Punto de color del tipo de día. */
export const DAY_TYPE_DOT: Record<NutritionDayType, string> = {
  descanso: 'bg-neutral-500',
  ligero: 'bg-emerald-400',
  normal: 'bg-brand-gold',
  alto: 'bg-brand-orange',
};
