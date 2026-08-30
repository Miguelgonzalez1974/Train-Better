import type { RxOrScaled } from '../data/athlete/types';

/** Rango de reps en el que Epley da una estimacion fiable — series mas largas se alejan demasiado del maximo real. */
const RELIABLE_MIN_REPS = 1;
const RELIABLE_MAX_REPS = 6;
/** Un coach real no estima un maximo de una serie que no se sintio cerca del limite. */
const RPE_THRESHOLD = 9;

/** Formula de Epley: e1RM = carga x (1 + reps/30). */
export function estimateE1RM(loadKg: number, reps: number): number {
  return loadKg * (1 + reps / 30);
}

/**
 * e1RM ajustado por RPE — para una serie de trabajo que NO fue hasta el fallo. Convierte el RPE en
 * repeticiones en reserva (RIR = 10 - RPE) y estima el maximo como si la serie hubiera llegado al
 * fallo (reps + RIR), con la misma formula de Epley. Metodo estandar RTS/Helms. Devuelve null fuera
 * del rango fiable: RPE 5-10, reps 1-8, y sobre todo reps-equivalentes (reps + RIR) <= 10 — mas alla
 * Epley pierde fiabilidad.
 */
export function estimateE1RMFromRpe(loadKg: number, reps: number, rpe: number): number | null {
  if (!(loadKg > 0) || !Number.isFinite(reps) || !Number.isFinite(rpe)) return null;
  if (reps < 1 || reps > 8 || rpe < 5 || rpe > 10) return null;
  const rir = Math.max(0, 10 - rpe);
  const effReps = reps + rir;
  if (effReps > 10) return null;
  return Math.round(estimateE1RM(loadKg, effReps) * 10) / 10;
}

/**
 * Extrae las reps de una serie principal solo si es un numero limpio y fiable — descarta
 * escaleras ("5-3-1"), rangos del primer tecnico de oly ("2-3") y formatos EMOM ("1 rep/min"
 * pasa porque "1" es una rep unica valida, pero cualquier cosa con guion o rango no).
 */
export function parseCleanReps(reps: string): number | null {
  const match = reps.match(/^(\d+)(?:\s|$)/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= RELIABLE_MIN_REPS && value <= RELIABLE_MAX_REPS ? value : null;
}

/**
 * Solo se calcula una estimacion cuando el atleta fue a Rx (si escalo, no sabemos que carga
 * uso de verdad) y reporto RPE alto (senal de que la serie fue cerca del limite, no una serie
 * de trabajo cualquiera) — evita estimar un maximo a partir de un lunes de acumulacion al 65%.
 */
export function qualifiesForE1RMEstimate(rxOrScaled: RxOrScaled, rpe: number): boolean {
  return rxOrScaled === 'rx' && rpe >= RPE_THRESHOLD;
}
