import { describe, it, expect } from 'vitest';
import { generateSessionForDate, isCachedSessionStale, toHistoryEntry } from './generateSession';
import { resolveWeekLocks } from './weekLocks';
import { toLocalIsoDate } from './periodization';
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
