import { describe, expect, it } from 'vitest';
import { makeProfile } from './__fixtures';
import { companionSchedule } from './companionSchedule';
import { generateCompanionSession } from './generateSession';
import { buildTexasProgram } from './seasonSetup';
import { completeCompanion, skipCompanion } from './strengthCompanion';

let n = 0;
const program = buildTexasProgram('2026-11-08', () => `t${++n}`);
const profile = () => makeProfile({ strengthPrograms: [program], macrocycles: [{ id: 'm', label: 'M', startDate: '2026-11-09', endDate: '2027-06-27' }], trainingDaysPerWeek: 6 });

describe('Texas Method clásico que convive con el macro', () => {
  it('son 8 semanas de 3 sesiones: lunes volumen, miércoles recuperación, viernes intensidad', () => {
    const weeks = companionSchedule(profile(), [], program, '2026-11-08');
    expect(weeks).toHaveLength(8);
    expect(weeks.every((w) => w.sessions.length === 3)).toBe(true);
    const w1 = weeks[0].sessions;
    expect(w1.map((s) => s.weekday)).toEqual([0, 2, 4]);
    expect(w1.map((s) => s.role.split('·')[1].trim())).toEqual(['día de volumen', 'día de recuperación', 'día de intensidad']);
    expect(w1.map((s) => s.lines.map((l) => l.scheme).join(' + '))).toEqual(['5×5 + 5×5', '2×5 + 3×5', '1×5 + 1×5']);
    expect(w1[2].lines.every((l) => l.attempt)).toBe(true);
    expect(w1.flatMap((s) => s.lines).every((l) => l.percent === null)).toBe(true);
  });

  it('cada semana lleva sentadilla y un press, y banca y press militar se alternan', () => {
    const weeks = companionSchedule(profile(), [], program, '2026-11-08');
    const names = (w: number) => weeks[w].sessions.flatMap((s) => s.lines.map((l) => l.movementName));
    expect(names(0).filter((x) => x === 'Back Squat')).toHaveLength(3);
    expect(new Set(names(0))).toEqual(new Set(['Back Squat', 'Bench Press', 'Strict Press']));
    expect(names(0)[1]).not.toBe(names(1)[1]);
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.isTest)).toBe(false);
  });

  it('la marca del viernes sube semana a semana', () => {
    const weeks = companionSchedule(profile(), [], program, '2026-11-08');
    const squatMark = (w: number) => weeks[w].sessions[2].lines.find((l) => l.movementName === 'Back Squat')!.loadKg;
    expect(squatMark(1)).toBeGreaterThan(squatMark(0));
    expect(squatMark(7)).toBeGreaterThan(squatMark(3));
  });

  it('marca la siguiente, las hechas y las saltadas', () => {
    let p = profile();
    p = completeCompanion(p, program.id, '2026-11-09', { rpe: 7 });
    p = skipCompanion(p, program.id, '2026-11-11');
    const prog = p.strengthPrograms![0] as typeof program;
    const w = companionSchedule(p, [], prog, '2026-11-12');
    expect(w[0].sessions.map((s) => s.state)).toEqual(['hecha', 'saltada', 'siguiente']);
    expect(w[1].sessions[0].state).toBe('pendiente');
  });

  it('un viernes logrado sube el 5RM de verdad y las sesiones siguientes parten de él', () => {
    let p = profile();
    const day = () => generateCompanionSession(p, [], p.strengthPrograms![0] as typeof program, '2026-11-20', { neutral: true });
    p = completeCompanion(p, program.id, '2026-11-09');
    p = completeCompanion(p, program.id, '2026-11-11');
    const friday = day()!;
    expect(friday.intensity).toBe(true);
    const target = friday.lifts.find((l) => l.prKey === 'backSquat')!.loadKg;
    p = completeCompanion(p, program.id, '2026-11-13', { achieved: { backSquat: target } });
    expect((p.strengthPrograms![0] as typeof program).companion.fiveRm?.backSquat).toBe(target);
    const monday = generateCompanionSession(p, [], p.strengthPrograms![0] as typeof program, '2026-11-16', { neutral: true })!;
    expect(monday.lifts[0].loadKg).toBeCloseTo(0.9 * target, -1);
    expect(monday).toMatchObject({ weeks: 8, total: 24, intensity: false });
  });
});
