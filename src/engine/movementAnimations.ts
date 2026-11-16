import { BASE_ANIMATIONS, type MovementAnimation } from './movementAnimation';
import { MORE_ANIMATIONS } from './movementAnimationMore';
import { ACCESSORY_ANIMATIONS } from './movementAnimationAccessory';

/**
 * El registro de las animaciones de movimientos: cada movimiento del catálogo con su dibujo propio, más los alias (variantes que se ven
 * igual de perfil, como el sumo y el convencional, o la dominada con banda y la estricta). Lo que no está aquí no pinta nada.
 */

export const ANIMATIONS: Record<string, MovementAnimation> = { ...BASE_ANIMATIONS, ...MORE_ANIMATIONS, ...ACCESSORY_ANIMATIONS };

/** Movimiento → animación que comparte (variantes que de perfil se ven igual o casi). */
export const ANIMATION_ALIASES: Record<string, string> = {
  'sumo-deadlift': 'deadlift',
  'kettlebell-front-squat': 'kettlebell-goblet-squat',
  'shoulder-to-overhead': 'push-press',
  'butterfly-pull-up': 'kipping-pull-up',
  'banded-pull-up': 'strict-pull-up',
  'jumping-pull-up': 'strict-pull-up',
  'lateral-burpee': 'bar-facing-burpee',
  'hand-release-push-up': 'push-up',
  'kipping-hspu': 'handstand-push-up',
  'shuttle-run': 'run',
  'sled-drag': 'sled-push',
  'sled-row': 'sled-push',
  'chest-supported-row': 'single-arm-dumbbell-row',
  'back-extension': 'ghd-hip-extension',
  'floor-press': 'bench-press',
  'man-maker': 'devils-press',
  'single-under': 'double-under',
  // Accesorios que de perfil se ven como otro
  'hammer-curl': 'bicep-curl',
  'dumbbell-floor-press': 'dumbbell-bench-press',
  'band-pull-apart': 'face-pull',
  'side-plank-hold': 'plank',
  'cossack-squat': 'air-squat',
};

/** La animación de un movimiento del catálogo, o null si aún no la tiene. */
export function animationFor(movementId: string): MovementAnimation | null {
  return ANIMATIONS[ANIMATION_ALIASES[movementId] ?? movementId] ?? null;
}

/** Los movimientos que ya tienen animación (propia o compartida). */
export function animatedMovementIds(): string[] {
  return [...Object.keys(ANIMATIONS), ...Object.keys(ANIMATION_ALIASES)];
}
