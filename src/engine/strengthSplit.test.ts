import { describe, it, expect } from 'vitest';
import { generateSessionForDate, planWeekLocks } from './generateSession';
import { resolveWeekLocks } from './weekLocks';
import { buildMicrocyclePlan } from './weekPlan';
import { computeResponseProfile } from './responseProfile';
import { toLocalIsoDate } from './periodization';
import { consecutiveDates, makeMacro, makeProfile, makeStrengthGoal } from './__fixtures';
import { getMovementById } from '../data/movements';
import type { MovementPattern } from '../data/movements/types';
import type { DailySession } from '../data/athlete/types';

/**
 * Reparto semanal por dias ("split"): lunes piernas, martes pecho, miercoles hombro, jueves recuperacion, viernes
 * peso muerto y sabado libre — cada dia de fuerza con su complemento. El doble WOD (que se come el viernes) lo mete
 * el coach solo en Intensificacion/Pico y entonces el peso muerto pasa al sabado.
 */

// Macro clasico de 4 semanas de 1 fase cada una desde el lunes 5 ene 2026: W1 Acumulacion, W2 Intensificacion, W3 Pico, W4 Descarga.
const WEEK = (n: number) => consecutiveDates('2026-01-05', 7 * 8).slice(7 * (n - 1), 7 * n); // lunes..domingo de la semana n (1-indexada)

const patternOf = (s: DailySession): MovementPattern | undefined => {
  const st = s.blocks.find((b) => b.block === 'strength');
  return st ? getMovementById(st.movementId)?.pattern : undefined;
};

const six = (over: Parameters<typeof makeProfile>[0] = {}) => makeProfile({ trainingDaysPerWeek: 6, bodyweightLog: [{ date: '2026-01-01', kg: 82 }], ...over });
const week = (n: number, profile = six()) => WEEK(n).map((d) => generateSessionForDate(profile, [], d, profile.goals));

