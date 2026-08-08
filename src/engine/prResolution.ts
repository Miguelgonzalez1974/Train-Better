import type { Movement } from '../data/movements/types';
import type { PersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';

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
