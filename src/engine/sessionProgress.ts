import type { SessionBlockResult, WorkSetEntry } from '../data/athlete/types';
import { complexLogId } from '../data/complexes';

/**
 * Cuánto de la sesión de hoy está anotado serie a serie. Solo cuentan los ejercicios de barra de trabajo (fuerza y halterofilia, sin los de preparación)
 * que se anotan serie a serie: una rampa u ola, series rectas de más de una o un single de un solo registro. Lo demás (calentamiento, accesorio, WOD)
 * no se anota por series, así que no decide si «parece que has terminado». Puro.
 */

/** Series que se anotan de un ejercicio de barra (0 si no se anota serie a serie). */
export function loggedRowCount(b: SessionBlockResult): number {
  const plan = b.setPlan && b.setPlan.length >= 2 ? b.setPlan : undefined;
  const singleLog = Boolean(b.logAsSingle) && (b.sets ?? 0) <= 1;
  if (plan) return plan.length;
  if (singleLog) return 1;
  return (b.sets ?? 0) > 1 ? b.sets ?? 0 : 0;
}

/** La clave con la que se anotan las series de ese ejercicio (los complejos llevan la suya, aparte del levantamiento). */
export function logIdOf(b: SessionBlockResult): string {
  return b.complex ? complexLogId(b.complex.id) : b.movementId;
}

/** Todas las series de barra previstas están anotadas (y hay al menos una prevista). */
export function allBarSetsLogged(blocks: SessionBlockResult[], workLog: Pick<WorkSetEntry, 'movementId' | 'setNumber'>[]): boolean {
  let planned = 0;
  for (const b of blocks) {
    if ((b.block !== 'strength' && b.block !== 'oly') || b.subgroup) continue;
    const rows = loggedRowCount(b);
    if (rows === 0) continue;
    const id = logIdOf(b);
    for (let n = 1; n <= rows; n++) {
      planned++;
      if (!workLog.some((e) => e.movementId === id && e.setNumber === n)) return false;
    }
  }
  return planned > 0;
}
