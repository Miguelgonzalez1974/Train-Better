import type { AthleteProfile, LevelTestKey, LevelTestPostpone, SessionHistoryEntry } from '../data/athlete/types';
import { scaledTestResults, testResults, testTargets, testDateText, timeText, TEST_LABEL } from './levelReference';
import { addDaysIso, isoDiffDays } from './periodization';

/**
 * Los tests de «Tu nivel» que programa el coach: Fran, remo 2 km y carrera 5 km, uno cada 4 semanas y rotando (cada uno se repite a las 12).
 * Cada hueco de 4 semanas empieza en lunes; el test sale ese lunes en lugar del WOD de referencia. Si ese día no toca (competición cerca, vuelta
 * tras un parón, preparación baja, molestia o porque lo aplazas), se vuelve a ofrecer el lunes siguiente mientras quede hueco; si no, espera al
 * siguiente turno. No guarda estado: sale de la fecha, de tus resultados y de los lunes que hayas aplazado. Puro.
 */
export const TEST_ROTATION: LevelTestKey[] = ['fran', 'row2k', 'run5k'];
/** El primer lunes del calendario de tests. */
export const TEST_PLAN_ANCHOR = '2026-11-30';
export const TEST_SLOT_DAYS = 28;
/** Un resultado hecho por tu cuenta hasta dos semanas antes del hueco ya vale: no se te vuelve a pedir. */
export const TEST_EARLY_DAYS = 14;
/** Con cuántos días de antelación se avisa. */
export const TEST_NOTICE_DAYS = 7;

/** El WOD de referencia de cada test (`data/movements/benchmarkWods.ts`). */
export const TEST_WOD_ID: Record<LevelTestKey, string> = { fran: 'fran', row2k: '2k-row', run5k: '5k-run' };

export const POSTPONE_TEXT: Record<LevelTestPostpone, string> = {
  tu: 'lo has pedido',
  competicion: 'tienes la competición cerca',
  rampa: 'estás volviendo tras un parón',
  descarga: 'toca descargar',
  preparacion: 'llegas con la preparación baja',
  maximo: 'ese día ya hay un test de máximos',
  molestia: 'tienes una molestia que lo desaconseja',
};

export const testName = (key: LevelTestKey) => TEST_LABEL[key];

export const testPlanEnabled = (profile: AthleteProfile) => profile.testPlan?.enabled !== false;

export interface TestSlot {
  key: LevelTestKey;
  /** El lunes en que empieza el hueco. */
  start: string;
  index: number;
}

/** El hueco de 4 semanas en el que cae una fecha; null antes del primero. */
export function testSlotOf(dateIso: string): TestSlot | null {
  const days = isoDiffDays(TEST_PLAN_ANCHOR, dateIso);
  if (days < 0) return null;
  return slotAt(Math.floor(days / TEST_SLOT_DAYS));
}

function slotAt(index: number): TestSlot {
  return { key: TEST_ROTATION[index % TEST_ROTATION.length], start: addDaysIso(TEST_PLAN_ANCHOR, index * TEST_SLOT_DAYS), index };
}

/** El test de ese hueco ya está hecho (en Rx o escalado) antes de `beforeIso`. */
function slotDone(profile: AthleteProfile, history: SessionHistoryEntry[], slot: TestSlot, beforeIso: string): boolean {
  const from = addDaysIso(slot.start, -TEST_EARLY_DAYS);
  const dates = [...testResults(profile, history, slot.key), ...scaledTestResults(profile, history, slot.key)].map((r) => r.date);
  return dates.some((d) => d >= from && d < beforeIso);
}

const isMonday = (dateIso: string) => isoDiffDays(TEST_PLAN_ANCHOR, dateIso) % 7 === 0;

/** El test que correspondería a ese día (un lunes con el hueco pendiente), sin mirar si has podido aplazarlo o si el día lo permite. */
export function testCandidate(profile: AthleteProfile, history: SessionHistoryEntry[], dateIso: string): TestSlot | null {
  if (!testPlanEnabled(profile) || !isMonday(dateIso)) return null;
  const slot = testSlotOf(dateIso);
  if (!slot || slotDone(profile, history, slot, dateIso)) return null;
  return slot;
}

