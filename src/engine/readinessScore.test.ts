import { describe, it, expect } from 'vitest';
import type { PainFlag, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { computeReadinessScore } from './readinessScore';

const TODAY = new Date('2026-10-10T12:00:00');
const day = (n: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const GOOD = { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' } as const;
const BAD = { sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' } as const;
const checks = (q: Pick<ReadinessCheck, 'sleep' | 'soreness' | 'stress' | 'motivation'>, offsets: number[]): ReadinessCheck[] => offsets.map((o) => ({ date: day(o), ...q }));
const session = (offset: number, rpe: number, minutes = 60): SessionHistoryEntry => ({ date: day(offset), mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe, durationMin: minutes });

const input = (over: Partial<Parameters<typeof computeReadinessScore>[0]> = {}) => ({
  readinessLog: undefined as ReadinessCheck[] | undefined,
  history: [] as SessionHistoryEntry[],
  painFlags: undefined as PainFlag[] | undefined,
  today: TODAY,
  ...over,
});

describe('la preparación es la energía de la mañana', () => {
  it('sin dos días de datos recientes no hay cifra', () => {
    expect(computeReadinessScore(input())).toMatchObject({ total: null, level: null, energy: null, estimated: true });
    expect(computeReadinessScore(input({ readinessLog: checks(GOOD, [0]) })).total).toBeNull();
    expect(computeReadinessScore(input({ readinessLog: checks(GOOD, [-30]), history: [session(-40, 7)] })).total).toBeNull();
  });

  it('con datos recientes da una cifra, estimada si falta el check-in de hoy', () => {
    const estimated = computeReadinessScore(input({ history: [session(-2, 6), session(-3, 6)] }));
    expect(estimated.total).not.toBeNull();
    expect(estimated.estimated).toBe(true);
    const asked = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1]) }));
    expect(asked.estimated).toBe(false);
    expect(asked.total).toBe(asked.energy!.total);
  });

  it('su nivel: con ganas desde 65 y cansado hasta 40', () => {
    const high = computeReadinessScore(input({ readinessLog: checks(GOOD, [0, -1, -2]) }));
    expect(high.total).toBeGreaterThanOrEqual(65);
    expect(high.level).toBe('alta');
    const history = Array.from({ length: 10 }, (_, i) => session(-(i + 1), 10, 150));
    const low = computeReadinessScore(input({ readinessLog: checks(BAD, [0, -1, -2]), history }));
    expect(low.total).toBeLessThanOrEqual(40);
    expect(low.level).toBe('baja');
  });

  it('la sesión de hoy no la mueve', () => {
    const log = checks(GOOD, [0, -1, -2]);
    const before = computeReadinessScore(input({ readinessLog: log, history: [session(-2, 6)] })).total;
    expect(computeReadinessScore(input({ readinessLog: log, history: [session(-2, 6), session(0, 10, 120)] })).total).toBe(before);
  });

  it('dice cómo va la carga y lo que resta', () => {
    expect(computeReadinessScore(input({ readinessLog: checks(GOOD, [0]), history: [session(-2, 6)] })).load).toEqual({ penalty: 0, detail: 'Aún sin sesiones suficientes para medir tu carga.' });
    const steady = Array.from({ length: 27 }, (_, i) => session(-(i + 1), 5, 40));
    const r = computeReadinessScore(input({ readinessLog: checks(GOOD, [0]), history: steady }));
    expect(r.loadPenalty).toBe(0);
    expect(r.load.detail).toContain('dentro de lo seguro');
  });

  it('cada zona con molestia resta 8, con un tope de 16', () => {
    const log = checks(BAD, [0, -1, -2]).map((c) => ({ ...c, soreness: 'ninguno' as const }));
    const base = computeReadinessScore(input({ readinessLog: log }));
    const one = [{ id: '1', area: 'hombro', createdDate: day(0), until: null }] as PainFlag[];
    const three = [...one, { id: '2', area: 'rodilla', createdDate: day(0), until: null }, { id: '3', area: 'codo-muneca', createdDate: day(0), until: null }] as PainFlag[];
    expect(computeReadinessScore(input({ readinessLog: log, painFlags: one })).total).toBe(base.total! - 8);
    expect(computeReadinessScore(input({ readinessLog: log, painFlags: one })).pain.areas).toEqual(['hombro']);
    expect(computeReadinessScore(input({ readinessLog: log, painFlags: three })).pain.penalty).toBe(16);
  });
});
