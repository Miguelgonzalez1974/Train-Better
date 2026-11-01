import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { COST_MAX, COST_MIN, effectiveLoad, recentSessionCosts, sessionCostFactor } from './sessionCost';
import { dayStrain } from './strain';

const LIGHT = 'bm:mayhem-282'; // carga mecánica 8
const MID = 'lib:pj-2017-07-06-870'; // 34, la mediana del catálogo
const HEAVY = 'bm:mayhem-453'; // 75

const entry = (over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: '2026-10-30', mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60, ...over });

describe('sessionCostFactor', () => {
  it('una sesión de la que no sabemos nada no se toca', () => {
    expect(sessionCostFactor(entry())).toBe(0);
    expect(effectiveLoad(entry())).toBe(dayStrain(entry()));
  });

  it('un WOD de mucha carga mecánica cuesta más que su RPE y uno ligero, menos', () => {
    expect(sessionCostFactor(entry({ wodCatalogId: HEAVY }))).toBeGreaterThan(0.1);
    expect(sessionCostFactor(entry({ wodCatalogId: LIGHT }))).toBeLessThan(-0.05);
    expect(Math.abs(sessionCostFactor(entry({ wodCatalogId: MID })))).toBeLessThan(0.01);
  });

  it('las piernas pesadas y la halterofilia suman', () => {
    expect(sessionCostFactor(entry({ strengthPattern: 'squat' }))).toBeCloseTo(0.06, 5);
    expect(sessionCostFactor(entry({ strengthPattern: 'horizontalPush' }))).toBe(0);
    expect(sessionCostFactor(entry({ olyFamily: 'snatch' }))).toBeCloseTo(0.04, 5);
    expect(sessionCostFactor(entry({ strengthPattern: 'hinge', olyFamily: 'clean', wodCatalogId: HEAVY }))).toBeGreaterThan(sessionCostFactor(entry({ wodCatalogId: HEAVY })));
  });

  it('el factor siempre queda entre el mínimo y el máximo', () => {
    for (const e of [entry({ wodCatalogId: HEAVY, strengthPattern: 'squat', olyFamily: 'snatch' }), entry({ wodCatalogId: LIGHT })]) {
      const k = sessionCostFactor(e);
      expect(k).toBeGreaterThanOrEqual(COST_MIN);
      expect(k).toBeLessThanOrEqual(COST_MAX);
    }
  });

  it('reconoce los ids del catálogo en cualquiera de sus campos', () => {
    const viaCatalog = sessionCostFactor(entry({ wodCatalogId: HEAVY }));
    expect(sessionCostFactor(entry({ wodCatalogIds: [HEAVY] }))).toBeCloseTo(viaCatalog, 9);
    expect(sessionCostFactor(entry({ wodCatalogId: 'bm:no-existe' }))).toBe(0);
  });
});

describe('effectiveLoad', () => {
  it('es el esfuerzo del día por el coste real, entre 0 y 100', () => {
    const e = entry({ wodCatalogId: HEAVY });
    expect(effectiveLoad(e)).toBeGreaterThan(dayStrain(e)!);
    expect(effectiveLoad(entry({ rpe: 10, durationMin: 240, wodCatalogId: HEAVY, strengthPattern: 'squat' }))).toBeLessThanOrEqual(100);
    expect(effectiveLoad(entry({ rpe: 0, durationMin: 0 }))).toBe(0);
  });
});

describe('recentSessionCosts', () => {
  it('devuelve las últimas sesiones con su coste real y la diferencia en %', () => {
    const history = [
      entry({ date: '2026-10-28', strengthPattern: 'verticalPush', wodCatalogId: LIGHT }),
      entry({ date: '2026-10-29', wodCatalogId: MID }),
      entry({ date: '2026-10-30', strengthPattern: 'squat', wodCatalogId: HEAVY, rpe: 8, durationMin: 70 }),
      entry({ date: '2026-11-05' }), // futura: no cuenta
    ];
    const rows = recentSessionCosts(history, '2026-11-01', 3);
    expect(rows.map((r) => r.date)).toEqual(['2026-10-30', '2026-10-29', '2026-10-28']);
    expect(rows[0].pct).toBeGreaterThan(10);
    expect(rows[0].title).toMatch(/^Sentadilla \+ WOD /);
    expect(rows[0].detail).toMatch(/^RPE 8 · 70 min · mecánica /);
    expect(rows[2].pct).toBeLessThan(0);
    expect(rows[0].real).toBeGreaterThan(rows[0].base);
  });

  it('una sesión sin datos de WOD se llama simplemente Sesión', () => {
    const rows = recentSessionCosts([entry()], '2026-11-01', 1);
    expect(rows[0].title).toBe('Sesión');
    expect(rows[0].pct).toBe(0);
  });
});
