import { describe, expect, it } from 'vitest';
import { makeProfile } from './__fixtures';
import { applySeasonSetup, backupBeforeSeason, blockLengths, blockPhaseWeeks, buildSeasonSetup, describeRemovals, nextMondayIso, restoreSeasonBackup, seasonEndIso, swapToTexas, TEXAS_WEEKS } from './seasonSetup';
import { getActiveMacrocycle, totalMacrocycleWeeks } from './periodization';
import { generateSessionForDate } from './generateSession';
import { companionStatus, companionTotalSessions, isCompanionProgram } from './strengthCompanion';

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

  it('el programa es un Texas Method de 8 semanas que convive con el macro, lunes, miércoles y viernes, desde mañana', () => {
    expect(setup.program).toMatchObject({ method: 'texas', startDate: '2026-11-09', lifts: ['backSquat', 'benchPress', 'strictPress'] });
    expect(isCompanionProgram(setup.program)).toBe(true);
    expect(setup.program.companion).toMatchObject({ weekdays: [0, 2, 4], weeks: 8, cursor: 0, deferrals: 0 });
    expect(companionTotalSessions(setup.program)).toBe(24);
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
    expect(companionStatus(program, '2026-11-08').kind).toBe('no-empieza');
    expect(companionStatus(program, '2026-11-09').kind).toBe('oferta');
    expect(companionStatus(program, '2026-11-10').kind).toBe('oferta'); // aún no hecha: sigue pendiente
  });
});

describe('cambiar el programa que convive por el Texas Method', () => {
  it('quita el programa que convivía, deja los demás y no toca el macro', () => {
    const setup = buildSeasonSetup('2026-11-08', ids)!;
    const normal = { id: 'n', startDate: '2026-12-01', endDate: '2027-01-01', method: '531' as const, lifts: [] };
    const profile = makeProfile({ macrocycles: setup.macrocycles, strengthPrograms: [normal, { ...setup.program, method: 'temporada' }] });
    const next = swapToTexas(profile, '2026-11-08', ids);
    expect(next.macrocycles).toBe(profile.macrocycles);
    expect(next.strengthPrograms?.map((p) => p.method)).toEqual(['531', 'texas']);
    expect(next.strengthPrograms?.[1]).toMatchObject({ startDate: '2026-11-09' });
    expect(TEXAS_WEEKS).toBe(8);
  });
});


describe('temporada con una competicion a la vista', () => {
  const comp = { goalId: 'g', start: '2027-03-02', end: '2027-03-02', provisional: true };
  const goal = (id: string, targetDate: string, extra = {}) => ({ id, type: 'subir-pr' as const, movementId: 'back-squat', targetDate, emphasis: 'moderado' as const, createdAt: '2026-09-01', ...extra });

  it('los bloques empiezan el lunes siguiente y acaban una semana despues de la competicion', () => {
    const setup = buildSeasonSetup('2026-11-10', ids, { competition: comp })!;
    expect(setup.startDate).toBe('2026-11-16');
    expect(setup.endDate).toBe('2027-03-09');
    expect(setup.competition).toEqual(comp);
    expect(setup.macrocycles[0].startDate).toBe('2026-11-16');
    expect(setup.macrocycles[setup.macrocycles.length - 1].endDate).toBe('2027-03-09');
  });

  it('sin tiempo para un bloque (menos de 4 semanas) no se propone', () => {
    expect(buildSeasonSetup('2026-11-10', ids, { competition: { ...comp, start: '2026-11-28', end: '2026-11-28' } })).toBeNull();
  });

  it('aplicar mantiene la competicion y los objetivos no vencidos, y recorta el macro de ahora', () => {
    const old = { id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-12-16' };
    const profile = makeProfile({
      macrocycles: [old],
      goals: [goal('vigente', '2027-02-01'), goal('vencido', '2026-10-20'), { ...goal('cerrada', '2026-11-06'), type: 'preparar-competicion' as const, result: { feeling: 4 as const, closedAt: '2026-11-10' } }, { ...goal('g', '2027-03-02'), type: 'preparar-competicion' as const }],
    });
    const setup = buildSeasonSetup('2026-11-10', ids, { competition: comp })!;
    const next = applySeasonSetup(profile, setup, '2026-11-10');
    expect(next.goals.map((g) => g.id).sort()).toEqual(['cerrada', 'g', 'vigente']);
    expect(next.macrocycles.find((m) => m.id === 'otono')?.endDate).toBe('2026-11-15');
    expect(next.macrocycles).toHaveLength(1 + setup.macrocycles.length);
    const sorted = [...next.macrocycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].startDate > sorted[i - 1].endDate).toBe(true);
  });

  it('lo que se quita solo cuenta lo que cae en la temporada y los objetivos vencidos', () => {
    const profile = makeProfile({ macrocycles: [{ id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-12-16' }], goals: [goal('vigente', '2027-02-01'), goal('vencido', '2026-10-20')] });
    const setup = buildSeasonSetup('2026-11-10', ids, { competition: comp })!;
    const removed = describeRemovals(profile, setup, '2026-11-10');
    expect(removed.goals).toBe(1);
    expect(removed.macrocycles).toHaveLength(1);
    // sin competicion se quita todo, como siempre
    expect(describeRemovals(profile).goals).toBe(2);
  });

  it('sin competicion, aplicar sigue sustituyendo macros y objetivos', () => {
    const profile = makeProfile({ macrocycles: [{ id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-12-16' }], goals: [goal('vigente', '2027-02-01')] });
    const next = applySeasonSetup(profile, buildSeasonSetup('2026-11-10', ids)!, '2026-11-10');
    expect(next.goals).toEqual([]);
    expect(next.macrocycles.some((m) => m.id === 'otono')).toBe(false);
  });
});