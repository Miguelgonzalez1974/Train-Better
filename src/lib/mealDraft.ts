/**
 * El puente entre el lab de Rex y Nutrición: si escribes «he comido dos huevos y arroz» en el lab, la frase espera aquí hasta que la
 * pantalla de Nutrición la recoge, la lee con Rex y te la enseña antes de apuntar nada. Dura lo que la pestaña (sessionStorage).
 */
export const MEAL_DRAFT_KEY = 'tb-rex-meal-draft';

/** Lee y borra la frase pendiente (null si no hay o no hay almacenamiento). */
export function takeMealDraft(storage: Pick<Storage, 'getItem' | 'removeItem'> | null): string | null {
  try {
    const value = storage?.getItem(MEAL_DRAFT_KEY) ?? null;
    if (value !== null) storage?.removeItem(MEAL_DRAFT_KEY);
    return value && value.trim() !== '' ? value : null;
  } catch {
    return null;
  }
}
