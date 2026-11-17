import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult, WorkSetEntry } from '../../data/athlete/types';
import { workDoneLines, workSummary } from './workDoneLines';

const set = (movementId: string, block: 'strength' | 'oly', setNumber: number, kg: number): WorkSetEntry => ({ date: '2026-11-17', movementId, block, setNumber, kg, reps: 5 });
const blocks: SessionBlockResult[] = [
  { block: 'strength', movementId: 'bench-press', sets: 4, reps: '5', loadKg: 67.5 },
  { block: 'strength', movementId: 'pendlay-row', sets: 3, reps: '10', loadKg: 57.5 },
  { block: 'wod', movementId: 'benchmark:x' },
  { block: 'oly', movementId: 'movement-specific-primer', subgroup: 'Calentamiento de barra' },
  { block: 'oly', movementId: 'muscle-clean', sets: 3, reps: '2-3', loadKg: 35 },
  { block: 'oly', movementId: 'power-clean', format: 'Complejo', sets: 4, reps: '1+1+1', loadKg: 60, complex: { id: 'c1', name: 'Power clean + hang power clean + split jerk', steps: [{ movementId: 'power-clean', reps: 1 }] } },
];
const session: DailySession = { date: '2026-11-17', mesocycleWeek: 2, isRestDay: false, blocks };

describe('lo hecho de verdad bajo fuerza y oly', () => {
  it('resume las series anotadas por movimiento, con el peso o el rango, y el complejo por su clave de registro', () => {
    const log = [
      ...[1, 2, 3, 4].map((n) => set('bench-press', 'strength', n, 67.5)),
      set('pendlay-row', 'strength', 1, 55),
      set('pendlay-row', 'strength', 2, 57.5),
      set('complex:c1', 'oly', 1, 60),
      set('complex:c1', 'oly', 2, 62.5),
    ];
    const lines = workDoneLines(session, log);
    expect(lines.strength).toEqual([
      { name: 'Bench Press', text: '4/4 series · 67.5 kg' },
      { name: 'Pendlay Row', text: '2/3 series · 55–57.5 kg' },
    ]);
    expect(lines.oly).toEqual([{ name: 'Power clean + hang power clean + split jerk', text: '2/4 series · 60–62.5 kg' }]);
  });

  it('un movimiento sin series anotadas no sale, y el calentamiento nunca', () => {
    const lines = workDoneLines(session, [set('bench-press', 'strength', 1, 67.5), set('movement-specific-primer', 'oly', 1, 40)]);
    expect(lines.strength).toEqual([{ name: 'Bench Press', text: '1/4 series · 67.5 kg' }]);
    expect(lines.oly).toBeUndefined();
  });

  it('sin registro, o en una sesión propia, no hay líneas', () => {
    expect(workDoneLines(session, [])).toEqual({});
    expect(workDoneLines({ ...session, source: 'custom' }, [set('bench-press', 'strength', 1, 60)])).toEqual({});
  });

  it('workSummary: sin prescripción cuenta solo las series, y sin kilos no pone peso', () => {
    expect(workSummary([set('x', 'strength', 1, 0), set('x', 'strength', 2, 0)], 'x', 0)).toBe('2 series');
    expect(workSummary([], 'x', 3)).toBeNull();
  });
});
