import type { Goal, SessionHistoryEntry } from '../data/athlete/types';
import type { AcwrZone } from './loadMetrics';
import { daysBetween } from './loadMetrics';
import type { RecoveryTier } from './responseProfile';

export type DeloadReason = 'fatiga' | 'taper' | 'rpe-alto' | 'preparacion';

export const DELOAD_REASON_NOTE: Record<DeloadReason, string> = {
  preparacion:
    'Descarga activada por tu preparación: llevas varios días seguidos con la preparación baja (o con la HRV por debajo de tu rango). No esperamos al calendario: bajamos unos días para que te recuperes y vuelvas a rendir.',
  fatiga: 'Descarga activada por tu carga acumulada (ACWR en riesgo alto) — hoy toca bajar el pie del acelerador, no seguir el plan estándar de la semana.',
  'rpe-alto':
    'Descarga activada por tu esfuerzo percibido: llevas varias sesiones seguidas a RPE 9 o más. Un coach no espera a que el ACWR lo confirme — bajamos unos días para que asimiles el trabajo y vuelvas a rendir.',
  taper: 'Taper pre-competición: quedan pocos días para tu objetivo — bajamos volumen para que llegues fresco, no más fuerte que hoy.',
};

/** RPE a partir del cual una sesion cuenta como "al limite". */
const RPE_OVERREACH_HARD = 9;
/** Ventana en la que se cuentan las sesiones duras, y antiguedad maxima de la ultima para que la descarga siga viva. */
const RPE_OVERREACH_WINDOW_DAYS = 10;
const RPE_OVERREACH_RECENCY_DAYS = 5;
/** Sesiones al limite (o media alta con >=4 sesiones) que disparan la descarga. */
const RPE_OVERREACH_MIN_HARD = 3;
const RPE_OVERREACH_MEAN = 8.5;
const RPE_OVERREACH_MEAN_MIN_SESSIONS = 4;
/** Por debajo de esta fiabilidad el RPE del atleta no discrimina entre semanas duras y suaves: no se usa para descargar. */
const RPE_MIN_RELIABILITY = 0.7;

/**
 * Sobrecarga percibida sostenida: varias sesiones seguidas a RPE >= 9 en los ultimos 10 dias, con la
 * ultima hace <= 5. Es una señal independiente del ACWR (media suavizada y con retraso). Las sesiones
 * que ya se hicieron en descarga no cuentan, asi la descarga dura ~5 dias desde la ultima sesion dura
 * y termina sola sin quedarse enganchada. Si el RPE del atleta no es fiable (perfil de respuesta), no
 * se usa: descargar por un RPE que no informa seria descargar al azar.
 */
export function hasSustainedHighRpe(history: SessionHistoryEntry[], today: Date, rpeReliability = 1): boolean {
  if (rpeReliability < RPE_MIN_RELIABILITY) return false;
  const recent = history.filter((e) => {
    const age = daysBetween(e.date, today);
    return age >= 0 && age <= RPE_OVERREACH_WINDOW_DAYS && e.mesocycleWeek !== 4;
  });
  const hard = recent.filter((e) => e.rpe >= RPE_OVERREACH_HARD);
  const lastHardAge = hard.length > 0 ? Math.min(...hard.map((e) => daysBetween(e.date, today))) : Infinity;
  if (hard.length >= RPE_OVERREACH_MIN_HARD && lastHardAge <= RPE_OVERREACH_RECENCY_DAYS) return true;
  if (recent.length >= RPE_OVERREACH_MEAN_MIN_SESSIONS) {
    const mean = recent.reduce((s, e) => s + e.rpe, 0) / recent.length;
    const lastAge = Math.min(...recent.map((e) => daysBetween(e.date, today)));
    if (mean >= RPE_OVERREACH_MEAN && lastAge <= RPE_OVERREACH_RECENCY_DAYS) return true;
  }
  return false;
}

/**
 * Un coach real no descarga solo porque "toca semana 4 de 4": si el ACWR esta en zona de riesgo
 * alto, o si quedan pocos dias para una competicion, la semana se convierte en descarga aunque el
 * ciclo de calendario diga otra cosa. La semana de calendario sigue existiendo para las demas
 * semanas (progresion de intensidad 1-2-3), pero puede ser sustituida por estos dos motivos.
 */
export function resolveTrainingWeek(
  calendarWeek: 1 | 2 | 3 | 4,
  acwrZone: AcwrZone,
  _goals: Goal[],
  today: Date,
  recoveryTier: RecoveryTier | null = null,
  history: SessionHistoryEntry[] = [],
  rpeReliability = 1,
  /** La tendencia de tu preparación pide descarga (ver `sustainedLowReadiness`). */
  lowReadiness = false,
): { week: 1 | 2 | 3 | 4; reason?: DeloadReason } {
  // El taper de una competicion ya no es una descarga: lo gestiona la cuenta atras de `competition.ts` (pico con el
  // volumen recortado) y aqui solo mandan los motivos de seguridad.
  if (acwrZone === 'alta') return { week: 4, reason: 'fatiga' };
  // Un atleta que el perfil de respuesta marca como de recuperacion lenta frena antes: se descarga
  // ya en riesgo moderado, sin esperar a que el ACWR llegue a alto.
  if (recoveryTier === 'lento' && acwrZone === 'moderada') return { week: 4, reason: 'fatiga' };
  // Sobrecarga percibida sostenida (varias sesiones a RPE >= 9): se descarga aunque el ACWR aun no lo diga.
  // En la semana 4 de calendario ya es descarga, no se anuncia otro motivo.
  if (calendarWeek !== 4 && hasSustainedHighRpe(history, today, rpeReliability)) return { week: 4, reason: 'rpe-alto' };
  // Varios días seguidos con la preparación baja (o la HRV por debajo de tu rango): descarga sin esperar al calendario.
  if (calendarWeek !== 4 && lowReadiness) return { week: 4, reason: 'preparacion' };
  return { week: calendarWeek };
}
