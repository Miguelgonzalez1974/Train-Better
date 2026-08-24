/**
 * Opciones de escalado para movimientos del bloque WOD, extraidas del documento "Mayhem Athlete
 * Scaling & Movement Substitutions" (Mayhem Nation). Cubre solo movimientos que el motor puede
 * llegar a prescribir de verdad en un WOD generado (`getMovementsByBlock('wod')`) — no tiene
 * sentido ofrecer escalado para un movimiento que el atleta nunca va a ver programado. Los WOD de
 * referencia (benchmark) quedan fuera a proposito: se muestran como una sola tarjeta de texto, sin
 * entradas individuales por movimiento a las que enganchar un selector.
 */

export interface ScalingOption {
  /** Texto a mostrar, fiel a como lo escribe la fuente. */
  label: string;
  /** Id de catalogo del movimiento sustituto — se usa para arrastrar el mismo mecanismo de historial/seguimiento que cualquier otro movimiento. */
  movementId: string;
  /** Reps/formato fijo a prescribir en vez de las reps originales (ej. "150" para 150 Single-Unders). Si no se indica, se mantienen las reps ya prescritas ese dia. */
  reps?: string;
  /** Cuando la fuente da una proporcion en vez de un numero fijo (ej. "2 Pull-Ups por cada Muscle-Up") — las reps escaladas se calculan a partir de las reps originales. */
  perRepRatio?: number;
}

/** Extrae el primer numero entero de una prescripcion de reps ("12-15" -> 12, "21-15-9" -> 21) — base para aplicar un perRepRatio. */
export function parseLeadingRepCount(reps: string | undefined): number | null {
  if (!reps) return null;
  const match = reps.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export const SCALING_GUIDE: Record<string, ScalingOption[]> = {
  'handstand-walk': [
    { label: '20/16 Calorie Ski', movementId: 'ski-erg', reps: '20/16 cal' },
    { label: '15 HSPU', movementId: 'handstand-push-up', reps: '15' },
    { label: "100' Bear Crawl", movementId: 'bear-crawl', reps: "100'" },
    { label: '6 Wall Walks', movementId: 'wall-walk', reps: '6' },
    { label: '40 HS Shoulder Taps', movementId: 'hs-shoulder-taps', reps: '40' },
    { label: '1:00 Handstand Hold', movementId: 'handstand-hold', reps: '1:00' },
  ],
  'rope-climb': [
    { label: '3-4 Toes-to-Bar', movementId: 'toes-to-bar', reps: '3-4' },
    { label: '3 Strict Pull-Ups', movementId: 'strict-pull-up', reps: '3' },
    { label: "25' Hand over Hand Sled Pull (145/125)", movementId: 'sled-push', reps: "25'" },
    { label: '4-5 Strict Knees-to-Elbows', movementId: 'knees-to-elbow', reps: '4-5' },
  ],
  'toes-to-bar': [
    { label: '12 GHD Sit-Ups', movementId: 'ghd-situp', reps: '12' },
    { label: '14 V-Ups', movementId: 'v-up', reps: '14' },
    { label: '16 V-Ups alternos', movementId: 'v-up', reps: '16' },
    { label: '20 Abmat Sit-Ups', movementId: 'abmat-situp', reps: '20' },
    { label: '10 Abmat Sit-Ups lastrados (carga ligera-moderada)', movementId: 'abmat-situp', reps: '10' },
  ],
  'ring-muscle-up': [
    { label: 'Bar Muscle-Up', movementId: 'bar-muscle-up' },
    { label: 'Burpee Pull-Up — 2 por cada muscle-up (si te falta equipo)', movementId: 'burpee-pull-up', perRepRatio: 2 },
    { label: 'Burpee Pull-Up — 1 por cada muscle-up (si te falta la técnica)', movementId: 'burpee-pull-up', perRepRatio: 1 },
  ],
  'kipping-pull-up': [
    { label: '10-15 Banded Pull-Ups', movementId: 'banded-pull-up', reps: '10-15' },
    { label: '10-15 Jumping Pull-Ups', movementId: 'jumping-pull-up', reps: '10-15' },
    { label: '5 Strict Pull-Ups', movementId: 'strict-pull-up', reps: '5' },
    { label: '15 Ring Rows', movementId: 'ring-row', reps: '15' },
    { label: '15 Body Rows', movementId: 'ring-row', reps: '15' },
  ],
  'double-under': [{ label: '150 Single-Unders', movementId: 'single-under', reps: '150' }],
  'sled-push': [
    { label: '15/12 Cal Assault Bike', movementId: 'air-bike', reps: '15/12 cal' },
    { label: '12/9 Cal Echo Bike', movementId: 'air-bike', reps: '12/9 cal' },
    { label: "100' Farmers Carry", movementId: 'farmers-carry', reps: "100'" },
  ],
  'wall-ball': [
    { label: 'Empty Bar Thruster (45/35)', movementId: 'thruster' },
    { label: 'DB Thruster (2x35/2x25)', movementId: 'dumbbell-thruster' },
  ],
};

export function getScalingOptions(movementId: string): ScalingOption[] {
  return SCALING_GUIDE[movementId] ?? [];
}
