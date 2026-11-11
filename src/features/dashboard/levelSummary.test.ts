import { describe, expect, it } from 'vitest';
import type { DiagnosisArea, DiagnosisRow } from '../../engine/athleteDiagnosis';
import { levelHighlights, scoredAreas } from './levelSummary';

const row = (label: string, value: string, ratio: number | null): DiagnosisRow => ({ id: label, label, value, ratio, tone: 'mid' });
const area = (key: DiagnosisArea['key'], title: string, score: number | null, rows: DiagnosisRow[] = [], weakest: DiagnosisRow | null = null): DiagnosisArea => ({
  key,
  title,
  confidence: 'provisional',
  trend: 'estable',
  tone: 'mid',
  score,
  verdict: '',
  rows,
  samples: 5,
  need: null,
  weakest,
});

const AREAS = [
  area('fuerza', 'Fuerza', 47, [row('Sentadilla', '170 kg', 1.1), row('Press estricto', '65 kg', 0.76)], row('Press estricto', '76 %', 0.76)),
  area('halterofilia', 'Halterofilia', 82, [row('Snatch', '90 kg', 1.2), row('Clean', '115 kg', 1)]),
  area('motor', 'Motor', 58),
  area('gimnasticos', 'Gimnásticos', null),
  area('constancia', 'Constancia', 71),
];

describe('Tu nivel: lo que va mejor y peor', () => {
  it('el area con mas puntos es la que va mejor y la de menos la que va peor, cada una con su dato', () => {
    const { best, worst } = levelHighlights(AREAS);
    expect(best).toMatchObject({ key: 'halterofilia', title: 'Halterofilia', detail: 'Snatch · 90 kg' });
    expect(worst).toMatchObject({ key: 'fuerza', title: 'Fuerza', detail: 'Press estricto · 76 %' });
  });

  it('un area sin datos no cuenta ni para lo mejor ni para lo peor', () => {
    expect(scoredAreas(AREAS)).toHaveLength(4);
    const { best, worst } = levelHighlights(AREAS);
    expect([best?.key, worst?.key]).not.toContain('gimnasticos');
  });

  it('con menos de tres areas con datos no se opina', () => {
    expect(levelHighlights([AREAS[0], AREAS[1], area('motor', 'Motor', null)])).toEqual({ best: null, worst: null });
  });

  it('si todas puntuan igual no se elige ninguna; sin filas con referencia el dato queda vacio', () => {
    expect(levelHighlights([area('fuerza', 'Fuerza', 60), area('motor', 'Motor', 60), area('constancia', 'Constancia', 60)])).toEqual({ best: null, worst: null });
    const r = levelHighlights([area('fuerza', 'Fuerza', 40), area('motor', 'Motor', 60), area('constancia', 'Constancia', 80)]);
    expect(r.best?.detail).toBe('');
    expect(r.worst?.detail).toBe('');
  });
});
