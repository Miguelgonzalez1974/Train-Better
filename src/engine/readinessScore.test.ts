import { describe, it, expect } from 'vitest';
import type { PainFlag, ReadinessCheck, SessionHistoryEntry, SetFeedbackEntry } from '../data/athlete/types';
import { computeReadinessScore, REST_CREDIT_MAX, restPart } from './readinessScore';

const TODAY = new Date('2026-10-10T12:00:00');
const day = (n: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const GOOD = { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' } as const;
const BAD = { sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' } as const;
const checks = (q: Pick<ReadinessCheck, 'sleep' | 'soreness' | 'stress' | 'motivation'>, offsets: number[]): ReadinessCheck[] => offsets.map((o) => ({ date: day(o), ...q }));

const session = (offset: number, rpe: number): SessionHistoryEntry => ({
  date: day(offset),
  mesocycleWeek: 2,
  movementIds: ['back-squat'],
  rxOrScaled: 'rx',
  rpe,
  durationMin: 60,
});

const feedback = (offset: number, feel: SetFeedbackEntry['feel']): SetFeedbackEntry => ({
  date: day(offset),
  movementId: 'back-squat',
  block: 'strength',
  prescribedKg: 100,
  prescribedReps: 5,
  prescribedSets: 5,
  feel,
});

/** 8 sesiones repartidas en el mes con RPE 6 y, si se pide, 3 recientes con RPE distinto. */
const baseHistory = (recentRpe = 6): SessionHistoryEntry[] => [
  ...[-30, -27, -24, -20, -17, -14].map((o) => session(o, 6)),
  ...[-8, -5, -2].map((o) => session(o, recentRpe)),
];

const input = (over: Partial<Parameters<typeof computeReadinessScore>[0]> = {}) => ({
  readinessLog: undefined as ReadinessCheck[] | undefined,
  history: [] as SessionHistoryEntry[],
  setFeedbackLog: undefined as SetFeedbackEntry[] | undefined,
  painFlags: undefined as PainFlag[] | undefined,
  today: TODAY,
  ...over,
});

describe('el descanso de ayer suma a la nota', () => {
  const trained = (offsets: number[]) => offsets.map((o) => session(o, 6));
  const MID = { sleep: 'bien', soreness: 'leve', stress: 'medio', motivation: 'normal' } as const;
  const todayCheck = (sleep: ReadinessCheck['sleep']): ReadinessCheck => ({ date: day(0), ...MID, sleep });
  const todayIso = day(0);

  it('tras una racha larga y con buen sueño suma el máximo, y cuanto más corta la racha, menos', () => {
    const six = restPart(trained([-2, -3, -4, -5, -6, -7]), todayIso, todayCheck('bien'));
    expect(six).toMatchObject({ credit: REST_CREDIT_MAX, streak: 6, restDays: 1 });
    expect(six.detail).toBe('Descansaste ayer tras 6 días seguidos entrenando.');
    expect(restPart(trained([-2, -3, -4]), todayIso, todayCheck('bien')).credit).toBe(3);
    expect(restPart(trained([-2, -3]), todayIso, todayCheck('bien')).credit).toBe(2);
    expect(restPart(trained([-2]), todayIso, todayCheck('bien')).credit).toBe(0);
  });

  it('ayer entrenaste, o llevas tres o más días sin entrenar: no suma nada', () => {
    expect(restPart(trained([-1, -2, -3, -4]), todayIso, todayCheck('bien'))).toMatchObject({ credit: 0, restDays: 0, detail: '' });
    expect(restPart(trained([-4, -5, -6, -7]), todayIso, todayCheck('bien')).credit).toBe(0);
    expect(restPart([], todayIso, todayCheck('bien')).credit).toBe(0);
  });

  it('dormir mal hoy recorta lo que suma, y sin check-in aún cuenta un término medio', () => {
    const h = trained([-2, -3, -4, -5, -6, -7]);
    expect(restPart(h, todayIso, todayCheck('regular')).credit).toBe(4);
    expect(restPart(h, todayIso, todayCheck('mal')).credit).toBe(2);
    expect(restPart(h, todayIso, undefined).credit).toBe(4);
    expect(restPart(h, todayIso, todayCheck('regular')).detail).toContain('el sueño de hoy lo recorta');
  });

  it('el segundo día de descanso seguido aporta menos', () => {
    const h = trained([-3, -4, -5, -6, -7, -8]);
    expect(restPart(h, todayIso, todayCheck('bien'))).toMatchObject({ credit: 4, streak: 6, restDays: 2 });
    expect(restPart(h, todayIso, todayCheck('bien')).detail).toBe('Llevas 2 días de descanso tras 6 días seguidos entrenando.');
  });

  it('entra en la nota total junto al resto de partes', () => {
    const history = trained([-2, -3, -4, -5, -6, -7]);
    const r = computeReadinessScore(input({ readinessLog: [...checks(MID, [-1, -2]), todayCheck('bien')], history }));
    expect(r.rest.credit).toBe(REST_CREDIT_MAX);
    expect(r.feel.score).not.toBeNull();
    const raw = r.performance.score === null ? r.feel.score! : r.feel.score! * 0.6 + r.performance.score * 0.4;
    expect(r.total).toBe(Math.max(0, Math.min(100, Math.round(raw - r.pain.penalty - r.loadPenalty + r.rest.credit))));
  });
});

describe('nota de recuperación (check-in + cómo te salen las sesiones)', () => {
  it('sin ningún dato no hay nota', () => {
    const r = computeReadinessScore(input());
    expect(r.total).toBeNull();
    expect(r.level).toBeNull();
    expect(r.estimated).toBe(false);
  });

  it('con solo check-ins buenos, la nota es alta y no está estimada', () => {
    const r = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]) }));
    expect(r.total).toBe(100);
    expect(r.level).toBe('alta');
    expect(r.estimated).toBe(false);
  });

  it('con check-ins malos, la nota es baja', () => {
    const r = computeReadinessScore(input({ readinessLog: checks(BAD, [0, -1, -2]) }));
    expect(r.total).toBe(0);
    expect(r.level).toBe('baja');
  });

  it('sin check-ins pero con datos de entrenamiento sale una nota estimada', () => {
    const r = computeReadinessScore(input({ history: baseHistory(9) }));
    expect(r.feel.score).toBeNull();
    expect(r.performance.score).not.toBeNull();
    expect(r.total).not.toBeNull();
    expect(r.estimated).toBe(true);
  });

  it('un RPE reciente por encima de tu norma baja la parte de rendimiento', () => {
    const normal = computeReadinessScore(input({ history: baseHistory(6) }));
    const hard = computeReadinessScore(input({ history: baseHistory(9) }));
    expect(normal.performance.score).toBe(70);
    expect(hard.performance.score).toBe(10);
    expect(hard.performance.detail).toContain('por encima');
  });

  it('las primeras series duras bajan el rendimiento y se cuentan en el texto', () => {
    const r = computeReadinessScore(input({ setFeedbackLog: [feedback(-1, 'duro'), feedback(-3, 'muy-duro'), feedback(-5, 'justo')] }));
    expect(r.performance.score).not.toBeNull();
    expect(r.performance.score!).toBeLessThan(50);
    expect(r.performance.detail).toContain('2 de 3');
  });

  it('el peso es 60 % check-in y 40 % rendimiento', () => {
    // check-in perfecto (100) y rendimiento 10 → 0,6·100 + 0,4·10 = 64
    const r = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), history: baseHistory(9) }));
    expect(r.feel.score).toBe(100);
    expect(r.performance.score).toBe(10);
    expect(r.total).toBe(64);
  });

  it('la carga no se promedia: con carga óptima no suma ni resta, y con carga alta resta', () => {
    const calm = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), history: baseHistory(6) }));
    expect(calm.loadPenalty).toBe(0);
    // el historial acumula una semana seguida de sesiones: ACWR alto y días seguidos sin descansar
    const streak = [...baseHistory(6), ...[-9, -7, -6, -4, -3, -1, 0].map((o) => session(o, 6))];
    const loaded = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), history: streak }));
    expect(loaded.load.detail).toContain('días seguidos');
    expect(loaded.loadPenalty).toBeGreaterThan(0);
    expect(loaded.loadPenalty).toBeLessThanOrEqual(25);
    // la nota baja exactamente lo que resta la carga (unos buenos check-ins no pueden taparlo)
    expect(loaded.total).toBe(calm.total! - loaded.loadPenalty);
  });

  it('sin sesiones suficientes para medir la carga no resta nada', () => {
    const r = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), history: [session(-1, 7), session(-3, 7)] }));
    expect(r.load.score).toBeNull();
    expect(r.loadPenalty).toBe(0);
  });

  it('una molestia activa resta 8 puntos por zona, hasta 16', () => {
    const base = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]) }));
    const one: PainFlag[] = [{ id: 'p1', area: 'hombro', createdDate: day(-3), until: day(10) }];
    const two: PainFlag[] = [...one, { id: 'p2', area: 'rodilla', createdDate: day(-3), until: day(10) }, { id: 'p3', area: 'codo-muneca', createdDate: day(-3), until: day(10) }];
    expect(computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), painFlags: one })).total).toBe(base.total! - 8);
    expect(computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), painFlags: two })).total).toBe(base.total! - 16);
    expect(computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]), painFlags: one })).pain.areas).toEqual(['hombro']);
  });
});
