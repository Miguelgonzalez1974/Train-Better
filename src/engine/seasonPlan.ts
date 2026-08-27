import type { GoalType, Macrocycle, PersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { roundToNearestPlate, STRENGTH_WEEK_SCHEMES } from './oneRepMaxTables';
import { addDaysIso, isoDiffDays, weeksBetweenIso } from './periodization';

/** Menos de esto no es una temporada — un macrociclo suelto lo cubre mejor (ver `nextMacroSuggestion.ts`). */
export const MIN_SEASON_WEEKS = 8;
/** Numero de bloques permitido en una temporada — bloques de ~8-12 semanas. */
export const MIN_SEASON_BLOCKS = 2;
export const MAX_SEASON_BLOCKS = 4;
/** Ningun bloque baja de esto — por debajo no cabe un reparto de fases con sentido (acum/intens/pico/descarga). */
export const MIN_BLOCK_WEEKS = 4;

export interface SeasonPlanBlock {
  /** `crypto.randomUUID()` — se convierte tal cual en `Macrocycle.id` al confirmar. */
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  /** [acumulacion, intensificacion, pico, descarga] — mismo formato y orden que `Macrocycle.phaseWeeks`. */
  phaseWeeks: [number, number, number, number];
  totalWeeks: number;
  role: 'base' | 'pico';
  /** Solo para el preview — no viaja al `Macrocycle`. */
  focusNote: string;
  /** Ejemplo concreto de carga (sentadilla) al %1RM de pico de este bloque, redondeado a plato. */
  referenceLoadKg: number;
}

export interface SeasonPlanDraft {
  startDate: string;
  targetDate: string;
  totalWeeks: number;
  blockCount: number;
  blocks: SeasonPlanBlock[];
  drivingGoal?: { label: string; movementName?: string; targetDate: string };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Reparto de fases de UN bloque segun su posicion en la temporada. `positionRatio` va de 0
 * (primer bloque, mas acumulacion) a 1 (ultimo bloque, mas pico + taper). Es un punto de
 * partida honesto que el atleta edita luego macro a macro, no una prescripcion cerrada — misma
 * postura que `nextMacroSuggestion.ts`.
 */
export function seasonPhaseWeeks(totalWeeks: number, positionRatio: number): [number, number, number, number] {
  // Siempre se reserva 1 semana de descarga/taper — en el ultimo bloque es el taper que
  // `deload.ts` ya reconoce por el objetivo `preparar-competicion` a <= 7 dias.
  const weeks = Math.max(MIN_BLOCK_WEEKS, Math.round(totalWeeks));
  const deload = 1;
  const rest = weeks - deload; // >= 3 por el clamp de arriba

  const accFrac = lerp(0.55, 0.2, positionRatio);
  const peakFrac = lerp(0.15, 0.45, positionRatio);

  let acc = Math.max(1, Math.round(rest * accFrac));
  let peak = Math.max(1, Math.round(rest * peakFrac));
  let int = rest - acc - peak;

  // Si el redondeo dejo intensificacion por debajo de 1, se recorta primero de acumulacion y
  // luego de pico hasta recuperar el minimo (siempre posible: rest >= 3).
  while (int < 1 && acc > 1) {
    acc -= 1;
    int += 1;
  }
  while (int < 1 && peak > 1) {
    peak -= 1;
    int += 1;
  }

  // El bloque de pico de verdad prioriza intensidad: pico nunca por debajo de intensificacion.
  if (positionRatio >= 1 && peak < int) {
    [int, peak] = [peak, int];
  }

  return [acc, int, peak, weeks - acc - int - peak];
}

function focusNoteFor(positionRatio: number, role: 'base' | 'pico'): string {
  if (role === 'pico') return 'Bloque de pico — intensidad alta y semana de taper para llegar fino a la fecha.';
  if (positionRatio <= 0.34) return 'Base de temporada — volumen alto y técnica, construyes el motor.';
  return 'Transición — sube la intensidad manteniendo el volumen que ya toleras.';
}

/**
 * Planifica una temporada completa hacia atras desde `targetDate`: reparte el rango en 2-4
 * bloques contiguos (`Macrocycle` en potencia), con repartos de fase que progresan — mas
 * acumulacion al principio, mas pico + taper al final, y el ultimo bloque terminando justo en
 * `targetDate`. Devuelve `null` si el rango es demasiado corto para una temporada.
 *
 * NO persiste nada: la UI muestra el borrador, el atleta lo revisa y al confirmar se escriben
 * los bloques en `profile.macrocycles` de una vez (ver `SeasonPlannerModal`).
 */
export function buildSeasonPlan(params: {
  startDate: string;
  targetDate: string;
  prs: PersonalRecords;
  blockCount?: number;
  drivingGoal?: { type: GoalType; movementId?: string; targetDate: string };
}): SeasonPlanDraft | null {
  const { startDate, targetDate, prs } = params;
  if (isoDiffDays(startDate, targetDate) <= 0) return null;

  const totalWeeks = weeksBetweenIso(startDate, targetDate);
  if (totalWeeks < MIN_SEASON_WEEKS) return null;

  // Tope de bloques para que ninguno baje de MIN_BLOCK_WEEKS — con temporadas cortas esto
  // reduce el maximo real por debajo de MAX_SEASON_BLOCKS.
  const maxBlocks = Math.min(MAX_SEASON_BLOCKS, Math.max(MIN_SEASON_BLOCKS, Math.floor(totalWeeks / MIN_BLOCK_WEEKS)));
  const blockCount = clamp(
    Math.round(params.blockCount ?? totalWeeks / 10),
    MIN_SEASON_BLOCKS,
    maxBlocks,
  );

  // Reparto de semanas lo mas igual posible; el resto se suma a los primeros bloques.
  const base = Math.floor(totalWeeks / blockCount);
  const remainder = totalWeeks - base * blockCount;
  const weeksPerBlock = Array.from({ length: blockCount }, (_, i) => base + (i < remainder ? 1 : 0));

  const drivingMovement = params.drivingGoal?.movementId ? getMovementById(params.drivingGoal.movementId) : undefined;

  const blocks: SeasonPlanBlock[] = [];
  let cursorStart = startDate;
  for (let i = 0; i < blockCount; i++) {
    const isLast = i === blockCount - 1;
    const positionRatio = blockCount === 1 ? 1 : i / (blockCount - 1);
    const blockWeeks = weeksPerBlock[i];
    // El ultimo bloque termina exactamente en la fecha objetivo — nunca se arrastra un error de
    // redondeo hasta el dia de la competicion.
    const endDate = isLast ? targetDate : addDaysIso(cursorStart, blockWeeks * 7 - 1);
    const role: 'base' | 'pico' = isLast ? 'pico' : 'base';
    const phaseWeeks = seasonPhaseWeeks(blockWeeks, positionRatio);
    const peakPercent = STRENGTH_WEEK_SCHEMES[3].percent;

    blocks.push({
      id: crypto.randomUUID(),
      label: isLast
        ? `Pico — ${drivingMovement ? drivingMovement.name : 'a competición'}`
        : `Base ${i + 1}`,
      startDate: cursorStart,
      endDate,
      phaseWeeks,
      totalWeeks: blockWeeks,
      role,
      focusNote: focusNoteFor(positionRatio, role),
      referenceLoadKg: roundToNearestPlate(prs.backSquat * peakPercent),
    });

    cursorStart = addDaysIso(endDate, 1);
  }

  return {
    startDate,
    targetDate,
    totalWeeks,
    blockCount,
    blocks,
    drivingGoal: params.drivingGoal
      ? {
          label: drivingMovement ? drivingMovement.name : 'objetivo',
          movementName: drivingMovement?.name,
          targetDate: params.drivingGoal.targetDate,
        }
      : undefined,
  };
}

/** Los bloques de la temporada como `Macrocycle[]` listos para `profile.macrocycles`. */
export function seasonBlocksToMacrocycles(blocks: SeasonPlanBlock[]): Macrocycle[] {
  return blocks.map((b) => ({
    id: b.id,
    label: b.label,
    startDate: b.startDate,
    endDate: b.endDate,
    phaseWeeks: b.phaseWeeks,
  }));
}
