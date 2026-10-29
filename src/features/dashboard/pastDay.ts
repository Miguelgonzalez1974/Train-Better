import type { AthleteProfile, SessionHistoryEntry, StrainTarget } from '../../data/athlete/types';
import { computeAcwr, getAcwrTrend, type AcwrResult } from '../../engine/loadMetrics';
import { computeReadinessScore, type ReadinessScore } from '../../engine/readinessScore';
import { dayStrain, strainStatus } from '../../engine/strain';
import type { StrainLearning } from '../../engine/strainLearning';
import { buildStrainTarget } from '../../engine/strainTarget';
import type { TrendPoint } from '../../engine/weekTrend';
import type { StrainView } from './StrainRing';

function isoAddDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Un día de la gráfica semanal: su objetivo, el esfuerzo real (o el previsto de hoy) y si entrenó. */
export interface WeekDayPoint {
  iso: string;
  target: StrainTarget | null;
  real: number | null;
  /** Solo hoy, si aún no has entrenado: el esfuerzo que cuesta la sesión prevista. */
  planned: number | null;
}

/**
 * Los 7 días que terminan en `endIso` (el día elegido) con el objetivo y el esfuerzo de cada uno: el objetivo es el
 * guardado esa mañana (o, si falta y hubo sesión, el que se habría pedido) y el esfuerzo, el real. Hoy suma el previsto.
 */
export function buildWeekWindow(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  endIso: string,
  todayIso: string,
  todayStrain: StrainView,
): WeekDayPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = isoAddDays(endIso, i - 6);
    const entry = history.find((h) => h.date === iso);
    const real = dayStrain(entry);
    const stored = profile.strainTargets?.[iso];
    const target = iso > todayIso ? null : stored ?? (entry || iso === todayIso ? buildStrainTarget(profile, history, iso) : null);
    const planned = iso === todayIso && real === null ? todayStrain.planned?.strain ?? null : null;
    return { iso, target: iso === todayIso ? todayStrain.target : target, real, planned };
  });
}

/** La preparación de cada uno de los últimos `days` días hasta `endIso` (null si ese día no se puede calcular). */
export function buildReadinessSeries(profile: AthleteProfile, history: SessionHistoryEntry[], endIso: string, days: number): { iso: string; total: number | null }[] {
  return Array.from({ length: days }, (_, i) => {
    const iso = isoAddDays(endIso, i - (days - 1));
    const prior = history.filter((h) => h.date < iso);
    const score = computeReadinessScore({ readinessLog: profile.readinessLog, history: prior, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: new Date(`${iso}T12:00:00`) });
    return { iso, total: score.total };
  });
}

/**
 * Los `days` días que terminan hoy (o en el día elegido si queda fuera) para la gráfica de tendencia: esfuerzo real (0 en los días sin sesión desde que hay datos,
 * porque un descanso también es un dato; null hoy antes de entrenar y antes de empezar a usar la app), el objetivo de ese día y la
 * preparación con la que se llegó (calculada con lo que se sabía esa mañana).
 */
export function buildTrendPoints(profile: AthleteProfile, history: SessionHistoryEntry[], dayIso: string, todayIso: string, days: number): TrendPoint[] {
  // La ventana termina hoy y no se mueve al tocar un día (así se puede recorrer la semana sin que cambie de sitio); solo se desplaza
  // hacia atrás si el día elegido en el Dashboard cae antes de su inicio.
  const endIso = dayIso < isoAddDays(todayIso, -(days - 1)) ? dayIso : todayIso;
  const firstIso = [...history.map((h) => h.date), ...(profile.readinessLog ?? []).map((r) => r.date)].sort()[0] ?? todayIso;
  return Array.from({ length: days }, (_, i) => {
    const iso = isoAddDays(endIso, i - (days - 1));
    const entry = history.find((h) => h.date === iso);
    const real = dayStrain(entry);
    const strain = real ?? (iso < todayIso && iso >= firstIso ? 0 : null);
    const stored = profile.strainTargets?.[iso];
    const target = iso > todayIso ? null : stored ?? (entry || iso === todayIso ? buildStrainTarget(profile, history, iso) : null);
    const readiness =
      iso > todayIso || iso < firstIso
        ? null
        : computeReadinessScore({
            readinessLog: profile.readinessLog,
            history: history.filter((h) => h.date < iso),
            setFeedbackLog: profile.setFeedbackLog,
            painFlags: profile.painFlags,
            today: new Date(`${iso}T12:00:00`),
          }).total;
    return { iso, strain, target: target ? { low: target.low, high: target.high } : null, readiness };
  });
}

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
