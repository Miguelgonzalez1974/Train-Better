import type { Block } from './types';

/**
 * Movimientos de accesorio cuya carga sugerida es POR MANCUERNA (se usan en pareja): el numero que se
 * muestra es el de cada una, no el total. El resto de cargas de accesorio son la barra / el total
 * movido. Vive en la capa de datos porque lo leen tanto el motor (para calcular) como la UI (para
 * etiquetar "kg c/u" en vez de "kg").
 */
export const PER_DUMBBELL_ACCESSORY_IDS: ReadonlySet<string> = new Set([
  'dumbbell-bench-press',
  'dumbbell-floor-press',
  'dumbbell-z-press',
  'lateral-raise',
]);

/** Etiqueta de unidad de una carga: "kg c/u" para accesorios con una mancuerna en cada mano, si no "kg". */
export function loadUnitLabel(movementId: string | undefined, block: Block | undefined): string {
  return block === 'accessory' && movementId && PER_DUMBBELL_ACCESSORY_IDS.has(movementId) ? 'kg c/u' : 'kg';
}
