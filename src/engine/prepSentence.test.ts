import { describe, expect, it } from 'vitest';
import { prepSentence } from './prepSentence';
import type { ReadinessScore } from './readinessScore';

const part = { score: 70, detail: '' };
function score(over: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    total: 72,
    level: 'normal',
    estimated: false,
    feel: part,
    load: { ...part, penalty: 0 },
    loadPenalty: 0,
    rest: { credit: 0, streak: 0, restDays: 0, detail: '' },
    hrv: { penalty: 0 } as ReadinessScore['hrv'],
    performance: part,
    pain: { count: 0, areas: [], penalty: 0 },
    checkins: { checks: 5, score: 72, baseline: 70, delta: 2, level: 'normal', axes: [], weakest: null, days: [] } as unknown as ReadinessScore['checkins'],
    ...over,
  };
}

describe('prepSentence', () => {
  it('sin nota pide el check-in', () => {
    expect(prepSentence(score({ total: null, level: null }))).toMatch(/check-in/);
  });

  it('un día normal sin nada que restar sigue el plan', () => {
    expect(prepSentence(score())).toBe('Sigue el plan del día.');
  });

  it('prioriza lo que resta: molestia y carga', () => {
    const s = prepSentence(score({ level: 'baja', pain: { count: 1, areas: ['hombro'], penalty: 8 }, loadPenalty: 10 }));
    expect(s).toBe('Tienes una molestia activa (hombro) y tu carga acumulada va alta. Hoy mejor intensidad moderada que volumen.');
  });

  it('sin penalizaciones, señala el eje más flojo de la semana', () => {
    const checkins = { ...score().checkins, weakest: { key: 'sleep', label: 'Sueño', score: -0.5 } } as ReadinessScore['checkins'];
    expect(prepSentence(score({ level: 'baja', checkins }))).toMatch(/^El sueño es lo que más te baja esta semana\./);
  });

  it('con buena nota y descanso de ayer, lo dice', () => {
    expect(prepSentence(score({ level: 'alta', rest: { credit: 4, streak: 5, restDays: 1, detail: '' } }))).toMatch(/^El descanso de ayer te suma\./);
  });
});
