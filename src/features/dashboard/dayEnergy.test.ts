import { describe, expect, it } from 'vitest';
import type { AthleteProfile, DailySession, DayWorkout, SessionHistoryEntry } from '../../data/athlete/types';
import { mergeProfile, snapshotSyncBase } from '../../data/athlete/mergeProfile';
import { makeProfile } from '../../engine/__fixtures';
import { explainEnergy } from '../../engine/explainNumbers';
import { companionTrainedDates } from '../../engine/companionLoad';
import { loadHistoryFor } from '../../engine/readinessAt';
import { ensureStrainTarget } from '../../engine/strainTarget';
import { blockShares, buildDayEnergy, hourOf, shareOut, tomorrowEstimate } from './dayEnergy';

const DAY = '2026-11-26';
const session = {
  date: DAY,
  mesocycleWeek: 2,
  isRestDay: false,
  blocks: [
    { block: 'warmup', movementId: 'arm-circles' },
    { block: 'strength', movementId: 'back-squat', sets: 5 },
    { block: 'oly', movementId: 'power-clean', sets: 4 },
    { block: 'wod', movementId: 'row', format: 'AMRAP 15 min' },
    { block: 'accessory', movementId: 'bicep-curl', sets: 3 },
    { block: 'cooldown', movementId: 'childs-pose' },
  ],
} as DailySession;
const entry: SessionHistoryEntry = { date: DAY, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 8, durationMin: 70, closedAt: '19:40' };
const workout = (over: Partial<DayWorkout> = {}): DayWorkout => ({ id: 'w1', date: DAY, time: '09:30', kind: 'running', minutes: 40, rpe: 4, ...over });
const input = (profile: AthleteProfile, history: SessionHistoryEntry[] = [entry]) => ({ profile, history, dateIso: DAY, morning: 70, session });

