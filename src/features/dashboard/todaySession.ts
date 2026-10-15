import { athleteRepository } from '../../data/athlete/athleteRepository';
import {
  generateSessionForDate,
  hasActiveTrainingStructure,
  isCachedSessionOrphaned,
  isCachedSessionStale,
} from '../../engine/generateSession';
import { ensureWeekLocked } from '../planificacion/weeklyLock';
import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';

/**
 * La sesión de hoy tal como la ve el Dashboard: la caché vigente si la hay y, si no, la misma generación que haría
 * Planificación (sin escribir nada — la escritura autoritativa sigue siendo cosa de Planificación). null si ya entrenaste
 * hoy o no hay macrociclo ni programa activo.
 */
export function resolveTodaySession(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): DailySession | null {
  if (history.some((h) => h.date === todayIso) || !hasActiveTrainingStructure(profile, todayIso)) return null;
  const cached = athleteRepository.getCachedSession(todayIso);
  if (cached && !isCachedSessionOrphaned(cached, profile, todayIso) && !isCachedSessionStale(cached, profile.weeklyLocks?.[todayIso], history, profile.painFlags, profile.regenVariants?.[todayIso] ?? 0)) {
    return cached;
  }
  return generateSessionForDate(profile, history, new Date(), profile.goals);
}

/**
 * Tras el check-in de hoy la sesión se rehace con el nuevo factor de energía, igual que cuando el check-in se hace en
 * Planificación: el motor tiene aleatoriedad interna, así que confirmarlo puede volver a barajar el WOD de hoy.
 */
export function refreshTodaySession(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): void {
  if (history.some((h) => h.date === todayIso) || !hasActiveTrainingStructure(profile, todayIso)) return;
  const locked = ensureWeekLocked(profile, history, profile.goals, todayIso);
  athleteRepository.deleteCachedSession(todayIso);
  athleteRepository.saveCachedSession(generateSessionForDate(locked, history, new Date(), locked.goals));
}
