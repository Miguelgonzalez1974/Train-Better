import { describe, expect, it } from 'vitest';
import { analysisHeadline } from './analysisHeadline';
import type { LoadRow } from './loadLearning';

const row = (key: string, label: string, adjustPct: number): LoadRow => ({
  key,
  label,
  source: 'series',
  reference: 100,
  estimated: 100 + adjustPct,
  adjustPct,
  direction: adjustPct >= 1 ? 'sube' : adjustPct <= -1 ? 'baja' : 'igual',
  samples: 4,
  have: 4,
  need: 3,
  text: '',
});
const none = (key: string, label: string): LoadRow => ({ ...row(key, label, 0), source: null, estimated: null, samples: 0, have: 0 });
const lift = (key: string, label: string, ratePerMonthPct: number, tier: 'rapido' | 'normal' | 'lento' | 'regresion') => ({ key, label, ratePerMonthPct, tier });

describe('titular del Análisis', () => {
  it('si el coach sube las cargas de un levantamiento y otro progresa rápido, dice los dos', () => {
    const h = analysisHeadline({ loadRows: [row('backSquat', 'Back Squat', 2)], perLift: [lift('benchPress', 'Bench Press', 2.24, 'rapido')], desbalances: 0, equilibrados: 3 });
    expect(h.tone).toBe('good');
    expect(h.sentences[0]).toBe('Tu fuerza sube: Back Squat va un 2 % por encima de lo previsto y Bench Press +2,2 %/mes.');
    expect(h.sentences[1]).toBe('Todo equilibrado.');
  });

  it('un levantamiento estancado o en caída manda sobre lo demás y avisa', () => {
    const h = analysisHeadline({ loadRows: [row('backSquat', 'Back Squat', 3)], perLift: [lift('deadlift', 'Deadlift', 0, 'lento'), lift('benchPress', 'Bench Press', 2, 'rapido')], desbalances: 0, equilibrados: 0 });
    expect(h.tone).toBe('warn');
    expect(h.sentences[0]).toContain('Deadlift lleva tiempo estancado');
    const down = analysisHeadline({ loadRows: [], perLift: [lift('deadlift', 'Deadlift', -3, 'regresion')], desbalances: 0, equilibrados: 0 });
    expect(down.sentences[0]).toContain('a la baja');
  });

  it('si algo te cuesta más de lo previsto, lo dice con lo que baja el coach', () => {
    const h = analysisHeadline({ loadRows: [row('benchPress', 'Bench Press', -4)], perLift: [], desbalances: 0, equilibrados: 0 });
    expect(h.tone).toBe('warn');
    expect(h.sentences[0]).toBe('Bench Press te está costando más de lo previsto: el coach baja la carga un 4 %.');
  });

  it('con varios ajustes elige el mayor', () => {
    const h = analysisHeadline({ loadRows: [row('a', 'Front Squat', 1), row('b', 'Back Squat', 5), none('c', 'Clean')], perLift: [], desbalances: 0, equilibrados: 0 });
    expect(h.sentences[0]).toContain('Back Squat va un 5 %');
  });

  it('sin ajustes pero con un levantamiento rápido, lo dice; sin nada, pide datos', () => {
    expect(analysisHeadline({ loadRows: [none('a', 'Clean')], perLift: [lift('snatch', 'Snatch', 3.5, 'rapido')], desbalances: 0, equilibrados: 0 }).sentences[0]).toBe('Snatch progresa rápido (+3,5 %/mes).');
    const empty = analysisHeadline({ loadRows: [], perLift: [], desbalances: 0, equilibrados: 0 });
    expect(empty.tone).toBe('neutral');
    expect(empty.sentences).toHaveLength(1);
    expect(empty.sentences[0]).toContain('pocos datos');
  });

  it('los desequilibrios pasan el titular a aviso y se cuentan en singular o plural', () => {
    expect(analysisHeadline({ loadRows: [row('a', 'Back Squat', 2)], perLift: [], desbalances: 1, equilibrados: 2 }).sentences[1]).toBe('Hay 1 desequilibrio por corregir.');
    const two = analysisHeadline({ loadRows: [row('a', 'Back Squat', 2)], perLift: [], desbalances: 2, equilibrados: 0 });
    expect(two.tone).toBe('warn');
    expect(two.sentences[1]).toBe('Hay 2 desequilibrios por corregir.');
  });
});