describe('split semanal — patron por dia', () => {
  it('semana sin doble (Acumulacion): lunes piernas, martes pecho, miercoles hombro, viernes peso muerto y sabado libre', () => {
    for (const n of [1, 5]) {
      const s = week(n);
      expect(patternOf(s[0]), `S${n} lunes`).toBe('squat');
      expect(patternOf(s[1]), `S${n} martes`).toBe('horizontalPush');
      expect(patternOf(s[2]), `S${n} miercoles`).toBe('verticalPush');
      expect(s[3].blocks.some((b) => b.block === 'strength'), `S${n} jueves es recuperacion`).toBe(false);
      expect(patternOf(s[4]), `S${n} viernes`).toBe('hinge');
      expect(s[4].doubleWod).toBeUndefined();
      expect(['horizontalPush', 'verticalPush'], `S${n} sabado libre`).toContain(patternOf(s[5]));
    }
  });

  it('semana con doble WOD el viernes (Intensificacion): el peso muerto pasa al sabado y no se pierde la bisagra', () => {
    const s = week(2);
    expect(s[4].doubleWod).toBe(true);
    expect(s[4].blocks.some((b) => b.block === 'strength')).toBe(false);
    expect(patternOf(s[0])).toBe('squat');
    expect(patternOf(s[1])).toBe('horizontalPush');
    expect(patternOf(s[2])).toBe('verticalPush');
    expect(patternOf(s[5])).toBe('hinge');
  });

  it('la semana de descarga conserva el mismo reparto y no lleva doble', () => {
    const s = week(4);
    expect(s.some((x) => x.doubleWod)).toBe(false);
    expect([0, 1, 2, 4].map((i) => patternOf(s[i]))).toEqual(['squat', 'horizontalPush', 'verticalPush', 'hinge']);
  });

  it('un objetivo de fuerza atrasado ya no cambia el patron de los dias fijos: elige la variante dentro del patron del dia', () => {
    const profile = six({ goals: [makeStrengthGoal('bench-press', 'intensivo')] });
    const s = week(1, profile);
    expect(patternOf(s[0])).toBe('squat');
    expect(patternOf(s[2])).toBe('verticalPush');
    expect(patternOf(s[4])).toBe('hinge');
  });

  it('nunca el mismo patron en dos dias de entreno seguidos, tampoco del sabado al lunes siguiente (4 semanas, 3-6 dias)', () => {
    for (const n of [3, 4, 5, 6] as const) {
      const profile = makeProfile({ trainingDaysPerWeek: n });
      const seq = consecutiveDates('2026-01-05', 28)
        .map((d) => generateSessionForDate(profile, [], d, profile.goals))
        .filter((x) => !x.isRestDay && !x.doubleWod)
        .map((x) => patternOf(x))
        .filter((p): p is MovementPattern => Boolean(p));
      for (let i = 1; i < seq.length; i++) expect(seq[i], `${n} dias: ${seq.join(' ')}`).not.toBe(seq[i - 1]);
    }
  });

  it('con 3 y 4 dias manda la prioridad piernas, pecho, peso muerto, hombro', () => {
    const rp = computeResponseProfile([], [], new Date('2026-03-02T12:00:00'), [], []);
    const plan = (n: 3 | 4 | 5 | 6) =>
      buildMicrocyclePlan({
        weeklySplit: true,
        macroId: 'm',
        weekNumber: 1,
        phase: 1,
        trainingDaysPerWeek: n,
        responseProfile: rp,
        avoidedPatterns: new Set(),
        goalForcedPattern: null,
        goalForcedFamily: null,
      }).strengthPattern;
    expect(plan(3)).toEqual(['squat', 'horizontalPush', 'hinge']);
    expect(plan(4)).toEqual(['squat', 'horizontalPush', 'hinge', 'verticalPush']);
    expect(plan(5).slice(0, 4)).toEqual(['squat', 'horizontalPush', 'verticalPush', 'hinge']);
  });

  it('el dia libre da prioridad al patron del objetivo (siempre que no sea el del dia anterior ni la sentadilla del lunes)', () => {
    const rp = computeResponseProfile([], [], new Date('2026-03-02T12:00:00'), [], []);
    const free = (goal: MovementPattern | null) =>
      buildMicrocyclePlan({
        weeklySplit: true,
        macroId: 'm',
        weekNumber: 3,
        phase: 1,
        trainingDaysPerWeek: 6,
        responseProfile: rp,
        avoidedPatterns: new Set(),
        goalForcedPattern: goal,
        goalForcedFamily: null,
      }).strengthPattern[5];
    expect(free('verticalPush')).toBe('verticalPush');
    expect(free('horizontalPush')).toBe('horizontalPush');
  });
});

describe('split semanal — complemento del dia', () => {
  it('lunes, martes y miercoles llevan fuerza + 1 complemento (A2) con series, reps y carga/peso propios', () => {
    const s = week(1);
    for (const i of [0, 1, 2]) {
      const strength = s[i].blocks.filter((b) => b.block === 'strength');
      expect(strength.length, `dia ${i}: fuerza + complemento`).toBe(2);
      const a2 = strength[1];
      expect(a2.sets, `dia ${i}`).toBeGreaterThanOrEqual(2);
      expect(a2.reps, `dia ${i}`).toBeTruthy();
      expect(getMovementById(a2.movementId), `dia ${i}`).toBeTruthy();
    }
    // El martes (banca) el complemento es un tiron.
    const tue = s[1].blocks.filter((b) => b.block === 'strength')[1];
    expect(['single-arm-dumbbell-row', 'pendlay-row', 'landmine-row', 'chest-supported-row']).toContain(tue.movementId);
  });

  it('el complemento progresa con la semana del meso (reps mas bajas y mas pesadas al acercarse al pico)', () => {
    // El miercoles (hombro): ni E2MOM ni test, asi que el complemento sale siempre como A2 progresivo.
    const reps = (n: number) => week(n)[2].blocks.filter((b) => b.block === 'strength')[1]?.reps;
    expect(reps(1)).toBe('10-12');
    expect(reps(2)).toBe('8-10');
    expect(reps(3)).toBe('6-8');
  });

  it('solo el ultimo dia de entreno lleva el bloque de accesorios completo; entre semana no hay accesorios', () => {
    const s = week(1);
    for (const i of [0, 1, 2, 4]) expect(s[i].blocks.some((b) => b.block === 'accessory' && b.accessoryRole), `dia ${i}`).toBe(false);
    expect(s[5].blocks.some((b) => b.block === 'accessory' && b.accessoryRole)).toBe(true);
  });

  it('el viernes de peso muerto lleva el oly en tecnico-ligero (carga mas baja que la del mismo oly un martes)', () => {
    const s = week(1);
    const fri = s[4].blocks.find((b) => b.block === 'oly' && !b.subgroup && b.loadKg);
    expect(fri, 'el viernes lleva oly con carga').toBeTruthy();
  });
});

