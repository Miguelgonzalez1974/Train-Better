import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { benchmarkWorkouts } from '../data/movements';
import { buildWodResult, EMPTY_WOD_FORM, isMeaningfulWodResult } from './wodScoring';
import { parseWodResultValue, describeWodResultVsTarget, wodPerformanceSamples } from './wodTargets';
import { wodCapFor } from './wodCap';
import type { SessionHistoryEntry } from '../data/athlete/types';

const session = (blocks: SessionBlockResult[]): DailySession => ({ date: '2026-11-04', mesocycleWeek: 1, isRestDay: false, blocks });
const wod = (extra: Partial<SessionBlockResult>): SessionBlockResult => ({ block: 'wod', movementId: 'x', ...extra });

describe('el límite de tiempo de un WOD', () => {
  it('un benchmark por tiempo con cap declarado lo lleva como cap', () => {
    const forTime = benchmarkWorkouts.find((w) => w.timeCapMinutes && w.scoreType === 'time');
    expect(forTime, 'hay algún benchmark por tiempo con cap en los datos').toBeDefined();
    expect(wodCapFor(session([wod({ movementId: `benchmark:${forTime!.id}` })]))).toEqual({ seconds: forTime!.timeCapMinutes! * 60, kind: 'cap' });
  });

  it('un benchmark puntuado por rondas (Cindy, AMRAP 20) lleva su duración como fin del AMRAP, no como cap', () => {
    expect(wodCapFor(session([wod({ movementId: 'benchmark:cindy' })]))).toEqual({ seconds: 1200, kind: 'amrap' });
  });

  it('un AMRAP que genera el coach declara su duración en el formato', () => {
    expect(wodCapFor(session([wod({ movementId: 'burpee', format: 'AMRAP 12 min' })]))).toEqual({ seconds: 720, kind: 'amrap' });
  });

  it('un WOD por tiempo que genera el coach no tiene cap: se pone a mano', () => {
    expect(wodCapFor(session([wod({ movementId: 'burpee', format: 'For Time (3 rondas)' })]))).toBeNull();
  });

  it('sin WOD, o una parte que no existe, no hay límite', () => {
    expect(wodCapFor(session([{ block: 'strength', movementId: 'back-squat' }]))).toBeNull();
    expect(wodCapFor(session([wod({ movementId: 'benchmark:cindy' })]), 2)).toBeNull();
  });

  it('en un doble WOD cada parte tiene el suyo', () => {
    const s = session([
      wod({ movementId: 'benchmark:cindy', wodPart: 1 }),
      wod({ movementId: 'burpee', format: 'AMRAP 8 min', wodPart: 2 }),
    ]);
    expect(wodCapFor(s, 1)?.seconds).toBe(1200);
    expect(wodCapFor(s, 2)?.seconds).toBe(480);
  });
});

describe('un WOD por tiempo no terminado se guarda como CAP', () => {
  const capped = { ...EMPTY_WOD_FORM, capped: true, capSeconds: 900 };

  it('con rondas y repeticiones: "CAP · 3+7", con el cap guardado', () => {
    expect(buildWodResult('time', { ...capped, rounds: 3, extraReps: 7 })).toEqual({ scoreType: 'time', value: 'CAP · 3+7', capped: true, capSeconds: 900 });
    expect(buildWodResult('time', { ...capped, rounds: 3 }).value).toBe('CAP · 3');
  });

  it('sin rondas (un chipper) lleva las repeticiones hechas; sin nada, solo CAP', () => {
    expect(buildWodResult('time', { ...capped, extraReps: 45 }).value).toBe('CAP · 45 reps');
    expect(buildWodResult('time', capped).value).toBe('CAP');
  });

  it('sin cap conocido no inventa uno', () => {
    expect(buildWodResult('time', { ...EMPTY_WOD_FORM, capped: true, rounds: 2 })).toEqual({ scoreType: 'time', value: 'CAP · 2', capped: true });
  });

  it('un tiempo normal sigue siendo un tiempo, aunque el formulario tenga el cap de antes', () => {
    expect(buildWodResult('time', { ...EMPTY_WOD_FORM, minutes: 9, seconds: 5, capSeconds: 900 })).toEqual({ scoreType: 'time', value: '9:05' });
    expect(buildWodResult('time', { ...EMPTY_WOD_FORM, minutes: 9, seconds: 5, capped: false })).toEqual({ scoreType: 'time', value: '9:05' });
  });

  it('el cap solo existe en los WODs por tiempo: en un AMRAP se ignora', () => {
    expect(buildWodResult('rounds+reps', { ...EMPTY_WOD_FORM, rounds: 6, extraReps: 4, capped: true, capSeconds: 900 })).toEqual({ scoreType: 'rounds+reps', value: '6+4' });
  });

  it('un CAP cuenta como resultado anotado (no es un formulario vacío)', () => {
    expect(isMeaningfulWodResult(buildWodResult('time', capped))).toBe(true);
  });

  it('en las estadísticas vale como "al menos el cap", nunca como un tiempo mejor; sin cap conocido no se puede comparar', () => {
    expect(parseWodResultValue({ scoreType: 'time', value: 'CAP · 3+7', capped: true, capSeconds: 900 })).toBe(900);
    expect(parseWodResultValue({ scoreType: 'time', value: 'CAP · 3+7', capped: true })).toBeNull();
  });

  it('la frase frente al objetivo dice que no se terminó', () => {
    const verdict = describeWodResultVsTarget({ scoreType: 'time', value: 'CAP', capped: true, capSeconds: 900 }, { low: 600, high: 780, unit: 'seconds', display: '10-13 min', note: '' } as never);
    expect(verdict).toMatch(/time cap/);
  });

  it('un CAP baja el rendimiento medido frente a lo estimado', () => {
    const entry = (result: SessionHistoryEntry['wodResult']): SessionHistoryEntry => ({
      date: '2026-11-01',
      mesocycleWeek: 1,
      movementIds: [],
      rxOrScaled: 'rx',
      rpe: 8,
      durationMin: 60,
      wodResult: result,
      wodTargetBase: { kind: 'forTime', unit: 'seconds', mid: 600 },
    });
    const finished = wodPerformanceSamples([entry({ scoreType: 'time', value: '10:00' })])[0];
    const capped = wodPerformanceSamples([entry({ scoreType: 'time', value: 'CAP · 3', capped: true, capSeconds: 900 })])[0];
    expect(finished.perf).toBeCloseTo(1, 5);
    expect(capped.perf).toBeLessThan(finished.perf);
    // sin cap conocido el CAP no entra en la calibración
    expect(wodPerformanceSamples([entry({ scoreType: 'time', value: 'CAP', capped: true })])).toHaveLength(0);
  });
});
