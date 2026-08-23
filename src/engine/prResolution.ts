import type { Movement } from '../data/movements/types';
import type { PersonalRecords, VariantPersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';

/** Movimiento exacto (no cadena de progresiones) que corresponde a cada PR de variante. */
export const VARIANT_PR_MOVEMENT_ID: Record<keyof VariantPersonalRecords, string> = {
  sumoDeadlift: 'sumo-deadlift',
  pushPress: 'push-press',
  splitJerk: 'split-jerk',
};

/**
 * PR dedicado de una variante para un movimiento concreto (no de su cadena de progresiones), si el
 * atleta lo ha rellenado — undefined si el movimiento no tiene variante dedicada o si no se ha
 * puesto un numero (>0). Los llamadores caen a la resolucion normal (PR del lift raiz) cuando esto
 * devuelve undefined, que es exactamente el comportamiento de antes de que existieran estos PRs.
 */
export function resolveVariantPR(movement: Movement, variantPrs: VariantPersonalRecords | undefined): number | undefined {
  if (!variantPrs) return undefined;
  const key = resolveVariantPRKey(movement);
  if (!key) return undefined;
  const value = variantPrs[key];
  return value && value > 0 ? value : undefined;
}

/**
 * A que campo de `VariantPersonalRecords` corresponde este movimiento exacto — a diferencia de
 * `resolveVariantPR`, no depende de que el atleta ya tenga un valor puesto en `variantPrs`. Sirve
 * para saber "¿la carga de hoy se calculo a partir de una variante?" incluso cuando se quiere
 * escribir un valor nuevo ahi (p.ej. una estimacion de e1RM), no solo leer uno existente.
 */
export function resolveVariantPRKey(movement: Movement): keyof VariantPersonalRecords | undefined {
  return (Object.keys(VARIANT_PR_MOVEMENT_ID) as (keyof VariantPersonalRecords)[]).find(
    (k) => VARIANT_PR_MOVEMENT_ID[k] === movement.id,
  );
}

export const STRENGTH_ROOT_PR_MAP: Record<string, keyof PersonalRecords> = {
  'back-squat': 'backSquat',
  'front-squat': 'frontSquat',
  'bench-press': 'benchPress',
  deadlift: 'deadlift',
  'strict-press': 'strictPress',
};

/** Recorre la cadena de progresiones del movimiento hasta encontrar el lift raiz que tiene PR propio. */
export function resolveStrengthPRKey(movement: Movement): keyof PersonalRecords | undefined {
  let current: Movement | undefined = movement;
  while (current) {
    const key = STRENGTH_ROOT_PR_MAP[current.id];
    if (key) return key;
    current = current.progressionOf ? getMovementById(current.progressionOf) : undefined;
  }
  return undefined;
}

export const OLY_ROOT_PR_MAP: Record<string, keyof PersonalRecords> = {
  snatch: 'snatch',
  clean: 'clean',
  'clean-and-jerk': 'cleanAndJerk',
};

/** Mismo criterio que `resolveStrengthPRKey`, pero para los levantamientos completos de oly. */
export function resolveOlyPRKey(movement: Movement): keyof PersonalRecords | undefined {
  let current: Movement | undefined = movement;
  while (current) {
    const key = OLY_ROOT_PR_MAP[current.id];
    if (key) return key;
    current = current.progressionOf ? getMovementById(current.progressionOf) : undefined;
  }
  return undefined;
}
