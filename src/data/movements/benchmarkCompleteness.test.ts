import { describe, expect, it } from 'vitest';
import { benchmarkHasExplicitScheme } from './benchmarkCompleteness';
import { benchmarkWorkouts } from './benchmarkWods';
import type { BenchmarkWorkout } from './types';

function wod(overrides: Partial<BenchmarkWorkout>): BenchmarkWorkout {
  return {
    id: 'test',
    name: 'Test',
    category: 'custom',
    format: 'For time',
    movements: ['thruster', 'burpee'],
    scoreType: 'time',
    tags: [],
    ...overrides,
  };
}

describe('benchmarkHasExplicitScheme', () => {
  it('acepta un esquema de reps compartido en escalera (Fran)', () => {
    expect(benchmarkHasExplicitScheme(wod({ format: '21-15-9 reps for time' }))).toBe(true);
  });

  it('acepta reps explicitas por movimiento (Weapon of Choice)', () => {
    expect(
      benchmarkHasExplicitScheme(
        wod({
          format: 'For time, partir como quieras: 30 Power Snatch (135/95 lb), 2000m Row, 100 Wall Ball (20/14 lb)',
          movements: ['power-snatch', 'row', 'wall-ball'],
        })
      )
    ).toBe(true);
  });

  it('acepta un solo movimiento aunque no haya reps (carrera, por ejemplo)', () => {
    expect(benchmarkHasExplicitScheme(wod({ format: 'For time', movements: ['run'] }))).toBe(true);
  });

  it('acepta tests de carga (1RM) sin reps por movimiento', () => {
    expect(benchmarkHasExplicitScheme(wod({ format: 'Max load', scoreType: 'load' }))).toBe(true);
  });

  it('rechaza "For time" sin ningun numero (Boom Boom Pow)', () => {
    expect(benchmarkHasExplicitScheme(wod({ format: 'For time', movements: ['thruster', 'air-bike', 'double-under'] }))).toBe(
      false
    );
  });

  it('rechaza rondas sin reps por movimiento (Death Race)', () => {
    expect(benchmarkHasExplicitScheme(wod({ format: '5 rondas for time', movements: ['air-bike', 'burpee'] }))).toBe(false);
  });

  it('rechaza AMRAP con tope de tiempo pero sin reps (Mind Your Business)', () => {
    expect(
      benchmarkHasExplicitScheme(
        wod({ format: 'AMRAP 20 min', movements: ['dumbbell-snatch', 'toes-to-bar', 'row'], scoreType: 'rounds+reps' })
      )
    ).toBe(false);
  });

  it('todos los benchmarks reales (girl/hero/open) traen su prescripcion completa: ninguno vuelve a salir sin reps', () => {
    const incomplete = benchmarkWorkouts
      .filter((w) => w.category !== 'custom' && !benchmarkHasExplicitScheme(w))
      .map((w) => `${w.id}: ${w.format}`);
    expect(incomplete).toEqual([]);
  });

  it('los WODs de CompTrain ya rellenados con prescripcion verificada cuentan como completos', () => {
    for (const id of ['nintendo', 'death-race', 'downfall', 'marston', 'holleyman', 'two-seater', 'heartless', 'sams-jam', 'pass-interference', 'return-to-sender', 'barnharts-bet']) {
      const w = benchmarkWorkouts.find((x) => x.id === id);
      expect(w, `${id} no existe`).toBeTruthy();
      expect(benchmarkHasExplicitScheme(w!), `${id} sigue incompleto`).toBe(true);
    }
  });

  it('un formato revisado a mano (reviewed) cuenta como completo aunque el detector no lo vea', () => {
    expect(benchmarkHasExplicitScheme(wod({ format: '5 rondas: 1:00 de cada movimiento', reviewed: true }))).toBe(true);
    expect(benchmarkHasExplicitScheme(wod({ format: '5 rondas: 1:00 de cada movimiento' }))).toBe(false);
  });

  it('el catalogo real no se queda sin benchmarks reales (girl/hero/open) completos', () => {
    const realComplete = benchmarkWorkouts.filter((w) => w.category !== 'custom' && benchmarkHasExplicitScheme(w));
    expect(realComplete.length).toBeGreaterThan(0);
  });
});
