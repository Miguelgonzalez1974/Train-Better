/**
 * Conversion de cardio entre maquinas, para cuando el atleta no puede hacer la que toca (ej. "no
 * puedo correr, ¿cuanto es en bici o remo?"). A diferencia de scalingGuide.ts (listas curadas de
 * alternativas), esto es una conversion matematica: las tablas de "Mayhem Athlete Scaling Doc"
 * (pagina 6) no son datos sueltos por tramo, son proporciones CONSTANTES ya redondeadas a numeros
 * bonitos — comprobado fila a fila en las 10 filas de la tabla de distancia y en toda la tabla de
 * calorias. Guardar solo la proporcion (en vez de la tabla completa) permite calcular la
 * equivalencia exacta para cualquier distancia/caloria que pida el WOD ese dia, no solo las que
 * aparecen en el documento.
 */

export type CardioUnit = 'm' | 'cal';

interface CardioRatio {
  /** Unidades de esta maquina (metros o calorias, segun `unit`) equivalentes a 1 metro corriendo. */
  perRunMeter: number;
  unit: CardioUnit;
}

/**
 * Base = metros corriendo. Cada ratio viene de la tabla de conversion de distancia del documento
 * (constante en las 10 filas, confirmado por calculo: 125/100, 250/200, 500/400... siempre 1.25;
 * 8/100, 15/200, 30/400... siempre 0.075 cal/m), salvo Ski Erg:
 *
 * Ski Erg se prescribe en calorias en esta app, pero el documento solo da Ski Erg en METROS
 * (misma columna que Row, 1.25x). Se deriva encadenando las dos tablas del propio documento en vez
 * de inventar un numero: la tabla de calorias dice que Row/Bike Erg/Ski Erg comparten la misma
 * lectura de calorias entre si, y que Assault/Air Bike lee 0.75x esa cifra. Combinando ambas:
 * air-bike cal = run_m * 0.075 (tabla de distancia) y air-bike cal = ski-erg cal * 0.75 (tabla de
 * calorias) => ski-erg cal = run_m * 0.075 / 0.75 = run_m * 0.1.
 */
export const CARDIO_RATIO: Record<string, CardioRatio> = {
  run: { perRunMeter: 1, unit: 'm' },
  row: { perRunMeter: 1.25, unit: 'm' },
  'air-bike': { perRunMeter: 0.075, unit: 'cal' },
  'ski-erg': { perRunMeter: 0.1, unit: 'cal' },
};

function formatCardioValue(value: number, unit: CardioUnit): string {
  const rounded = Math.max(1, Math.round(value));
  return unit === 'm' ? `${rounded}m` : `${rounded} cal`;
}

/** Primer numero que aparece en una prescripcion ("400m" -> 400, "15-20 cal" -> 15). */
function parseLeadingNumber(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export interface CardioConversion {
  movementId: string;
  reps: string;
}

/**
 * Dado un movimiento de cardio ya prescrito hoy con sus reps reales, calcula el equivalente exacto
 * en cada una de las demas maquinas — nunca una tabla fija, siempre el numero de hoy. Devuelve []
 * si el movimiento no tiene ratio conocido o si las reps de hoy no traen un numero reconocible.
 */
export function getCardioConversions(movementId: string, currentReps: string | undefined): CardioConversion[] {
  const from = CARDIO_RATIO[movementId];
  const currentValue = parseLeadingNumber(currentReps);
  if (!from || !currentValue) return [];

  const runMeters = currentValue / from.perRunMeter;
  return Object.entries(CARDIO_RATIO)
    .filter(([id]) => id !== movementId)
    .map(([id, to]) => ({ movementId: id, reps: formatCardioValue(runMeters * to.perRunMeter, to.unit) }));
}
