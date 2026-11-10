import { describe, expect, it } from 'vitest';
import type { Goal, Macrocycle } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { refitSeason } from './seasonRefit';
import { buildBlocksToCompetition } from './seasonSetup';

let n = 0;
const ids = () => `r${++n}`;
const comp = (targetDate: string, extra: Partial<Goal> = {}): Goal => ({ id: 'g', type: 'preparar-competicion', targetDate, emphasis: 'moderado', createdAt: '2026-11-10', provisional: true, ...extra });
const season = (end: string, from = '2026-11-16'): Macrocycle[] => buildBlocksToCompetition(from, end, ids, 'g');
const otono: Macrocycle = { id: 'otono', label: 'Otono', startDate: '2026-09-23', endDate: '2026-11-15' };

describe('reajustar la temporada al cambiar la fecha de la competicion', () => {
  it('sin bloques de esa competicion, o con la fecha igual, no hace nada', () => {
    expect(refitSeason(makeProfile({ goals: [comp('2027-03-02')], macrocycles: [otono] }), 'g', '2026-11-12')).toBeNull();
    expect(refitSeason(makeProfile({ goals: [comp('2027-03-02')], macrocycles: [otono, ...season('2027-03-02')] }), 'g', '2026-11-12')).toBeNull();
  });

  it('una competicion mas tarde alarga el pico: bloques rehechos hasta una semana despues, sin huecos ni solapes', () => {
    const profile = makeProfile({ goals: [comp('2027-03-16')], macrocycles: [otono, ...season('2027-03-02')] });
    const r = refitSeason(profile, 'g', '2026-11-12', ids)!;
    expect(r.shiftWeeks).toBe(2);
    expect(r.summary).toContain('2 semanas más tarde');
    const mine = r.macrocycles.filter((m) => m.forGoalId === 'g');
    expect(mine[0].startDate).toBe('2026-11-16');
    expect(mine[mine.length - 1].endDate).toBe('2027-03-23');
    for (let i = 1; i < r.macrocycles.length; i++) expect(r.macrocycles[i].startDate).toBe(new Date(new Date(`${r.macrocycles[i - 1].endDate}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10));
  });

  it('una competicion mas cerca acorta; con el bloque ya en marcha, se recorta el dia antes del lunes siguiente', () => {
    const profile = makeProfile({ goals: [comp('2027-02-02')], macrocycles: [otono, ...season('2027-03-02')] });
    const r = refitSeason(profile, 'g', '2026-12-02', ids)!;
    expect(r.shiftWeeks).toBeLessThan(0);
    const mine = r.macrocycles.filter((m) => m.forGoalId === 'g');
    expect(mine[0].startDate).toBe('2026-11-16');
    expect(mine[0].endDate).toBe('2026-12-06');
    expect(mine[1].startDate).toBe('2026-12-07');
    expect(mine[mine.length - 1].endDate).toBe('2027-02-09');
    // lo de otros macros no se toca
    expect(r.macrocycles.find((m) => m.id === 'otono')).toEqual(otono);
  });

  it('los bloques ya terminados se conservan', () => {
    const profile = makeProfile({ goals: [comp('2027-03-16')], macrocycles: [otono, ...season('2027-03-02')] });
    const r = refitSeason(profile, 'g', '2027-01-05', ids)!;
    const first = profile.macrocycles.find((m) => m.forGoalId === 'g')!;
    expect(r.macrocycles.find((m) => m.id === first.id)).toEqual(first);
  });

  it('sin tiempo para bloques nuevos, estira el ultimo hasta la nueva fecha', () => {
    const profile = makeProfile({ goals: [comp('2027-03-02', { id: 'g' })], macrocycles: [otono, ...season('2027-03-02')] });
    const moved = { ...profile, goals: [{ ...profile.goals[0], targetDate: '2027-02-20' }] };
    const r = refitSeason(moved, 'g', '2027-02-10', ids)!;
    const last = r.macrocycles[r.macrocycles.length - 1];
    expect(last.endDate).toBe('2027-02-27');
  });
});