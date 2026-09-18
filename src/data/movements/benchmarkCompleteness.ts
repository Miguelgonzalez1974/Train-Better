import type { BenchmarkWorkout } from './types';

const LADDER = /\d+(?:-\d+){2,}/;
const CLOCK_TIME = /\d+:\d+/g;
const BRACKETED_CAP = /\[[^\]]*\]/g;
const STRUCTURAL_NUMBER = /\b\d+\s*(?:min|minutos|rondas?|bloques?)\b/gi;

/**
 * `BenchmarkWorkout` no tiene reps/carga por movimiento como campo propio -- todo va en el texto
 * libre de `format`. Muchos WODs "custom" importados en bloque (ver benchmarkWods.ts, seccion
 * CompTrain) solo dicen "For time" o "5 rondas for time" sin decir cuanto de cada movimiento --
 * el mismo bug que tenia Weapon of Choice antes de rellenarlo con la prescripcion real. Esto
 * detecta esos casos para no ofrecerlos como benchmark del dia hasta que alguien los rellene con
 * la fuente real (nunca se inventan cifras aqui, solo se clasifica el texto ya existente).
 */
export function benchmarkHasExplicitScheme(wod: BenchmarkWorkout): boolean {
  if (wod.scoreType === 'load') return true;
  if (wod.movements.length <= 1) return true;
  if (LADDER.test(wod.format)) return true;

  const stripped = wod.format.replace(BRACKETED_CAP, '').replace(CLOCK_TIME, '').replace(STRUCTURAL_NUMBER, '');
  const remainingNumbers = stripped.match(/\d+/g) ?? [];
  return remainingNumbers.length >= wod.movements.length;
}
