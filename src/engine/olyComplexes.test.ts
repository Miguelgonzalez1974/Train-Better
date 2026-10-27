import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUILTIN_COMPLEXES, complexNotation, complexTotalReps, builtinComplexNameFromLogId, complexLogId, isComplexLogId, type OlyComplex } from '../data/complexes';
import { getMovementById, resolveMovementDisplayName } from '../data/movements';
import { buildComplexBlock, buildComplexPool, complexBaseKg, pickComplex, stepCapacityKg } from './olyComplexes';
import { buildMicrocyclePlan } from './weekPlan';
import { generateSessionForDate, isRealWodSelectionEnabled, planWeekLocks, setRealWodSelectionEnabled } from './generateSession';
import { consecutiveDates, makeProfile } from './__fixtures';
import { isStrengthOnlyDay } from './periodization';
import type { DailySession, Goal } from '../data/athlete/types';

const PRS = { backSquat: 140, frontSquat: 115, benchPress: 100, deadlift: 180, strictPress: 62, clean: 105, snatch: 80, cleanAndJerk: 100 };

describe('librería de complejos', () => {
  it('los ids no se repiten y todos los pasos existen en el catálogo', () => {
    const ids = BUILTIN_COMPLEXES.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const missing = BUILTIN_COMPLEXES.flatMap((x) => x.steps.filter((s) => !getMovementById(s.movementId)).map((s) => `${x.id}: ${s.movementId}`));
    expect(missing).toEqual([]);
  });

  it('cada complejo de fábrica tiene al menos 2 pasos, un enfoque y un peso calculable', () => {
    for (const x of BUILTIN_COMPLEXES) {
      expect(x.steps.length, x.id).toBeGreaterThanOrEqual(2);
      expect(x.focus.length, x.id).toBeGreaterThan(0);
      const kg = complexBaseKg(x, PRS);
      expect(kg, x.id).not.toBeNull();
      expect(kg!, x.id).toBeGreaterThan(20);
      expect(kg!, x.id).toBeLessThan(110);
    }
  });

  it('hay complejos de las tres familias, de varios enfoques', () => {
    const fams = new Set(BUILTIN_COMPLEXES.map((x) => x.family));
    expect(fams).toEqual(new Set(['snatch', 'clean', 'mixto']));
    expect(new Set(BUILTIN_COMPLEXES.flatMap((x) => x.focus)).size).toBeGreaterThanOrEqual(5);
    expect(BUILTIN_COMPLEXES.length).toBeGreaterThanOrEqual(25);
  });

  it('la notación y las repeticiones totales salen de los pasos', () => {
    const classic = BUILTIN_COMPLEXES.find((x) => x.id === 'cl-clasico')!;
    expect(complexNotation(classic)).toBe('1+2+1');
    expect(complexTotalReps(classic)).toBe(4);
  });

  it('la clave de registro no es un movimiento del catálogo y se reconoce y se nombra', () => {
    const key = complexLogId('cl-clasico');
    expect(isComplexLogId(key)).toBe(true);
    expect(getMovementById(key)).toBeUndefined();
    expect(builtinComplexNameFromLogId(key)).toBe('Clásico: clean + front squat + jerk');
    expect(resolveMovementDisplayName(key)).toBe('Clásico: clean + front squat + jerk');
    expect(resolveMovementDisplayName(complexLogId('custom-1'))).toBe('Complejo propio');
  });
});

