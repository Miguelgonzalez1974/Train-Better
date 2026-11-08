import { describe, expect, it } from 'vitest';
import { makeProfile } from './__fixtures';
import { companionSchedule } from './companionSchedule';
import { generateCompanionSession } from './generateSession';
import { buildTexasProgram } from './seasonSetup';
import { completeCompanion, skipCompanion } from './strengthCompanion';

let n = 0;
const program = buildTexasProgram('2026-11-08', () => `t${++n}`);
const profile = () => makeProfile({ strengthPrograms: [program], macrocycles: [{ id: 'm', label: 'M', startDate: '2026-11-09', endDate: '2027-06-27' }], trainingDaysPerWeek: 6 });

describe('Texas Method que convive con el macro', () => {
  it('son 8 semanas de 3 sesiones: lunes volumen, miércoles recuperación, viernes intensidad', () => {
    const weeks = companionSchedule(profile(), [], program, '2026-11-08');
    expect(weeks).toHaveLength(8);
    expect(weeks.every((w) => w.sessions.length === 3)).toBe(true);
    const w1 = weeks[0].sessions;
    expect(w1.map((s) => s.weekday)).toEqual([0, 2, 4]);
    expect(w1.map((s) => s.scheme)).toEqual(['5×5', '2×5', '1×3']);
    // el peso se redondea al disco más cercano, así que el % real baila uno o dos puntos
    [85, 70, 95].forEach((pct, i) => expect(Math.abs((w1[i].percent ?? 0) - pct)).toBeLessThanOrEqual(2));
    expect(w1.map((s) => s.role.split('·')[1].trim())).toEqual(['día de volumen', 'día de recuperación', 'día de intensidad']);
  });

  it('el levantamiento rota por semana (sentadilla, press banca, press militar) y no hay tests', () => {
    const weeks = companionSchedule(profile(), [], program, '2026-11-08');
    const lift = (w: number) => weeks[w].sessions[0].movementName;
    expect(new Set(weeks[0].sessions.map((s) => s.movementName)).size).toBe(1);
    expect([lift(0), lift(1), lift(2), lift(3)].length).toBe(4);
    expect(lift(0)).toBe(lift(3));
    expect(lift(0)).not.toBe(lift(1));
    expect(lift(1)).not.toBe(lift(2));
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.isTest)).toBe(false);
  });

  it('marca la siguiente, las hechas y las saltadas', () => {
    let p = profile();
    p = completeCompanion(p, program.id, '2026-11-09', { rpe: 7 });
    p = skipCompanion(p, program.id, '2026-11-11');
    const prog = p.strengthPrograms![0] as typeof program;
    const w1 = companionSchedule(p, [], prog, '2026-11-12')[0].sessions;
    expect(w1.map((s) => s.state)).toEqual(['hecha', 'saltada', 'siguiente']);
    expect(companionSchedule(p, [], prog, '2026-11-12')[1].sessions[0].state).toBe('pendiente');
  });

  it('sin autorregulación el plan es el mismo cualquier día; con ella, la sesión de hoy puede salir distinta', () => {
    const a = companionSchedule(profile(), [], program, '2026-11-08')[0].sessions[0].loadKg;
    const b = companionSchedule(profile(), [], program, '2026-12-20')[0].sessions[0].loadKg;
    expect(a).toBe(b);
    const real = generateCompanionSession(profile(), [], program, '2026-11-08');
    expect(real).toMatchObject({ weeks: 8, total: 24 });
    expect(real!.role).toContain('volumen');
  });
});
