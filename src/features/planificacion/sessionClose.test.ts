import { describe, expect, it } from 'vitest';
import { generateSessionForDate } from '../../engine/generateSession';
import { consecutiveDates, makeMacro, makeProfile } from '../../engine/__fixtures';
import { getWodParts } from '../../engine/wodScoring';
import type { SessionBlockResult } from '../../data/athlete/types';
import { buildClosedEntry, liftRpeEntry } from './sessionClose';

const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'a' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
const sessions = consecutiveDates('2026-01-12', 28)
  .map((d) => generateSessionForDate(profile, [], d, profile.goals))
  .filter((s) => !s.isRestDay);
const base = { prs: profile.prs, rxOrScaled: 'rx' as const, rpe: 7, durationMin: 60, wodResults: {} };

describe('cerrar una sesión (hoy o un día pasado)', () => {
  const session = sessions.find((s) => s.blocks.some((b) => b.block === 'strength'))!;

  it('guarda la sesión con su fecha, el esfuerzo y la duración', () => {
    const e = buildClosedEntry({ ...base, session, skips: {}, wodParts: getWodParts(session) });
    expect(e).toMatchObject({ date: session.date, rpe: 7, durationMin: 60, rxOrScaled: 'rx' });
    expect(e.movementIds.length).toBeGreaterThan(0);
    expect(e.skipped).toBeUndefined();
  });

  it('una parte no hecha se quita del historial y queda en `skipped`', () => {
    const e = buildClosedEntry({ ...base, session, skips: { strength: {} }, wodParts: getWodParts(session) });
    expect(e.skipped).toEqual([{ block: 'strength' }]);
    const strengthIds = session.blocks.filter((b) => b.block === 'strength').map((b) => b.movementId);
    expect(strengthIds.some((id) => e.movementIds.includes(id) && !session.blocks.some((b) => b.block !== 'strength' && b.movementId === id))).toBe(false);
  });

  it('el kilo de un test solo entra si se pasa (parte no saltada)', () => {
    expect(buildClosedEntry({ ...base, session, skips: {}, wodParts: [], testedLoadKg: 0 }).testLoadKg).toBeUndefined();
  });
});

describe('el esfuerzo de un ejercicio', () => {
  const block: SessionBlockResult = { block: 'strength', movementId: 'back-squat', sets: 5, reps: '5', loadKg: 100 };

  it('valora la serie más pesada con el peso previsto y estima el 1RM', () => {
    const f = liftRpeEntry('2026-11-20', block, { kg: 100, reps: 5 }, 8, undefined, profile.prs, profile.variantPrs)!;
    expect(f).toMatchObject({ date: '2026-11-20', movementId: 'back-squat', prescribedKg: 100, prescribedSets: 5, actualKg: 100, actualReps: 5, actualRpe: 8 });
    expect(f.estimated1rm).toBeGreaterThan(100);
  });

  it('sin peso prescrito o con una sola serie no se valora', () => {
    expect(liftRpeEntry('2026-11-20', { ...block, loadKg: 0 }, { kg: 50, reps: 5 }, 8, undefined, profile.prs, undefined)).toBeNull();
    expect(liftRpeEntry('2026-11-20', { ...block, sets: 1 }, { kg: 100, reps: 5 }, 8, undefined, profile.prs, undefined)).toBeNull();
  });
});