describe('repartir el gasto', () => {
  it('las partes suman exactamente el total', () => {
    expect(shareOut(31, [8, 6, 15, 2])).toEqual([8, 6, 15, 2]);
    expect(shareOut(10, [1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(10);
    expect(shareOut(0, [1, 2])).toEqual([0, 0]);
    expect(shareOut(5, [0, 0])).toEqual([0, 0]);
  });

  it('lee la hora', () => {
    expect(hourOf('13:30')).toBe(13.5);
    expect(hourOf(undefined)).toBeNull();
    expect(hourOf('25:00')).toBeNull();
  });

  it('por bloques: sin calentamiento ni vuelta a la calma, el WOD pesa más y lo que falló o salió duro cuesta más', () => {
    const shares = blockShares(session, 28, { date: DAY });
    expect(shares.map((s) => s.key)).toEqual(['fuerza', 'oly', 'wod', 'accesorio']);
    expect(shares.reduce((s, b) => s + b.cost, 0)).toBe(28);
    expect(shares.find((s) => s.key === 'wod')!.cost).toBeGreaterThan(shares.find((s) => s.key === 'accesorio')!.cost);
    const failed = blockShares(session, 60, { date: DAY, workLog: [{ date: DAY, movementId: 'back-squat', block: 'strength', setNumber: 1, kg: 100, reps: 5, quality: 'fallada' }] });
    expect(failed[0].cost).toBeGreaterThan(blockShares(session, 60, { date: DAY })[0].cost);
    const hard = blockShares(session, 60, { date: DAY, wodFeel: 'duro' }).find((s) => s.key === 'wod')!.cost;
    expect(hard).toBeGreaterThan(blockShares(session, 60, { date: DAY, wodFeel: 'facil' }).find((s) => s.key === 'wod')!.cost);
    expect(blockShares({ ...session, isRestDay: true }, 20, { date: DAY })).toEqual([]);
  });
});

describe('el día en energía', () => {
  it('suma la sesión y los entrenos añadidos, por hora, y resta de la energía de la mañana', () => {
    const profile = { ...makeProfile(), workouts: [workout()] };
    const day = buildDayEnergy(input(profile));
    expect(day.items.map((i) => [i.kind, i.done])).toEqual([['libre', true], ['sesion', true]]);
    // 560 de la sesión y 160 de correr: 720 / 20 = 36.
    expect(day.spent).toBe(36);
    expect(day.items.reduce((s, i) => s + i.cost, 0)).toBe(36);
    expect(day).toMatchObject({ morning: 70, computed: 34, energy: 34, pending: 0, projected: 34 });
    expect(day.items[1].start).toBeCloseTo(19.667 - 70 / 60, 2);
    expect(day.items[1].blocks!.reduce((s, b) => s + b.cost, 0)).toBe(day.items[1].cost);
    expect(day.effort).toBeGreaterThan(60);
  });

  it('antes de entrenar enseña lo previsto y con cuánto se acabaría', () => {
    const day = buildDayEnergy({ ...input(makeProfile(), []), plannedSession: { rpe: 7, minutes: 80 }, plannedProgram: { rpe: 7, minutes: 30 } });
    expect(day.spent).toBe(0);
    expect(day.items.map((i) => i.done)).toEqual([false, false]);
    expect(day).toMatchObject({ energy: 70, pending: 28 + 11, projected: 31 });
  });

  it('la respuesta de la noche corrige lo que queda', () => {
    const profile = { ...makeProfile(), nightLog: [{ date: DAY, feel: 'bien' as const }] };
    const day = buildDayEnergy(input(profile));
    expect(day.computed).toBe(70 - 28);
    expect(day.energy).toBe(56);
    expect(day.nightFeel).toBe('bien');
  });

  it('sin preparación no inventa cifras', () => {
    const day = buildDayEnergy({ ...input(makeProfile()), morning: null });
    expect(day).toMatchObject({ computed: null, energy: null, projected: null });
    expect(day.spent).toBe(28);
  });

  it('estima con cuánto se amanece según las horas dormidas', () => {
    const profile = makeProfile();
    const six = tomorrowEstimate(profile, [entry], DAY, 33, 6);
    const eight = tomorrowEstimate(profile, [entry], DAY, 33, 8);
    expect(eight).toBeGreaterThan(six);
    expect(six).toBe(33 + Math.round(67 * 0.4) - Math.round(0.25 * 28));
  });

  it('Rex lo explica con lo que resta cada cosa y tu respuesta', () => {
    const e = explainEnergy({ morning: 70, done: [{ name: 'Running', cost: 8 }], energy: 66, computed: 62, pending: 20, projected: 46, isToday: true });
    expect(e.lead).toBe('Te queda un 66 %.');
    expect(e.rows).toEqual([
      { kind: 'plain', label: 'Has salido con', value: '70 %' },
      { kind: 'delta', label: 'Running', value: -8 },
      { kind: 'delta', label: 'Tu respuesta de la noche', value: 4 },
      { kind: 'plain', label: 'Si haces lo que falta', value: '46 %' },
    ]);
    expect(explainEnergy({ morning: null, done: [], energy: null, computed: null, pending: 0, projected: null, isToday: true }).rows).toEqual([]);
  });
});

describe('los entrenos añadidos', () => {
  it('cuentan como carga y como día entrenado', () => {
    const profile = { ...makeProfile(), workouts: [workout({ date: '2026-11-25' })] };
    expect(loadHistoryFor(profile, [])).toEqual([expect.objectContaining({ date: '2026-11-25', durationMin: 40, rpe: 4, movementIds: [] })]);
    expect(companionTrainedDates(profile)).toEqual(['2026-11-25']);
  });

  it('se sincronizan: se unen entre dispositivos y lo borrado no vuelve', () => {
    const base = { ...makeProfile(), workouts: [workout(), workout({ id: 'w2', time: '12:00' })] };
    const remote = { ...base, workouts: [...base.workouts, workout({ id: 'w3', time: '20:00' })], nightLog: [{ date: DAY, feel: 'cansado' as const }] };
    const local = { ...base, workouts: [base.workouts[0]], nightLog: [{ date: DAY, feel: 'bien' as const }] };
    const merged = mergeProfile(remote, local, [], [], snapshotSyncBase(base, []));
    expect(merged.workouts!.map((w) => w.id)).toEqual(['w1', 'w3']);
    expect(merged.nightLog).toEqual([{ date: DAY, feel: 'bien' }]);
  });

  it('el objetivo de hoy fijado con el cálculo anterior se rehace una vez, sin perder lo previsto', () => {
    const old = { low: 50, high: 70, readiness: 56, yesterday: null, reasons: [], provisional: false, setOn: DAY, planned: 39 };
    const profile = { ...makeProfile(), strainTargets: { [DAY]: old } };
    const next = ensureStrainTarget(profile, [entry], DAY);
    expect(next).not.toBe(profile);
    expect(next.strainTargets![DAY]).toMatchObject({ modelo: 2, planned: 39 });
    expect(ensureStrainTarget(next, [entry], DAY)).toBe(next);
  });
});
