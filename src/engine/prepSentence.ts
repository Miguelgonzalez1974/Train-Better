import type { RecoveryAxisKey } from './recovery';
import type { ReadinessScore } from './readinessScore';

/** Lo que más pesa cuando el eje flojo es el motivo de la nota (una frase corta; el consejo largo vive en el detalle). */
const AXIS_REASON: Record<RecoveryAxisKey, string> = {
  sleep: 'el sueño es lo que más te baja esta semana',
  soreness: 'las agujetas son lo que más pesa esta semana',
  stress: 'el estrés es lo que más pesa esta semana',
  motivation: 'las ganas van justas esta semana',
};

const ADVICE = {
  alta: 'Buen día para apretar si el plan lo pide.',
  normal: 'Sigue el plan del día.',
  baja: 'Hoy mejor intensidad moderada que volumen.',
} as const;

/**
 * La frase de la pestaña Preparación: la razón principal de la nota y lo que implica hoy, en una línea. Prioriza lo que resta de
 * verdad (molestia, carga, HRV) y, si no hay nada, el eje del check-in que más baja la semana.
 */
export function prepSentence(r: ReadinessScore): string {
  if (r.total === null || r.level === null) return 'Haz el check-in de la mañana y verás aquí cómo llegas.';
  const reasons: string[] = [];
  if (r.pain.count > 0) reasons.push(`tienes una molestia activa (${r.pain.areas.join(', ')})`);
  if (r.loadPenalty > 0) reasons.push('tu carga acumulada va alta');
  if (r.hrv.penalty > 0) reasons.push('tu HRV está por debajo de tu rango');
  if (reasons.length === 0 && r.checkins.weakest && r.level !== 'alta') reasons.push(AXIS_REASON[r.checkins.weakest.key]);
  const because = reasons.length > 0 ? `${reasons[0][0].toUpperCase()}${reasons[0].slice(1)}${reasons.length > 1 ? ` y ${reasons[1]}` : ''}. ` : '';
  if (r.level === 'alta' && r.rest.credit > 0) return `El descanso de ayer te suma. ${ADVICE.alta}`;
  return `${because}${ADVICE[r.level]}`;
}
