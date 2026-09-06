import { describe, it, expect } from 'vitest';
import { computeResponseProfile, perLiftLoadFactor } from './responseProfile';
import type { PersonalRecords, SetFeedbackEntry, WorkSetEntry } from '../data/athlete/types';

const PRS: PersonalRecords = {
  backSquat: 200,
  frontSquat: 160,
  benchPress: 120,
  deadlift: 250,
  strictPress: 70,
  clean: 120,
  snatch: 95,
  cleanAndJerk: 125,
};

const top = (date: string, kg: number, reps = 3, movementId = 'back-squat'): WorkSetEntry => ({
  date,
  movementId,
  block: 'strength',
  setNumber: 3,
  kg,
  reps,
});

/** N sesiones semanales con una serie top de `kg x reps` para `movementId`. */
function sessions(kg: number, reps: number, n: number, movementId = 'back-squat'): WorkSetEntry[] {
  return Array.from({ length: n }, (_, i) => top(`2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`, kg, reps, movementId));
}

describe('calibracion de carga desde workLog', () => {
  it('si mueves consistentemente por encima de tu PR, sube la carga de ese lift', () => {
    // 190 x 5 -> Epley ~221, PR 200 -> ~+10%, acotado a +5% (pre-confident)
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), [], [], sessions(190, 5, 5), PRS);
    expect(perLiftLoadFactor(profile, 'backSquat')).toBeGreaterThan(1);
    expect(perLiftLoadFactor(profile, 'backSquat')).toBeLessThanOrEqual(1.05);
  });

  it('si te quedas por debajo de tu PR, baja la carga', () => {
    // 150 x 3 -> Epley ~165, PR 200 -> ~-17%, acotado a -5%
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), [], [], sessions(150, 3, 5), PRS);
    expect(perLiftLoadFactor(profile, 'backSquat')).toBeLessThan(1);
    expect(perLiftLoadFactor(profile, 'backSquat')).toBeGreaterThanOrEqual(0.95);
  });

  it('las series ligeras (< 55% del PR) no cuentan: no hay calibracion', () => {
    // 100kg = 50% de 200 -> se descarta
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), [], [], sessions(100, 3, 6), PRS);
    expect(perLiftLoadFactor(profile, 'backSquat')).toBe(1);
  });

  it('con menos de 3 sesiones no hay calibracion', () => {
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), [], [], sessions(190, 3, 2), PRS);
    expect(perLiftLoadFactor(profile, 'backSquat')).toBe(1);
  });

  it('sin prs no hace nada', () => {
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), [], [], sessions(190, 3, 5));
    expect(perLiftLoadFactor(profile, 'backSquat')).toBe(1);
  });

  it('el feedback de 1ª serie con RPE gana al workLog para el mismo lift', () => {
    // workLog dice "sube" (190x5), pero el feedback con RPE dice "baja".
    const fb: SetFeedbackEntry[] = Array.from({ length: 4 }, (_, i) => ({
      date: `2026-02-0${i + 1}`,
      movementId: 'back-squat',
      block: 'strength',
      prescribedKg: 160,
      prescribedReps: 3,
      prescribedSets: 5,
      feel: 'duro',
      prKey: 'backSquat',
      pctOf1rm: 0.8,
      actualKg: 160,
      actualReps: 3,
      actualRpe: 9.5,
      estimated1rm: 178, // por debajo del assumed (160/0.8 = 200)
    }));
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), fb, [], sessions(190, 5, 5), PRS);
    // gana el feedback -> factor < 1
    expect(perLiftLoadFactor(profile, 'backSquat')).toBeLessThan(1);
  });

  it('funciona igual para movimientos de oly (resuelve la clave de PR raiz)', () => {
    // power-clean -> progressionOf clean -> clave 'clean'. 110 x 2 -> Epley ~117, PR clean 120.
    const profile = computeResponseProfile([], [], new Date('2026-03-01'), [], [], sessions(118, 2, 5, 'clean'), PRS);
    expect(perLiftLoadFactor(profile, 'clean')).toBeGreaterThan(0.9);
    expect(perLiftLoadFactor(profile, 'clean')).toBeLessThanOrEqual(1.05);
  });
});
