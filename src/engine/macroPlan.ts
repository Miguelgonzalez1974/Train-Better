import type { Macrocycle, PersonalRecords } from '../data/athlete/types';
import { resolvePhaseAtWeek, totalMacrocycleWeeks, weeksSinceStart } from './periodization';
import { MESOCYCLE_PHASE, roundToNearestPlate, STRENGTH_WEEK_SCHEMES } from './oneRepMaxTables';

export interface MacroPlanPhase {
  phaseIndex: 1 | 2 | 3 | 4;
  label: string;
  /** Semana del macrociclo (1-indexada) en la que empieza este bloque de fase. */
  startWeek: number;
  /** Semana del macrociclo (1-indexada, inclusive) en la que termina este bloque de fase. */
  endWeek: number;
  lengthWeeks: number;
  /** %1RM de referencia que el motor usa esta fase (STRENGTH_WEEK_SCHEMES) — para mostrar carga real, no una prediccion. */
  percent: number;
  coachNote: string;
  isDeload: boolean;
  /** Carga de referencia para sentadilla trasera en esta fase, redondeada a plato — ejemplo concreto, no estimacion de progreso futuro. */
  referenceLoadKg: number;
}

export interface MacroPlan {
  totalWeeks: number;
  /** Semana actual del macrociclo (1-indexada, acotada a [1, totalWeeks]). */
  currentWeek: number;
  currentPhaseIndex: 1 | 2 | 3 | 4;
  weekInPhase: number;
  phaseLengthWeeks: number;
  phases: MacroPlanPhase[];
}

function buildPhase(phaseIndex: 1 | 2 | 3 | 4, startWeek: number, endWeek: number, backSquatPr: number): MacroPlanPhase {
  const scheme = STRENGTH_WEEK_SCHEMES[phaseIndex];
  return {
    phaseIndex,
    label: MESOCYCLE_PHASE[phaseIndex],
    startWeek,
    endWeek,
    lengthWeeks: endWeek - startWeek + 1,
    percent: scheme.percent,
    coachNote: scheme.coachNote,
    isDeload: phaseIndex === 4,
    referenceLoadKg: roundToNearestPlate(backSquatPr * scheme.percent),
  };
}

/**
 * Roadmap visual de un macrociclo completo: recorre cada semana (1..totalWeeks) resolviendo su
 * fase con `resolvePhaseAtWeek` y agrupa semanas consecutivas de la misma fase en un solo bloque.
 * Sin `phaseWeeks` personalizado esto produce muchos bloques de 1 semana (el ciclo clasico rota
 * cada semana) — es una representacion honesta de que ese macrociclo no tiene bloques largos
 * definidos, no un bug: la vista lo dibuja como una franja rayada en vez de pocos bloques grandes.
 */
export function buildMacroPlan(macro: Macrocycle, prs: PersonalRecords, today: Date = new Date()): MacroPlan {
  const totalWeeks = totalMacrocycleWeeks(macro);
  const weeksSince = weeksSinceStart(macro.startDate, today);
  const currentWeek = Math.min(Math.max(weeksSince + 1, 1), totalWeeks);
  const current = resolvePhaseAtWeek(macro, weeksSince);

  const phases: MacroPlanPhase[] = [];
  let segmentStart = 1;
  let segmentPhaseIndex = resolvePhaseAtWeek(macro, 0).phaseIndex;

  for (let week = 2; week <= totalWeeks + 1; week++) {
    const phaseIndex = week <= totalWeeks ? resolvePhaseAtWeek(macro, week - 1).phaseIndex : null;
    if (phaseIndex !== segmentPhaseIndex) {
      phases.push(buildPhase(segmentPhaseIndex, segmentStart, week - 1, prs.backSquat));
      segmentStart = week;
      segmentPhaseIndex = phaseIndex as 1 | 2 | 3 | 4;
    }
  }

  return {
    totalWeeks,
    currentWeek,
    currentPhaseIndex: current.phaseIndex,
    weekInPhase: current.weekInPhase,
    phaseLengthWeeks: current.phaseLengthWeeks,
    phases,
  };
}
