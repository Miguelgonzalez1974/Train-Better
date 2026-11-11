import { describe, expect, it } from 'vitest';
import type { Goal, Macrocycle } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { buildSeasonMap } from './seasonMap';
import { buildBlocksToCompetition, buildTexasProgram } from './seasonSetup';

// Miércoles 11 de noviembre de 2026; su lunes es el 9.
const TODAY = '2026-11-11';
const ids = (() => {
  let i = 0;
  return () => `m${++i}`;
})();
const otono: Macrocycle = { id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-11-15' };
const comp = (extra: Partial<Goal> = {}): Goal => ({ id: 'gc', type: 'preparar-competicion', targetDate: '2027-03-02', emphasis: 'moderado', createdAt: '2026-11-10', provisional: true, ...extra });

const fullProfile = () =>
  makeProfile({
    macrocycles: [otono, ...buildBlocksToCompetition('2026-11-16', '2027-03-02', ids, 'gc')],
    strengthPrograms: [buildTexasProgram(TODAY, () => 'tx')],
    intensityRamp: { startDate: '2026-11-10', strengthWeeks: 1, olyWeeks: 2, wodWeeks: 2 },
    goals: [comp(), { id: 'gk', type: 'subir-pr', movementId: 'back-squat', targetDate: '2027-03-15', emphasis: 'moderado', createdAt: '2026-11-01', targetKg: 190, startKg: 170 }],
    prs: { backSquat: 175, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 },
  });

describe('mapa de la temporada', () => {
  it('sin macros, programa ni competicion por delante no hay mapa', () => {
    expect(buildSeasonMap(makeProfile({ macrocycles: [], goals: [], strengthPrograms: [] }), TODAY)).toBeNull();
    // un macro ya terminado tampoco cuenta
    expect(buildSeasonMap(makeProfile({ macrocycles: [{ ...otono, endDate: '2026-11-01' }], goals: [], strengthPrograms: [] }), TODAY)).toBeNull();
  });

  it('empieza el lunes de esta semana, dura semanas enteras y llega hasta lo ultimo del plan', () => {
    const map = buildSeasonMap(fullProfile(), TODAY)!;
    expect(map.startIso).toBe('2026-11-09');
    expect(map.weeks).toBeGreaterThanOrEqual(18);
    expect(map.endIso >= '2027-03-15').toBe(true);
    expect(map.todayPct).toBeGreaterThan(0);
    expect(map.todayPct).toBeLessThan(5);
  });

  it('cada tipo va en su fila y los bloques del macro no se solapan', () => {
    const map = buildSeasonMap(fullProfile(), TODAY)!;
    const macroBars = map.bars.filter((b) => b.kind === 'macro').sort((a, b) => a.startPct - b.startPct);
    expect(new Set(macroBars.map((b) => b.lane)).size).toBe(1);
    for (let i = 1; i < macroBars.length; i++) expect(macroBars[i].startPct).toBeGreaterThanOrEqual(macroBars[i - 1].startPct + macroBars[i - 1].widthPct - 0.01);
    const program = map.bars.find((b) => b.kind === 'programa')!;
    expect(program.lane).toBeGreaterThan(macroBars[0].lane);
    expect(map.lanes).toBeGreaterThanOrEqual(3);
    for (const b of map.bars) {
      expect(b.startPct).toBeGreaterThanOrEqual(0);
      expect(b.startPct + b.widthPct).toBeLessThanOrEqual(100.01);
    }
  });

  it('marca el bloque en marcha, el pico y el modo competicion', () => {
    const map = buildSeasonMap(fullProfile(), TODAY)!;
    expect(map.bars.find((b) => b.id === 'macro:otono')!.current).toBe(true);
    expect(map.bars.filter((b) => b.kind === 'macro' && b.peak)).toHaveLength(1);
    const modo = map.bars.find((b) => b.kind === 'modo')!;
    expect(modo.label).toBe('Modo competición');
    expect(modo.detail).toMatch(/taper/);
  });

  it('banderas: la competicion (provisional) y la meta en kilos, en filas distintas si estan cerca', () => {
    const map = buildSeasonMap(fullProfile(), TODAY)!;
    const c = map.flags.find((f) => f.kind === 'competicion')!;
    const k = map.flags.find((f) => f.kind === 'meta')!;
    expect(c.label).toMatch(/2 mar · provisional/);
    expect(c.detail).toMatch(/provisional/);
    expect(k.label).toMatch(/190 kg/);
    expect(k.detail).toMatch(/te faltan 15 kg/);
    expect(k.pct).toBeGreaterThan(c.pct);
    // 13 dias de diferencia en ~18 semanas: mas de un 12 %, misma fila; con fechas pegadas, filas distintas
    const near = buildSeasonMap(makeProfile({ macrocycles: [otono], goals: [comp(), { ...fullProfile().goals[1], targetDate: '2027-03-05' }], prs: fullProfile().prs }), TODAY)!;
    expect(new Set(near.flags.map((f) => f.row)).size).toBe(2);
  });

  it('el resumen dice en que bloque estas y cuanto falta para competir', () => {
    const map = buildSeasonMap(fullProfile(), TODAY)!;
    expect(map.now).toMatch(/Otono · semana \d+ de \d+/);
    expect(map.toCompetition).toMatch(/Faltan 16 semanas para la competición/);
    const soon = buildSeasonMap(makeProfile({ macrocycles: [otono], goals: [comp({ targetDate: '2026-11-14' })] }), TODAY)!;
    expect(soon.toCompetition).toBe('Faltan 3 días para la competición');
    expect(buildSeasonMap(makeProfile({ macrocycles: [otono], goals: [] }), TODAY)!.toCompetition).toBeNull();
  });

  it('los meses del eje caen en su sitio', () => {
    const map = buildSeasonMap(fullProfile(), TODAY)!;
    expect(map.months.map((m) => m.label).slice(0, 4)).toEqual(['nov', 'dic', 'ene', 'feb']);
    for (let i = 1; i < map.months.length; i++) expect(map.months[i].pct).toBeGreaterThan(map.months[i - 1].pct);
  });

  it('un rango minimo de ocho semanas y maximo de un año', () => {
    const short = buildSeasonMap(makeProfile({ macrocycles: [{ ...otono, endDate: '2026-11-20' }], goals: [] }), TODAY)!;
    expect(short.weeks).toBe(8);
    const long = buildSeasonMap(makeProfile({ macrocycles: [{ ...otono, endDate: '2029-01-01' }], goals: [] }), TODAY)!;
    expect(long.weeks).toBe(53);
  });
});
