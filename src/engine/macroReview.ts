import type { AthleteProfile, Macrocycle, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { computeAcwr, daysBetween } from './loadMetrics';
import { MESOCYCLE_PHASE } from './oneRepMaxTables';
import { expectedStrengthSessionsPerWeek, resolvePhaseAtWeek, weeksSinceStart } from './periodization';
import { isGoalBehindSchedule } from './goalProgress';
import { pickPriorityGoal } from './goalPriority';
import { computeResponseProfile, engineResponseProfile } from './responseProfile';

export type MacroReviewKind = 'extend-phase' | 'goal-behind';

interface ExtendPhaseSuggestion {
  kind: 'extend-phase';
  reviewKey: string;
  phaseIndex: 1 | 2 | 3 | 4;
  headline: string;
  detail: string;
}

interface GoalBehindSuggestion {
  kind: 'goal-behind';
  reviewKey: string;
  goalId: string;
  headline: string;
  detail: string;
}

export type MacroReviewSuggestion = ExtendPhaseSuggestion | GoalBehindSuggestion;

/** RPE medio de la semana a partir del cual un coach real se plantea que el bloque se ha quedado corto de tiempo para asimilar. */
const HIGH_RPE_THRESHOLD = 8.5;
/** Un atleta que el perfil de respuesta marca como de recuperacion lenta necesita alargar la fase con una señal mas leve. */
const HIGH_RPE_THRESHOLD_SLOW_RECOVERY = 8.0;

/**
 * Revision semanal del macrociclo: a diferencia de `deload.ts` (que solo abarata la sesion de HOY
 * cuando el ACWR esta alto, sin dejar rastro una vez baja), esto mira la semana ya cerrada y, si
 * hace falta, edita el PLAN en si — alarga la fase actual o sube el enfasis de un objetivo — para
 * que la planificacion futura recuerde que esta semana costo, no solo el dia de hoy.
 *
 * Se limita a una sugerencia por semana de macrociclo (`reviewKey` = `macroId:semana`, marcado en
 * `profile.reviewedMacroWeeks` al confirmar o descartar) para no repetir el aviso cada dia.
 */
export function buildWeeklyMacroReview(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  macro: Macrocycle | undefined,
  today: Date = new Date(),
): MacroReviewSuggestion | null {
  if (!macro) return null;

  const weeksSince = weeksSinceStart(macro.startDate, today);
  const weekNumber = weeksSince + 1;
  const reviewKey = `${macro.id}:${weekNumber}`;
  if ((profile.reviewedMacroWeeks ?? []).includes(reviewKey)) return null;

  const weekEntries = history.filter((entry) => {
    const age = daysBetween(entry.date, today);
    return age >= 0 && age < 7;
  });
  // Un coach no juzga una semana con dos sesiones sueltas — espera a tener al menos la mitad del
  // volumen semanal habitual de este atleta antes de fiarse de la señal.
  const minSessions = Math.max(2, Math.ceil(expectedStrengthSessionsPerWeek(profile.trainingDaysPerWeek) / 2));
  if (weekEntries.length < minSessions) return null;

  const avgRpe = weekEntries.reduce((sum, entry) => sum + entry.rpe, 0) / weekEntries.length;
  const acwr = computeAcwr(history, today);
  const responseProfile = engineResponseProfile(computeResponseProfile(history, profile.prLog, today));
  const slowRecovery = responseProfile.recovery.tier === 'lento';
  const rpeThreshold = slowRecovery ? HIGH_RPE_THRESHOLD_SLOW_RECOVERY : HIGH_RPE_THRESHOLD;

  if (macro.phaseWeeks && !acwr.coldStart && acwr.zone === 'alta' && avgRpe >= rpeThreshold) {
    const phase = resolvePhaseAtWeek(macro, weeksSince);
    // Alargar una descarga no tiene sentido — si la fase 4 no basta para bajar el ACWR, el problema
    // no lo resuelve una semana mas de lo mismo.
    if (phase.phaseIndex !== 4) {
      return {
        kind: 'extend-phase',
        reviewKey,
        phaseIndex: phase.phaseIndex,
        headline: `Esta semana tu carga ha estado en riesgo alto (RPE medio ${avgRpe.toFixed(1)}) — ¿alargamos una semana la fase de ${MESOCYCLE_PHASE[phase.phaseIndex]}?`,
        detail: slowRecovery
          ? 'Tu perfil de respuesta indica recuperación lenta, así que se activa antes: una semana más en la fase actual para asimilar sin forzar el calendario.'
          : 'Añade una semana a la fase actual antes de pasar a la siguiente — más margen de asimilación en vez de forzar el calendario original.',
      };
    }
  }

  const behindGoal = pickPriorityGoal(profile.goals, (g) => g.emphasis !== 'intensivo' && isGoalBehindSchedule(g, history, today));
  if (behindGoal) {
    const movement = behindGoal.movementId ? getMovementById(behindGoal.movementId) : undefined;
    return {
      kind: 'goal-behind',
      reviewKey,
      goalId: behindGoal.id,
      headline: `Tu objetivo${movement ? ` de ${movement.name}` : ''} va por detrás de lo esperado — ¿subimos el énfasis a intensivo?`,
      detail: 'Las sesiones se reestructuran para exponer más tu objetivo en los bloques correspondientes, en vez de esperar a que el calendario lo arregle solo.',
    };
  }

  return null;
}

/** Cap del log de semanas ya revisadas — mismo orden de magnitud que los demas logs del perfil (bodyweight, readiness). */
export const REVIEWED_MACRO_WEEKS_LIMIT = 60;