describe('peso de un complejo', () => {
  it('manda el paso más flojo y encadenar rebaja la carga', () => {
    const classic = BUILTIN_COMPLEXES.find((x) => x.id === 'cl-clasico')!;
    const kg = complexBaseKg(classic, PRS)!;
    // El clean (105) y el jerk (105) mandan: 105 × 0,72 ≈ 75.
    expect(kg).toBeGreaterThan(70);
    expect(kg).toBeLessThan(80);
    const weakJerk = complexBaseKg(classic, PRS, { splitJerk: 70 })!;
    expect(weakJerk).toBeLessThan(kg);
  });

  it('un movimiento que no se sabe valorar deja el complejo sin peso', () => {
    expect(stepCapacityKg('movimiento-inexistente', PRS)).toBeNull();
    expect(complexBaseKg({ id: 'x', name: 'x', family: 'clean', focus: ['tecnica'], steps: [{ movementId: 'nada', reps: 1 }, { movementId: 'clean', reps: 1 }] }, PRS)).toBeNull();
  });

  it('un complejo propio puede ajustar su carga', () => {
    const base = BUILTIN_COMPLEXES[0];
    expect(complexBaseKg({ ...base, loadAdjust: 0.9 }, PRS)!).toBeCloseTo(complexBaseKg(base, PRS)! * 0.9, 5);
  });

  it('el bloque lleva un peso por serie, la segunda mitad un escalón más alta, y la carga fuerte es la última', () => {
    const classic = BUILTIN_COMPLEXES.find((x) => x.id === 'cl-clasico')!;
    const block = buildComplexBlock({ complex: classic, week: 2, prs: PRS, dayFactor: 1, notes: '' })!;
    expect(block.sets).toBe(5);
    expect(block.reps).toBe('1+2+1');
    expect(block.complex?.id).toBe('cl-clasico');
    expect(block.setPlan).toHaveLength(5);
    expect(block.setPlan![4].kg).toBe(block.loadKg);
    expect(block.setPlan![0].kg).toBeLessThan(block.loadKg!);
    expect(block.setPlan!.every((s) => s.reps === 4)).toBe(true);
  });

  it('la carga sube del bloque (semana 1) al pico (3) y baja en la descarga', () => {
    const x = BUILTIN_COMPLEXES.find((y) => y.id === 'cl-clasico')!;
    const kg = (week: 1 | 2 | 3 | 4) => buildComplexBlock({ complex: x, week, prs: PRS, dayFactor: 1, notes: '' })!.loadKg!;
    expect(kg(3)).toBeGreaterThan(kg(2));
    expect(kg(2)).toBeGreaterThan(kg(1));
    expect(kg(4)).toBeLessThan(kg(1));
  });
});

describe('elección del complejo', () => {
  const pool = buildComplexPool(undefined, undefined);
  const draw = (v: number) => () => v;

  it('solo de la familia del día (y mixtos)', () => {
    for (const v of [0, 0.3, 0.6, 0.99]) {
      const x = pickComplex({ family: 'snatch', week: 2, pool, recentMovementIds: new Set(), receivingFocus: false, draw: draw(v) })!;
      expect(['snatch', 'mixto']).toContain(x.family);
    }
  });

  it('prefiere el enfoque de la semana: técnica en la 1, jerk o fuerza en la 3', () => {
    const w1 = pickComplex({ family: 'clean', week: 1, pool, recentMovementIds: new Set(), receivingFocus: false, draw: draw(0.2) })!;
    expect(w1.focus).toContain('tecnica');
    const w3 = pickComplex({ family: 'clean', week: 3, pool, recentMovementIds: new Set(), receivingFocus: false, draw: draw(0.2) })!;
    expect(w3.focus.some((f) => f === 'jerk' || f === 'fuerza')).toBe(true);
  });

  it('con foco de recepción elige uno de recepción', () => {
    const x = pickComplex({ family: 'snatch', week: 1, pool, recentMovementIds: new Set(), receivingFocus: true, draw: draw(0.5) })!;
    expect(x.focus).toContain('recepcion');
  });

  it('un complejo oculto no sale nunca', () => {
    const all = buildComplexPool(undefined, undefined).all.filter((x) => x.family === 'clean');
    const hiddenPool = buildComplexPool(undefined, { favorites: [], hidden: all.map((x) => x.id) });
    // Solo quedan los mixtos.
    for (const v of [0, 0.5, 0.99]) {
      const x = pickComplex({ family: 'clean', week: 2, pool: hiddenPool, recentMovementIds: new Set(), receivingFocus: false, draw: draw(v) });
      expect(x?.family === 'clean').toBe(false);
    }
  });

  it('se prefiere el que menos pasos repite de lo reciente', () => {
    const recent = new Set(['snatch-pull', 'hang-snatch', 'overhead-squat', 'power-snatch', 'muscle-snatch']);
    const x = pickComplex({ family: 'snatch', week: 2, pool, recentMovementIds: recent, receivingFocus: false, draw: draw(0.4) })!;
    const overlap = x.steps.filter((s) => recent.has(s.movementId)).length;
    const minOverlap = Math.min(
      ...pool.all.filter((y) => (y.family === 'snatch' || y.family === 'mixto') && y.focus.some((f) => f === 'potencia' || f === 'recepcion')).map((y) => y.steps.filter((s) => recent.has(s.movementId)).length),
    );
    expect(overlap).toBe(minOverlap);
  });

  it('los propios y los favoritos tienen ventaja pero no excluyen a los demás', () => {
    const mine: OlyComplex = { id: 'mio', name: 'Mío', family: 'clean', focus: ['tecnica'], custom: true, steps: [{ movementId: 'hang-clean', reps: 2 }, { movementId: 'split-jerk', reps: 1 }] };
    const withMine = buildComplexPool([mine], undefined);
    const picks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((v) => pickComplex({ family: 'clean', week: 1, pool: withMine, recentMovementIds: new Set(), receivingFocus: false, draw: draw(v) })!.id);
    expect(picks.filter((id) => id === 'mio').length).toBeGreaterThan(0);
    expect(new Set(picks).size).toBeGreaterThan(1);
  });
});

