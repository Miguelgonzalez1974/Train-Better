import type { AthleteProfile } from '../data/athlete/types';

/**
 * Descanso elegido: el atleta marca un día como descanso a propósito ("Hoy descanso") para que la app lo distinga de un día
 * olvidado. Se guarda como una lista de fechas en el perfil (`restDates`). Sin marca, un día previsto sin registrar cuenta como
 * "no registrado" y resta al cumplimiento del plan; con ella se pinta como descanso y no resta.
 */

/** Tope de fechas guardadas (las más recientes): de sobra para el cumplimiento del año. */
export const REST_DATES_LIMIT = 400;

export function isRestMarked(restDates: string[] | undefined, iso: string): boolean {
  return (restDates ?? []).includes(iso);
}

/** El perfil con `iso` marcado como descanso elegido (idempotente). */
export function withRestMarked(profile: AthleteProfile, iso: string): AthleteProfile {
  if (isRestMarked(profile.restDates, iso)) return profile;
  return { ...profile, restDates: [...(profile.restDates ?? []), iso].sort().slice(-REST_DATES_LIMIT) };
}

/** El perfil sin la marca de descanso de `iso`. */
export function withRestUnmarked(profile: AthleteProfile, iso: string): AthleteProfile {
  if (!isRestMarked(profile.restDates, iso)) return profile;
  return { ...profile, restDates: (profile.restDates ?? []).filter((d) => d !== iso) };
}
