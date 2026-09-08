import { describe, it, expect } from 'vitest';
import { generateSessionForDate } from './generateSession';
import { STRENGTH_METHOD_LABEL } from './strengthPrograms';
import { parseLadder, resolveLadderDay } from './ladderProgram';
import { getMovementById } from '../data/movements';
import type { StrengthMethod } from '../data/athlete/types';
import { makeProfile, consecutiveDates, loadsAreFinite, allIdsResolve } from './__fixtures';

const CYCLES: { method: StrengthMethod; days: number }[] = [
  { method: 'haltero', days: 42 },
  { method: 'mayhem-base', days: 42 },
  { method: 'mayhem-tecnica', days: 28 },
  { method: 'mayhem-pico', days: 56 },
];

describe('programas de fuerza transcritos', () => {
  for (const { method, days } of CYCLES) {
    it(`${STRENGTH_METHOD_LABEL[method]}: cada dia genera bloques con cargas finitas e ids validos`, () => {
      const profile = makeProfile({
        strengthPrograms: [{ id: 'p', method, startDate: '2026-01-05', endDate: '2027-01-01', lifts: [] }],
      });
      const bad: string[] = [];
      for (const d of consecutiveDates('2026-01-05', days)) {
        const s = generateSessionForDate(profile, [], d, []);
        if (s.isRestDay) continue;
        expect(s.blocks.length, `${method} ${s.date} sin bloques`).toBeGreaterThan(0);
        if (!loadsAreFinite(s)) bad.push(`${s.date}: carga no finita`);
        const res = allIdsResolve(s);
        if (!res.ok) bad.push(`${s.date}: ids ${res.missing.join(',')}`);
      }
      expect(bad).toEqual([]);
    });

    it(`${STRENGTH_METHOD_LABEL[method]}: lleva circuito de core salvo en dias de intento de 1RM / MAX OUT`, () => {
      const profile = makeProfile({
        strengthPrograms: [{ id: 'p', method, startDate: '2026-01-05', endDate: '2027-01-01', lifts: [] }],
      });
      let withCore = 0;
      let daysChecked = 0;
      for (const d of consecutiveDates('2026-01-05', days)) {
        const s = generateSessionForDate(profile, [], d, []);
        if (s.isRestDay) continue;
        daysChecked++;
        // Circuito de reps o formato en intervalo Tabata — ambos son "core".
        const hasCore = s.blocks.some((b) => (b.format ?? '').startsWith('Core'));
        const isMaxish = s.blocks.some((b) => /MAX OUT|1RM real|intento de 1RM/.test(b.notes ?? ''));
        if (hasCore) withCore++;
        // Nunca las dos cosas: un dia de max no lleva finisher de core.
        expect(hasCore && isMaxish, `${method} ${s.date}: core + max a la vez`).toBe(false);
      }
      // La mayoria de dias (los que no son de max) llevan core.
      expect(withCore / daysChecked, method).toBeGreaterThan(0.6);
    });
  }
});

describe('ladderProgram.parseLadder', () => {
  it('parsea la notacion compacta del documento', () => {
    expect(parseLadder('60/3 70/3 75/2×3')).toEqual([
      { percent: 0.6, sets: 1, reps: 3 },
      { percent: 0.7, sets: 1, reps: 3 },
      { percent: 0.75, sets: 2, reps: 3 },
    ]);
    expect(parseLadder('60/2x3')).toEqual([{ percent: 0.6, sets: 2, reps: 3 }]);
    // tokens sueltos ("RM", "× 1") se ignoran
    expect(parseLadder('90/1 RM').length).toBe(1);
  });

  it('resolveLadderDay: aplica autorregulacion salvo en isMaxAttempt y redondea a disco', () => {
    const lift = {
      label: 'Snatch',
      movementId: 'snatch',
      prKey: 'snatch' as const,
      block: 'oly' as const,
      steps: parseLadder('60/3 100/1'),
      isMaxAttempt: true,
    };
    const [res] = resolveLadderDay([lift], { snatch: 100 } as never, 0.9);
    // ultimo paso = 100% x 100kg, isMaxAttempt -> sin descuento
    expect(res.loadKg).toBe(100);
    expect(getMovementById(res.movementId)).toBeTruthy();
  });
});
