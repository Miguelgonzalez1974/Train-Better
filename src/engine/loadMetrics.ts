import type { SessionHistoryEntry } from '../data/athlete/types';

export type AcwrZone = 'baja' | 'optima' | 'moderada' | 'alta';

export interface AcwrResult {
  acute: number;
  chronic: number;
  acwr: number | null;
  zone: AcwrZone;
}

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;

export const ACWR_ZONE_LABEL: Record<AcwrZone, string> = {
  baja: 'Baja carga',
  optima: 'Óptimo',
  moderada: 'Riesgo moderado',
  alta: 'Riesgo alto',
};

function daysBetween(dateIso: string, reference: Date): number {
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
 * Acute:Chronic Workload Ratio a partir de sRPE (RPE x duracion en min) de cada sesion.
 * ACWR = carga aguda (suma ultimos 7 dias) / carga cronica (media semanal de los ultimos 28 dias).
 * Zonas basadas en la literatura de gestion de carga (Gabbett et al.): <0.8 baja, 0.8-1.3 optima,
 * 1.3-1.5 moderada, >1.5 alta.
 */
export function computeAcwr(history: SessionHistoryEntry[], referenceDate: Date = new Date()): AcwrResult {
  let acute = 0;
  let chronicSum = 0;

  for (const entry of history) {
    const age = daysBetween(entry.date, referenceDate);
    if (age < 0 || age >= CHRONIC_WINDOW_DAYS) continue;
    const srpe = entry.rpe * entry.durationMin;
    chronicSum += srpe;
    if (age < ACUTE_WINDOW_DAYS) acute += srpe;
  }

  const chronic = chronicSum / (CHRONIC_WINDOW_DAYS / 7);
  const acwr = chronic > 0 ? acute / chronic : null;

  return { acute, chronic, acwr, zone: classifyAcwr(acwr) };
}
