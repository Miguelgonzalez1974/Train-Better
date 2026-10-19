import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, DayLightInfo, PainFlag, ReadinessCheck, SessionHistoryEntry } from '../../data/athlete/types';
import { computeHrvStatus, hrvVsOf } from '../../engine/hrv';
import { checkFromCard, describeMorning, verdictFor, type CardAnswers, type MorningLine, type MorningVerdict } from '../../engine/morningCheckIn';
import { applyPainFollowUps, getActivePainFlags, prunePainFlags, type PainFollowUp } from '../../engine/painFlags';
import { getReadinessCheckForDate, getReadinessFactor } from '../../engine/readiness';
import { computeReadinessScore } from '../../engine/readinessScore';
import { ensureStrainTarget } from '../../engine/strainTarget';
import { refreshTodaySession, resolveTodaySession } from '../dashboard/todaySession';

export interface MorningResult {
  /** El semáforo de hoy (null en descanso o si aún no hay nota de preparación). */
  light: DayLightInfo | null;
  /** Cómo llegas a entrenar, en una frase (null si ya entrenaste hoy o aún no hay nota). */
  verdict: MorningVerdict | null;
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
  // Dónde cae tu HRV frente a tu rango: se guarda con el check-in para que el factor de carga y lo que aprende el coach la lean.
  const hrvVs = hrvVsOf(computeHrvStatus([...(before.readinessLog ?? []).filter((c) => c.date !== todayIso), check], todayIso));
  if (hrvVs) check.hrvVs = hrvVs;
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
  const score = computeReadinessScore({ readinessLog: profile.readinessLog, history, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: new Date(`${todayIso}T12:00:00`) });
  const stored = profile.strainTargets?.[todayIso];
  const dayLight = session?.dayLight ?? null;
  // En un día verde solo hay permiso para apretar fuera de descarga y lejos de una competición (como en el motor).
  const lightInfo = dayLight ? { color: dayLight.color, push: !session?.competition && session?.mesocycleWeek !== 4 } : null;
  const { changes, notes } = describeMorning({
    check,
    day,
    hasAccessory: Boolean(session?.blocks.some((b) => b.block === 'accessory')),
    factor: getReadinessFactor(check).factor,
    flags,
    hrv: score.hrv,
    rest: score.rest,
    light: lightInfo,
  });
  const hrvLow = check.hrvVs === 'bajo' || score.hrv.hrPenalty > 0;
  return { light: dayLight, verdict: verdictFor({ level: score.level, day, hrvLow, light: dayLight?.color ?? null }), readiness: score.total, target: day === 'training' && stored ? { low: stored.low, high: stored.high } : null, day, changes, notes };
}
