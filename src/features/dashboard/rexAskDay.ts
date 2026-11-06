import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { generateSessionForDate, hasActiveTrainingStructure } from '../../engine/generateSession';
import { addDaysIso } from '../../engine/periodization';
import { estimatePlannedStrain } from '../../engine/plannedStrain';
import { isRestMarked } from '../../engine/restDays';
import { estimateSessionMinutes } from '../../lib/sessionDuration';
import { buildPreviewLine } from './DayRows';
import type { DayInfo } from './rexAsk';

/**
 * Lo que Rex cuenta cuando le preguntas «¿qué toca…?»: hoy lo que ya se resolvió en el Dashboard, y un día futuro se genera con el mismo
 * motor que Planificación (sin guardar nada). Es lo previsto: con el check-in de ese día y cómo llegues puede cambiar.
 */
export function describeDayForAsk(input: {
  offset: number;
  todayIso: string;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  /** La sesión de hoy ya resuelta por el Dashboard (null si ya entrenaste o no hay estructura). */
  todaySession: DailySession | null;
  /** El esfuerzo de hoy si ya entrenaste, null si no. */
  todayStrain: number | null;
  /** Lo que el aprendizaje del esfuerzo corrige la estimación (`strainLearned.bias`). */
  bias: number;
}): DayInfo {
  const { offset, todayIso, profile, history, bias } = input;
  const iso = addDaysIso(todayIso, offset);
  if (offset === 0 && history.some((h) => h.date === todayIso)) return { kind: 'hecho', strain: input.todayStrain };
  if (isRestMarked(profile.restDates, iso)) return { kind: 'descanso', chosen: true };
  if (!hasActiveTrainingStructure(profile, iso)) return { kind: 'sin-plan' };
  const session = offset === 0 ? input.todaySession : generateSessionForDate(profile, history, new Date(`${iso}T00:00:00`), profile.goals);
  if (!session) return { kind: 'sin-plan' };
  if (session.isRestDay) return { kind: 'descanso', chosen: false };
  if (session.competition?.eventDay) return { kind: 'competicion' };
  const planned = estimatePlannedStrain(session, history, bias);
  return { kind: 'sesion', line: buildPreviewLine(session), strain: planned ? Math.round(planned.strain) : null, minutes: Math.round(planned?.minutes ?? estimateSessionMinutes(session)) || null };
}
