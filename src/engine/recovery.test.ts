import { describe, it, expect } from 'vitest';
import type { ReadinessCheck } from '../data/athlete/types';
import { computeRecoverySummary } from './recovery';

const TODAY = '2026-10-10';
const day = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const GOOD = { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' } as const;
const OK = { sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal' } as const;
const BAD = { sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' } as const;
const check = (offset: number, q: Pick<ReadinessCheck, 'sleep' | 'soreness' | 'stress' | 'motivation'>): ReadinessCheck => ({ date: day(offset), ...q });

describe('recuperación (check-in diario)', () => {
  it('sin check-ins no hay lectura', () => {
    const r = computeRecoverySummary(undefined, TODAY);
    expect(r.score).toBeNull();
    expect(r.level).toBeNull();
    expect(r.axes).toEqual([]);
    expect(r.days).toHaveLength(7);
    expect(r.days.every((d) => d.score === null)).toBe(true);
  });

  it('con un solo check-in en la semana todavía no se atreve', () => {
    expect(computeRecoverySummary([check(0, GOOD)], TODAY).score).toBeNull();
  });

  it('una semana buena puntúa alta y una mala, baja', () => {
    const good = computeRecoverySummary([check(0, GOOD), check(-1, GOOD), check(-2, GOOD)], TODAY);
    expect(good.score).toBe(100);
    expect(good.level).toBe('alta');
    const bad = computeRecoverySummary([check(0, BAD), check(-1, BAD)], TODAY);
    expect(bad.score).toBe(0);
    expect(bad.level).toBe('baja');
    const mid = computeRecoverySummary([check(0, OK), check(-2, OK)], TODAY);
    expect(mid.score).toBe(50);
    expect(mid.level).toBe('normal');
  });

  it('compara la semana con tus 4 semanas anteriores', () => {
    const log = [check(0, BAD), check(-1, BAD), ...[-9, -12, -16, -20].map((o) => check(o, GOOD))];
    const r = computeRecoverySummary(log, TODAY);
    expect(r.baseline).toBe(100);
    expect(r.delta).toBe(-100);
  });

  it('sin base suficiente (menos de 3 check-ins anteriores) no hay comparación', () => {
    const r = computeRecoverySummary([check(0, GOOD), check(-1, GOOD), check(-10, GOOD), check(-12, GOOD)], TODAY);
    expect(r.baseline).toBeNull();
    expect(r.delta).toBeNull();
  });

  it('señala el eje que más te baja, solo si va flojo de verdad', () => {
    const lowSleep = { ...GOOD, sleep: 'mal' } as const;
    const r = computeRecoverySummary([check(0, lowSleep), check(-1, lowSleep), check(-2, lowSleep)], TODAY);
    expect(r.weakest?.key).toBe('sleep');
    const fine = computeRecoverySummary([check(0, GOOD), check(-1, OK)], TODAY);
    expect(fine.weakest).toBeNull();
  });

  it('los días de la última semana salen en orden, con hueco donde no hubo check-in', () => {
    const r = computeRecoverySummary([check(0, GOOD), check(-2, BAD), check(-3, OK)], TODAY);
    expect(r.days.map((d) => d.date)).toEqual([-6, -5, -4, -3, -2, -1, 0].map(day));
    expect(r.days[6].score).toBe(100);
    expect(r.days[5].score).toBeNull();
    expect(r.days[4].score).toBe(0);
    expect(r.days[3].score).toBe(50);
  });

  it('un check-in de hace más de 7 días no cuenta para la semana', () => {
    const r = computeRecoverySummary([check(-7, GOOD), check(-8, GOOD), check(0, GOOD)], TODAY);
    expect(r.checks).toBe(1);
    expect(r.score).toBeNull();
  });
});