export const testSkippedByAthlete = (profile: AthleteProfile, dateIso: string) => (profile.testPlan?.skipped ?? []).includes(dateIso);

export interface UpcomingTest {
  key: LevelTestKey;
  date: string;
}

/** Los próximos tests desde hoy (hoy incluido), contando lo ya hecho y lo que has aplazado. Lo que el coach aplace por tu estado se sabrá ese día. */
export function upcomingTests(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string, count = 3): UpcomingTest[] {
  if (!testPlanEnabled(profile)) return [];
  const out: UpcomingTest[] = [];
  const first = testSlotOf(todayIso)?.index ?? 0;
  const doneToday = [...history].some((e) => e.date === todayIso);
  for (let index = first; out.length < count && index < first + count + 6; index++) {
    const slot = slotAt(index);
    if (slotDone(profile, history, slot, addDaysIso(todayIso, 1))) continue;
    for (let week = 0; week < TEST_SLOT_DAYS / 7; week++) {
      const date = addDaysIso(slot.start, week * 7);
      if (date < todayIso || (date === todayIso && doneToday) || testSkippedByAthlete(profile, date)) continue;
      out.push({ key: slot.key, date });
      break;
    }
  }
  return out;
}

/** El siguiente turno del mismo test después de una fecha (12 semanas más tarde). */
export function nextTestOfSameKind(dateIso: string): string | null {
  const slot = testSlotOf(dateIso);
  return slot ? slotAt(slot.index + TEST_ROTATION.length).start : null;
}

/** El aviso previo: el próximo test si cae dentro de la semana que viene (sin contar hoy). */
export function testNotice(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): (UpcomingTest & { inDays: number }) | null {
  const next = upcomingTests(profile, history, todayIso, 1)[0];
  if (!next) return null;
  const inDays = isoDiffDays(todayIso, next.date);
  return inDays >= 1 && inDays <= TEST_NOTICE_DAYS ? { ...next, inDays } : null;
}

/** Lo que se hace en cada test, con su Rx. */
export const TEST_PRESCRIPTION: Record<LevelTestKey, string> = {
  fran: '21-15-9 thruster (43 kg) y pull-up, por tiempo.',
  row2k: '2000 m de remo, por tiempo.',
  run5k: '5 km corriendo, por tiempo.',
};

export interface TestBriefing {
  key: LevelTestKey;
  name: string;
  prescription: string;
  /** Los tiempos que piden los dos primeros escalones («8:08 o menos»); vacío sin referencia o sin año de nacimiento. */
  targets: { zone: string; seconds: number }[];
  /** Tu último resultado anterior a ese día. */
  previous: { date: string; seconds: number } | null;
}

export function testBriefing(profile: AthleteProfile, history: SessionHistoryEntry[], key: LevelTestKey, dateIso: string): TestBriefing {
  const age = profile.birthYear ? Number(dateIso.slice(0, 4)) - profile.birthYear : null;
  const previous = testResults(profile, history, key).find((r) => r.date < dateIso) ?? null;
  return {
    key,
    name: testName(key),
    prescription: TEST_PRESCRIPTION[key],
    targets: testTargets(key, age),
    previous: previous ? { date: previous.date, seconds: previous.seconds } : null,
  };
}

/** La nota del WOD de un test: qué es, a qué apuntar y por qué va primero. */
export function testNote(brief: TestBriefing): string {
  const targets = brief.targets.map((t) => `${t.zone}: ${timeText(t.seconds)} o menos`).join(' · ');
  const previous = brief.previous ? ` Tu marca anterior: ${timeText(brief.previous.seconds)} (${testDateText(brief.previous.date)}).` : ' Aún no tienes marca: será tu punto de partida.';
  return `Test de nivel: ${brief.name} — ${brief.prescription}${targets ? ` Para ${targets}.` : ''}${previous} Hazlo antes de la fuerza, que hoy va ligera, y apunta el tiempo tal cual salga.`;
}

/** Aplazar un lunes: se guarda la fecha y el hueco lo vuelve a ofrecer la semana siguiente. */
export function withTestSkipped(profile: AthleteProfile, dateIso: string): AthleteProfile {
  const skipped = [...new Set([...(profile.testPlan?.skipped ?? []), dateIso])].sort().slice(-30);
  return { ...profile, testPlan: { ...profile.testPlan, skipped } };
}
