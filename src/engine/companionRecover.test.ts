import { describe, expect, it } from 'vitest';
import type { CompanionLogEntry } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { companionStatus, isCompanionProgram, orphanCompanionEntries, recoverCompanion } from './strengthCompanion';
import { buildTexasProgram } from './seasonSetup';

const TODAY = '2026-11-12';
const done = (programId: string, index: number, date: string, extra: Partial<CompanionLogEntry> = {}): CompanionLogEntry => ({ id: `${programId}|${index}`, programId, index, date, outcome: 'hecha', ...extra });

// El programa nuevo (empezó de cero al rehacer la temporada) y las dos sesiones del anterior, que ya no existe.
const fresh = () => buildTexasProgram(TODAY, () => 'nuevo');
const withLost = (extra: CompanionLogEntry[] = []) =>
  makeProfile({
    strengthPrograms: [fresh()],
    companionLog: [
      done('viejo', 0, '2026-11-10', { lifts: [{ movementId: 'back-squat', sets: 5, reps: '5', loadKg: 120 }] }),
      done('viejo', 1, '2026-11-11', { lifts: [{ movementId: 'back-squat', sets: 1, reps: '5', loadKg: 130, attempt: true, achieved: 132.5 }] }),
      ...extra,
    ],
  });

describe('recuperar las sesiones de un programa que se perdio', () => {
  it('encuentra las sesiones de un programa que ya no existe, de las ultimas semanas y en orden', () => {
    expect(orphanCompanionEntries(withLost(), TODAY).map((e) => e.index)).toEqual([0, 1]);
  });

  it('no mira lo antiguo (mas de 4 semanas) ni lo de programas que si existen, y solo coge el programa perdido mas reciente', () => {
    const old = [done('muy-viejo', 0, '2026-09-01'), done('muy-viejo', 1, '2026-09-03')];
    const mine = [done('nuevo', 0, '2026-11-12')];
    expect(orphanCompanionEntries(withLost([...old, ...mine]), TODAY).map((e) => e.programId)).toEqual(['viejo', 'viejo']);
    const two = [done('otro', 0, '2026-10-20'), done('otro', 1, '2026-10-22'), done('otro', 2, '2026-10-24')];
    expect(orphanCompanionEntries(withLost(two), TODAY).map((e) => e.programId)).toEqual(['viejo', 'viejo']);
  });

  it('el programa sigue desde la siguiente sesion, con lo hecho a su nombre y las marcas logradas como su 5RM', () => {
    const next = recoverCompanion(withLost(), 'nuevo', TODAY);
    const program = next.strengthPrograms![0];
    if (!isCompanionProgram(program)) throw new Error('debería convivir');
    expect(program.companion.cursor).toBe(2);
    expect(program.companion.lastResolvedOn).toBe('2026-11-11');
    expect(program.companion.fiveRm?.backSquat).toBe(132.5);
    expect(program.startDate <= '2026-11-10').toBe(true);
    expect(next.companionLog!.map((e) => e.id).sort()).toEqual(['nuevo|0', 'nuevo|1']);
    expect(next.companionLog!.every((e) => e.programId === 'nuevo')).toBe(true);
    // ya no hay nada que recuperar, y el estado de hoy es el de un programa en curso
    expect(orphanCompanionEntries(next, TODAY)).toEqual([]);
    expect(companionStatus(program, TODAY).kind).not.toBe('no-empieza');
  });

  it('nunca pisa un programa que ya ha avanzado, y sin nada perdido no cambia nada', () => {
    const advanced = withLost();
    const p = advanced.strengthPrograms![0];
    if (!isCompanionProgram(p)) throw new Error('x');
    const moved = { ...advanced, strengthPrograms: [{ ...p, companion: { ...p.companion, cursor: 1 } }] };
    expect(recoverCompanion(moved, 'nuevo', TODAY)).toBe(moved);
    const clean = makeProfile({ strengthPrograms: [fresh()], companionLog: [] });
    expect(recoverCompanion(clean, 'nuevo', TODAY)).toBe(clean);
  });
});
