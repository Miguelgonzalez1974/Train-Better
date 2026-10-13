import { describe, it, expect } from 'vitest';
import { computeReadinessLearning, LEARNING_MIN_PAIRS } from './readinessLearning';
import { checkFromQuickAnswer } from './readiness';
import type { ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';

const day = (i: number) => `2026-09-${String(i + 1).padStart(2, '0')}`;
const entry = (date: string, rpe: number): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe, durationMin: 60 });

/** n días: los pares duermen mal (RPE alto), el resto bien (RPE bajo). */
function scenario(n: number, rpeBad: number, rpeOk: number) {
  const log: ReadinessCheck[] = [];
  const history: SessionHistoryEntry[] = [];
  for (let i = 0; i < n; i++) {
    const bad = i % 2 === 0;
    log.push(bad ? checkFromQuickAnswer(day(i), 'normal', ['sleep']) : checkFromQuickAnswer(day(i), 'bien', []));
    history.push(entry(day(i), bad ? rpeBad : rpeOk));
  }
  return { log, history };
}

describe('lo que aprendo de ti (etapa 1)', () => {
  it('con pocas sesiones emparejadas no enseña nada y dice cuántas lleva', () => {
    const { log, history } = scenario(LEARNING_MIN_PAIRS - 1, 8, 6);
    const r = computeReadinessLearning(log, history);
    expect(r.ready).toBe(false);
    expect(r.pairs).toBe(LEARNING_MIN_PAIRS - 1);
    expect(r.insights).toEqual([]);
  });

  it('solo cuentan los días con check-in Y sesión', () => {
    const { log, history } = scenario(14, 8, 6);
    const r = computeReadinessLearning(log.slice(0, 5), history);
    expect(r.pairs).toBe(5);
  });

  it('si dormir mal sube el esfuerzo, lo detecta con su diferencia', () => {
    const { log, history } = scenario(16, 8, 6.5);
    const r = computeReadinessLearning(log, history);
    expect(r.ready).toBe(true);
    const sleep = r.insights.find((i) => i.key === 'sleep');
    expect(sleep).toBeDefined();
    expect(sleep!.delta).toBeCloseTo(1.5, 1);
    expect(sleep!.nBad).toBe(8);
    expect(sleep!.nOk).toBe(8);
    expect(r.insights[0].key).toBe('sleep');
  });

  it('un factor que no se marcó nunca no genera dato (grupo vacío)', () => {
    const { log, history } = scenario(16, 8, 6.5);
    const r = computeReadinessLearning(log, history);
    expect(r.insights.some((i) => i.key === 'stress')).toBe(false);
  });

  it('si el RPE es igual con y sin el factor, la diferencia es ~0', () => {
    const { log, history } = scenario(16, 7, 7);
    const sleep = computeReadinessLearning(log, history).insights.find((i) => i.key === 'sleep');
    expect(sleep!.delta).toBe(0);
  });

  it('con horas de sueño anotadas compara dormir poco con dormir más', () => {
    const log: ReadinessCheck[] = [];
    const history: SessionHistoryEntry[] = [];
    for (let i = 0; i < 16; i++) {
      const short = i % 2 === 0;
      log.push(checkFromQuickAnswer(day(i), 'normal', ['sleep'], short ? 5 : 7.5));
      history.push(entry(day(i), short ? 8.5 : 7));
    }
    const h = computeReadinessLearning(log, history).insights.find((i) => i.key === 'sleepHours');
    expect(h).toBeDefined();
    expect(h!.delta).toBeCloseTo(1.5, 1);
  });

  it('ignora entradas con RPE fuera de rango', () => {
    const { log, history } = scenario(14, 8, 6);
    history[0] = entry(history[0].date, 0);
    expect(computeReadinessLearning(log, history).pairs).toBe(13);
  });
});
