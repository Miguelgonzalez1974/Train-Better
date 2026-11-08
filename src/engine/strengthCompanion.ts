import type { AthleteProfile, CompanionLogEntry, ProgramCompanion, StrengthProgram } from '../data/athlete/types';
import { addDaysIso } from './periodization';
import { TEMPORADA_TOTAL_WEEKS } from './strengthPrograms';

/**
 * Programa de fuerza que CONVIVE con el macro. El macro sigue mandando cada día y la sesión del programa se ofrece debajo
 * («¿quieres hacerla hoy?»). El programa avanza por sesiones hechas, no por fecha: si dices «hoy no», la sesión espera y se vuelve a
 * ofrecer mañana. Todo lo de aquí es puro: sin React, sin reloj propio (la fecha entra por parámetro) y sin almacenamiento.
 */

/** Lunes, miércoles y viernes. */
export const COMPANION_DEFAULT_WEEKDAYS = [0, 2, 4];

/** Los ciclos de halterofilia y Mayhem prescriben varios levantamientos por día y no encajan como complemento de una sola sesión. */
const UNSUPPORTED_METHODS = new Set<StrengthProgram['method']>(['haltero', 'mayhem-base', 'mayhem-tecnica', 'mayhem-pico']);

export function supportsCompanion(method: StrengthProgram['method']): boolean {
  return !UNSUPPORTED_METHODS.has(method);
}

export type CompanionProgram = StrengthProgram & { companion: ProgramCompanion };

export function isCompanionProgram(program: StrengthProgram): program is CompanionProgram {
  return program.companion !== undefined;
}

