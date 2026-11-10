import { describe, expect, it } from 'vitest';
import type { CompanionLogEntry, SessionHistoryEntry } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { computeAdherenceStreak } from './adherence';
import { companionTrainedDates } from './companionLoad';
import { computeMonthPlan } from './monthPlan';
import { computeYearConsistency } from './yearConsistency';

const done = (date: string, outcome: 'hecha' | 'saltada' = 'hecha'): CompanionLogEntry => ({ id: `tx|${date}`, programId: 'tx', index: 0, date, outcome });
const macro = (date: string): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });

// Martes 10 de noviembre de 2026; con 5 días por semana, de lunes a viernes se entrena.
const TODAY = new Date('2026-11-10T12:00:00');
const profile = (companionLog: CompanionLogEntry[]) => makeProfile({ trainingDaysPerWeek: 5, onboardedAt: '2026-11-02T00:00:00.000Z', companionLog });

describe('los días solo de programa de fuerza cuentan como entrenados', () => {
  it('companionTrainedDates: días hechos, sin repetir y sin las saltadas', () => {
    expect(companionTrainedDates({ companionLog: [done('2026-11-02'), done('2026-11-02'), done('2026-11-04', 'saltada')] })).toEqual(['2026-11-02']);
    expect(companionTrainedDates({})).toEqual([]);
  });

  it('la racha no se corta un día en que solo hiciste el programa', () => {
    const history = [macro('2026-11-02'), macro('2026-11-04'), macro('2026-11-05')];
    // El martes 3 no hay sesión del macro: sin el programa corta la racha.
    expect(computeAdherenceStreak(profile([]), history, '2026-11-05')).toBe(2);
    expect(computeAdherenceStreak(profile([done('2026-11-03')]), history, '2026-11-05')).toBe(4);
  });

  it('una sesión saltada del programa no cuenta', () => {
    const history = [macro('2026-11-02'), macro('2026-11-04'), macro('2026-11-05')];
    expect(computeAdherenceStreak(profile([done('2026-11-03', 'saltada')]), history, '2026-11-05')).toBe(2);
  });

  it('la constancia del año y el plan del mes suben con el día solo de programa', () => {
    const history = [macro('2026-11-02'), macro('2026-11-04')];
    const without = computeYearConsistency(profile([]), history, TODAY);
    const withTexas = computeYearConsistency(profile([done('2026-11-03')]), history, TODAY);
    expect(withTexas.days).toBe(without.days + 1);
    expect(computeMonthPlan(profile([done('2026-11-03')]), history, TODAY).done).toBe(computeMonthPlan(profile([]), history, TODAY).done + 1);
  });
});
