import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { generateSessionForDate, isRealWodSelectionEnabled, setRealWodSelectionEnabled } from './generateSession';
import { makeLadderLift, resolveLadderDay } from './ladderProgram';
import { consecutiveDates, makeProfile } from './__fixtures';
import type { PersonalRecords } from '../data/athlete/types';

const INITIAL = isRealWodSelectionEnabled();
beforeAll(() => setRealWodSelectionEnabled(false));
afterAll(() => setRealWodSelectionEnabled(INITIAL));

const prs: PersonalRecords = { backSquat: 170, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 };

describe('plan serie a serie de rampas y olas', () => {
  it('una ola 5-3-1 doble con back-off se expande en sus 7 series, cada una con sus reps y su peso', () => {
    const lift = makeLadderLift('Back Squat — ola 5-3-1', 'back-squat', 'backSquat', 'strength', '75/5 82/3 88/1 78/5 85/3 90/1 65/10');
    const [resolved] = resolveLadderDay([lift], prs, 1);
    expect(resolved.setPlan.map((s) => s.reps)).toEqual([5, 3, 1, 5, 3, 1, 10]);
    // 75 % de 170 = 127,5; la serie de trabajo (la última) es el back-off al 65 %
    expect(resolved.setPlan[0].kg).toBeCloseTo(127.5, 0);
    expect(resolved.setPlan[6].kg).toBe(resolved.loadKg);
  });

  it('un paso con varias series se repite ("70/5×2" = 5 series de 2 al 70 %)', () => {
    const lift = makeLadderLift('Front Squat', 'front-squat', 'frontSquat', 'strength', '70/5×2 75/4×2 80/3');
    const [resolved] = resolveLadderDay([lift], prs, 1);
    expect(resolved.setPlan.map((s) => s.reps)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 3]);
    expect(resolved.setPlan[0].kg).toBe(resolved.setPlan[4].kg);
    expect(resolved.setPlan[5].kg).toBeGreaterThan(resolved.setPlan[4].kg);
    expect(resolved.setPlan[9].kg).toBe(resolved.loadKg);
  });

  it('la autorregulación baja todas las series del plan, no solo la última', () => {
    const lift = makeLadderLift('Back Squat', 'back-squat', 'backSquat', 'strength', '70/5 80/3 90/1');
    const full = resolveLadderDay([lift], prs, 1)[0];
    const light = resolveLadderDay([lift], prs, 0.9)[0];
    light.setPlan.forEach((s, i) => expect(s.kg).toBeLessThan(full.setPlan[i].kg));
  });

  it('la rampa "5-3-1" del generador lleva su plan: reps 5-3-1, carga que sube y última serie = carga de trabajo', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 6 });
    const ramps = consecutiveDates('2026-01-05', 84)
      .map((d) => generateSessionForDate(profile, [], d, []))
      .flatMap((s) => s.blocks.filter((b) => b.block === 'strength' && b.reps === '5-3-1'));
    expect(ramps.length).toBeGreaterThan(0);
    for (const b of ramps) {
      expect(b.setPlan?.map((s) => s.reps)).toEqual([5, 3, 1]);
      const kgs = b.setPlan!.map((s) => s.kg);
      expect(kgs[0]).toBeLessThan(kgs[1]);
      expect(kgs[1]).toBeLessThanOrEqual(kgs[2]);
      expect(kgs[2]).toBe(b.loadKg);
    }
  });

  it('las series rectas y demás esquemas que no son rampa no llevan plan (siguen igual que siempre)', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 6 });
    const others = consecutiveDates('2026-01-05', 56)
      .map((d) => generateSessionForDate(profile, [], d, []))
      .flatMap((s) => s.blocks.filter((b) => b.block === 'strength' && b.sets && b.reps && b.reps !== '5-3-1'));
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((b) => b.setPlan === undefined)).toBe(true);
  });
});
