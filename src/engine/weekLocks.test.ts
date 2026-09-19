import { describe, it, expect } from 'vitest';
import { generateSessionForDate, isCachedSessionStale, toHistoryEntry } from './generateSession';
import { resolveWeekLocks } from './weekLocks';
import { toLocalIsoDate } from './periodization';
import { historyStamp } from '../data/athlete/historyStamp';
import { makeProfile, consecutiveDates } from './__fixtures';
import { SESSION_GEN_VERSION, type AthleteProfile, type DailySession, type SessionHistoryEntry } from '../data/athlete/types';

const START = '2026-01-05'; // lunes, semana 1 del macro fixture
const [MON, TUE, WED, , FRI] = consecutiveDates(START, 5);
const iso = toLocalIsoDate;

/** Semana ya planificada el lunes y con el lunes entrenado; el martes se pierde. */
function weekWithMissedTuesday() {
  const base = makeProfile({ trainingDaysPerWeek: 6 });
  const planned = resolveWeekLocks(base, [], base.goals, iso(MON), MON);
  const monday = generateSessionForDate(planned, [], MON, base.goals);
  const history: SessionHistoryEntry[] = [toHistoryEntry(monday, 'rx', 7, 60)];
  return { base, planned, history };
}

describe('cache vs historial: un dia futuro cacheado se regenera cuando el historial cambia', () => {
  const entryOn = (date: string): SessionHistoryEntry => ({
    date,
    mesocycleWeek: 1,
    movementIds: [],
    rxOrScaled: 'rx',
    rpe: 9,
    durationMin: 60,
  });
  const base = makeProfile({ trainingDaysPerWeek: 6 });
  const cachedFor = (history: SessionHistoryEntry[]): DailySession => ({
    ...generateSessionForDate(base, history, WED, base.goals),
    genVersion: SESSION_GEN_VERSION,
    genHistoryStamp: historyStamp(history),
  });

  it('historyStamp cambia con la fecha de la ultima sesion y con el numero de sesiones', () => {
    expect(historyStamp([])).toBe('#0');
    expect(historyStamp([entryOn('2026-01-05')])).toBe('2026-01-05#1');
    expect(historyStamp([entryOn('2026-01-05'), entryOn('2026-01-06')])).toBe('2026-01-06#2');
  });

  it('con el mismo historial no esta vieja; al registrar una sesion anterior al dia, si', () => {
    const before = [entryOn(iso(MON))];
    const session = cachedFor(before);
    expect(isCachedSessionStale(session, undefined, before)).toBe(false);
    expect(isCachedSessionStale(session, undefined, [...before, entryOn(iso(TUE))])).toBe(true);
  });

  it('una sesion retroactiva (fecha anterior a la ultima) tambien la deja vieja', () => {
    const before = [entryOn(iso(TUE))];
    const session = cachedFor(before);
    expect(isCachedSessionStale(session, undefined, [entryOn(iso(MON)), ...before])).toBe(true);
  });

  it('un dia ya entrenado o anterior a la ultima sesion registrada no se regenera por esto', () => {
    const session = { ...cachedFor([]), genHistoryStamp: '#0' };
    expect(isCachedSessionStale(session, undefined, [entryOn(iso(WED))])).toBe(false);
    expect(isCachedSessionStale(session, undefined, [entryOn(iso(FRI))])).toBe(false);
  });

  it('editada a mano o sin huella (cacheada antigua) nunca se considera vieja por esto', () => {
    const hist = [entryOn(iso(MON))];
    const session = cachedFor([]);
    expect(isCachedSessionStale({ ...session, editedByAthlete: true }, undefined, hist)).toBe(false);
    const { genHistoryStamp: _omit, ...noStamp } = session;
    expect(isCachedSessionStale(noStamp as DailySession, undefined, hist)).toBe(false);
  });
});

describe('resolveWeekLocks', () => {
  it('planifica la semana entera y estampa plannedOn', () => {
    const { planned } = weekWithMissedTuesday();
    const locks = Object.entries(planned.weeklyLocks ?? {});
    expect(locks.length).toBeGreaterThan(3);
    for (const [, l] of locks) expect(l.plannedOn).toBe(iso(MON));
  });

  it('un dia perdido tras planificar re-planifica los dias que quedan, y es idempotente', () => {
    const { base, planned, history } = weekWithMissedTuesday();
    expect(planned.weeklyLocks?.[iso(TUE)], 'el martes deberia estar bloqueado').toBeDefined();

    const replanned = resolveWeekLocks(planned, history, base.goals, iso(WED), WED);
    expect(replanned).not.toBe(planned);
    expect(replanned.weeklyLocks?.[iso(WED)]?.plannedOn).toBe(iso(WED));
    expect(replanned.weeklyLocks?.[iso(FRI)]?.plannedOn).toBe(iso(WED));
    // Lo pasado no se toca.
    expect(replanned.weeklyLocks?.[iso(MON)]).toEqual(planned.weeklyLocks?.[iso(MON)]);
    expect(replanned.weeklyLocks?.[iso(TUE)]).toEqual(planned.weeklyLocks?.[iso(TUE)]);

    // Segunda llamada el mismo dia: nada que hacer.
    expect(resolveWeekLocks(replanned, history, base.goals, iso(WED), WED)).toBe(replanned);
  });

  it('sin dias perdidos no re-planifica', () => {
    const { base, planned, history } = weekWithMissedTuesday();
    const tuesday = generateSessionForDate(planned, history, TUE, base.goals);
    const both = [...history, toHistoryEntry(tuesday, 'rx', 7, 60)];
    expect(resolveWeekLocks(planned, both, base.goals, iso(WED), WED)).toBe(planned);
  });

  it('los dias editados a mano no se re-deciden ni pierden su bloqueo', () => {
    const { base, planned, history } = weekWithMissedTuesday();
    const friday = generateSessionForDate(planned, history, FRI, base.goals);
    const edited: DailySession = { ...friday, editedByAthlete: true };
    const withEdit: AthleteProfile = { ...planned, sessionCache: { [iso(FRI)]: edited } };

    const replanned = resolveWeekLocks(withEdit, history, base.goals, iso(WED), WED);
    expect(replanned.weeklyLocks?.[iso(FRI)]).toEqual(planned.weeklyLocks?.[iso(FRI)]);
    expect(replanned.weeklyLocks?.[iso(FRI)]?.plannedOn).toBe(iso(MON));
  });

  it('solo re-planifica la semana en curso: mirar una semana pasada no la toca', () => {
    const { base, planned, history } = weekWithMissedTuesday();
    const nextWeekToday = consecutiveDates(START, 9)[8];
    expect(resolveWeekLocks(planned, history, base.goals, iso(WED), nextWeekToday)).toBe(planned);
  });

  it('la cache que contradice al bloqueo vigente se considera vieja; la editada o coincidente, no', () => {
    const { base, planned } = weekWithMissedTuesday();
    // `saveCachedSession` estampa la version del motor al cachear; aqui se hace a mano.
    const session = { ...generateSessionForDate(planned, [], FRI, base.goals), genVersion: SESSION_GEN_VERSION };
    const lock = planned.weeklyLocks![iso(FRI)];
    expect(isCachedSessionStale(session, lock)).toBe(false);

    const other = { ...lock, strengthMovementId: 'definitely-not-the-cached-one' };
    expect(isCachedSessionStale(session, other)).toBe(true);
    expect(isCachedSessionStale({ ...session, editedByAthlete: true }, other)).toBe(false);
  });
});
