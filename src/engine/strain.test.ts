import { describe, it, expect } from 'vitest';
import { buildTrend, dayStrain, recommendedStrain, strainFromSrpe, strainStatus } from './strain';
import type { ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';

const entry = (date: string, rpe: number, durationMin: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });
const check = (date: string, over: Partial<ReadinessCheck> = {}): ReadinessCheck => ({ date, sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal', ...over });

describe('esfuerzo del día', () => {
  it('sin carga es 0 y crece sin pasar de 100', () => {
    expect(strainFromSrpe(0)).toBe(0);
    expect(strainFromSrpe(-5)).toBe(0);
    const values = [100, 300, 420, 800, 1200, 3000].map(strainFromSrpe);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it('una sesión normal (RPE 7, 60 min) ronda 50 y una dura (RPE 9, 90) ronda 75-85', () => {
    expect(dayStrain(entry('2026-10-01', 7, 60))).toBeGreaterThanOrEqual(48);
    expect(dayStrain(entry('2026-10-01', 7, 60))).toBeLessThanOrEqual(52);
    const hard = dayStrain(entry('2026-10-01', 9, 90))!;
    expect(hard).toBeGreaterThanOrEqual(70);
    expect(hard).toBeLessThanOrEqual(85);
  });

  it('sin sesión no hay esfuerzo (null, no 0)', () => {
    expect(dayStrain(undefined)).toBeNull();
  });
});

describe('rango recomendado', () => {
  it('es un rango de 20 puntos y sube con la preparación', () => {
    const low = recommendedStrain(30, 'optima');
    const high = recommendedStrain(85, 'optima');
    expect(low.high - low.low).toBe(20);
    expect(high.low).toBeGreaterThan(low.low);
    expect(high.high).toBeGreaterThan(low.high);
  });

  it('la carga acumulada alta lo recorta y la baja lo amplía', () => {
    const optima = recommendedStrain(60, 'optima');
    expect(recommendedStrain(60, 'alta').high).toBeLessThan(optima.high);
    expect(recommendedStrain(60, 'moderada').high).toBeLessThan(optima.high);
    expect(recommendedStrain(60, 'baja').high).toBeGreaterThan(optima.high);
  });

  it('sin preparación ni carga asume un día normal, y nunca se sale de la escala', () => {
    const r = recommendedStrain(null, null);
    expect(r.low).toBeLessThan(55);
    expect(r.high).toBeGreaterThan(55);
    for (const readiness of [0, 100]) {
      for (const zone of ['baja', 'optima', 'moderada', 'alta'] as const) {
        const x = recommendedStrain(readiness, zone);
        expect(x.low).toBeGreaterThanOrEqual(0);
        expect(x.high).toBeLessThanOrEqual(100);
        expect(x.low).toBeLessThan(x.high);
      }
    }
  });
});

describe('estado frente al rango', () => {
  const range = { low: 50, high: 70 };
  it('sin entrenar, por debajo, dentro y por encima', () => {
    expect(strainStatus(null, range)).toBe('sin-entrenar');
    expect(strainStatus(49, range)).toBe('por-debajo');
    expect(strainStatus(50, range)).toBe('dentro');
    expect(strainStatus(70, range)).toBe('dentro');
    expect(strainStatus(71, range)).toBe('pasado');
  });
});

describe('tendencia', () => {
  it('devuelve los últimos N días hasta hoy, del más antiguo al más reciente', () => {
    const t = buildTrend([], [], '2026-10-14', 7);
    expect(t.map((d) => d.date)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(t.every((d) => d.strain === null && d.recovery === null)).toBe(true);
  });

  it('cruza esfuerzo y preparación de cada día (los huecos quedan en null)', () => {
    const history = [entry('2026-10-13', 7, 60), entry('2026-10-11', 8, 70)];
    const log = [check('2026-10-13', { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' }), check('2026-10-12')];
    const t = buildTrend(history, log, '2026-10-14', 4);
    const byDate = Object.fromEntries(t.map((d) => [d.date, d]));
    expect(byDate['2026-10-13'].strain).toBe(dayStrain(history[0]));
    expect(byDate['2026-10-13'].recovery).toBe(100);
    expect(byDate['2026-10-12'].strain).toBeNull();
    expect(byDate['2026-10-12'].recovery).toBe(50);
    expect(byDate['2026-10-11'].recovery).toBeNull();
    expect(byDate['2026-10-14'].strain).toBeNull();
  });

  it('cruza bien el cambio de mes y de horario de verano', () => {
    const t = buildTrend([], [], '2026-11-02', 5);
    expect(t.map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});
