import type { ReadinessScore } from './readinessScore';

const ADVICE = {
  alta: 'Buen día para apretar si el plan lo pide.',
  normal: 'Sigue el plan del día.',
  baja: 'Hoy mejor intensidad moderada que volumen.',
} as const;

/** Menos de estas horas ya es una noche corta que se dice. */
const SHORT_NIGHT = 6.5;
/** Lo que tiene que restar el arrastre o el ánimo para nombrarlo. */
const NOTABLE = 8;

/**
 * La frase de la pestaña Preparación: la razón principal de la cifra y lo que implica hoy, en una línea. Prioriza lo que resta de verdad
 * (molestia, carga, HRV, una noche corta, lo que arrastras o el ánimo).
 */
export function prepSentence(r: ReadinessScore): string {
  if (r.total === null || r.level === null || r.energy === null) return 'Haz el check-in de la mañana y verás aquí cómo llegas.';
  const e = r.energy;
  const reasons: string[] = [];
  if (r.pain.count > 0) reasons.push(`tienes una molestia activa (${r.pain.areas.join(', ')})`);
  if (r.loadPenalty > 0) reasons.push('tu carga acumulada va alta');
  if (r.hrv.penalty > 0) reasons.push('tu HRV está por debajo de tu rango');
  if (e.sleepKnown && e.sleepHours < SHORT_NIGHT) reasons.push('has dormido poco');
  if (e.carry >= NOTABLE) reasons.push(e.carryFrom === 'agujetas' ? 'las agujetas pesan' : 'arrastras lo entrenado estos días');
  if (e.checkin <= -NOTABLE) reasons.push('el estrés y el ánimo van flojos');
  const because = reasons.length > 0 ? `${reasons[0][0].toUpperCase()}${reasons[0].slice(1)}${reasons.length > 1 ? ` y ${reasons[1]}` : ''}. ` : '';
  return `${because}${ADVICE[r.level]}`;
}
