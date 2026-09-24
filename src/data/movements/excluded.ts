/**
 * Movimientos que el atleta ha pedido no programar nunca (por salud articular). Salen del catálogo de
 * movimientos y de la progresión de habilidades; además, los WODs de referencia y de la biblioteca que los
 * incluyen se descartan al elegir el WOD del día (los ids de esos WODs se conservan para no romper el historial).
 *
 * Pistol squat: lo pidió el atleta — es nocivo para las rodillas, no quiere tenerlo en la programación (ni con
 * versiones asistidas o con caja).
 */
export const EXCLUDED_MOVEMENT_IDS: ReadonlySet<string> = new Set([
  'pistol-squat',
  'pistol',
  'box-pistol',
  'assisted-pistol',
  'pistol-squat-progression',
  'box-pistol-squat',
]);

export function isExcludedMovement(id: string): boolean {
  return EXCLUDED_MOVEMENT_IDS.has(id);
}

/** El texto del WOD nombra un pistol (por si el WOD lo trae solo en el enunciado y no en la lista de ids). */
const EXCLUDED_TEXT = /pistol/i;

export function usesExcludedMovement(movementIds: readonly string[], text = ''): boolean {
  return movementIds.some(isExcludedMovement) || EXCLUDED_TEXT.test(text);
}
