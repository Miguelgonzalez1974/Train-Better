import type { DailySession, SessionBlockResult } from '../data/athlete/types';

/**
 * Reparación de una sesión de hoy que quedó con bloques que el motor ya no programa (errores antiguos): un movimiento de mancuernas como
 * levantamiento principal de fuerza (su carga era un % del 1RM de la barra: 62,5 kg «c/u») o un complejo de oly que mezcla snatch y clean
 * (no se encadenan sin soltar la barra). Una sesión registrada se marca como editada y nunca se regenera sola, así que sin esto el error se
 * quedaría aunque se deshaga el registro. Se sustituye SOLO el grupo de bloques erróneo (fuerza o oly) por el de una sesión nueva del
 * motor, y se respeta el resto (WOD, accesorio, cambios a mano).
 */

const isBadStrength = (b: SessionBlockResult) => b.block === 'strength' && b.movementId.startsWith('dumbbell-');

/** Un complejo con pasos de snatch y de clean/jerk a la vez (en una cadena sin soltar la barra no se puede cambiar el agarre). */
const isBadComplex = (b: SessionBlockResult) => {
  if (b.block !== 'oly' || !b.complex) return false;
  const ids = b.complex.steps.map((s) => s.movementId);
  return ids.some((id) => id.includes('snatch')) && ids.some((id) => id.includes('clean') || id.includes('jerk'));
};

export function invalidGroups(session: DailySession): ('strength' | 'oly')[] {
  const out: ('strength' | 'oly')[] = [];
  if (session.blocks.some(isBadStrength)) out.push('strength');
  if (session.blocks.some(isBadComplex)) out.push('oly');
  return out;
}

/** La sesión con los grupos erróneos sustituidos por los de `fresh`; la misma referencia si no hay nada que reparar o `fresh` no trae ese grupo. */
export function repairSession(cached: DailySession, fresh: DailySession): DailySession {
  const groups = invalidGroups(cached).filter((g) => fresh.blocks.some((b) => b.block === g));
  if (groups.length === 0) return cached;
  let blocks = cached.blocks;
  for (const group of groups) {
    const first = blocks.findIndex((b) => b.block === group);
    const before = blocks.slice(0, first).filter((b) => b.block !== group);
    const after = blocks.slice(first).filter((b) => b.block !== group);
    blocks = [...before, ...fresh.blocks.filter((b) => b.block === group), ...after];
  }
  return { ...cached, blocks };
}
