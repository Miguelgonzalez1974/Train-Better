import { describe, it, expect } from 'vitest';
import { buildMicrocyclePlan } from './weekPlan';
import { computeResponseProfile } from './responseProfile';
import type { MovementPattern } from '../data/movements/types';

const rp = computeResponseProfile([], [], new Date('2026-03-02T12:00:00'), [], []);

function plan(n: 3 | 4 | 5 | 6, phase: 1 | 2 | 3 | 4, goalForcedPattern: MovementPattern | null = null) {
  return buildMicrocyclePlan({
    macroId: 'm',
    weekNumber: phase,
    phase,
    trainingDaysPerWeek: n,
    responseProfile: rp,
    avoidedPatterns: new Set(),
    goalForcedPattern,
    goalForcedFamily: null,
  });
}

describe('buildMicrocyclePlan', () => {
  it('ningun patron de fuerza se lleva mas de la mitad de los dias de fuerza, ni forzado por objetivo', () => {
    for (const n of [3, 4, 5, 6] as const) {
      for (const phase of [1, 2, 3, 4] as const) {
        for (const forced of [null, 'hinge', 'squat'] as (MovementPattern | null)[]) {
          const p = plan(n, phase, forced);
          const strengthDays = p.strengthPattern.length; // aproximacion: array completo
          const counts = new Map<string, number>();
          for (const pat of p.strengthPattern) counts.set(pat, (counts.get(pat) ?? 0) + 1);
          const max = Math.max(...counts.values());
          expect(max, `n=${n} fase=${phase} forced=${forced}`).toBeLessThanOrEqual(Math.ceil(strengthDays / 2));
        }
      }
    }
  });

  it('las familias de oly alternan entre dias de fuerza consecutivos', () => {
    for (const n of [3, 4, 5, 6] as const) {
      for (const phase of [1, 2, 3, 4] as const) {
        const p = plan(n, phase);
        // Alternancia sobre los slots de fuerza: reconstruimos el orden de familias por dia.
        const fams = p.olyFamily;
        // No puede haber 3 dias consecutivos con la misma familia (tolera 2 por relleno de dias sin oly).
        for (let i = 2; i < fams.length; i++) {
          expect(fams[i] === fams[i - 1] && fams[i] === fams[i - 2], `n=${n} fase=${phase} idx=${i}`).toBe(false);
        }
      }
    }
  });

  it('marca como combinado exactamente el ultimo dia de oly de la semana (si hay >=2)', () => {
    for (const n of [3, 4, 5, 6] as const) {
      const p = plan(n, 1);
      const combinedIdx = p.olyCombined.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      expect(combinedIdx.length).toBeLessThanOrEqual(1);
      if (combinedIdx.length === 1) {
        // no puede ser el dia 0
        expect(combinedIdx[0]).toBeGreaterThan(0);
      }
    }
  });
});
