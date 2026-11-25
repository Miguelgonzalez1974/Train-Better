import type { AcwrResult } from '../../engine/loadMetrics';

/** La palabra de cada zona de carga: la misma en el aro, en la tarjeta «Tu forma» y en su pantalla. */
export const ZONE_WORD: Record<AcwrResult['zone'], string> = { baja: 'Baja', optima: 'Óptima', moderada: 'Alta', alta: 'Muy alta' };

/**
 * La carga dicha en porcentaje: tus últimos 7 días frente a tu media de 4 semanas («+18 %», óptima). Es la misma medida del aro y del coach.
 * Sin historial suficiente no hay cifra ni palabra.
 */
export function loadPercent(acwr: AcwrResult): { value: string; word: string | null } {
  if (acwr.acwr === null || acwr.coldStart) return { value: '—', word: null };
  const pct = Math.round((acwr.acwr - 1) * 100);
  return { value: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`, word: ZONE_WORD[acwr.zone] };
}
