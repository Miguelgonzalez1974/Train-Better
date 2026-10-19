import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getReadinessCheckForDate } from './readiness';
import { computeReadinessScore } from './readinessScore';

/**
 * La tendencia de tu preparación: cuando llevas varios días seguidos mal, un entrenador no espera al calendario para descargar.
 * Es un disparador de descarga independiente del ACWR (que va con retraso) y del RPE: lo que dices y lo que miden tus datos.
 *   - Preparación: los últimos 3 días (con el de hoy) todos en `LOW_READINESS_MAX` o menos.
 *   - HRV: tu HRV por debajo de tu rango (el completo) y la preparación de hoy y de ayer en `HRV_LOW_READINESS_MAX` o menos.
 * Solo con el check-in de hoy hecho, y no si ya llevas una descarga encima: así termina sola en unos días en vez de engancharse.
 */

export const LOW_READINESS_DAYS = 3;
export const LOW_READINESS_MAX = 45;
export const HRV_LOW_READINESS_MAX = 55;
/** Si en los últimos días ya hubo sesiones de descarga (semana 4), no se vuelve a disparar: la descarga ya está en marcha. */
const RECENT_DELOAD_DAYS = 4;

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** La preparación de hoy y de los `days - 1` días anteriores (cada día con lo que se sabía ese día); null si un día no tiene nota. */
export function readinessLastDays(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string, days: number): (number | null)[] {
  return Array.from({ length: days }, (_, back) => {
    const dayIso = isoMinus(todayIso, back);
    return computeReadinessScore({
      readinessLog: profile.readinessLog,
      history: history.filter((h) => h.date < dayIso),
      setFeedbackLog: profile.setFeedbackLog,
      painFlags: profile.painFlags,
      today: new Date(`${dayIso}T12:00:00`),
    }).total;
  });
}

export type LowReadinessTrigger = 'preparacion' | 'hrv';

/** ¿Pide la tendencia de tu preparación una descarga hoy? Devuelve el motivo, o null. */
export function sustainedLowReadiness(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): LowReadinessTrigger | null {
  const check = getReadinessCheckForDate(profile.readinessLog, todayIso);
  if (!check) return null;
  const sinceIso = isoMinus(todayIso, RECENT_DELOAD_DAYS);
  if (history.some((h) => h.date >= sinceIso && h.date < todayIso && h.mesocycleWeek === 4)) return null;

  const last = readinessLastDays(profile, history, todayIso, LOW_READINESS_DAYS);
  if (last.every((v) => v !== null && v <= LOW_READINESS_MAX)) return 'preparacion';
  if (check.hrvVs === 'bajo' && last[0] !== null && last[0] <= HRV_LOW_READINESS_MAX && last[1] !== null && last[1] <= HRV_LOW_READINESS_MAX) return 'hrv';
  return null;
}
