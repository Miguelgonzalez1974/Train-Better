import type { SetFeel } from '../data/athlete/types';
import { roundToNearestPlate } from './oneRepMaxTables';

export const SET_FEEL_LABEL: Record<SetFeel, string> = {
  sobro: 'Me sobró',
  justo: 'Justo',
  duro: 'Duro',
  'muy-duro': 'Muy duro',
};

export const SET_FEEL_ORDER: SetFeel[] = ['sobro', 'justo', 'duro', 'muy-duro'];

/** Cuanto pesa cada sensacion cuando se agrega el historial: negativo = la carga sobra, positivo = se queda corta de margen. */
export const SET_FEEL_SCORE: Record<SetFeel, number> = {
  sobro: -1,
  justo: 0,
  duro: 1,
  'muy-duro': 2,
};

/** Subida de carga cuando la primera serie voló (~+4%, luego redondeado al disco). */
const SOBRO_FACTOR = 1.04;
/** Bajada suave para sostener la técnica el resto de series. */
const DURO_FACTOR = 0.95;
/** Bajada franca cuando la primera serie ya fue al límite. */
const MUY_DURO_FACTOR = 0.925;

/**
 * Extrae las reps de una serie principal de trabajo solo si son un número limpio (1-12) — descarta
 * escaleras de carga ("5-3-1"), el rango del primer técnico de oly ("2-3") y formatos sin número
 * de serie ("técnica / tiempo"). Es el filtro que decide si un bloque admite feedback en caliente:
 * si cada serie ya lleva un peso distinto, no hay "resto de series" que reajustar.
 */
export function parseWorkingReps(reps: string): number | null {
  const match = reps.trim().match(/^(\d+)(?:\s|$)/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 12 ? value : null;
}

export interface SetAdjustmentInput {
  /** Carga prescrita de la primera serie, kg. */
  prescribedKg: number;
  /** Series totales prescritas. */
  prescribedSets: number;
  /** Series ya completadas al dar el feedback (normalmente 1). */
  completedSets: number;
  feel: SetFeel;
}

export interface SetAdjustment {
  /** Carga para las series que quedan (igual a la prescrita si `feel` es 'justo' o si el ajuste no llega ni a un disco). */
  adjustedKg: number;
  /** Series totales tras el ajuste — 'muy-duro' puede quitar una, nunca por debajo de las ya hechas + 1. */
  adjustedSets: number;
  /** Serie a partir de la cual aplica `adjustedKg` (1-indexado). */
  fromSet: number;
  /** true si algo cambió respecto a lo prescrito. */
  changed: boolean;
  /** Nota de coach explicando el ajuste (siempre presente, también cuando no hay cambio). */
  note: string;
}

/**
 * Traduce "cómo fue la primera serie" en un reajuste de las series restantes del MISMO
 * levantamiento — peso y, en el peor caso, número de series. Deliberadamente conservador y
 * determinista: sin aleatoriedad, sin tocar más bloques, y con el peso siempre redondeado a disco
 * real para que sea cargable. Recalcula siempre desde la prescripción original (`prescribedKg`),
 * nunca desde una carga ya ajustada, así que volver a tocar otra opción da el resultado correcto.
 */
export function adjustRemainingSets(input: SetAdjustmentInput): SetAdjustment {
  const { prescribedKg, prescribedSets, completedSets, feel } = input;
  const done = Math.max(0, Math.min(completedSets, prescribedSets));
  const remaining = Math.max(0, prescribedSets - done);
  const fromSet = Math.min(done + 1, prescribedSets);

  const unchanged: SetAdjustment = {
    adjustedKg: prescribedKg,
    adjustedSets: prescribedSets,
    fromSet,
    changed: false,
    note: '',
  };

  if (remaining === 0) return unchanged;

  if (feel === 'justo') {
    return { ...unchanged, note: 'Vas al punto — el resto de series sigue igual.' };
  }

  const seriesWord = remaining === 1 ? 'la serie que queda' : `las ${remaining} series que quedan`;

  if (feel === 'sobro') {
    const adjustedKg = roundToNearestPlate(prescribedKg * SOBRO_FACTOR);
    if (adjustedKg <= prescribedKg) {
      return { ...unchanged, note: 'La primera voló, pero el salto de disco más pequeño ya sería demasiado — mantén el peso y apriétalas.' };
    }
    return {
      adjustedKg,
      adjustedSets: prescribedSets,
      fromSet,
      changed: true,
      note: `La primera voló — subimos ${seriesWord} a ${adjustedKg} kg.`,
    };
  }

  if (feel === 'duro') {
    const adjustedKg = Math.min(roundToNearestPlate(prescribedKg * DURO_FACTOR), prescribedKg);
    if (adjustedKg >= prescribedKg) {
      return { ...unchanged, note: 'Costó, pero bajar ni un disco cambiaría nada — mantén el peso y cuida la posición.' };
    }
    return {
      adjustedKg,
      adjustedSets: prescribedSets,
      fromSet,
      changed: true,
      note: `Bajamos ${seriesWord} a ${adjustedKg} kg para que mantengas la técnica.`,
    };
  }

  // muy-duro: baja la carga y, si hay margen, quita una serie.
  const adjustedKg = Math.min(roundToNearestPlate(prescribedKg * MUY_DURO_FACTOR), prescribedKg);
  const adjustedSets = Math.max(done + 1, prescribedSets - 1);
  const droppedSet = adjustedSets < prescribedSets;
  const kgPart = adjustedKg < prescribedKg ? `${adjustedKg} kg` : 'el mismo peso';
  return {
    adjustedKg,
    adjustedSets,
    fromSet,
    changed: true,
    note: droppedSet
      ? `Hoy no forzamos: ${kgPart} y una serie menos (${adjustedSets} en total).`
      : `Hoy no forzamos: bajamos ${seriesWord} a ${adjustedKg} kg.`,
  };
}
