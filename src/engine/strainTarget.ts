import type { AthleteProfile, SessionHistoryEntry, StrainTarget } from '../data/athlete/types';
import { computeAcwr } from './loadMetrics';
import { computeCompetitionDay } from './competition';
import { computeReadinessScore } from './readinessScore';
import { dayStrain, recommendedStrain } from './strain';

/**
 * Esfuerzo objetivo del día, fijado UNA vez por la mañana. Se calcula solo con lo que se sabía antes de entrenar (el
 * historial hasta ayer, el check-in de hoy y los avisos de dolor), así que da igual cuándo se abra la app: el objetivo
 * es el mismo antes y después de la sesión y se puede comparar con lo que hiciste.
 *
 * Sin check-in de hoy el objetivo sale "provisional": se rehace en cuanto lo hagas, y tras eso queda fijo.
 */

const RANGE_HALF_WIDTH = 10;
/** Si ayer fue un esfuerzo muy alto, hoy el centro baja un poco más (la carga acumulada ya pesa, esto es el dato fresco). */
const YESTERDAY_HIGH = 75;
const YESTERDAY_SHIFT = -4;
/** Tope del centro del rango según la fase de la competición: en el taper no se sube el esfuerzo aunque te sientas bien. */
const COMPETITION_CENTER_CAP: Record<string, number> = { taper: 55, activacion: 35, vispera: 20, post: 40 };

const LOAD_WORD = { baja: 'baja', optima: 'óptima', moderada: 'alta', alta: 'muy alta' } as const;

function isoAddDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** El objetivo de `todayIso` calculado con los datos de antes de entrenar. */
export function buildStrainTarget(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): StrainTarget {
  const reference = new Date(`${todayIso}T12:00:00`);
  const prior = history.filter((h) => h.date < todayIso);
  const hasCheckIn = (profile.readinessLog ?? []).some((c) => c.date === todayIso);

  const readiness = computeReadinessScore({
    readinessLog: profile.readinessLog,
    history: prior,
    setFeedbackLog: profile.setFeedbackLog,
    painFlags: profile.painFlags,
    today: reference,
  });
  const acwr = computeAcwr(prior, reference);
  const zone = acwr.acwr !== null && !acwr.coldStart ? acwr.zone : null;
  const yesterday = dayStrain(prior.find((h) => h.date === isoAddDays(todayIso, -1)));

  const base = recommendedStrain(readiness.total, zone);
  let center = (base.low + base.high) / 2;
  const reasons: string[] = [];

  if (readiness.total !== null) {
    reasons.push(hasCheckIn ? `Tu preparación hoy es ${readiness.total} %.` : `Preparación estimada en ${readiness.total} % (sin check-in de hoy).`);
  } else {
    reasons.push('Sin datos de preparación: parto de un día normal.');
  }
  if (zone) reasons.push(`Tu carga acumulada es ${LOAD_WORD[zone]}.`);
  if (yesterday === null) {
    reasons.push('Ayer no registraste sesión.');
  } else if (yesterday >= YESTERDAY_HIGH) {
    center += YESTERDAY_SHIFT;
    reasons.push(`Ayer fue un esfuerzo muy alto (${yesterday}): hoy se modera un poco.`);
  } else {
    reasons.push(`Ayer: esfuerzo ${yesterday}.`);
  }

  const comp = computeCompetitionDay(profile.goals, reference, profile.trainingDaysPerWeek);
  const cap = comp ? COMPETITION_CENTER_CAP[comp.phase] : undefined;
  if (comp && cap !== undefined && center > cap) {
    center = cap;
    reasons.push(`${comp.label}: el esfuerzo se mantiene bajo para llegar fresco a la competición.`);
  }

  const low = Math.max(0, Math.round(center - RANGE_HALF_WIDTH));
  const high = Math.min(100, Math.round(center + RANGE_HALF_WIDTH));
  return { low, high, readiness: readiness.total, yesterday, reasons, provisional: !hasCheckIn, setOn: todayIso };
}

/**
 * Devuelve el perfil con el objetivo de hoy fijado, o el mismo perfil si no hay nada que cambiar. Un objetivo
 * definitivo no se vuelve a tocar; uno provisional solo se rehace cuando aparece el check-in de hoy.
 */
export function ensureStrainTarget(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): AthleteProfile {
  const stored = profile.strainTargets?.[todayIso];
  const hasCheckIn = (profile.readinessLog ?? []).some((c) => c.date === todayIso);
  if (stored && (!stored.provisional || !hasCheckIn)) return profile;
  return { ...profile, strainTargets: { ...(profile.strainTargets ?? {}), [todayIso]: buildStrainTarget(profile, history, todayIso) } };
}
