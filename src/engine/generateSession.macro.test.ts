import { describe, it, expect } from 'vitest';
import { generateSessionForDate, WOD_SYNONYM_GROUPS } from './generateSession';
import type { DailySession } from '../data/athlete/types';
import {
  makeProfile,
  makeStrengthGoal,
  consecutiveDates,
  simulateSessions,
  loadsAreFinite,
  allIdsResolve,
} from './__fixtures';
import { getMovementById } from '../data/movements';

const START = '2026-01-05'; // lunes, semana 1 del macro fixture
const THREE_WEEKS = consecutiveDates(START, 21);

describe('generateSessionForDate — macrociclo', () => {
  it('es determinista: la misma fecha produce sesiones identicas', () => {
    const profile = makeProfile();
    for (const d of consecutiveDates(START, 10)) {
      const a = generateSessionForDate(profile, [], d, profile.goals);
      const b = generateSessionForDate(profile, [], d, profile.goals);
      expect(a).toEqual(b);
    }
  });

  it('nunca produce loadKg NaN o negativo', () => {
    const profile = makeProfile();
    const bad: string[] = [];
    for (const d of THREE_WEEKS) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      if (!loadsAreFinite(s)) bad.push(s.date);
    }
    expect(bad).toEqual([]);
  });

  it('todos los ids de movimiento existen en el catalogo', () => {
    const profile = makeProfile();
    const missing = new Set<string>();
    for (const d of THREE_WEEKS) {
      const res = allIdsResolve(generateSessionForDate(profile, [], d, profile.goals));
      res.missing.forEach((m) => missing.add(m));
    }
    expect([...missing]).toEqual([]);
  });

  it('el WOD no mezcla cuasi-sinonimos (box jump + box jump over, dos variantes de dominada, etc.)', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 6 });
    const violations: string[] = [];
    for (const d of consecutiveDates(START, 42)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      // Un formato multironda lista un movimiento por ronda a proposito -> comparamos ids distintos.
      const wodIds = new Set(
        s.blocks.filter((b) => b.block === 'wod' && !b.movementId.startsWith('benchmark:')).map((b) => b.movementId),
      );
      for (const group of WOD_SYNONYM_GROUPS) {
        const clash = group.filter((id) => wodIds.has(id));
        if (clash.length > 1) violations.push(`${s.date}: ${clash.join(' + ')}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('el primer del complejo de oly nunca es un drill de jerk', () => {
    const profile = makeProfile();
    const bad: string[] = [];
    for (const d of consecutiveDates(START, 42)) {
      const s = generateSessionForDate(profile, [], d, profile.goals);
      const primer = s.blocks.find((b) => b.block === 'oly' && !b.subgroup);
      if (primer && /jerk/.test(primer.movementId)) bad.push(`${s.date}: ${primer.movementId}`);
    }
    expect(bad).toEqual([]);
  });

  it('no programa el mismo patron de fuerza dos dias de entreno seguidos', () => {
    const profile = makeProfile();
    const patterns = simulateSessions(profile, consecutiveDates(START, 28))
      .map((s) => s.blocks.find((b) => b.block === 'strength'))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => getMovementById(b.movementId)?.pattern ?? b.movementId);
    let backToBack = 0;
    for (let i = 1; i < patterns.length; i++) if (patterns[i] === patterns[i - 1]) backToBack++;
    expect(backToBack, `${patterns.join(' ')}`).toBe(0);
  });

  it('con objetivo intensivo de peso muerto, la bisagra NO monopoliza el mes', () => {
    const profile = makeProfile({ goals: [makeStrengthGoal('deadlift', 'intensivo')] });
    const patterns = simulateSessions(profile, consecutiveDates(START, 28))
      .flatMap((s) => s.blocks.filter((b) => b.block === 'strength'))
      .map((b) => getMovementById(b.movementId)?.pattern);
    expect(patterns.length).toBeGreaterThan(0);
    const hinge = patterns.filter((p) => p === 'hinge').length;
    // Mas frecuencia por el objetivo, pero no toda la programacion.
    expect(hinge / patterns.length).toBeLessThan(0.7);
    expect(patterns).toContain('squat');
    expect(patterns.some((p) => p === 'verticalPush' || p === 'horizontalPush')).toBe(true);
  });

  it('todas las sesiones de 3 semanas traen al menos un bloque', () => {
    const profile = makeProfile();
    const empty: string[] = [];
    for (const d of THREE_WEEKS) {
      const s: DailySession = generateSessionForDate(profile, [], d, profile.goals);
      if (!s.isRestDay && s.blocks.length === 0) empty.push(s.date);
    }
    expect(empty).toEqual([]);
  });
});
