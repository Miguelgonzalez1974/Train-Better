import { describe, expect, it } from 'vitest';
import { makeProfile } from './__fixtures';
import { applySeasonSetup, backupBeforeSeason, blockLengths, blockPhaseWeeks, buildSeasonSetup, nextMondayIso, restoreSeasonBackup, seasonEndIso } from './seasonSetup';
import { getActiveMacrocycle, totalMacrocycleWeeks } from './periodization';
import { generateSessionForDate } from './generateSession';
import { companionStatus, isCompanionProgram } from './strengthCompanion';

let n = 0;
const ids = () => `id${++n}`;

describe('fechas de la temporada', () => {
  it('empieza el primer lunes desde hoy (el domingo 8 nov 2026 → lunes 9) y acaba el último domingo de junio', () => {
    expect(nextMondayIso('2026-11-08')).toBe('2026-11-09');
    expect(nextMondayIso('2026-11-09')).toBe('2026-11-09');
    expect(nextMondayIso('2026-11-10')).toBe('2026-11-16');
    expect(seasonEndIso('2026-11-09')).toBe('2027-06-27');
    expect(seasonEndIso('2027-01-04')).toBe('2027-06-27');
    expect(seasonEndIso('2027-02-01')).toBe('2027-06-27');
  });
});

describe('reparto de fases y bloques', () => {
  it('33 semanas se reparten en 10, 11 y 12', () => {
    expect(blockLengths(33)).toEqual([10, 11, 12]);
    expect(blockLengths(33).reduce((a, b) => a + b, 0)).toBe(33);
  });

  it('cada bloque suma sus semanas, tiene al menos una de cada fase y la descarga es una', () => {
    expect(blockPhaseWeeks(10, 'base1')).toEqual([5, 3, 1, 1]);
    expect(blockPhaseWeeks(11, 'base2')).toEqual([4, 4, 2, 1]);
    expect(blockPhaseWeeks(12, 'pico')).toEqual([3, 3, 5, 1]);
    for (const shape of ['base1', 'base2', 'pico'] as const) {
      for (let w = 4; w <= 16; w++) {
        const p = blockPhaseWeeks(w, shape);
        expect(p.reduce((a, b) => a + b, 0)).toBe(w);
        expect(Math.min(...p)).toBeGreaterThanOrEqual(1);
        expect(p[3]).toBe(1);
      }
    }
  });
});

describe('el plan completo', () => {
  const setup = buildSeasonSetup('2026-11-08', ids)!;

  it('un macro continuo en tres bloques, sin huecos ni solapes, del 9 nov al 27 jun', () => {
    expect(setup.startDate).toBe('2026-11-09');
    expect(setup.endDate).toBe('2027-06-27');
    expect(setup.totalWeeks).toBe(33);
    expect(setup.macrocycles.map((m) => [m.startDate, m.endDate])).toEqual([
      ['2026-11-09', '2027-01-17'],
      ['2027-01-18', '2027-04-04'],
      ['2027-04-05', '2027-06-27'],
    ]);
    expect(setup.macrocycles.map((m) => totalMacrocycleWeeks(m))).toEqual([10, 11, 12]);
    expect(setup.macrocycles.map((m) => m.phaseWeeks)).toEqual([[5, 3, 1, 1], [4, 4, 2, 1], [3, 3, 5, 1]]);
  });

  it('el programa es el Bloque de Temporada que convive con el macro, lunes, miércoles y viernes, desde el 16 nov', () => {
    expect(setup.program).toMatchObject({ method: 'temporada', startDate: '2026-11-16', lifts: ['benchPress', 'backSquat', 'strictPress'] });
    expect(isCompanionProgram(setup.program)).toBe(true);
    expect(setup.program.companion).toMatchObject({ weekdays: [0, 2, 4], cursor: 0, deferrals: 0 });
    expect(setup.ramp).toEqual({ startDate: '2026-11-09', strengthWeeks: 1, olyWeeks: 2, wodWeeks: 2 });
  });

  it('con menos de 14 semanas por delante no hay temporada', () => {
    expect(buildSeasonSetup('2027-03-29', ids)).toBeNull();
  });

  it('aplicarlo quita lo anterior, pone lo nuevo, conserva el pasado y se puede deshacer', () => {
    const old = makeProfile({
      macrocycles: [{ id: 'old', label: 'Competición', startDate: '2026-09-07', endDate: '2026-11-08' }],
      goals: [{ id: 'g', type: 'preparar-competicion', targetDate: '2026-11-06', emphasis: 'moderado', createdAt: '2026-08-01' }],
      strengthPrograms: [{ id: 'sp', startDate: '2026-10-01', endDate: '2026-12-01', method: '531', lifts: [] }],
      sessionCache: { '2026-11-07': { date: '2026-11-07', mesocycleWeek: 1, isRestDay: false, blocks: [] }, '2026-11-10': { date: '2026-11-10', mesocycleWeek: 1, isRestDay: false, blocks: [] } },
      trainingDaysPerWeek: 6,
    });
    const backup = backupBeforeSeason(old, '2026-11-08T10:00:00Z');
    const next = applySeasonSetup(old, setup, '2026-11-08');
    expect(next.macrocycles).toHaveLength(3);
    expect(next.goals).toEqual([]);
    expect(next.strengthPrograms).toEqual([setup.program]);
    expect(Object.keys(next.sessionCache ?? {})).toEqual(['2026-11-07']);
    const restored = restoreSeasonBackup(next, backup);
    expect(restored.macrocycles.map((m) => m.id)).toEqual(['old']);
    expect(restored.goals).toHaveLength(1);
    expect(restored.strengthPrograms?.map((p) => p.id)).toEqual(['sp']);
  });

  it('con el plan puesto, el macro manda cada día y el programa se ofrece lunes, miércoles y viernes', () => {
    const profile = applySeasonSetup(makeProfile({ trainingDaysPerWeek: 6, macrocycles: [] }), setup, '2026-11-08');
    expect(getActiveMacrocycle(profile.macrocycles, '2026-11-17')?.label).toContain('Base 1');
    const session = generateSessionForDate(profile, [], new Date('2026-11-18T12:00:00'), []);
    expect(session.strengthProgramLabel).toBeUndefined();
    const program = profile.strengthPrograms![0];
    if (!isCompanionProgram(program)) throw new Error('debería convivir');
    expect(companionStatus(program, '2026-11-15').kind).toBe('no-empieza');
    expect(companionStatus(program, '2026-11-16').kind).toBe('oferta');
    expect(companionStatus(program, '2026-11-17').kind).toBe('oferta'); // aún no hecha: sigue pendiente
  });
});
