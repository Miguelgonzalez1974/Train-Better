import { athleteRepository } from '../../data/athlete/athleteRepository';
import { resolveWeekLocks } from '../../engine/weekLocks';
import type { AthleteProfile, Goal, SessionHistoryEntry } from '../../data/athlete/types';

/**
 * Modulo compartido entre Planificacion.tsx y WeekStrip.tsx (evita el import circular que saldria
 * de definir esto dentro de cualquiera de los dos componentes).
 */

/**
 * Planifica y bloquea la semana de `dateIso` en cuanto hace falta un dia de ella (no hay servidor
 * propio para un disparador real de domingo), y la re-planifica si un dia de la semana en curso se
 * perdio despues de planificar (ver `resolveWeekLocks`). Persiste el resultado y lo devuelve, para
 * generar la sesion de ese dia con el bloqueo ya aplicado.
 */
export function ensureWeekLocked(profile: AthleteProfile, history: SessionHistoryEntry[], goals: Goal[], dateIso: string): AthleteProfile {
  const next = resolveWeekLocks(profile, history, goals, dateIso);
  if (next !== profile) athleteRepository.saveProfile(next);
  return next;
}
