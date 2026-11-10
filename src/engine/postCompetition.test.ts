import { describe, expect, it } from 'vitest';
import type { Goal } from '../data/athlete/types';
import { buildBlocksToCompetition, competitionToClose, nextCompetitionGoal } from './postCompetition';
import { addDaysIso } from './periodization';

const goal = (id: string, targetDate: string, eventEndDate?: string, extra: Partial<Goal> = {}): Goal => ({ id, type: 'preparar-competicion', targetDate, ...(eventEndDate ? { eventEndDate } : {}), emphasis: 'intensivo', createdAt: '2026-09-01', ...extra });
const ids = () => {
  let i = 0;
  return () => `m${++i}`;
};

describe('competicion por cerrar', () => {
  const comp = goal('a', '2026-11-06', '2026-11-07');

  it('desde el dia siguiente al ultimo dia y hasta 30 dias despues', () => {
    expect(competitionToClose([comp], '2026-11-07')).toBeNull();
    expect(competitionToClose([comp], '2026-11-08')).toMatchObject({ daysSince: 1, eventEnd: '2026-11-07' });
    expect(competitionToClose([comp], '2026-11-10')?.daysSince).toBe(3);
    expect(competitionToClose([comp], '2026-12-07')?.daysSince).toBe(30);
    expect(competitionToClose([comp], '2026-12-08')).toBeNull();
  });

  it('una ya cerrada, o un objetivo que no es de competicion, no cuenta', () => {
    expect(competitionToClose([{ ...comp, result: { feeling: 4, closedAt: '2026-11-09' } }], '2026-11-10')).toBeNull();
    expect(competitionToClose([{ ...comp, type: 'subir-pr' }], '2026-11-10')).toBeNull();
    expect(competitionToClose(undefined, '2026-11-10')).toBeNull();
  });

  it('con varias, la mas reciente', () => {
    const older = goal('b', '2026-10-17');
    expect(competitionToClose([older, comp], '2026-11-10')?.goal.id).toBe('a');
  });
});

describe('siguiente competicion', () => {
  it('la mas proxima que aun no ha empezado', () => {
    const goals = [goal('a', '2026-11-06'), goal('far', '2027-05-01'), goal('near', '2027-02-06')];
    expect(nextCompetitionGoal(goals, '2026-11-10')?.id).toBe('near');
    expect(nextCompetitionGoal([goal('a', '2026-11-06')], '2026-11-10')).toBeNull();
  });
});

describe('bloques hasta la competicion', () => {
  const START = '2026-11-16';
  const covers = (macros: ReturnType<typeof buildBlocksToCompetition>) => {
    for (let i = 1; i < macros.length; i++) expect(macros[i].startDate).toBe(addDaysIso(macros[i - 1].endDate, 1));
  };

  it('con 14 semanas o mas, tres bloques sin huecos que acaban una semana despues de la competicion', () => {
    const m = buildBlocksToCompetition(START, '2027-03-13', ids());
    expect(m).toHaveLength(3);
    expect(m[0].startDate).toBe(START);
    expect(m[2].endDate).toBe('2027-03-20');
    covers(m);
    for (const b of m) expect(b.phaseWeeks!.reduce((a, c) => a + c, 0)).toBeGreaterThanOrEqual(4);
  });

  it('de 8 a 13 semanas, dos bloques; de 4 a 7, solo el pico; menos, ninguno', () => {
    expect(buildBlocksToCompetition(START, '2027-01-23', ids())).toHaveLength(2);
    expect(buildBlocksToCompetition(START, '2026-12-12', ids())).toHaveLength(1);
    expect(buildBlocksToCompetition(START, '2026-11-28', ids())).toHaveLength(0);
  });

  it('las fases de cada bloque suman las semanas del bloque', () => {
    for (const end of ['2027-03-13', '2027-01-23', '2026-12-12']) {
      const m = buildBlocksToCompetition(START, end, ids());
      for (const b of m) {
        const weeks = Math.round((new Date(`${b.endDate}T00:00:00`).getTime() - new Date(`${b.startDate}T00:00:00`).getTime() + 86400000) / (7 * 86400000));
        expect(b.phaseWeeks!.reduce((a, c) => a + c, 0)).toBe(weeks);
      }
    }
  });
});
