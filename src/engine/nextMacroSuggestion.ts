import type { AthleteProfile, GoalType, Macrocycle, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { daysBetween } from './loadMetrics';
import { getActiveMacrocycle, toLocalIsoDate, totalMacrocycleWeeks } from './periodization';
import { pickPriorityGoal } from './goalPriority';
import { computeWeakPoints } from './weakPoints';

/** Ventana antes del fin del macro activo en la que tiene sentido empezar a hablar del siguiente. */
const NEXT_MACRO_WINDOW_DAYS = 14;
/** Si ya hay otro macro que empieza en este margen tras el que termina, el atleta ya lo planeo — no hace falta sugerir nada. */
const ALREADY_PLANNED_GAP_DAYS = 14;
/** Duracion minima (en dias) que debe tener el siguiente bloque para que la fecha del objetivo se use tal cual como fin — si el objetivo cae demasiado pronto, un bloque tan corto no tendria sentido y se usa la duracion del macro que termina como referencia. */
const MIN_NEXT_MACRO_DAYS = 14;

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

function isoDiffDays(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24));
}

function weeksBetweenIso(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((isoDiffDays(startIso, endIso) + 1) / 7));
}

export interface NextMacroSuggestion {
  endingMacro: Macrocycle;
  /** Dias que quedan para que termine el macro activo (siempre 0-NEXT_MACRO_WINDOW_DAYS aqui). */
  daysRemaining: number;
  /** Borrador listo para cargar tal cual en el formulario de "Nuevo macrociclo" — el atleta lo revisa/edita antes de guardar, nunca se crea solo. */
  draft: Macrocycle;
  /** Objetivo que marco la fecha de fin sugerida, si lo hubo — se resuelve a texto en la UI (que ya conoce GOAL_TYPE_META), no aqui. */
  drivingGoal?: { type: GoalType; movementName?: string; targetDate: string };
  /** Patron de movimiento peor situado ahora mismo (computeWeakPoints), para que el atleta lo tenga en cuenta al revisar las fases. */
  weakPointLabel?: string;
  /** Cuantos objetivos activos siguen abiertos mas alla del fin de este macro (informativo). */
  openGoalsBeyond: number;
}

/**
 * Tercera capa del coach "que planifica mas alla de hoy": cuando el macrociclo activo esta cerca
 * de terminar, prepara un borrador razonado del siguiente en vez de dejar que el atleta caiga en
 * modo mantenimiento sin darse cuenta. Deliberadamente NO crea nada — devuelve un `draft` para que
 * el atleta lo revise, edite y guarde con el mismo formulario y el mismo boton que ya usa para
 * crear un macrociclo a mano (ver Objetivos.tsx). Las decisiones clave (duracion, fases, si seguir
 * un objetivo concreto) las toma el atleta al confirmar, no esta funcion.
 */
export function buildNextMacroSuggestion(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  today: Date = new Date(),
): NextMacroSuggestion | null {
  const todayIso = toLocalIsoDate(today);
  const active = getActiveMacrocycle(profile.macrocycles, todayIso);
  if (!active) return null;

  const daysRemaining = -daysBetween(active.endDate, today);
  if (daysRemaining < 0 || daysRemaining > NEXT_MACRO_WINDOW_DAYS) return null;

  const alreadyPlanned = profile.macrocycles.some(
    (m) => m.id !== active.id && m.startDate > active.endDate && m.startDate <= addDaysIso(active.endDate, ALREADY_PLANNED_GAP_DAYS),
  );
  if (alreadyPlanned) return null;

  const suggestedStart = addDaysIso(active.endDate, 1);
  const mirroredWeeks = totalMacrocycleWeeks(active);
  const mirroredEnd = addDaysIso(suggestedStart, mirroredWeeks * 7 - 1);

  const drivingGoal = pickPriorityGoal(profile.goals, (g) => g.targetDate > active.endDate);
  const goalReachable = drivingGoal ? isoDiffDays(suggestedStart, drivingGoal.targetDate) >= MIN_NEXT_MACRO_DAYS : false;
  const suggestedEnd = goalReachable ? drivingGoal!.targetDate : mirroredEnd;

  const drivingMovement = drivingGoal?.movementId ? getMovementById(drivingGoal.movementId) : undefined;
  const suggestedLabel = goalReachable
    ? `Rumbo a ${drivingMovement ? drivingMovement.name : 'tu objetivo'}`
    : `${active.label} (continuación)`;

  const topWeak = computeWeakPoints(history).find((w) => w.status === 'a-trabajar');

  // Solo se propone la misma duracion de fases si de verdad cabe en el nuevo total dejando al
  // menos una semana de descarga — si el objetivo obliga a un bloque mas corto que el reparto
  // anterior, arrastrar los mismos numeros dejaria un formulario ya invalido. Mejor no proponer
  // fases (vuelve al ciclo clasico, siempre valido) que entregar un borrador roto.
  let suggestedPhaseWeeks: [number, number, number, number] | undefined;
  if (active.phaseWeeks) {
    const [acc, int, peak] = active.phaseWeeks;
    const newTotalWeeks = weeksBetweenIso(suggestedStart, suggestedEnd);
    if (acc + int + peak + 1 <= newTotalWeeks) {
      suggestedPhaseWeeks = [acc, int, peak, newTotalWeeks - acc - int - peak];
    }
  }

  return {
    endingMacro: active,
    daysRemaining,
    draft: {
      id: crypto.randomUUID(),
      label: suggestedLabel,
      startDate: suggestedStart,
      endDate: suggestedEnd,
      phaseWeeks: suggestedPhaseWeeks,
    },
    drivingGoal: goalReachable
      ? { type: drivingGoal!.type, movementName: drivingMovement?.name, targetDate: drivingGoal!.targetDate }
      : undefined,
    weakPointLabel: topWeak?.label,
    openGoalsBeyond: profile.goals.filter((g) => g.targetDate > active.endDate).length,
  };
}
