import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, PainFlag, ReadinessCheck, SessionHistoryEntry } from '../../data/athlete/types';
import { checkFromCard, describeMorning, restingHrBaseline, type CardAnswers, type MorningLine } from '../../engine/morningCheckIn';
import { applyPainFollowUps, getActivePainFlags, prunePainFlags, type PainFollowUp } from '../../engine/painFlags';
import { getReadinessCheckForDate, getReadinessFactor } from '../../engine/readiness';
import { computeReadinessScore } from '../../engine/readinessScore';
import { ensureStrainTarget } from '../../engine/strainTarget';
import { refreshTodaySession, resolveTodaySession } from '../dashboard/todaySession';

export interface MorningResult {
  /** Nota de preparación de hoy con lo que acabas de contar (null si aún no hay datos para calcularla). */
  readiness: number | null;
  /** Objetivo de esfuerzo de hoy; null en días de descanso o si ya entrenaste. */
  target: { low: number; high: number } | null;
  day: 'training' | 'rest' | 'trained';
  changes: MorningLine[];
  notes: MorningLine[];
}

/**
 * Guarda la tarjeta de la mañana: aplica lo contestado a los avisos de molestia, guarda el check-in (conservando los hábitos
 * anotados antes), fija el objetivo de esfuerzo de hoy con él y rehace la sesión de hoy (nueva energía, agujetas, avisos).
 * Devuelve lo que enseña la pantalla final: nota, objetivo y la lista de lo que cambia hoy.
 */
export function commitMorning(
  answers: CardAnswers,
  followUps: Record<string, PainFollowUp>,
  history: SessionHistoryEntry[],
  todayIso: string,
): MorningResult {
  const before = athleteRepository.getProfile();
  const previous = getReadinessCheckForDate(before.readinessLog, todayIso);
  const activeBefore = getActivePainFlags(before.painFlags, todayIso);

  const painFlags = applyPainFollowUps(prunePainFlags(before.painFlags, todayIso), followUps, todayIso);
  if (JSON.stringify(painFlags) !== JSON.stringify(before.painFlags ?? [])) athleteRepository.saveProfile({ ...before, painFlags });

  const check: ReadinessCheck = { ...checkFromCard(todayIso, answers), ...(previous?.habits ? { habits: previous.habits } : {}) };
  athleteRepository.saveReadinessCheck(check);

  // El objetivo provisional se rehace con el check-in y queda fijo; la sesión de hoy se recalcula con todo lo nuevo.
  const fresh = athleteRepository.getProfile();
  const next = ensureStrainTarget(fresh, history, todayIso);
  if (next !== fresh) athleteRepository.saveProfile(next);
  refreshTodaySession(next, history, todayIso);

  return buildResult(athleteRepository.getProfile(), history, todayIso, check, activeBefore.map((flag) => ({ flag, answer: followUps[flag.id] ?? null })));
}

function buildResult(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  todayIso: string,
  check: ReadinessCheck,
  flags: { flag: PainFlag; answer: PainFollowUp | null }[],
): MorningResult {
  const trained = history.some((h) => h.date === todayIso);
  const session = trained ? null : resolveTodaySession(profile, history, todayIso);
  const day: MorningResult['day'] = trained ? 'trained' : session && !session.isRestDay ? 'training' : 'rest';
  const readiness = computeReadinessScore({ readinessLog: profile.readinessLog, history, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: new Date(`${todayIso}T12:00:00`) }).total;
  const stored = profile.strainTargets?.[todayIso];
  const { changes, notes } = describeMorning({
    check,
    day,
    hasAccessory: Boolean(session?.blocks.some((b) => b.block === 'accessory')),
    factor: getReadinessFactor(check).factor,
    flags,
    restingHrBaseline: restingHrBaseline(profile.readinessLog, todayIso),
  });
  return { readiness, target: day === 'training' && stored ? { low: stored.low, high: stored.high } : null, day, changes, notes };
}
