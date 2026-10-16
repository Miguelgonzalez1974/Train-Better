import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { computeAcwr, getAcwrTrend, type AcwrResult } from '../../engine/loadMetrics';
import { computeReadinessScore, type ReadinessScore } from '../../engine/readinessScore';
import { dayStrain, strainStatus } from '../../engine/strain';
import type { StrainLearning } from '../../engine/strainLearning';
import { buildStrainTarget } from '../../engine/strainTarget';
import type { StrainView } from './StrainRing';

export interface PastDayView {
  readiness: ReadinessScore;
  acwr: AcwrResult;
  trend: (number | null)[];
  strain: StrainView;
  entry: SessionHistoryEntry | undefined;
}

/**
 * Cómo estaba un día pasado, con lo que se sabía esa mañana: la preparación y la carga se calculan con el historial
 * anterior a ese día y su check-in; el objetivo es el que se fijó entonces (o, si no se guardó, el que se habría pedido);
 * el esfuerzo es el real de ese día.
 */
export function buildPastDayView(profile: AthleteProfile, history: SessionHistoryEntry[], dayIso: string, learning: StrainLearning): PastDayView {
  const ref = new Date(`${dayIso}T12:00:00`);
  const prior = history.filter((h) => h.date < dayIso);
  const entry = history.find((h) => h.date === dayIso);
  const target = profile.strainTargets?.[dayIso] ?? buildStrainTarget(profile, history, dayIso);
  const real = dayStrain(entry);
  return {
    readiness: computeReadinessScore({ readinessLog: profile.readinessLog, history: prior, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: ref }),
    acwr: computeAcwr(prior, ref),
    trend: getAcwrTrend(prior, undefined, ref),
    strain: { target, planned: null, fit: null, real, status: strainStatus(real, target), learning },
    entry,
  };
}
