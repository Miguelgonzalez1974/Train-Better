import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { applyManualCorrection, MANUAL_FIX_ID, PC_HPC_SJ_COMPLEX } from './oneOffCorrections';
import { stepCapacityKg } from './olyComplexes';

const profile = makeProfile({ prs: { ...makeProfile().prs, benchPress: 100, clean: 100, snatch: 80, cleanAndJerk: 110, deadlift: 160 } });
const blocks = (): SessionBlockResult[] => [
  { block: 'warmup', movementId: 'hip-halo' },
  { block: 'strength', movementId: 'spoto-press', sets: 4, reps: '5', loadKg: 67.5, notes: 'principal' },
  { block: 'strength', movementId: 'single-arm-dumbbell-row', sets: 3, reps: '10', loadKg: 30, notes: 'Complemento del día (A2)' },
  { block: 'wod', movementId: 'benchmark:x' },
  { block: 'oly', movementId: 'burgener-warmup-clean', subgroup: 'Calentamiento de barra', reps: 'PVC' },
  { block: 'oly', movementId: 'barbell-warmup-complex', subgroup: 'Calentamiento de barra', reps: '2-3 rondas' },
  { block: 'oly', movementId: 'movement-specific-primer', subgroup: 'Calentamiento de barra', reps: '3-4 series ascendentes', loadKg: 60 },
  { block: 'oly', movementId: 'hang-power-clean', sets: 3, reps: '2-3', loadKg: 60 },
  { block: 'oly', movementId: 'clean', format: 'Complejo', sets: 5, reps: '1+2+1', loadKg: 70, complex: { id: 'cl-clasico', name: 'Clásico', steps: [{ movementId: 'clean', reps: 1 }, { movementId: 'front-squat', reps: 2 }, { movementId: 'split-jerk', reps: 1 }] } },
  { block: 'oly', movementId: 'clean-deadlift', sets: 3, reps: '3', loadKg: 95 },
  { block: 'accessory', movementId: 'plank' },
];
const session = (date = '2026-11-17', extra: Partial<DailySession> = {}): DailySession => ({ date, mesocycleWeek: 2, isRestDay: false, blocks: blocks(), ...extra });

describe('corrección puntual de la sesión del 17 nov', () => {
  it('deja la sesión como se hizo: bench press, pendlay row, muscle clean, el complejo propio y clean pull', () => {
    const fix = applyManualCorrection(session(), profile)!;
    const b = fix.session.blocks;
    expect(b.filter((x) => x.block === 'strength').map((x) => x.movementId)).toEqual(['bench-press', 'pendlay-row']);
    expect(b.find((x) => x.movementId === 'bench-press')).toMatchObject({ sets: 4, reps: '5', loadKg: 67.5 });
    const row = b.find((x) => x.movementId === 'pendlay-row')!;
    expect(row.loadKg).toBeGreaterThan(40);
    expect(row.sets).toBe(3);
    const oly = b.filter((x) => x.block === 'oly' && !x.subgroup);
    expect(oly.map((x) => x.movementId)).toEqual(['muscle-clean', 'power-clean', 'clean-pull']);
    expect(oly[1].complex).toEqual({ id: PC_HPC_SJ_COMPLEX.id, name: PC_HPC_SJ_COMPLEX.name, steps: PC_HPC_SJ_COMPLEX.steps });
    expect(oly[1].reps).toBe('1+1+1');
    expect(oly[1].setPlan).toHaveLength(oly[1].sets!);
    expect(oly[0].loadKg).toBeLessThan(60);
    // Clean pull y clean deadlift aguantan lo mismo: el tirón conserva su carga.
    expect(oly[2].loadKg).toBe(95);
    // El WOD y el accesorio no se tocan.
    expect(b.find((x) => x.block === 'wod')).toEqual(blocks()[3]);
    expect(b.find((x) => x.block === 'accessory')).toEqual(blocks()[10]);
    expect(fix.session.manualFix).toBe(MANUAL_FIX_ID);
    expect(fix.session.editedByAthlete).toBe(true);
  });

  it('el peso del complejo manda el paso más flojo', () => {
    const fix = applyManualCorrection(session(), profile)!;
    const block = fix.session.blocks.find((x) => x.complex)!;
    const weakest = Math.min(...PC_HPC_SJ_COMPLEX.steps.map((s) => stepCapacityKg(s.movementId, profile.prs, profile.variantPrs)!));
    expect(block.loadKg!).toBeLessThan(weakest);
  });

  it('solo esa fecha, solo una vez y no una sesión propia', () => {
    expect(applyManualCorrection(session('2026-11-18'), profile)).toBeNull();
    const done = applyManualCorrection(session(), profile)!;
    expect(applyManualCorrection(done.session, profile)).toBeNull();
    expect(applyManualCorrection(session('2026-11-17', { source: 'custom' }), profile)).toBeNull();
  });

  it('un calentamiento de snatch en el día de clean pasa a calentamiento de clean', () => {
    const s = session();
    s.blocks[4] = { ...s.blocks[4], movementId: 'burgener-warmup-snatch' };
    const fix = applyManualCorrection(s, profile)!;
    expect(fix.session.blocks.some((x) => x.movementId === 'burgener-warmup-snatch')).toBe(false);
  });
});
