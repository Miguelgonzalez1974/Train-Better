import { describe, it, expect } from 'vitest';
import { estimateWodTarget, parseWodResultValue, describeWodResultVsTarget } from './wodTargets';
import type { WodTimeDomain } from './wodDomains';

const TD: WodTimeDomain = { rounds: 5, amrapMin: 15, emomMin: 14 };

describe('estimateWodTarget', () => {
  it('escalera 21-15-9 barra + gimnástico -> objetivo de tiempo con banda', () => {
    const t = estimateWodTarget({
      kind: 'descendingLadder',
      entries: [
        { movementId: 'thruster', reps: '21-15-9', loadKg: 43 },
        { movementId: 'kipping-pull-up', reps: '21-15-9' },
      ],
      timeDomain: TD,
      ladderScheme: '21-15-9',
    });
    expect(t).toBeTruthy();
    expect(t!.scoreType).toBe('time');
    expect(t!.low).toBeGreaterThan(0);
    expect(t!.high).toBeGreaterThan(t!.low);
    // Fran-ish: en cualquier caso entre 2 y 12 min.
    expect(t!.low).toBeGreaterThanOrEqual(90);
    expect(t!.high).toBeLessThanOrEqual(900);
    expect(t!.display).toMatch(/min|s/);
    expect(t!.note).toMatch(/Objetivo orientativo/);
  });

  it('AMRAP -> objetivo en rondas', () => {
    const t = estimateWodTarget({
      kind: 'amrap',
      entries: [
        { movementId: 'chest-to-bar-pull-up', reps: '8-12' },
        { movementId: 'push-up', reps: '12-20' },
        { movementId: 'row', reps: '15-20 cal' },
      ],
      timeDomain: TD,
    });
    expect(t!.scoreType).toBe('rounds+reps');
    expect(t!.unit).toBe('rounds');
    expect(t!.low).toBeGreaterThanOrEqual(1);
    expect(t!.display).toMatch(/rondas/);
  });

  it('EMOM -> objetivo cualitativo (sin banda numérica)', () => {
    const t = estimateWodTarget({
      kind: 'emom',
      entries: [
        { movementId: 'kettlebell-swing-american', reps: '12-15' },
        { movementId: 'toes-to-bar', reps: '8-12' },
      ],
      timeDomain: TD,
    });
    expect(t!.low).toBe(0);
    expect(t!.high).toBe(0);
    expect(t!.note).toMatch(/14 min/);
  });

  it('es determinista y puro: misma entrada -> misma salida', () => {
    const input = {
      kind: 'forTime' as const,
      entries: [
        { movementId: 'wall-ball', reps: '12-15' },
        { movementId: 'box-jump-over', reps: '12-15' },
        { movementId: 'run', reps: '400m' },
      ],
      timeDomain: TD,
    };
    expect(estimateWodTarget(input)).toEqual(estimateWodTarget(input));
  });

  it('más volumen -> objetivo de tiempo mayor', () => {
    const short = estimateWodTarget({
      kind: 'forTime',
      entries: [{ movementId: 'thruster', reps: '9' }, { movementId: 'burpee', reps: '6' }],
      timeDomain: { ...TD, rounds: 3 },
    })!;
    const long = estimateWodTarget({
      kind: 'forTime',
      entries: [{ movementId: 'thruster', reps: '15' }, { movementId: 'burpee', reps: '15' }],
      timeDomain: { ...TD, rounds: 8 },
    })!;
    expect(long.low).toBeGreaterThan(short.high);
  });
});

describe('parseWodResultValue', () => {
  it('lee tiempo mm:ss, rondas+reps y reps', () => {
    expect(parseWodResultValue({ scoreType: 'time', value: '13:20' })).toBe(800);
    expect(parseWodResultValue({ scoreType: 'rounds+reps', value: '5+12' })).toBeCloseTo(5.6, 5);
    expect(parseWodResultValue({ scoreType: 'reps', value: '220 reps' })).toBe(220);
  });
});

describe('describeWodResultVsTarget', () => {
  const timeTarget = estimateWodTarget({
    kind: 'forTime',
    entries: [{ movementId: 'thruster', reps: '12' }, { movementId: 'kipping-pull-up', reps: '12' }],
    timeDomain: { ...TD, rounds: 5 },
  })!;

  it('dentro de la banda -> feedback positivo', () => {
    const mid = Math.round((timeTarget.low + timeTarget.high) / 2);
    const v = `${Math.floor(mid / 60)}:${String(mid % 60).padStart(2, '0')}`;
    expect(describeWodResultVsTarget({ scoreType: 'time', value: v }, timeTarget)).toMatch(/[Dd]entro/);
  });

  it('muy por encima -> aviso de escalar', () => {
    const slow = timeTarget.high * 1.5;
    const v = `${Math.floor(slow / 60)}:${String(Math.round(slow % 60)).padStart(2, '0')}`;
    expect(describeWodResultVsTarget({ scoreType: 'time', value: v }, timeTarget)).toMatch(/por encima/);
  });

  it('objetivo cualitativo -> null', () => {
    const q = estimateWodTarget({
      kind: 'emom',
      entries: [{ movementId: 'thruster', reps: '5' }],
      timeDomain: TD,
    })!;
    expect(describeWodResultVsTarget({ scoreType: 'reps', value: '100 reps' }, q)).toBeNull();
  });
});
