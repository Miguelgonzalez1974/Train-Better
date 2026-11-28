import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { generateSessionForDate, hasActiveTrainingStructure, isCachedSessionOrphaned, isCachedSessionStale } from '../../engine/generateSession';
import { isRestMarked } from '../../engine/restDays';
import { resolveWeekLocks } from '../../engine/weekLocks';

/**
 * La sesión prevista de un día que aún no ha llegado, la misma que enseña la tira de la semana, SIN guardar nada: ni la sesión ni el bloqueo de
 * la semana. null si ese día lo has marcado como descanso o no hay plan.
 */
export function previewSession(profile: AthleteProfile, history: SessionHistoryEntry[], dateIso: string): DailySession | null {
  if (isRestMarked(profile.restDates, dateIso) || !hasActiveTrainingStructure(profile, dateIso)) return null;
  const locked = resolveWeekLocks(profile, history, profile.goals, dateIso);
  const cached = athleteRepository.getCachedSession(dateIso);
  if (cached && !isCachedSessionOrphaned(cached, profile, dateIso) && !isCachedSessionStale(cached, locked.weeklyLocks?.[dateIso], history, locked.painFlags, locked.regenVariants?.[dateIso] ?? 0)) {
    return cached;
  }
  return generateSessionForDate(locked, history, new Date(`${dateIso}T12:00:00`), locked.goals);
}
