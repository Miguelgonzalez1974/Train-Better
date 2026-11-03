import { describe, expect, it } from 'vitest';
import type { AthleteProfile, StrainTarget } from '../../data/athlete/types';
import { buildTrendPoints, plannedFor } from './pastDay';

const target = (over: Partial<StrainTarget> = {}): StrainTarget => ({ low: 60, high: 80, readiness: 70, yesterday: null, reasons: [], provisional: false, setOn: '2026-11-01', ...over });
const TODAY = '2026-11-03';
const FIRST = '2026-10-30';

describe('previsto de cada día para la línea de la gráfica', () => {
  it('el anotado antes de entrenar, tal cual', () => {
    expect(plannedFor(target({ planned: 65 }), '2026-11-02', TODAY, 40, null, FIRST)).toBe(65);
  });

  it('un día sin sesión (esfuerzo 0) con objetivo fijado vale 0, como lo hecho', () => {
    expect(plannedFor(target(), '2026-11-01', TODAY, 0, null, FIRST)).toBe(0);
  });

  it('no se sabe antes de la primera anotación ni en el futuro', () => {
    expect(plannedFor(target(), '2026-10-28', TODAY, 0, null, FIRST)).toBeNull();
    expect(plannedFor(undefined, '2026-11-04', TODAY, null, null, FIRST)).toBeNull();
    expect(plannedFor(target(), '2026-11-02', TODAY, 0, null, undefined)).toBeNull();
  });

  it('un día entrenado del que no se anotó el previsto (se entrenó antes de abrir el Dashboard) no se inventa', () => {
    expect(plannedFor(target(), '2026-11-02', TODAY, 55, null, FIRST)).toBeNull();
  });

  it('hoy, sin entrenar, el previsto en vivo; sin sesión prevista, nada', () => {
    expect(plannedFor(target(), TODAY, TODAY, null, 57, FIRST)).toBe(57);
    expect(plannedFor(target(), TODAY, TODAY, null, null, FIRST)).toBeNull();
  });
});

describe('buildTrendPoints lleva el previsto a cada día', () => {
  it('los días con previsto, los de descanso a 0 y los anteriores a la primera anotación sin él', () => {
    const profile = {
      strainTargets: {
        '2026-10-29': target(),
        '2026-10-30': target({ planned: 70 }),
        '2026-10-31': target(),
        '2026-11-01': target({ planned: 65 }),
        '2026-11-02': target(),
        [TODAY]: target({ planned: 57 }),
      },
    } as unknown as AthleteProfile;
    const history = [
      { date: '2026-10-30', rpe: 7, durationMin: 60 },
      { date: '2026-11-01', rpe: 5, durationMin: 50 },
    ] as never;
    const pts = buildTrendPoints(profile, history, TODAY, TODAY, 7, 57);
    const plan = Object.fromEntries(pts.map((p) => [p.iso, p.plan]));
    expect(plan).toEqual({
      '2026-10-28': null,
      '2026-10-29': null, // antes de la primera anotación (30 oct)
      '2026-10-30': 70,
      '2026-10-31': 0, // sin sesión, con objetivo fijado
      '2026-11-01': 65,
      '2026-11-02': 0,
      [TODAY]: 57,
    });
  });
});
