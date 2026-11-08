import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { generateCompanionSession } from './generateSession';
import { companionTotalSessions, type CompanionProgram } from './strengthCompanion';

/**
 * «Cómo queda cada semana»: todas las sesiones de un programa que convive con el macro, semana a semana, con su levantamiento, esquema
 * y carga. Se calcula sin autorregulación de hoy (el plan tal cual, con tus PR de ahora), para poder ver el programa entero antes de
 * empezarlo y compararlo con cómo avanza. Cada sesión sale del mismo cálculo que la que se ofrece cada día.
 */

export type ScheduleState = 'hecha' | 'saltada' | 'siguiente' | 'pendiente';

export interface ScheduleSession {
  index: number;
  /** Día de la semana en que toca (0 = lunes … 6 = domingo). */
  weekday: number;
  /** «Texas Method · día de volumen». */
  role: string;
  movementName: string;
  /** «5×5» o «test». */
  scheme: string;
  loadKg: number;
  /** Carga como % del PR del levantamiento (null si no se puede calcular). */
  percent: number | null;
  isTest: boolean;
  state: ScheduleState;
}

export interface ScheduleWeek {
  week: number;
  sessions: ScheduleSession[];
}

/** Las semanas del programa. Si no tiene tope de semanas, enseña `fallbackWeeks` (por defecto 8). */
export function companionSchedule(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  program: CompanionProgram,
  todayIso: string,
  fallbackWeeks = 8,
): ScheduleWeek[] {
  const perWeek = program.companion.weekdays.length;
  const total = companionTotalSessions(program) ?? perWeek * fallbackWeeks;
  const log = new Map((profile.companionLog ?? []).filter((e) => e.programId === program.id).map((e) => [e.index, e.outcome]));
  const weeks: ScheduleWeek[] = [];
  for (let i = 0; i < total; i++) {
    const plan = generateCompanionSession(profile, history, { ...program, companion: { ...program.companion, cursor: i } }, todayIso, { neutral: true });
    if (!plan) continue;
    const week = Math.floor(i / perWeek) + 1;
    if (!weeks.some((w) => w.week === week)) weeks.push({ week, sessions: [] });
    const pr = profile.prs[plan.prKey];
    const done = log.get(i);
    weeks[weeks.length - 1].sessions.push({
      index: i,
      weekday: program.companion.weekdays[i % perWeek],
      role: plan.role,
      movementName: getMovementById(plan.movementId)?.name ?? plan.movementId,
      scheme: plan.isTest ? 'test' : `${plan.sets}×${plan.reps}`,
      loadKg: plan.loadKg,
      percent: pr > 0 ? Math.round((plan.loadKg / pr) * 100) : null,
      isTest: plan.isTest,
      state: done ?? (i < program.companion.cursor ? 'saltada' : i === program.companion.cursor ? 'siguiente' : 'pendiente'),
    });
  }
  return weeks;
}