/** Día de la semana de una fecha ISO: 0 = lunes … 6 = domingo. */
export function weekdayOf(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

/** El estado inicial de un programa que convive con el macro. */
export function newCompanion(weekdays: number[] = COMPANION_DEFAULT_WEEKDAYS, weeks?: number): ProgramCompanion {
  const days = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  return { weekdays: days.length > 0 ? days : COMPANION_DEFAULT_WEEKDAYS, cursor: 0, deferrals: 0, ...(weeks ? { weeks } : {}) };
}

/** Cuántas semanas dura el programa; null = sin tope (sigue hasta su fecha de fin). */
export function companionWeeks(program: CompanionProgram): number | null {
  return program.method === 'temporada' ? TEMPORADA_TOTAL_WEEKS : (program.companion.weeks ?? null);
}

/** Cuántas sesiones tiene el programa entero; null = sin tope (sigue hasta su fecha de fin). */
export function companionTotalSessions(program: CompanionProgram): number | null {
  const weeks = companionWeeks(program);
  return weeks === null ? null : weeks * program.companion.weekdays.length;
}

/** Dónde cae la sesión número `index`: semana (0 = la primera), puesto dentro de la semana y la fecha «sintética» que usa el motor. */
export function companionPosition(program: CompanionProgram, index: number): { week: number; dayInWeek: number; syntheticDate: string } {
  const perWeek = program.companion.weekdays.length;
  const week = Math.floor(index / perWeek);
  return { week, dayInWeek: index % perWeek, syntheticDate: addDaysIso(program.startDate, week * 7) };
}

/** ¿Es una sesión de test (o de retest) del Bloque de Temporada? Esas no se saltan, solo se aplazan. */
export function isCompanionTestSession(program: CompanionProgram, index: number): boolean {
  if (program.method !== 'temporada') return false;
  const perWeek = program.companion.weekdays.length;
  return index < perWeek || index >= (TEMPORADA_TOTAL_WEEKS - 1) * perWeek;
}

/** La primera fecha en que toca la siguiente sesión: el primer día señalado de la semana después de la última sesión resuelta. */
export function companionDueDate(program: CompanionProgram): string {
  const anchor = program.companion.lastResolvedOn ?? addDaysIso(program.startDate, -1);
  let day = addDaysIso(anchor, 1);
  for (let i = 0; i < 8; i++) {
    if (program.companion.weekdays.includes(weekdayOf(day))) return day;
    day = addDaysIso(day, 1);
  }
  return day;
}

export type CompanionStatus =
  | { kind: 'no-empieza'; startDate: string }
  | { kind: 'terminado' }
  | { kind: 'hecha-hoy' }
  | { kind: 'pausado'; until: string }
  | { kind: 'aceptada'; index: number }
  | { kind: 'aplazada'; index: number; deferrals: number }
  /** Toca ofrecerla hoy. `late` = ya tocaba un día anterior y quedó pendiente. */
  | { kind: 'oferta'; index: number; late: boolean; deferrals: number }
  | { kind: 'espera'; dueDate: string };

/** En qué punto está el programa hoy: si toca ofrecer una sesión, si ya se aceptó o se aplazó, o si está en pausa o terminado. */
export function companionStatus(program: CompanionProgram, todayIso: string): CompanionStatus {
  const c = program.companion;
  const total = companionTotalSessions(program);
  if (todayIso < program.startDate) return { kind: 'no-empieza', startDate: program.startDate };
  if (todayIso > program.endDate || (total !== null && c.cursor >= total)) return { kind: 'terminado' };
  if (c.lastResolvedOn === todayIso) return { kind: 'hecha-hoy' };
  if (c.pausedUntil && c.pausedUntil >= todayIso) return { kind: 'pausado', until: c.pausedUntil };
  if (c.acceptedOn === todayIso) return { kind: 'aceptada', index: c.cursor };
  if (c.declinedOn === todayIso) return { kind: 'aplazada', index: c.cursor, deferrals: c.deferrals };
  const due = companionDueDate(program);
  if (todayIso >= due) return { kind: 'oferta', index: c.cursor, late: todayIso > due, deferrals: c.deferrals };
  return { kind: 'espera', dueDate: due };
}

function updateProgram(profile: AthleteProfile, programId: string, change: (p: CompanionProgram) => CompanionProgram): AthleteProfile {
  let found = false;
  const strengthPrograms = (profile.strengthPrograms ?? []).map((p) => {
    if (p.id !== programId || !isCompanionProgram(p)) return p;
    found = true;
    return change(p);
  });
  return found ? { ...profile, strengthPrograms } : profile;
}

/** «Hacerla hoy»: la sesión sale como parte del día. */
export function acceptCompanion(profile: AthleteProfile, programId: string, todayIso: string): AthleteProfile {
  return updateProgram(profile, programId, (p) => ({ ...p, companion: { ...p.companion, acceptedOn: todayIso, declinedOn: undefined } }));
}

/** Deshacer «hacerla hoy»: vuelve a ofrecerse. */
export function undoAcceptCompanion(profile: AthleteProfile, programId: string): AthleteProfile {
  return updateProgram(profile, programId, (p) => ({ ...p, companion: { ...p.companion, acceptedOn: undefined } }));
}

/** «Hoy no»: la sesión no se pierde, se vuelve a ofrecer mañana. */
export function declineCompanion(profile: AthleteProfile, programId: string, todayIso: string): AthleteProfile {
  return updateProgram(profile, programId, (p) =>
    p.companion.declinedOn === todayIso ? p : { ...p, companion: { ...p.companion, declinedOn: todayIso, acceptedOn: undefined, deferrals: p.companion.deferrals + 1 } },
  );
}

/** Deshacer «hoy no». */
export function undoDeclineCompanion(profile: AthleteProfile, programId: string, todayIso: string): AthleteProfile {
  return updateProgram(profile, programId, (p) =>
    p.companion.declinedOn !== todayIso ? p : { ...p, companion: { ...p.companion, declinedOn: undefined, deferrals: Math.max(0, p.companion.deferrals - 1) } },
  );
}

/** Pausa el programa `days` días a partir de hoy (hoy incluido): no se ofrece nada hasta pasada la pausa. */
export function pauseCompanion(profile: AthleteProfile, programId: string, todayIso: string, days: number): AthleteProfile {
  const until = addDaysIso(todayIso, Math.max(1, Math.round(days)) - 1);
  return updateProgram(profile, programId, (p) => ({ ...p, companion: { ...p.companion, pausedUntil: until, acceptedOn: undefined } }));
}

export function resumeCompanion(profile: AthleteProfile, programId: string): AthleteProfile {
  return updateProgram(profile, programId, (p) => ({ ...p, companion: { ...p.companion, pausedUntil: undefined } }));
}

export interface CompanionResult {
  label?: string;
  movementId?: string;
  loadKg?: number;
  rpe?: number;
  durationMin?: number;
}

function resolve(profile: AthleteProfile, programId: string, todayIso: string, outcome: CompanionLogEntry['outcome'], result: CompanionResult): AthleteProfile {
  const program = (profile.strengthPrograms ?? []).find((p) => p.id === programId);
  if (!program || !isCompanionProgram(program)) return profile;
  const index = program.companion.cursor;
  const entry: CompanionLogEntry = { id: `${programId}|${index}`, programId, index, date: todayIso, outcome, ...result };
  const next = updateProgram(profile, programId, (p) => ({
    ...p,
    companion: { ...p.companion, cursor: p.companion.cursor + 1, lastResolvedOn: todayIso, declinedOn: undefined, acceptedOn: undefined, deferrals: 0 },
  }));
  return { ...next, companionLog: [...(next.companionLog ?? []).filter((e) => e.id !== entry.id), entry] };
}

/** La sesión se ha hecho: el programa avanza a la siguiente y se apunta lo que salió. */
export function completeCompanion(profile: AthleteProfile, programId: string, todayIso: string, result: CompanionResult = {}): AthleteProfile {
  return resolve(profile, programId, todayIso, 'hecha', result);
}

/** «Saltar esta sesión»: el programa avanza sin hacerla. Las de test no se saltan (el llamador lo comprueba con `isCompanionTestSession`). */
export function skipCompanion(profile: AthleteProfile, programId: string, todayIso: string, label?: string): AthleteProfile {
  return resolve(profile, programId, todayIso, 'saltada', { label });
}

/** Cuántas sesiones se han hecho y se han saltado hasta ahora. */
export function companionCounts(profile: AthleteProfile, programId: string): { done: number; skipped: number } {
  const log = (profile.companionLog ?? []).filter((e) => e.programId === programId);
  return { done: log.filter((e) => e.outcome === 'hecha').length, skipped: log.filter((e) => e.outcome === 'saltada').length };
}
