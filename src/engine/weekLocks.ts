import { planWeekLocks } from './generateSession';
import { getWeekdayIndex, toLocalIsoDate } from './periodization';
import type { AthleteProfile, DailySession, Goal, SessionHistoryEntry } from '../data/athlete/types';

/** Lunes (fecha) de la semana de calendario que contiene `iso`. */
export function mondayOfWeek(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - getWeekdayIndex(d));
  return d;
}

/**
 * Decide si hay que planificar o re-planificar el bloqueo semanal de la semana de `dateIso` y devuelve
 * el perfil resultante (la MISMA referencia si no hay nada que hacer). Pura: no persiste nada.
 *
 * - Semana sin ningun dia bloqueado: se planifica entera (ver `planWeekLocks`).
 * - Semana en curso con un dia PERDIDO (bloqueado, ya pasado y sin sesion registrada) que ocurrio
 *   despues de planificar: se re-planifican los dias que quedan (desde hoy). Un coach real no deja el
 *   jueves como estaba pensado si el martes no entrenaste: el hueco semanal de patrones se recoloca.
 *   Los dias que el atleta ya edito a mano o ya registro no se tocan. Idempotente: tras re-planificar,
 *   `plannedOn` de los bloqueos es posterior al dia perdido y no vuelve a saltar.
 */
export function resolveWeekLocks(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  goals: Goal[],
  dateIso: string,
  today: Date = new Date(),
): AthleteProfile {
  const monday = mondayOfWeek(dateIso);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return toLocalIsoDate(d);
  });
  const todayIso = toLocalIsoDate(today);
  const locks = profile.weeklyLocks ?? {};
  const lockedDates = weekDates.filter((d) => locks[d]);

  if (lockedDates.length === 0) {
    const planned = planWeekLocks(profile, history, monday, goals, { plannedOn: todayIso });
    if (Object.keys(planned).length === 0) return profile;
    return { ...profile, weeklyLocks: { ...locks, ...planned } };
  }

  if (!weekDates.includes(todayIso)) return profile;

  const trained = new Set(history.map((h) => h.date));
  const missed = lockedDates.filter((d) => d < todayIso && !trained.has(d));
  if (missed.length === 0) return profile;
  const lastMissed = missed[missed.length - 1];

  const remainingLocked = lockedDates.filter((d) => d >= todayIso);
  const needsReplan = remainingLocked.some((d) => (locks[d]?.plannedOn ?? '') <= lastMissed);
  if (!needsReplan) return profile;

  const protectedSessions: Record<string, DailySession> = {};
  for (const d of weekDates.filter((x) => x >= todayIso)) {
    const cached = profile.sessionCache?.[d];
    if (cached && (cached.editedByAthlete || trained.has(d))) protectedSessions[d] = cached;
  }

  const replanned = planWeekLocks(profile, history, monday, goals, {
    fromDate: new Date(`${todayIso}T00:00:00`),
    protectedSessions,
    plannedOn: todayIso,
  });
  const next = { ...locks };
  for (const d of weekDates) {
    if (d >= todayIso && !protectedSessions[d]) delete next[d];
  }
  return { ...profile, weeklyLocks: { ...next, ...replanned } };
}