describe('semana: un complejo de clean y uno de snatch', () => {
  it('como mucho uno de cada familia, nunca en el día combinado ni en el de solo fuerza', () => {
    for (const n of [3, 4, 5, 6] as const) {
      for (let weekNumber = 1; weekNumber <= 8; weekNumber++) {
        const plan = buildMicrocyclePlan({
          macroId: 'm1', weekNumber, phase: ((weekNumber % 4) + 1) as 1 | 2 | 3 | 4, trainingDaysPerWeek: n,
          responseProfile: { perLift: [] } as never, avoidedPatterns: new Set(), goalForcedPattern: null, goalForcedFamily: null,
        } as never);
        const flagged = (plan.olyComplex ?? []).map((on, idx) => (on ? idx : -1)).filter((idx) => idx >= 0);
        const fams = flagged.map((idx) => plan.olyFamily[idx]);
        expect(new Set(fams).size, `n=${n} semana ${weekNumber}`).toBe(fams.length);
        for (const idx of flagged) {
          expect(plan.olyCombined[idx]).toBe(false);
          expect(isStrengthOnlyDay(n, idx)).toBe(false);
        }
        if (n >= 4) expect(flagged.length, `n=${n} semana ${weekNumber}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

const REAL_WOD_INITIAL = isRealWodSelectionEnabled();
beforeAll(() => setRealWodSelectionEnabled(false));
afterAll(() => setRealWodSelectionEnabled(REAL_WOD_INITIAL));

describe('complejos en las sesiones generadas', () => {
  const profile = makeProfile({ trainingDaysPerWeek: 6 });
  const days = consecutiveDates('2026-01-05', 140);
  const sessions = days.map((d) => generateSessionForDate(profile, [], d, profile.goals));
  const complexDays = sessions.flatMap((s) => {
    const block = s.blocks.find((b) => b.complex);
    return block ? [{ session: s, block }] : [];
  });

  it('salen, y como mucho una vez a la semana por familia', () => {
    expect(complexDays.length).toBeGreaterThan(10);
    const perWeek = new Map<string, number>();
    for (const { session, block } of complexDays) {
      const mondayKey = (() => {
        const d = new Date(`${session.date}T12:00:00`);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d.toISOString().slice(0, 10);
      })();
      const fam = block.complex!.id.startsWith('sn-') ? 'snatch' : block.complex!.id.startsWith('cl-') ? 'clean' : 'mixto';
      const key = `${mondayKey}|${fam}`;
      perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    }
    expect([...perWeek.values()].every((v) => v === 1), JSON.stringify([...perWeek.entries()].filter(([, v]) => v > 1))).toBe(true);
  });

  it('el bloque está bien formado y mantiene el primer técnico antes y el tirón después', () => {
    for (const { session, block } of complexDays) {
      expect(block.format).toBe('Complejo');
      expect(block.setPlan).toHaveLength(block.sets!);
      expect(block.setPlan![block.setPlan!.length - 1].kg).toBe(block.loadKg);
      expect(block.loadKg!).toBeGreaterThan(0);
      for (const s of block.complex!.steps) expect(getMovementById(s.movementId), s.movementId).toBeDefined();
      const oly = session.blocks.filter((b) => b.block === 'oly' && !b.subgroup);
      const i = oly.indexOf(block);
      expect(i, session.date).toBeGreaterThan(0);
      expect(oly[i - 1].reps).toBe('2-3');
      expect(oly[i - 1].sets ?? 0).toBeLessThanOrEqual(3);
      // Ningún paso del complejo se repite como primer técnico o como tirón del mismo día.
      const steps = new Set(block.complex!.steps.map((s) => s.movementId));
      expect(steps.has(oly[i - 1].movementId), session.date).toBe(false);
      const pull = oly[i + 1];
      if (pull) expect(steps.has(pull.movementId), session.date).toBe(false);
    }
  });

  it('no hay complejos con la competición cerca', () => {
    const goal: Goal = { id: 'c1', type: 'preparar-competicion', targetDate: '2026-03-20', eventEndDate: '2026-03-21', emphasis: 'intensivo', createdAt: '2026-01-01' };
    const comp = makeProfile({ trainingDaysPerWeek: 6, goals: [goal] });
    const generated: DailySession[] = consecutiveDates('2026-02-27', 21).map((d) => generateSessionForDate(comp, [], d, comp.goals));
    expect(generated.some((s) => s.competition)).toBe(true);
    expect(generated.flatMap((s) => s.blocks).some((b) => b.complex)).toBe(false);
  });

  it('con la semana bloqueada (así funciona la app) el día de complejo sigue siendo de complejo, el mismo cada vez', () => {
    // Lunes 2 de marzo de 2026 y 9 de marzo: dos semanas completas.
    let found = 0;
    for (const monday of ['2026-03-02', '2026-03-09', '2026-03-16']) {
      const mondayDate = new Date(`${monday}T12:00:00`);
      const locks = planWeekLocks(profile, [], mondayDate, profile.goals);
      const withLocks = { ...profile, weeklyLocks: locks };
      for (const [iso, lock] of Object.entries(locks)) {
        const s = generateSessionForDate(withLocks, [], new Date(`${iso}T12:00:00`), withLocks.goals);
        const block = s.blocks.find((b) => b.complex);
        if (lock.olyComplexId) {
          found++;
          expect(lock.olyMovementId, iso).toBeUndefined();
          expect(block?.complex?.id, `${iso}: el complejo bloqueado debe repetirse`).toBe(lock.olyComplexId);
          // Regenerar con el mismo bloqueo da lo mismo, y el bloqueo no hace que la sesión se considere "huérfana".
          expect(generateSessionForDate(withLocks, [], new Date(`${iso}T12:00:00`), withLocks.goals)).toEqual(s);
        } else if (block) {
          expect.fail(`${iso}: hay complejo sin bloqueo de complejo`);
        }
      }
    }
    expect(found).toBeGreaterThan(2);
  });

  it('un complejo oculto de la librería no sale y uno propio entra en el sorteo', () => {
    const mine: OlyComplex = { id: 'custom-prueba', name: 'Mi complejo', family: 'clean', focus: ['tecnica', 'jerk', 'fuerza', 'potencia', 'recepcion'], custom: true, steps: [{ movementId: 'hang-clean', reps: 2 }, { movementId: 'split-jerk', reps: 1 }] };
    const hiddenIds = BUILTIN_COMPLEXES.filter((x) => x.family !== 'snatch').map((x) => x.id);
    const p = makeProfile({ trainingDaysPerWeek: 6, customComplexes: [mine], complexPrefs: { favorites: [], hidden: hiddenIds } });
    const out = consecutiveDates('2026-01-05', 70).flatMap((d) => generateSessionForDate(p, [], d, p.goals).blocks.filter((b) => b.complex));
    const ids = out.map((b) => b.complex!.id);
    expect(ids.some((id) => id === 'custom-prueba')).toBe(true);
    expect(ids.filter((id) => id.startsWith('cl-') || id.startsWith('mx-'))).toEqual([]);
  });
});
