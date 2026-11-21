import { describe, expect, it } from 'vitest';
import type { WodSplitsRecord } from '../data/athlete/types';
import { pacingReport, patternSentence, patternTip, trendSentence, weakSentence, PACING_MIN_WODS } from './wodPacingReport';

const rec = (date: string, segments: number[], over: Partial<WodSplitsRecord> = {}): WodSplitsRecord => ({
  date,
  part: 1,
  key: `k-${date}`,
  mode: 'ronda',
  labels: [],
  segments,
  totalSeconds: segments.reduce((a, b) => a + b, 0),
  rx: true,
  ...over,
});

const TODAY = '2026-11-21';
const run = (ghosts: WodSplitsRecord[], weeks: number | null = 8) => pacingReport({ history: [], ghosts, todayIso: TODAY, weeks });

describe('pacingReport · patrón', () => {
  it('con menos WODs de los necesarios no hay patrón', () => {
    const r = run([rec('2026-11-01', [60, 62, 70, 80]), rec('2026-11-05', [60, 62, 70, 80])]);
    expect(r.wods).toBe(2);
    expect(r.pattern).toBeNull();
    expect(PACING_MIN_WODS).toBe(3);
  });

  it('detecta que te hundes cuando casi siempre las dos últimas rondas son más lentas', () => {
    const r = run([rec('2026-11-01', [60, 62, 75, 80]), rec('2026-11-05', [58, 60, 72, 78]), rec('2026-11-09', [62, 64, 70, 82]), rec('2026-11-12', [60, 60, 61, 62])]);
    expect(r.pattern?.kind).toBe('cae');
    expect(r.pattern).toMatchObject({ wods: 4, fading: 3, steady: 1, negative: 0 });
    expect(r.pattern!.avgFadePct).toBeGreaterThan(10);
    expect(patternSentence(r.pattern!)).toContain('te hundes');
    expect(patternTip(r.pattern!)).toContain('más tranquilo');
  });

  it('detecta que aguantas, que aceleras y que es mixto', () => {
    const steady = run([rec('2026-11-01', [60, 61, 60, 62]), rec('2026-11-05', [70, 70, 71, 70]), rec('2026-11-09', [65, 66, 65, 64])]);
    expect(steady.pattern?.kind).toBe('aguanta');
    expect(patternTip(steady.pattern!)).toBeNull();
    const neg = run([rec('2026-11-01', [80, 78, 70, 68]), rec('2026-11-05', [90, 88, 80, 78]), rec('2026-11-09', [75, 74, 66, 65])]);
    expect(neg.pattern?.kind).toBe('acelera');
    const mix = run([rec('2026-11-01', [60, 62, 80, 85]), rec('2026-11-05', [80, 78, 66, 64]), rec('2026-11-09', [60, 60, 61, 60])]);
    expect(mix.pattern?.kind).toBe('mixto');
  });

  it('ignora los WODs con pocas rondas y los de fuera del periodo', () => {
    const r = run([rec('2026-11-01', [60, 90]), rec('2026-11-05', [60, 62, 75, 80]), rec('2026-11-09', [60, 62, 75, 80]), rec('2026-11-12', [60, 62, 75, 80]), rec('2026-08-01', [60, 62, 75, 80])], 4);
    expect(r.wods).toBe(4);
    expect(r.analysed).toBe(3);
    const todo = run([rec('2026-08-01', [60, 62, 75, 80]), rec('2026-11-05', [60, 62, 75, 80]), rec('2026-11-09', [60, 62, 75, 80])], null);
    expect(todo.analysed).toBe(3);
  });

  it('un AMRAP cuenta sus tramos como rondas', () => {
    const r = run([rec('2026-11-01', [70, 72, 80, 90], { amrap: true }), rec('2026-11-05', [70, 72, 80, 90], { amrap: true }), rec('2026-11-09', [70, 72, 80, 90], { amrap: true })]);
    expect(r.pattern?.kind).toBe('cae');
  });
});

describe('pacingReport · movimientos que ceden', () => {
  const mov = (date: string, segs: number[]) => rec(date, segs, { mode: 'movimiento', labels: ['Thruster', 'Pull-up'] });
  // 4 rondas de [thruster, pull-up]: el thruster pasa de 30 a 45 s, el pull-up queda igual.
  const fadeThruster = [30, 20, 32, 20, 40, 20, 45, 21];

  it('marca el movimiento que más cede si se repite en dos WODs', () => {
    const r = run([mov('2026-11-01', fadeThruster), mov('2026-11-05', fadeThruster), mov('2026-11-09', [30, 20, 30, 20, 31, 20, 30, 21])]);
    expect(r.weak).toHaveLength(1);
    expect(r.weak[0]).toMatchObject({ name: 'Thruster', wods: 2, of: 3 });
    expect(r.weak[0].avgSlower).toBeGreaterThanOrEqual(12);
    expect(weakSentence(r.weak[0])).toContain('2 de 3');
  });

  it('con un solo WOD no se marca a nadie', () => {
    expect(run([mov('2026-11-01', fadeThruster), mov('2026-11-05', [30, 20, 30, 20, 31, 20, 30, 21])]).weak).toEqual([]);
  });
});

describe('pacingReport · WODs repetidos', () => {
  it('cuenta la diferencia entre la primera y la última vez', () => {
    const a = rec('2026-10-20', [70, 70, 70, 70], { key: 'bm:x' });
    const b = rec('2026-11-15', [64, 64, 64, 64], { key: 'bm:x' });
    const r = run([a, b], null);
    expect(r.trends).toHaveLength(1);
    expect(r.trends[0]).toMatchObject({ key: 'bm:x', times: 2, firstTotal: 280, lastTotal: 256, delta: -24 });
    expect(trendSentence(r.trends[0])).toContain('más rápido');
  });

  it('una diferencia pequeña, un WOD con cap o con otros tramos no cuenta', () => {
    expect(run([rec('2026-10-20', [70, 70, 70, 70], { key: 'q' }), rec('2026-11-15', [69, 70, 70, 70], { key: 'q' })], null).trends).toEqual([]);
    expect(run([rec('2026-10-20', [70, 70, 70, 70], { key: 'c', capped: true }), rec('2026-11-15', [60, 60, 60, 60], { key: 'c' })], null).trends).toEqual([]);
    expect(run([rec('2026-10-20', [70, 70, 70], { key: 'd' }), rec('2026-11-15', [60, 60, 60, 60], { key: 'd' })], null).trends).toEqual([]);
  });
});
