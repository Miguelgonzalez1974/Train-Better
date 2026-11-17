import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { invalidGroups, repairSession } from './sessionRepair';

const session = (blocks: SessionBlockResult[]): DailySession => ({ date: '2026-11-17', mesocycleWeek: 2, isRestDay: false, editedByAthlete: true, blocks });
const complex = (steps: string[]): SessionBlockResult => ({ block: 'oly', movementId: steps[0], format: 'Complejo', complex: { id: 'x', name: 'x', steps: steps.map((movementId) => ({ movementId, reps: 1 })) } });

describe('reparar una sesión con bloques erróneos', () => {
  const badStrength: SessionBlockResult = { block: 'strength', movementId: 'dumbbell-bench-press', sets: 3, reps: '8', loadKg: 62.5 };
  const goodStrength: SessionBlockResult = { block: 'strength', movementId: 'bench-press', sets: 3, reps: '8', loadKg: 80 };
  const wod: SessionBlockResult = { block: 'wod', movementId: 'benchmark:x' };
  const acc: SessionBlockResult = { block: 'accessory', movementId: 'plank' };

  it('detecta el press con mancuernas como fuerza y el complejo que mezcla snatch y clean', () => {
    expect(invalidGroups(session([badStrength, wod]))).toEqual(['strength']);
    expect(invalidGroups(session([complex(['power-snatch', 'power-clean', 'push-jerk'])]))).toEqual(['oly']);
    expect(invalidGroups(session([goodStrength, complex(['clean', 'front-squat', 'split-jerk']), complex(['snatch-pull', 'hang-snatch'])]))).toEqual([]);
    // Como accesorio el press con mancuernas es válido.
    expect(invalidGroups(session([{ block: 'accessory', movementId: 'dumbbell-bench-press', loadKg: 20 }]))).toEqual([]);
  });

  it('sustituye solo el grupo erróneo, en su sitio, y deja el resto (WOD, accesorio) como estaba', () => {
    const cached = session([{ block: 'warmup', movementId: 'hip-halo' }, badStrength, wod, acc]);
    const fresh = session([goodStrength, { block: 'wod', movementId: 'otro-wod' }, acc]);
    const next = repairSession(cached, fresh);
    expect(next.blocks.map((b) => `${b.block}:${b.movementId}`)).toEqual(['warmup:hip-halo', 'strength:bench-press', 'wod:benchmark:x', 'accessory:plank']);
    expect(next.editedByAthlete).toBe(true);
  });

  it('repara el oly mixto con el oly nuevo y no toca la fuerza buena', () => {
    const bad = complex(['hang-snatch', 'hang-clean', 'split-jerk']);
    const cached = session([goodStrength, wod, bad]);
    const fresh = session([goodStrength, wod, complex(['hang-power-clean', 'hang-squat-clean', 'split-jerk'])]);
    const next = repairSession(cached, fresh);
    expect(next.blocks.map((b) => b.movementId)).toEqual(['bench-press', 'benchmark:x', 'hang-power-clean']);
    expect(next.blocks[0]).toBe(goodStrength);
  });

  it('sin nada que reparar, o sin ese grupo en la sesión nueva, devuelve la misma sesión', () => {
    const ok = session([goodStrength, wod]);
    expect(repairSession(ok, ok)).toBe(ok);
    const bad = session([badStrength, wod]);
    expect(repairSession(bad, session([wod]))).toBe(bad);
  });
});
