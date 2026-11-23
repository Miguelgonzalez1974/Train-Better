import type { SessionBlockResult } from '../data/athlete/types';

/**
 * El descanso que prescribe el entreno entre las series de fuerza y de halterofilia. Lo marca la propia sesión (cuantas más repeticiones, menos descanso; los complejos y los
 * singles pesados, más) y no la app: solo hay descanso donde el entreno lo pide. Se deduce de la prescripción del bloque, así que sirve igual para una sesión ya generada,
 * editada a mano o de otro dispositivo, y el atleta lo ve junto a las series antes de entrenar. Un accesorio, un WOD (por tiempo o por intervalos, que ya llevan su propio reloj),
 * el calentamiento y la vuelta a la calma no llevan descanso entre series: devuelven null.
 *
 * Puro: sin reloj ni almacenamiento.
 */

/** Descanso de un test de máximo (1RM): hace falta recuperarse del todo. */
export const TEST_REST_SECONDS = 240;
/** Un complejo de halterofilia se hace entero y cuesta: dos minutos y medio (lo que ya decían sus notas, «2-3 min»). */
export const COMPLEX_REST_SECONDS = 150;
/** Una rampa o una ola (5-3-1…): las series de aproximación no cansan tanto como las de trabajo. */
export const WAVE_REST_SECONDS = 120;

/** Segundos de descanso según las repeticiones de la serie de trabajo en fuerza: pesado y corto descansa más. */
export function strengthRestForReps(reps: number): number {
  if (reps <= 2) return 180;
  if (reps <= 5) return 150;
  if (reps <= 8) return 120;
  if (reps <= 12) return 90;
  return 60;
}

/** Segundos de descanso en halterofilia (series de pocas repeticiones, técnica y potencia: se descansa para repetir bien). */
export function olyRestForReps(reps: number): number {
  return reps <= 3 ? 120 : 90;
}

type RestEntry = Pick<SessionBlockResult, 'block' | 'reps' | 'sets' | 'complex' | 'setPlan' | 'logAsSingle' | 'format'>;

/** Los segundos de descanso que prescribe una entrada entre sus series, o null si el entreno no marca ninguno. */
export function prescribedRestSeconds(entry: RestEntry): number | null {
  if (entry.block !== 'strength' && entry.block !== 'oly') return null;
  const format = entry.format ?? '';
  // Un EMOM ya lleva su propio reloj: el descanso es lo que sobra del minuto.
  if (/^EMOM/i.test(format)) return null;
  if (/Test/i.test(format)) return TEST_REST_SECONDS;
  if (entry.complex) return COMPLEX_REST_SECONDS;
  if (entry.setPlan && entry.setPlan.length >= 2) return WAVE_REST_SECONDS;
  // Las repeticiones de trabajo: el primer número («5», «10-12»); sin número («al fallo») no hay descanso que prescribir.
  const first = (entry.reps ?? '').match(/^\s*(\d+)/)?.[1];
  const reps = first ? Number(first) : null;
  if (reps === null || reps < 1 || reps > 30) return null;
  return entry.block === 'oly' ? olyRestForReps(reps) : strengthRestForReps(reps);
}

/** «2:30», «90 s» o «2 min»: como se dice el descanso al atleta. */
export function restLabel(seconds: number): string {
  if (seconds < 120 && seconds % 60 !== 0) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}
