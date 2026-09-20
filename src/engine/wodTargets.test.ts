import { describe, it, expect } from 'vitest';
import { calibrateWodTarget, estimateWodTarget, parsePublishedGoal, getWodPerformance, parseWodResultValue, describeWodResultVsTarget } from './wodTargets';
import type { WodTimeDomain } from './wodDomains';
import type { SessionHistoryEntry, WodResult } from '../data/athlete/types';

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

  it('"al máximo" -> objetivo en reps totales con banda', () => {
    const t = estimateWodTarget({
      kind: 'maxReps',
      entries: [
        { movementId: 'thruster', reps: '9-12', loadKg: 43 },
        { movementId: 'chest-to-bar-pull-up', reps: '9-12' },
        { movementId: 'row', reps: '12-15 cal' },
      ],
      timeDomain: { ...TD, rounds: 4 },
    });
    expect(t!.scoreType).toBe('reps');
    expect(t!.unit).toBe('reps');
    expect(t!.low).toBeGreaterThan(0);
    expect(t!.high).toBeGreaterThan(t!.low);
    expect(t!.display).toMatch(/reps/);
  });

  it('cardio chipper -> objetivo de tiempo, sumando los 3 tramos de cada movimiento', () => {
    const short = estimateWodTarget({
      kind: 'cardioChipper',
      entries: [
        { movementId: 'row', reps: '600-420-300 m' },
        { movementId: 'air-bike', reps: '20-14-10 cal' },
      ],
      timeDomain: TD,
    })!;
    const long = estimateWodTarget({
      kind: 'cardioChipper',
      entries: [
        { movementId: 'row', reps: '1200-840-600 m' },
        { movementId: 'air-bike', reps: '45-32-22 cal' },
      ],
      timeDomain: TD,
    })!;
    expect(short.scoreType).toBe('time');
    expect(long.low).toBeGreaterThan(short.high);
  });

  it('sandwich -> tiempo = entrada + salida + rondas x pareja: más rondas o más entrada suben el objetivo', () => {
    const mk = (buyIn: string, rounds: number) =>
      estimateWodTarget({
        kind: 'sandwich',
        entries: [
          { movementId: 'double-under', reps: buyIn },
          { movementId: 'toes-to-bar', reps: '10' },
          { movementId: 'power-snatch', reps: '10' },
          { movementId: 'double-under', reps: buyIn },
        ],
        timeDomain: { ...TD, rounds },
      })!;
    const base = mk('100', 4);
    expect(base.scoreType).toBe('time');
    expect(mk('100', 7).low).toBeGreaterThan(base.high);
    expect(mk('200', 4).low).toBeGreaterThan(base.low);
    // La entrada y la salida cuentan: sin ellas (rondas solas) saldria bastante menos.
    const roundsOnly = estimateWodTarget({
      kind: 'forTime',
      entries: [
        { movementId: 'toes-to-bar', reps: '10' },
        { movementId: 'power-snatch', reps: '10' },
      ],
      timeDomain: { ...TD, rounds: 4 },
    })!;
    expect(base.low).toBeGreaterThan(roundsOnly.low);
  });

  it('objetivo publicado: solo formas inequivocas, con la cifra exacta de la fuente', () => {
    const t = parsePublishedGoal('10-12 min.', 'time')!;
    expect([t.low, t.high, t.unit]).toEqual([600, 720, 'seconds']);
    expect(parsePublishedGoal('14 min.', 'time')).toMatchObject({ low: 840, high: 840 });
    expect(parsePublishedGoal('complete 5 rounds.', 'rounds+reps')).toMatchObject({ low: 5, high: 5, unit: 'rounds' });
    expect(parsePublishedGoal('8-10 rounds.', 'rounds+reps')).toMatchObject({ low: 8, high: 10 });
    // Ambiguos o de otro tipo de puntuacion -> nada, mejor que leerlo mal.
    for (const g of ['< 6 min.', 'Under 30 min.', 'round of 18.', '400 reps.', '14 min (avg. 2:20/round).', '5 rounds.']) {
      expect(parsePublishedGoal(g, 'time'), g).toBeNull();
    }
    expect(parsePublishedGoal('14 min.', 'rounds+reps')).toBeNull();
    expect(parsePublishedGoal('5 rounds.', 'reps')).toBeNull();
    expect(parsePublishedGoal(undefined, 'time')).toBeNull();
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

function wodEntry(
  kind: string,
  unit: 'seconds' | 'rounds' | 'reps',
  mid: number,
  result: WodResult,
  rxOrScaled: 'rx' | 'scaled' = 'rx',
): SessionHistoryEntry {
  return {
    date: '2026-01-01',
    mesocycleWeek: 1,
    movementIds: [],
    rxOrScaled,
    rpe: 7,
    durationMin: 60,
    wodResult: result,
    wodTargetBase: { kind, unit, mid },
  };
}

describe('getWodPerformance / calibrateWodTarget', () => {
  const slower = (n: number) =>
    Array.from({ length: n }, () => wodEntry('forTime', 'seconds', 600, { scoreType: 'time', value: '12:00' }));

  it('sin muestras suficientes no ajusta nada', () => {
    expect(getWodPerformance([], 'forTime')).toBeNull();
    expect(getWodPerformance(slower(2), 'forTime')).toBeNull();
  });

  it('si el atleta tarda un 20% mas que la estimacion base, rinde <1 (ajuste tibio por pocas muestras)', () => {
    const perf = getWodPerformance(slower(4), 'forTime')!;
    // 600 s estimados vs 720 reales -> perf 0.833; con 4 muestras se aplica 4/7 del desvio.
    expect(perf).toBeCloseTo(1 + (1 / 1.2 - 1) * (4 / 7), 3);
    expect(perf).toBeLessThan(1);
    expect(perf).toBeGreaterThan(0.75);
  });

  it('mas muestras = ajuste mas firme, y nunca pasa de los topes', () => {
    expect(getWodPerformance(slower(6), 'forTime')!).toBeLessThan(getWodPerformance(slower(3), 'forTime')!);
    const absurd = Array.from({ length: 6 }, () => wodEntry('forTime', 'seconds', 600, { scoreType: 'time', value: '60:00' }));
    expect(getWodPerformance(absurd, 'forTime')).toBeGreaterThanOrEqual(0.75);
  });

  it('los WODs escalados no cuentan', () => {
    const scaled = Array.from({ length: 5 }, () =>
      wodEntry('forTime', 'seconds', 600, { scoreType: 'time', value: '12:00' }, 'scaled'),
    );
    expect(getWodPerformance(scaled, 'forTime')).toBeNull();
  });

  it('rendimiento en rondas y en tiempo comparten escala (>1 = mejor que lo estimado)', () => {
    const stronger = [
      wodEntry('amrap', 'rounds', 5, { scoreType: 'rounds+reps', value: '6+0' }),
      wodEntry('amrap', 'rounds', 5, { scoreType: 'rounds+reps', value: '6+0' }),
      wodEntry('forTime', 'seconds', 600, { scoreType: 'time', value: '8:20' }),
    ];
    // Formato sin muestras propias suficientes -> se usan las de cualquier formato.
    expect(getWodPerformance(stronger, 'emom')!).toBeGreaterThan(1);
  });

  it('un desvio pequeno (<4%) no se toca', () => {
    const close = Array.from({ length: 5 }, () => wodEntry('forTime', 'seconds', 600, { scoreType: 'time', value: '10:10' }));
    expect(getWodPerformance(close, 'forTime')).toBeNull();
  });

  it('calibrateWodTarget reescala la banda, deja constancia y no toca los cualitativos', () => {
    const base = estimateWodTarget({
      kind: 'forTime',
      entries: [
        { movementId: 'thruster', reps: '15', loadKg: 43 },
        { movementId: 'kipping-pull-up', reps: '15' },
      ],
      timeDomain: TD,
    })!;
    const slowAthlete = calibrateWodTarget(base, 0.85);
    expect(slowAthlete.low).toBeGreaterThan(base.low);
    expect(slowAthlete.high).toBeGreaterThan(base.high);
    expect(slowAthlete.calibration).toBeCloseTo(1 / 0.85, 5);
    expect(slowAthlete.note).toMatch(/Ajustado a tus últimos WODs/);
    // La banda base se recupera del punto medio y el factor guardado.
    const baseMid = (base.low + base.high) / 2;
    expect((slowAthlete.low + slowAthlete.high) / 2 / slowAthlete.calibration!).toBeCloseTo(baseMid, -1);

    const amrap = estimateWodTarget({
      kind: 'amrap',
      entries: [
        { movementId: 'burpee', reps: '10' },
        { movementId: 'air-squat', reps: '15' },
      ],
      timeDomain: TD,
    })!;
    expect(calibrateWodTarget(amrap, 1.2).high).toBeGreaterThanOrEqual(amrap.high);

    const qual = estimateWodTarget({ kind: 'emom', entries: [{ movementId: 'burpee', reps: '8' }], timeDomain: TD })!;
    expect(calibrateWodTarget(qual, 0.8)).toBe(qual);
    expect(calibrateWodTarget(base, null)).toBe(base);
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
