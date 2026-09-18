import { athleteRepository } from '../../data/athlete/athleteRepository';
import { planWeekLocks } from '../../engine/generateSession';
import { getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import type { AthleteProfile, Goal, SessionHistoryEntry } from '../../data/athlete/types';

/**
 * Modulo compartido entre Planificacion.tsx y WeekStrip.tsx (evita el import circular que saldria
 * de definir esto dentro de cualquiera de los dos componentes).
 */

/** Lunes (fecha) de la semana de calendario que contiene `iso`. */
export function mondayOfWeek(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - getWeekdayIndex(d));
  return d;
}

/**
 * Si la semana de `dateIso` aun no tiene ningun dia de fuerza/oly bloqueado, la planifica y bloquea
 * entera de una vez (ver `planWeekLocks`) — "el coach planifica y bloquea la semana" en cuanto hace
 * falta un dia de ella, no con un disparador real de domingo (esta PWA no tiene servidor propio).
 * Devuelve el perfil ya con el bloqueo aplicado, para generar la sesion de ese dia con el en el acto.
 */
export function ensureWeekLocked(profile: AthleteProfile, history: SessionHistoryEntry[], goals: Goal[], dateIso: string): AthleteProfile {
  const monday = mondayOfWeek(dateIso);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return toLocalIsoDate(d);
  });
  if (weekDates.some((d) => profile.weeklyLocks?.[d])) return profile;
  const locks = planWeekLocks(profile, history, monday, goals);
  if (Object.keys(locks).length === 0) return profile;
  const next: AthleteProfile = { ...profile, weeklyLocks: { ...(profile.weeklyLocks ?? {}), ...locks } };
  athleteRepository.saveProfile(next);
  return next;
}
