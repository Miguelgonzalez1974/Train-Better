import { describe, it, expect } from 'vitest';
import { makeProfile } from './__fixtures';
import { computeMonthPlan } from './monthPlan';

// Sábado 10 de octubre de 2026; con 5 días por semana (lunes a viernes) el sábado es de descanso.
// Días previstos del 1 al 9 de octubre: jue 1, vie 2, lun 5, mar 6, mié 7, jue 8, vie 9 = 7.
const TODAY = new Date('2026-10-10T12:00:00');
const profile = (over: Parameters<typeof makeProfile>[0] = {}) => makeProfile({ trainingDaysPerWeek: 5, onboardedAt: '2025-11-01T00:00:00.000Z', ...over });
const PLANNED = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

describe('cumplimiento del plan del mes', () => {
  it('sin entrenar nada, 0 de los días previstos', () => {
    const r = computeMonthPlan(profile(), [], TODAY);
    expect(r).toEqual({ done: 0, planned: 7, pct: 0 });
  });

  it('a todos los días previstos, 100 %', () => {
    const r = computeMonthPlan(profile({ trainingDatesLog: PLANNED }), [], TODAY);
    expect(r).toEqual({ done: 7, planned: 7, pct: 100 });
  });

  it('un día entrenado que no tocaba no suma ni resta', () => {
    const r = computeMonthPlan(profile({ trainingDatesLog: [...PLANNED.slice(0, 5), '2026-10-03', '2026-10-04'] }), [], TODAY);
    expect(r).toEqual({ done: 5, planned: 7, pct: 71 });
  });

  it('los días de otro mes no cuentan', () => {
    const r = computeMonthPlan(profile({ trainingDatesLog: ['2026-09-30', '2026-09-29'] }), [], TODAY);
    expect(r.done).toBe(0);
  });

  it('hoy solo cuenta como previsto si ya has entrenado', () => {
    const friday = new Date('2026-10-09T09:00:00');
    expect(computeMonthPlan(profile(), [], friday).planned).toBe(6);
    expect(computeMonthPlan(profile({ trainingDatesLog: ['2026-10-09'] }), [], friday).planned).toBe(7);
  });

  it('se cuenta desde que empezaste a usar la app si fue este mes', () => {
    const r = computeMonthPlan(profile({ onboardedAt: '2026-10-06T10:00:00.000Z' }), [], TODAY);
    expect(r.planned).toBe(4);
  });

  it('sin días previstos todavía no hay porcentaje', () => {
    const r = computeMonthPlan(profile({ onboardedAt: '2026-10-10T08:00:00.000Z' }), [], TODAY);
    expect(r.pct).toBeNull();
  });

  it('el historial también cuenta, sin duplicar con el registro de fechas', () => {
    const entry = { date: '2026-10-09', mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx' as const, rpe: 7, durationMin: 60 };
    expect(computeMonthPlan(profile({ trainingDatesLog: ['2026-10-09'] }), [entry], TODAY).done).toBe(1);
  });
});
