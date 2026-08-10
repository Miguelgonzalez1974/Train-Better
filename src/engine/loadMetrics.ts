import type { SessionHistoryEntry } from '../data/athlete/types';

export type AcwrZone = 'baja' | 'optima' | 'moderada' | 'alta';

export interface AcwrResult {
  acute: number;
  chronic: number;
  acwr: number | null;
  zone: AcwrZone;
  /** true si aun no hay sesiones recientes suficientes para confiar en el ratio (atleta nuevo o que vuelve de una pausa larga). */
  coldStart: boolean;
}

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;
/** Sesiones minimas en la ventana cronica para tratar el ACWR calculado como fiable. */
const COLD_START_MIN_SESSIONS = 4;
const COLD_START_ZONE: AcwrZone = 'moderada';

export const ACWR_ZONE_LABEL: Record<AcwrZone, string> = {
  baja: 'Baja carga',
  optima: 'Óptimo',
  moderada: 'Riesgo moderado',
  alta: 'Riesgo alto',
};

/** Orden de cautela de cada zona (a mayor numero, mas restrictiva) — usado solo para no relajar nunca una zona ya cautelosa. */
const ZONE_CAUTION_RANK: Record<AcwrZone, number> = { baja: 0, optima: 0, moderada: 1, alta: 2 };

export function daysBetween(dateIso: string, reference: Date): number {
  const diffMs = new Date(reference).setHours(0, 0, 0, 0) - new Date(dateIso).setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function classifyAcwr(acwr: number | null): AcwrZone {
  if (acwr === null) return 'optima';
  if (acwr < 0.8) return 'baja';
  if (acwr <= 1.3) return 'optima';
  if (acwr <= 1.5) return 'moderada';
  return 'alta';
}

/**
 * Un coach real no le da carga plena a un atleta del que no conoce su tolerancia: con menos de
 * `COLD_START_MIN_SESSIONS` sesiones recientes (atleta nuevo, o que vuelve de una pausa larga y por
 * tanto no tiene sesiones en la ventana cronica) se aplica cautela minima aunque el ratio en si de
 * "optima" — pero nunca se relaja una zona que el propio ratio ya marque como mas restrictiva.
 */
function applyColdStart(zone: AcwrZone, sessionsInWindow: number): AcwrZone {
  if (sessionsInWindow >= COLD_START_MIN_SESSIONS) return zone;
  return ZONE_CAUTION_RANK[zone] >= ZONE_CAUTION_RANK[COLD_START_ZONE] ? zone : COLD_START_ZONE;
}

/**
 * Acute:Chronic Workload Ratio a partir de sRPE (RPE x duracion en min) de cada sesion.
 * ACWR = carga aguda (suma ultimos 7 dias) / carga cronica (media semanal de los ultimos 28 dias).
 * Zonas basadas en la literatura de gestion de carga (Gabbett et al.): <0.8 baja, 0.8-1.3 optima,
 * 1.3-1.5 moderada, >1.5 alta.
 */
export function computeAcwr(history: SessionHistoryEntry[], referenceDate: Date = new Date()): AcwrResult {
  let acute = 0;
  let chronicSum = 0;
  let sessionsInWindow = 0;

  for (const entry of history) {
    const age = daysBetween(entry.date, referenceDate);
    if (age < 0 || age >= CHRONIC_WINDOW_DAYS) continue;
    sessionsInWindow++;
    const srpe = entry.rpe * entry.durationMin;
    chronicSum += srpe;
    if (age < ACUTE_WINDOW_DAYS) acute += srpe;
  }

  const chronic = chronicSum / (CHRONIC_WINDOW_DAYS / 7);
  const acwr = chronic > 0 ? acute / chronic : null;
  const coldStart = sessionsInWindow < COLD_START_MIN_SESSIONS;
  const zone = applyColdStart(classifyAcwr(acwr), sessionsInWindow);

  return { acute, chronic, acwr, zone, coldStart };
}
