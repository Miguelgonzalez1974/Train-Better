import { describe, it, expect } from 'vitest';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from './periodization';
import { makeProfile } from './__fixtures';
import { computeYearConsistency } from './yearConsistency';

// Sábado 10 de octubre de 2026; con 5 días por semana, el sábado es de descanso.
const TODAY = new Date('2026-10-10T12:00:00');

/** Fechas ISO de entreno previstas (lunes a viernes) desde `fromIso` hasta ayer. */
function scheduledDates(fromIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T00:00:00`);
  const end = new Date('2026-10-10T00:00:00');
  while (d < end) {
    if (getDayPlan(getWeekdayIndex(d), 5).isTrainingDay) out.push(toLocalIsoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const profile = (over: Parameters<typeof makeProfile>[0] = {}) => makeProfile({ trainingDaysPerWeek: 5, onboardedAt: '2025-11-01T00:00:00.000Z', ...over });

describe('constancia del año', () => {
  it('sin entrenar nada, el porcentaje es 0 y hay días previstos', () => {
    const r = computeYearConsistency(profile(), [], TODAY);
    expect(r.since).toBe('2026-01-01');
    expect(r.days).toBe(0);
    expect(r.pct).toBe(0);
    expect(r.planned).toBe(scheduledDates('2026-01-01').length);
  });

  it('si fuiste a todos los días previstos, 100 %', () => {
    const all = scheduledDates('2026-01-01');
    const r = computeYearConsistency(profile({ trainingDatesLog: all }), [], TODAY);
    expect(r.pct).toBe(100);
    expect(r.days).toBe(all.length);
  });

  it('a la mitad de los días, ~50 %', () => {
    const all = scheduledDates('2026-01-01');
    const half = all.filter((_, i) => i % 2 === 0);
    const r = computeYearConsistency(profile({ trainingDatesLog: half }), [], TODAY);
    expect(r.pct).toBeGreaterThanOrEqual(49);
    expect(r.pct).toBeLessThanOrEqual(51);
  });

  it('se cuenta desde que empezaste a usar la app, no desde el 1 de enero', () => {
    const r = computeYearConsistency(profile({ onboardedAt: '2026-09-01T10:00:00.000Z' }), [], TODAY);
    expect(r.since).toBe('2026-09-01');
    expect(r.planned).toBe(scheduledDates('2026-09-01').length);
  });

  it('un día entrenado que no tocaba suma a días pero el porcentaje no pasa de 100', () => {
    const all = scheduledDates('2026-01-01');
    const extra = ['2026-03-07', '2026-03-08']; // un sábado y un domingo
    const r = computeYearConsistency(profile({ trainingDatesLog: [...all, ...extra] }), [], TODAY);
    expect(r.days).toBe(all.length + 2);
    expect(r.pct).toBe(100);
  });

  it('el historial también cuenta, sin duplicar con el registro de fechas', () => {
    const entry = { date: '2026-10-09', mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx' as const, rpe: 7, durationMin: 60 };
    const r = computeYearConsistency(profile({ trainingDatesLog: ['2026-10-09'] }), [entry], TODAY);
    expect(r.days).toBe(1);
  });

  it('el día de hoy no cuenta como fallo si todavía no has entrenado', () => {
    // viernes 9 de octubre de 2026, previsto: sin entrenar hoy no se añade al total previsto
    const friday = new Date('2026-10-09T09:00:00');
    const noToday = computeYearConsistency(profile(), [], friday);
    const withToday = computeYearConsistency(profile({ trainingDatesLog: ['2026-10-09'] }), [], friday);
    expect(withToday.planned).toBe(noToday.planned + 1);
  });

  it('sin ningún día previsto todavía no hay porcentaje', () => {
    // te diste de alta hoy, que es sábado (no toca)
    const r = computeYearConsistency(profile({ onboardedAt: '2026-10-10T08:00:00.000Z' }), [], TODAY);
    expect(r.planned).toBe(0);
    expect(r.pct).toBeNull();
  });
});
