import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { generateCompanionSession } from './generateSession';
import { addDaysIso } from './periodization';
import { companionDueDate, companionTotalSessions, weekdayOf, type CompanionProgram } from './strengthCompanion';

/**
 * Qué sesión del programa toca un día futuro (o hoy), para enseñarla al tocar ese día: la que sigue a la que va por delante y, desde ahí, una por cada día del
 * programa (lunes, miércoles y viernes). Es una PREVISIÓN: el programa avanza por sesiones hechas, no por fecha, así que si aplazas una, las siguientes se corren.
 * null si ese día no toca nada (o el programa no ha empezado, ya terminó o está en pausa).
 */
export function companionIndexForDate(program: CompanionProgram, dateIso: string, todayIso: string): number | null {
  if (dateIso < program.startDate || dateIso > program.endDate || dateIso < todayIso) return null;
  const c = program.companion;
  const total = companionTotalSessions(program);
  // La primera fecha posible: la que le toca (o hoy, si ya tocaba antes y está pendiente); mañana si hoy la aplazaste; tras la pausa si la hay.
  let day = companionDueDate(program);
  if (day < todayIso) day = todayIso;
  if (c.declinedOn === todayIso && day === todayIso) day = addDaysIso(todayIso, 1);
  if (c.pausedUntil && day <= c.pausedUntil) day = addDaysIso(c.pausedUntil, 1);
  let index = c.cursor;
  for (let i = 0; i < 150; i++) {
    if (total !== null && index >= total) return null;
    if (day === dateIso) return index;
    if (day > dateIso) return null;
    let next = addDaysIso(day, 1);
    for (let k = 0; k < 8 && !c.weekdays.includes(weekdayOf(next)); k++) next = addDaysIso(next, 1);
    day = next;
    index++;
  }
  return null;
}

/**
 * «Cómo queda cada semana»: todas las sesiones de un programa que convive con el macro, semana a semana, con su levantamiento, esquema
 * y carga. Se calcula sin autorregulación de hoy (el plan tal cual, con tus PR de ahora), para poder ver el programa entero antes de
 * empezarlo y compararlo con cómo avanza. En el Texas Method se da por logrado cada viernes que falta, para enseñar la progresión.
 * Cada sesión sale del mismo cálculo que la que se ofrece cada día.
 */

export type ScheduleState = 'hecha' | 'saltada' | 'siguiente' | 'pendiente';

export interface ScheduleLine {
  movementName: string;
  /** «5×5», «1×5» o «test». */
  scheme: string;
  loadKg: number;
  /** Carga como % del PR (1RM) del levantamiento; null en el Texas (donde la referencia es el 5RM) y en los tests. */
  percent: number | null;
  /** Marca a batir (Texas, viernes). */
  attempt: boolean;
}

export interface ScheduleSession {
  index: number;
  /** Día de la semana en que toca (0 = lunes … 6 = domingo). */
  weekday: number;
  /** «Texas Method · día de volumen». */
  role: string;
  lines: ScheduleLine[];
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
    const plan = generateCompanionSession(profile, history, { ...program, companion: { ...program.companion, cursor: i } }, todayIso, {
      neutral: true,
      projectFrom: program.companion.cursor,
    });
    if (!plan) continue;
    const week = Math.floor(i / perWeek) + 1;
    if (!weeks.some((w) => w.week === week)) weeks.push({ week, sessions: [] });
    const done = log.get(i);
    weeks[weeks.length - 1].sessions.push({
      index: i,
      weekday: program.companion.weekdays[i % perWeek],
      role: plan.role,
      lines: plan.lifts.map((l) => {
        const pr = profile.prs[l.prKey];
        return {
          movementName: getMovementById(l.movementId)?.name ?? l.movementId,
          scheme: plan.isTest ? 'test' : `${l.sets}×${l.reps}`,
          loadKg: l.loadKg,
          percent: program.method === 'texas' || plan.isTest || pr <= 0 ? null : Math.round((l.loadKg / pr) * 100),
          attempt: l.attempt,
        };
      }),
      isTest: plan.isTest,
      state: done ?? (i < program.companion.cursor ? 'saltada' : i === program.companion.cursor ? 'siguiente' : 'pendiente'),
    });
  }
  return weeks;
}