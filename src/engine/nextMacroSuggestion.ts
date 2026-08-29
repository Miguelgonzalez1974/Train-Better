import type { AthleteProfile, GoalType, Macrocycle, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { daysBetween } from './loadMetrics';
import {
  addDaysIso,
  getActiveMacrocycle,
  isoDiffDays,
  toLocalIsoDate,
  totalMacrocycleWeeks,
  weeksBetweenIso,
} from './periodization';
import { getActiveStrengthProgram } from './strengthPrograms';
import { pickPriorityGoal } from './goalPriority';
import { computeWeakPoints } from './weakPoints';
import { computeResponseProfile, engineResponseProfile } from './responseProfile';

/** Ventana antes del fin de la estructura activa en la que tiene sentido empezar a hablar de lo siguiente. */
const NEXT_MACRO_WINDOW_DAYS = 14;
/** Si ya hay otro macro que empieza en este margen tras el que termina, el atleta ya lo planeo — no hace falta sugerir nada. */
const ALREADY_PLANNED_GAP_DAYS = 14;
/** Duracion minima (en dias) que debe tener el siguiente bloque para que la fecha del objetivo se use tal cual como fin — si el objetivo cae demasiado pronto, un bloque tan corto no tendria sentido y se usa la duracion del macro que termina como referencia. */
const MIN_NEXT_MACRO_DAYS = 14;
/**
 * A partir de este hueco hasta el objetivo, un solo macrociclo se queda corto: son varios
 * bloques encadenados (una temporada). La UI usa esto para enrutar al planificador de temporada
 * en vez de al formulario de un macro suelto.
 */
export const SEASON_SUGGESTION_MIN_DAYS = 16 * 7;

/** Estructura que gobierna el entrenamiento ahora y esta a punto de acabar — un macrociclo o un bloque de temporada (StrengthProgram). Solo se usa `label`/`endDate` aguas abajo. */
export interface EndingStructure {
  id: string;
  label: string;
  endDate: string;
  kind: 'macrocycle' | 'temporada';
}

export interface NextMacroSuggestion {
  endingStructure: EndingStructure;
  /** Dias que quedan para que termine la estructura activa (siempre 0-NEXT_MACRO_WINDOW_DAYS aqui). */
  daysRemaining: number;
  /** Borrador listo para cargar tal cual en el formulario de "Nuevo macrociclo" — el atleta lo revisa/edita antes de guardar, nunca se crea solo. */
  draft: Macrocycle;
  /** Objetivo que marco la fecha de fin sugerida, si lo hubo — se resuelve a texto en la UI (que ya conoce GOAL_TYPE_META), no aqui. */
  drivingGoal?: { type: GoalType; movementId?: string; movementName?: string; targetDate: string };
  /** true cuando el hueco hasta el objetivo da para varios bloques — la UI ofrece "Planificar temporada" en vez del borrador de un macro. */
  suggestsSeason: boolean;
  /** Patron de movimiento peor situado ahora mismo (computeWeakPoints), para que el atleta lo tenga en cuenta al repartir las fases. */
  weakPointLabel?: string;
  /** Nota si el perfil de respuesta ajusto el reparto de fases (p.ej. recuperacion lenta -> una semana mas de descarga). */
  recoveryNote?: string;
  /** Cuantos objetivos activos siguen abiertos mas alla del fin de esta estructura (informativo). */
  openGoalsBeyond: number;
}

/**
 * Tercera capa del coach "que planifica mas alla de hoy": cuando la estructura activa (macrociclo
 * o bloque de temporada) esta cerca de terminar, prepara un borrador razonado de lo siguiente en
 * vez de dejar que el atleta caiga en modo mantenimiento sin darse cuenta. Deliberadamente NO crea
 * nada — devuelve un `draft` para que el atleta lo revise, edite y guarde con el mismo formulario
 * y el mismo boton que ya usa para crear un macrociclo a mano (ver Objetivos.tsx). Si el hueco
 * hasta el objetivo da para varios bloques, `suggestsSeason` avisa a la UI para que ofrezca el
 * planificador de temporada. Las decisiones clave las toma el atleta al confirmar, no esta funcion.
 */
export function buildNextMacroSuggestion(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  today: Date = new Date(),
): NextMacroSuggestion | null {
  const todayIso = toLocalIsoDate(today);

  const activeMacro = getActiveMacrocycle(profile.macrocycles, todayIso);
  const activeProgram = getActiveStrengthProgram(profile.strengthPrograms ?? [], todayIso);
  // Un bloque de temporada (test -> build -> retest) cuenta como estructura que termina: su semana
  // de retest es justo el momento de decidir que viene despues. Otros metodos de fuerza (5/3/1,
  // etc.) no — no cierran un ciclo con la misma logica de "y ahora que".
  const endingTemporada = activeProgram && activeProgram.method === 'temporada' ? activeProgram : undefined;

  const ending: EndingStructure | null = activeMacro
    ? { id: activeMacro.id, label: activeMacro.label, endDate: activeMacro.endDate, kind: 'macrocycle' }
    : endingTemporada
      ? { id: endingTemporada.id, label: 'Bloque de Temporada', endDate: endingTemporada.endDate, kind: 'temporada' }
      : null;
  if (!ending) return null;

  const daysRemaining = -daysBetween(ending.endDate, today);
  if (daysRemaining < 0 || daysRemaining > NEXT_MACRO_WINDOW_DAYS) return null;

  const alreadyPlanned = profile.macrocycles.some(
    (m) => m.id !== ending.id && m.startDate > ending.endDate && m.startDate <= addDaysIso(ending.endDate, ALREADY_PLANNED_GAP_DAYS),
  );
  if (alreadyPlanned) return null;

  const suggestedStart = addDaysIso(ending.endDate, 1);
  // Sin macrociclo de referencia (viene de un bloque de temporada) se asume un macro estandar de 8 semanas.
  const mirroredWeeks = activeMacro ? totalMacrocycleWeeks(activeMacro) : 8;
  const mirroredEnd = addDaysIso(suggestedStart, mirroredWeeks * 7 - 1);

  const drivingGoal = pickPriorityGoal(profile.goals, (g) => g.targetDate > ending.endDate);
  const goalReachable = drivingGoal ? isoDiffDays(suggestedStart, drivingGoal.targetDate) >= MIN_NEXT_MACRO_DAYS : false;
  const suggestedEnd = goalReachable ? drivingGoal!.targetDate : mirroredEnd;
  const suggestsSeason = goalReachable && isoDiffDays(suggestedStart, drivingGoal!.targetDate) >= SEASON_SUGGESTION_MIN_DAYS;

  const drivingMovement = drivingGoal?.movementId ? getMovementById(drivingGoal.movementId) : undefined;
  const suggestedLabel = goalReachable
    ? `Rumbo a ${drivingMovement ? drivingMovement.name : 'tu objetivo'}`
    : `${ending.label} (continuación)`;

  const topWeak = computeWeakPoints(history).find((w) => w.status === 'a-trabajar');

  // Solo se propone la misma duracion de fases si de verdad cabe en el nuevo total dejando al
  // menos una semana de descarga — si el objetivo obliga a un bloque mas corto que el reparto
  // anterior, arrastrar los mismos numeros dejaria un formulario ya invalido. Mejor no proponer
  // fases (vuelve al ciclo clasico, siempre valido) que entregar un borrador roto.
  // Perfil de respuesta: a un atleta de recuperacion lenta se le deja una semana mas de descarga en
  // el proximo bloque — quitandola de intensificacion (la fase mas prescindible para el), o de
  // acumulacion si intensificacion ya esta en su minimo.
  const slowRecovery =
    engineResponseProfile(computeResponseProfile(history, profile.prLog, today, profile.setFeedbackLog, profile.bodyweightLog))
      .recovery.tier === 'lento';

  let suggestedPhaseWeeks: [number, number, number, number] | undefined;
  let recoveryNote: string | undefined;
  if (activeMacro?.phaseWeeks) {
    let acc = activeMacro.phaseWeeks[0];
    let int = activeMacro.phaseWeeks[1];
    const peak = activeMacro.phaseWeeks[2];
    const newTotalWeeks = weeksBetweenIso(suggestedStart, suggestedEnd);
    if (slowRecovery && (int > 1 || acc > 1)) {
      if (int > 1) int -= 1;
      else acc -= 1;
      recoveryNote = 'Tu perfil de respuesta indica recuperación lenta: este bloque lleva una semana más de descarga (a costa de intensificación).';
    }
    if (acc + int + peak + 1 <= newTotalWeeks) {
      suggestedPhaseWeeks = [acc, int, peak, newTotalWeeks - acc - int - peak];
    } else {
      recoveryNote = undefined; // no cupo el reparto ajustado; se cae al ciclo clasico sin nota
    }
  }

  return {
    endingStructure: ending,
    daysRemaining,
    draft: {
      id: crypto.randomUUID(),
      label: suggestedLabel,
      startDate: suggestedStart,
      endDate: suggestedEnd,
      phaseWeeks: suggestedPhaseWeeks,
    },
    drivingGoal: goalReachable
      ? {
          type: drivingGoal!.type,
          movementId: drivingGoal!.movementId,
          movementName: drivingMovement?.name,
          targetDate: drivingGoal!.targetDate,
        }
      : undefined,
    suggestsSeason,
    weakPointLabel: topWeak?.label,
    recoveryNote,
    openGoalsBeyond: profile.goals.filter((g) => g.targetDate > ending.endDate).length,
  };
}
