import { describe, expect, it } from 'vitest';
import type { AthleteProfile, DailySession, SessionBlockResult } from '../data/athlete/types';
import { consecutiveDates, makeProfile, simulateSessions } from './__fixtures';
import { COMBINED_TAIL_PREFIX, isLiftStep, isNoProbeSession, isProbeDay, nextSteps, recentLevelUp } from './levelNextStep';
import { computeReferenceLevel } from './levelReference';

const base = makeProfile();
const athlete = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  ...base,
  birthYear: 1974,
  prs: { ...base.prs, backSquat: 120, benchPress: 100, deadlift: 160, frontSquat: 95, strictPress: 60, snatch: 65, clean: 85, cleanAndJerk: 70 },
  bodyweightLog: [{ date: '2026-11-20', kg: 83 }],
  ...over,
});
const today = new Date('2026-11-28T12:00:00');
const stepsOf = (p: AthleteProfile) => nextSteps(computeReferenceLevel({ profile: p, history: [], today }));

const block = (over: Partial<SessionBlockResult> = {}): SessionBlockResult => ({ block: 'oly', movementId: 'clean-and-jerk', sets: 5, reps: '1', loadKg: 60, ...over });
const session = (blocks: SessionBlockResult[], over: Partial<DailySession> = {}): DailySession => ({ date: '2026-12-01', mesocycleWeek: 3, isRestDay: false, blocks, ...over });

describe('el siguiente salto de nivel', () => {
  it('el primero es el que menos hay que mejorar en proporción, con kilos que se pueden cargar', () => {
    const steps = stepsOf(athlete());
    expect(steps[0]).toEqual({ key: 'cleanAndJerk', kind: 'kg', current: 70, target: 72.5, gap: 1, zoneName: 'Intermedio' });
    expect(steps[1]).toMatchObject({ key: 'backSquat', target: 122.5, gap: 2, zoneName: 'Novato' });
    // Los kilos que se piden siempre pasan de escalón.
    for (const s of steps) {
      if (!isLiftStep(s.key)) continue;
      const after = computeReferenceLevel({ profile: athlete({ prs: { ...athlete().prs, [s.key]: s.target } }), history: [], today });
      expect(after.categories.flatMap((c) => c.marks).find((m) => m.key === s.key)!.placement!.zone).toBeGreaterThan(computeReferenceLevel({ profile: athlete(), history: [], today }).categories.flatMap((c) => c.marks).find((m) => m.key === s.key)!.placement!.zone);
    }
  });

  it('un test de tiempo entra en segundos; sin peso ni año no hay saltos', () => {
    const fran = stepsOf(athlete({ levelTests: [{ key: 'fran', date: '2026-11-01', seconds: 500 }] })).find((s) => s.key === 'fran')!;
    expect(fran.kind).toBe('time');
    expect(fran.target).toBeLessThan(500);
    expect(fran.gap).toBe(500 - fran.target);
    expect(stepsOf(athlete({ birthYear: undefined }))).toEqual([]);
    expect(stepsOf(athlete({ bodyweightLog: [] }))).toEqual([]);
  });

  it('un récord reciente que sube de escalón se celebra unos días', () => {
    const p = athlete({
      prLog: [
        { date: '2026-08-30', key: 'snatch', kg: 50 },
        { date: '2026-11-27', key: 'snatch', kg: 65 },
      ],
    });
    expect(recentLevelUp(p, [], today, '2026-11-28')).toEqual({ key: 'snatch', zoneName: 'Intermedio', date: '2026-11-27' });
    expect(recentLevelUp(p, [], new Date('2026-12-01T12:00:00'), '2026-12-01')).toBeNull();
    // Un récord sin cambio de escalón, o la primera marca, no cuentan.
    expect(recentLevelUp(athlete({ prLog: [{ date: '2026-08-30', key: 'snatch', kg: 62.5 }, { date: '2026-11-27', key: 'snatch', kg: 65 }] }), [], today, '2026-11-28')).toBeNull();
    expect(recentLevelUp(athlete({ prLog: [{ date: '2026-11-27', key: 'snatch', kg: 65 }] }), [], today, '2026-11-28')).toBeNull();
  });
});

describe('qué días se puede intentar', () => {
  it('con el levantamiento completo de trabajo, no con un complejo ni con el toque ligero', () => {
    expect(isProbeDay(session([block()]), 'cleanAndJerk')).toBe(true);
    expect(isProbeDay(session([block()]), 'snatch')).toBe(false);
    expect(isProbeDay(session([block({ complex: { id: 'x', name: 'x', steps: [] } })]), 'cleanAndJerk')).toBe(false);
    expect(isProbeDay(session([block({ notes: `${COMBINED_TAIL_PREFIX} (estilo Day 5 de Mayhem): …` })]), 'cleanAndJerk')).toBe(false);
    expect(isProbeDay(session([block({ block: 'strength', movementId: 'back-squat' })]), 'backSquat')).toBe(true);
    expect(isProbeDay(session([block({ block: 'wod' })]), 'cleanAndJerk')).toBe(false);
  });

  it('ni en descarga ni con la competición encima, salvo en un test de máximos', () => {
    expect(isProbeDay(session([block()], { mesocycleWeek: 4 }), 'cleanAndJerk')).toBe(false);
    expect(isProbeDay(session([block()], { deloadReason: 'fatiga' }), 'cleanAndJerk')).toBe(false);
    expect(isNoProbeSession(session([], { competition: { phase: 'taper', label: '', guidance: '', daysToEvent: 5 } }))).toBe(true);
    expect(isNoProbeSession(session([], { competition: { phase: 'construccion', label: '', guidance: '', daysToEvent: 80 } }))).toBe(false);
    expect(isProbeDay(session([block({ format: 'Test 1RM' })], { mesocycleWeek: 4 }), 'cleanAndJerk')).toBe(true);
  });

  it('en un plan de verdad aparecen días de C&J y de sentadilla, siempre con carga de trabajo', () => {
    const profile = makeProfile();
    const sessions = simulateSessions(profile, consecutiveDates('2026-01-05', 84));
    for (const [key, id] of [['cleanAndJerk', 'clean-and-jerk'], ['backSquat', 'back-squat']] as const) {
      const days = sessions.filter((s) => isProbeDay(s, key));
      expect(days.length, key).toBeGreaterThan(0);
      for (const s of days) expect(s.blocks.some((b) => b.movementId === id && !b.complex)).toBe(true);
    }
    // El generador sigue marcando el toque ligero como lo esperamos.
    const tails = sessions.flatMap((s) => s.blocks).filter((b) => b.notes?.startsWith(COMBINED_TAIL_PREFIX));
    expect(tails.length).toBeGreaterThan(0);
  });
});
