import { athleteRepository } from '../../data/athlete/athleteRepository';
import type { AthleteProfile, DayLightInfo, PainFlag, ReadinessCheck, SessionHistoryEntry } from '../../data/athlete/types';
import { computeHrvStatus, hrvLogWith, hrvVsOf } from '../../engine/hrv';
import { checkFromCard, describeMorning, type CardAnswers, type MorningDescribeInput, type MorningLine } from '../../engine/morningCheckIn';
import { simulacroDateFor } from '../../engine/competition';
import { computeReadinessLearning, learnedScoreShift, type LearnedShift } from '../../engine/readinessLearning';
import { assessSimulacro, resolveCompetitionDay } from '../../engine/taperPlan';
import { applyPainFollowUps, getActivePainFlags, prunePainFlags, type PainFollowUp } from '../../engine/painFlags';
import { getReadinessCheckForDate, getReadinessFactor } from '../../engine/readiness';
import { readinessAt } from '../../engine/readinessAt';
import { resolveDayLight } from '../../engine/dayLight';
import { ensureStrainTarget } from '../../engine/strainTarget';
import { refreshTodaySession, resolveTodaySession } from '../dashboard/todaySession';

export interface MorningResult {
  /** El semáforo de hoy (null en descanso o si aún no hay nota de preparación). */
  light: DayLightInfo | null;
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
  const activeBefore = getActivePainFlags(before.painFlags, todayIso);

  const painFlags = applyPainFollowUps(prunePainFlags(before.painFlags, todayIso), followUps, todayIso);
  if (JSON.stringify(painFlags) !== JSON.stringify(before.painFlags ?? [])) athleteRepository.saveProfile({ ...before, painFlags });

  const { check, learned } = buildCheck(answers, before, history, todayIso);
  athleteRepository.saveReadinessCheck(check);

  // El objetivo provisional se rehace con el check-in y queda fijo; la sesión de hoy se recalcula con todo lo nuevo.
  const fresh = athleteRepository.getProfile();
  // La carga cuenta también el programa de fuerza que convive con el macro, igual que en el Dashboard y en Planificación.
  const next = ensureStrainTarget(fresh, history, todayIso);
  if (next !== fresh) athleteRepository.saveProfile(next);
  refreshTodaySession(next, history, todayIso);

  return buildResult(athleteRepository.getProfile(), history, todayIso, check, activeBefore.map((flag) => ({ flag, answer: followUps[flag.id] ?? null })), learned);
}

/**
 * El check-in que sale de las respuestas, con lo que se calcula de ellas: dónde cae tu HRV frente a tu rango (se guarda para que el factor
 * de carga y el coach la lean) y el ajuste personal de lo que has aprendido de ti. Si no tocaste los hábitos hoy, se conservan los que ya había.
 */
function buildCheck(answers: CardAnswers, before: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): { check: ReadinessCheck; learned: LearnedShift } {
  const previous = getReadinessCheckForDate(before.readinessLog, todayIso);
  const check: ReadinessCheck = { ...checkFromCard(todayIso, answers), ...(answers.habits === undefined && previous?.habits ? { habits: previous.habits } : {}) };
  const hrvVs = hrvVsOf(computeHrvStatus(hrvLogWith([...(before.readinessLog ?? []).filter((c) => c.date !== todayIso), check], before.hrvHistory), todayIso));
  if (hrvVs) check.hrvVs = hrvVs;
  // Pesos aprendidos de ti (con datos suficientes): lo que hoy está en contra y a ti te cuesta mucho cuenta doble, y lo que apenas te afecta no cuenta.
  const learned = learnedScoreShift(check, computeReadinessLearning((before.readinessLog ?? []).filter((c) => c.date !== todayIso), history));
  if (learned.shift !== 0) check.learnedShift = learned.shift;
  return { check, learned };
}

export interface MorningPreview {
  /** La preparación de hoy con lo que llevas contado (null si aún no hay con qué calcularla). */
  readiness: number | null;
  /** El semáforo con lo que llevas contado (null sin respuestas). */
  light: DayLightInfo | null;
}

/**
 * Cómo quedaría el día con lo que llevas contado en la tarjeta, sin guardar nada: es lo que enseña la barra de arriba mientras respondes.
 * Usa los mismos cálculos que al guardar (salvo las respuestas a los avisos de molestia, que solo cuentan al guardar).
 */
export function previewMorning(answers: CardAnswers, history: SessionHistoryEntry[], todayIso: string): MorningPreview {
  const before = athleteRepository.getProfile();
  const { check } = buildCheck(answers, before, history, todayIso);
  const draft: AthleteProfile = { ...before, readinessLog: [...(before.readinessLog ?? []).filter((c) => c.date !== todayIso), check] };
  const date = new Date(`${todayIso}T12:00:00`);
  // La misma preparación que enseña el Dashboard (una sola función: `readinessAt`).
  const score = readinessAt(draft, history, date);
  return { readiness: score.total, light: resolveDayLight(draft, history, date, check, resolveCompetitionDay(draft, history, date)) };
}

function buildResult(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  todayIso: string,
  check: ReadinessCheck,
  flags: { flag: PainFlag; answer: PainFollowUp | null }[],
  learned: LearnedShift,
): MorningResult {
  const trained = history.some((h) => h.date === todayIso);
  const session = trained ? null : resolveTodaySession(profile, history, todayIso);
  const day: MorningResult['day'] = trained ? 'trained' : session && !session.isRestDay ? 'training' : 'rest';
  const score = readinessAt(profile, history, new Date(`${todayIso}T12:00:00`));
  const stored = profile.strainTargets?.[todayIso];
  // Simulacro de la competición: hoy es el día (hay que medir antes y mañana) o fue ayer (se enseña cómo respondiste).
  const comp = resolveCompetitionDay(profile, history, new Date(`${todayIso}T12:00:00`));
  const yesterdayIso = new Date(`${todayIso}T12:00:00`);
  yesterdayIso.setDate(yesterdayIso.getDate() - 1);
  const yIso = `${yesterdayIso.getFullYear()}-${String(yesterdayIso.getMonth() + 1).padStart(2, '0')}-${String(yesterdayIso.getDate()).padStart(2, '0')}`;
  const simulacroIso = comp ? simulacroDateFor(comp.eventStart, profile.trainingDaysPerWeek) : null;
  const simulacro: MorningDescribeInput['simulacro'] = comp?.simulacro
    ? { when: 'hoy' }
    : simulacroIso !== null && simulacroIso === yIso
      ? { when: 'ayer', result: assessSimulacro(profile.readinessLog, simulacroIso) }
      : null;
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
    simulacro,
    learned,
    soreStrengthCut: Boolean(session?.soreStrengthCut),
  });
  return { light: dayLight, readiness: score.total, target: day === 'training' && stored ? { low: stored.low, high: stored.high } : null, day, changes, notes };
}
