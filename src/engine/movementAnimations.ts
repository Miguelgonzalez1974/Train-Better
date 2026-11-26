import { BASE_ANIMATIONS, type MovementAnimation } from './movementAnimation';
import { MORE_ANIMATIONS } from './movementAnimationMore';
import { ACCESSORY_ANIMATIONS } from './movementAnimationAccessory';
import { LIFT_ANIMATIONS } from './movementAnimationLifts';
import { COOLDOWN_ANIMATIONS } from './movementAnimationCooldown';

/**
 * El registro de las animaciones de movimientos: cada movimiento del catálogo con su dibujo propio, más los alias (variantes que se ven
 * igual de perfil, como el sumo y el convencional, o la dominada con banda y la estricta). Lo que no está aquí no pinta nada.
 */

export const ANIMATIONS: Record<string, MovementAnimation> = {
  ...BASE_ANIMATIONS,
  ...MORE_ANIMATIONS,
  ...ACCESSORY_ANIMATIONS,
  ...LIFT_ANIMATIONS,
  ...COOLDOWN_ANIMATIONS,
};

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
  // Fuerza: variantes de pausa, tempo, agarre o inclinación que de perfil se ven como el movimiento base
  'close-grip-bench-press': 'bench-press',
  'incline-bench-press': 'bench-press',
  'spoto-press': 'bench-press',
  'box-squat': 'back-squat',
  'pause-back-squat': 'back-squat',
  'tempo-back-squat': 'back-squat',
  'deficit-deadlift': 'deadlift',
  'halting-deadlift': 'deadlift',
  'seated-strict-press': 'z-press',
  'in-the-hole-front-squat': 'front-squat',
  // Halterofilia: variantes y ejercicios técnicos que comparten dibujo con el levantamiento
  'snatch-balance': 'overhead-squat',
  'snatch-deadlift': 'deadlift',
  'clean-deadlift': 'deadlift',
  'no-touch-snatch-deadlift': 'deadlift',
  'no-touch-clean-deadlift': 'deadlift',
  'panda-pull': 'deadlift',
  'panda-pull-clean': 'deadlift',
  'three-position-snatch': 'snatch',
  'three-position-clean': 'clean',
  'barski-snatch': 'snatch',
  'snatch-drop': 'snatch',
  'pause-snatch': 'snatch',
  'pause-overhead-squat': 'overhead-squat',
  'jerk-balance': 'push-jerk',
  'tall-jerk': 'push-jerk',
  'tall-clean': 'hang-clean',
  'off-blocks-snatch': 'hang-snatch',
  'off-blocks-clean': 'hang-clean',
  // Skill
  'handstand-walk-progression': 'handstand-walk',
  'muscle-up-transition-drill': 'bar-muscle-up',
  'banded-muscle-up': 'bar-muscle-up',
  'double-under-practice': 'double-under',
  'rope-climb-technique': 'rope-climb',
  'seated-rope-climb': 'legless-rope-climb',
  'l-sit-progression': 'l-sit',
  'negative-pull-up': 'strict-pull-up',
  'false-grip-hang': 'dead-hang',
  'hollow-hold': 'hollow-rock',
  'hspu-negative': 'handstand-push-up',
};

/** La animación de un movimiento del catálogo, o null si aún no la tiene. */
export function animationFor(movementId: string): MovementAnimation | null {
  return ANIMATIONS[ANIMATION_ALIASES[movementId] ?? movementId] ?? null;
}

/** Los movimientos que ya tienen animación (propia o compartida). */
export function animatedMovementIds(): string[] {
  return [...Object.keys(ANIMATIONS), ...Object.keys(ANIMATION_ALIASES)];
}
