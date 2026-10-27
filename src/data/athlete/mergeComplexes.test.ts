import { describe, expect, it } from 'vitest';
import { makeProfile } from '../../engine/__fixtures';
import type { OlyComplex } from '../complexes';
import { mergeProfile, snapshotSyncBase } from './mergeProfile';

const cx = (id: string, name = id): OlyComplex => ({ id, name, family: 'clean', focus: ['tecnica'], custom: true, steps: [{ movementId: 'hang-clean', reps: 1 }, { movementId: 'split-jerk', reps: 1 }] });
const profile = (over: Parameters<typeof makeProfile>[0]) => makeProfile({ onboardedAt: '2026-01-01T00:00:00.000Z', ...over });

describe('sincronización de los complejos propios', () => {
  it('se unen por id: lo creado en cada dispositivo se conserva', () => {
    const merged = mergeProfile(profile({ customComplexes: [cx('a')] }), profile({ customComplexes: [cx('b')] }));
    expect((merged.customComplexes ?? []).map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('si el mismo id cambió en los dos sitios gana el local', () => {
    const merged = mergeProfile(profile({ customComplexes: [cx('a', 'remoto')] }), profile({ customComplexes: [cx('a', 'local')] }));
    expect(merged.customComplexes?.[0].name).toBe('local');
  });

  it('lo que se borró en este dispositivo desde la última sincronización no vuelve', () => {
    const before = profile({ customComplexes: [cx('a'), cx('b')] });
    const base = snapshotSyncBase(before, []);
    const merged = mergeProfile(before, profile({ customComplexes: [cx('b')] }), [], [], base);
    expect((merged.customComplexes ?? []).map((c) => c.id)).toEqual(['b']);
  });

  it('la dureza pedida por día se une por fecha, gana el local y «volver a normal» (0) también', () => {
    const merged = mergeProfile(
      profile({ hardness: { '2026-03-02': 2, '2026-03-03': 1 } }),
      profile({ hardness: { '2026-03-02': 0, '2026-03-04': 1 } }),
    );
    expect(merged.hardness).toEqual({ '2026-03-02': 0, '2026-03-03': 1, '2026-03-04': 1 });
    expect(mergeProfile(profile({}), profile({})).hardness).toBeUndefined();
  });

  it('el apunte de lo que se sabía al subir la dureza se une por fecha y gana el local', () => {
    const e = (date: string, predicted: number) => ({ date, level: 1 as const, mode: 'volume' as const, situation: 'normal' as const, predicted, targetLow: 45, targetHigh: 65, readiness: 78 });
    const merged = mergeProfile(profile({ hardnessLog: [e('2026-03-02', 50), e('2026-03-03', 52)] }), profile({ hardnessLog: [e('2026-03-02', 58), e('2026-03-04', 55)] }));
    expect(merged.hardnessLog?.map((x) => [x.date, x.predicted])).toEqual([['2026-03-02', 58], ['2026-03-03', 52], ['2026-03-04', 55]]);
  });

  it('favoritos y ocultos: gana el local, y si no hay se toma el remoto', () => {
    const remote = profile({ complexPrefs: { favorites: ['x'], hidden: [] } });
    expect(mergeProfile(remote, profile({ complexPrefs: { favorites: ['y'], hidden: ['z'] } })).complexPrefs).toEqual({ favorites: ['y'], hidden: ['z'] });
    expect(mergeProfile(remote, profile({})).complexPrefs).toEqual({ favorites: ['x'], hidden: [] });
  });
});
