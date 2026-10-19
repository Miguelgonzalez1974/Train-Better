import type { SetFeel } from '../data/athlete/types';

/**
 * Autorregulación dentro de la sesión: tras la PRIMERA serie de trabajo de un levantamiento, cómo te ha ido (sobró, justo,
 * duro, muy duro) ajusta el peso de las series que quedan, como haría un entrenador a pie de barra. Es una sugerencia que
 * se rellena en las series pendientes: los +/- del modo enfocado siguen mandando. Nunca se mueve más de un 5 % sobre lo
 * previsto, y si hoy no es día de subir (día ámbar o una molestia activa) solo se baja.
 */

/** Lo máximo que se mueve el peso sobre lo previsto (fracción). */
export const ADJUST_MAX_FRACTION = 0.05;
/** Paso habitual del ajuste, en kg (se recorta al 5 % si el peso es pequeño). */
export const ADJUST_STEP_KG = 2.5;
/** Redondeo del peso sugerido, en kg. */
const ROUND_KG = 0.5;
/** Series totales a partir de las cuales, si fue muy duro, se sugiere quitar la última. */
const DROP_FROM_SETS = 3;

export interface SetAdjustment {
  /** Peso para las series que quedan (kg); 0 si no se puede ajustar (sin peso previsto). */
  kg: number;
  /** Diferencia con lo previsto (kg, con signo). */
  deltaKg: number;
  /** Si fue muy duro y hay series de sobra, se sugiere quitar la última. */
  dropLastSet: boolean;
  /** Lo que se dice al atleta, en una frase. */
  message: string;
}

const fmt = (n: number) => String(Math.abs(n)).replace('.', ',');
const round = (kg: number) => Math.round(kg / ROUND_KG) * ROUND_KG;

/** El peso de las series que quedan según cómo salió la primera. `canRaise` = si hoy se puede subir la carga. */
export function adjustRemainingSets(input: { prescribedKg: number; feel: SetFeel; canRaise: boolean; sets: number }): SetAdjustment {
  const { prescribedKg, feel, canRaise, sets } = input;
  if (!(prescribedKg > 0)) return { kg: 0, deltaKg: 0, dropLastSet: false, message: '' };
  const cap = prescribedKg * ADJUST_MAX_FRACTION;
  const step = Math.min(ADJUST_STEP_KG, cap);

  let delta = 0;
  let dropLastSet = false;
  let message = 'Sigues como estaba previsto.';
  if (feel === 'sobro') {
    if (canRaise) {
      delta = step;
    } else {
      message = 'Te sobró, pero hoy no subo la carga: es un día para mantener (o tienes una molestia activa).';
    }
  } else if (feel === 'duro') {
    delta = -step;
  } else if (feel === 'muy-duro') {
    delta = -cap;
    dropLastSet = sets >= DROP_FROM_SETS;
  }

  const kg = round(prescribedKg + delta);
  const deltaKg = Math.round((kg - prescribedKg) * 100) / 100;
  if (deltaKg > 0) message = `Subo ${fmt(deltaKg)} kg en las series que quedan (tope +${Math.round(ADJUST_MAX_FRACTION * 100)} %).`;
  else if (deltaKg < 0) {
    message = feel === 'muy-duro'
      ? `Bajo ${fmt(deltaKg)} kg (un ${Math.round(ADJUST_MAX_FRACTION * 100)} %)${dropLastSet ? ' y puedes quitar la última serie' : ''}: hoy no es el día.`
      : `Bajo ${fmt(deltaKg)} kg en las series que quedan.`;
  } else if (feel === 'muy-duro' || feel === 'duro') {
    // el recorte no llega ni a medio kilo: se deja el peso, pero se dice
    message = dropLastSet ? 'Fue muy duro: mantén el peso y puedes quitar la última serie.' : 'Fue duro: mantén el peso y descansa un poco más.';
  }
  return { kg, deltaKg, dropLastSet, message };
}