describe('split semanal — modo adaptativo y bloqueos', () => {
  it('con el modo adaptativo el reparto sigue siendo el de siempre (no fija lunes = piernas) y el viernes de Acumulacion no es siempre peso muerto', () => {
    const profile = six({ strengthSplit: 'adaptive' });
    const patterns = [1, 5, 9, 13].map((n) => {
      const d = consecutiveDates('2026-01-05', 7 * 14).slice(7 * (n - 1), 7 * n);
      return d.map((x) => patternOf(generateSessionForDate(profile, [], x, profile.goals)));
    });
    const sameShape = patterns.every((p) => p.every((x, i) => x === patterns[0][i]));
    const fixedSplit = patterns.every((p) => p[0] === 'squat' && p[1] === 'horizontalPush' && p[2] === 'verticalPush' && p[4] === 'hinge');
    expect(fixedSplit && sameShape).toBe(false);
  });

  it('planWeekLocks marca los bloqueos del split y la semana se re-planifica si se bloqueo con el otro modo', () => {
    const MON = new Date(2026, 0, 12);
    const iso = toLocalIsoDate(MON);
    const profile = six();
    const locks = planWeekLocks(profile, [], MON, profile.goals, { plannedOn: iso });
    expect(Object.values(locks).length).toBeGreaterThan(3);
    expect(Object.values(locks).every((l) => l.split === true)).toBe(true);

    // Semana bloqueada por el motor adaptativo (sin la marca): hoy es martes, los dias que quedan se re-planifican.
    const adaptive = six({ strengthSplit: 'adaptive' });
    const oldLocks = planWeekLocks(adaptive, [], MON, adaptive.goals, { plannedOn: iso });
    expect(Object.values(oldLocks).every((l) => !l.split)).toBe(true);
    const TUE = new Date(2026, 0, 13);
    const switched = resolveWeekLocks({ ...profile, weeklyLocks: oldLocks }, [], profile.goals, toLocalIsoDate(TUE), TUE);
    const remaining = Object.entries(switched.weeklyLocks ?? {}).filter(([d]) => d >= toLocalIsoDate(TUE) && d <= '2026-01-18');
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.every(([, l]) => l.split === true)).toBe(true);
    // Idempotente: una vez re-planificada no vuelve a cambiar.
    expect(resolveWeekLocks(switched, [], profile.goals, toLocalIsoDate(TUE), TUE)).toBe(switched);
  });

  it('un bloqueo del otro modo no manda: la sesion de hoy se decide con el reparto actual', () => {
    const profile = six();
    const MON = consecutiveDates('2026-01-05', 1)[0];
    const stale = { ...profile, weeklyLocks: { '2026-01-05': { strengthMovementId: 'deadlift', plannedOn: '2026-01-05' } } };
    const s = generateSessionForDate(stale, [], MON, stale.goals);
    expect(patternOf(s)).toBe('squat');
  });

  it('el macro con fases largas: el doble solo en la segunda mitad de la Intensificacion', () => {
    const macro = makeMacro({ id: 'largo', phaseWeeks: [2, 4, 2, 1] });
    const profile = six({ macrocycles: [macro] });
    const friday = (n: number) => {
      const d = consecutiveDates('2026-01-05', 7 * 10)[7 * (n - 1) + 4];
      return generateSessionForDate(profile, [], d, profile.goals);
    };
    // Semanas 1-2 Acumulacion (sin doble), 3-6 Intensificacion (doble en 5 y 6), 7-8 Pico (doble), 9 Descarga.
    expect([1, 2, 3, 4].map((n) => Boolean(friday(n).doubleWod))).toEqual([false, false, false, false]);
    expect([5, 6, 7, 8].every((n) => friday(n).doubleWod === true)).toBe(true);
    expect(friday(9).doubleWod).toBeUndefined();
  });
});
