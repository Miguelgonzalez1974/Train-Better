import type { AcwrZone } from './loadMetrics';
import { daysBetween } from './loadMetrics';
import type { SessionHistoryEntry } from '../data/athlete/types';

/**
 * Autorregulacion de carga por ACWR (Gabbett et al., mismas zonas que el gauge del Dashboard):
 * si el atleta viene de un pico de carga aguda frente a su carga cronica, un coach real reduce
 * el %1RM de hoy en vez de aplicar la progresion de la semana a ciegas.
 */
const AUTOREG_FACTOR: Record<AcwrZone, number> = {
  baja: 1,
  optima: 1,
  moderada: 0.95,
  alta: 0.88,
};

const AUTOREG_NOTE: Partial<Record<AcwrZone, string>> = {
  moderada: 'Carga ajustada -5% por tu volumen acumulado esta semana (ACWR en riesgo moderado) — prioriza la técnica.',
  alta: 'Carga ajustada -12% por tu volumen acumulado (ACWR alto) — hoy toca bajar el pie del acelerador, no sumar más fatiga.',
};

/** Nota distinta a la de riesgo moderado real: aqui la cautela es por falta de historial, no por volumen acumulado. */
const COLD_START_NOTE =
  'Carga ajustada con cautela — todavía no hay suficiente historial reciente para calcular tu ACWR real, así que el coach empieza conservador hasta conocer tu tolerancia.';

export function getAutoregFactor(zone: AcwrZone): number {
  return AUTOREG_FACTOR[zone];
}

export function getAutoregNote(zone: AcwrZone, coldStart = false): string | undefined {
  if (coldStart) return COLD_START_NOTE;
  return AUTOREG_NOTE[zone];
}

const RPE_HIGH_THRESHOLD = 9;
const RPE_LOW_THRESHOLD = 5;
/** Ventana para la señal de "ayer diste el máximo" — se cuenta desde la ultima sesion registrada, no desde hoy. */
const RPE_HIGH_LOOKBACK_DAYS = 2;
/** Ventana mas amplia para detectar una racha de sesiones que se han sentido ligeras. */
const RPE_LIGHT_STREAK_DAYS = 5;
const RPE_LIGHT_STREAK_MIN_SESSIONS = 2;
const RPE_HIGH_FACTOR = 0.93;
const RPE_LIGHT_FACTOR = 1.05;
/** Ni el ACWR ni el RPE reciente deben poder combinarse hasta vaciar la sesion de sentido. */
export const AUTOREG_FLOOR = 0.7;
export const AUTOREG_CEILING = 1.05;

export interface RpeAutoregResult {
  factor: number;
  note?: string;
}

/**
 * Segunda señal de autorregulacion, independiente del ACWR (que es una media suavizada de los
 * ultimos 7 dias con retraso). Un coach real no espera a que el ratio semanal se mueva para notar
 * que ayer diste el maximo esfuerzo — si el RPE de tu ultima sesion registrada fue muy alto, hoy
 * se baja un poco mas de lo que ya diga el ACWR; si las ultimas sesiones se han sentido
 * consistentemente ligeras, se sube un poco para no quedarse corto en vez de seguir aplicando la
 * progresion de la semana a ciegas.
 */
/**
 * `rpeReliability` (0.4-1, del perfil de respuesta): cuando el RPE del atleta no discrimina bien
 * entre semanas duras y suaves, su valor da menos informacion — se acerca el factor a 1 en
 * proporcion, para que el motor se apoye mas en el ACWR (que es objetivo) y menos en su RPE.
 */
export function getRpeAutoregFactor(
  history: SessionHistoryEntry[],
  referenceDate: Date = new Date(),
  rpeReliability = 1,
): RpeAutoregResult {
  const raw = rawRpeAutoregFactor(history, referenceDate);
  if (raw.factor === 1 || rpeReliability >= 1) return raw;
  return { factor: 1 + (raw.factor - 1) * rpeReliability, note: raw.note };
}

function rawRpeAutoregFactor(history: SessionHistoryEntry[], referenceDate: Date): RpeAutoregResult {
  if (history.length === 0) return { factor: 1 };

  const last = history[history.length - 1];
  const daysSinceLast = daysBetween(last.date, referenceDate);

  if (daysSinceLast >= 0 && daysSinceLast <= RPE_HIGH_LOOKBACK_DAYS && last.rpe >= RPE_HIGH_THRESHOLD) {
    return {
      factor: RPE_HIGH_FACTOR,
      note: `Ayer registraste RPE ${last.rpe} — hoy se baja un poco más para no acumular fatiga encima de eso.`,
    };
  }

  const recentLight = history.filter((entry) => {
    const age = daysBetween(entry.date, referenceDate);
    return age >= 0 && age <= RPE_LIGHT_STREAK_DAYS;
  });
  if (recentLight.length >= RPE_LIGHT_STREAK_MIN_SESSIONS && recentLight.every((entry) => entry.rpe <= RPE_LOW_THRESHOLD)) {
    return {
      factor: RPE_LIGHT_FACTOR,
      note: 'Tus últimas sesiones se han sentido ligeras (RPE bajo) — hoy se sube un poco la intensidad.',
    };
  }

  return { factor: 1 };
}

/**
 * Combina ACWR + RPE reciente (+ check-in de energia + sesgo del perfil de respuesta) en un solo
 * multiplicador, sin dejar que se disparen entre si. `responseBias` (~0.97-1.03): un atleta que
 * reporta sus RPE sistematicamente bajos recibe algo mas de cautela; uno que los infla, algo mas de permiso.
 */
export function combineAutoregFactors(acwrFactor: number, rpeFactor: number, readinessFactor = 1, responseBias = 1): number {
  return Math.max(AUTOREG_FLOOR, Math.min(AUTOREG_CEILING, acwrFactor * rpeFactor * readinessFactor * responseBias));
}
