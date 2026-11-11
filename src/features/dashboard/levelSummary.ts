import type { DiagnosisAreaKey } from '../../data/athlete/types';
import type { DiagnosisArea } from '../../engine/athleteDiagnosis';

/**
 * Lo que dice debajo del radar de «Tu nivel»: el área que va mejor y la que va peor, cada una con su dato más concreto (la fila del
 * diagnóstico que más y que menos destaca). Solo se opina con tres áreas o más con datos y, si todas puntúan igual, no se elige ninguna.
 * Puro: lee el diagnóstico que ya calcula `computeAthleteDiagnosis`.
 */

export interface LevelHighlight {
  key: DiagnosisAreaKey;
  title: string;
  /** El dato concreto («Press estricto · 76 %»), o vacío si el área no tiene filas con referencia. */
  detail: string;
}

export const MIN_SCORED_AREAS = 3;

/** Cuántas áreas tienen datos para el radar. */
export function scoredAreas(areas: DiagnosisArea[]): DiagnosisArea[] {
  return areas.filter((a) => a.score !== null);
}

function rowDetail(area: DiagnosisArea, pick: 'best' | 'worst'): string {
  const withRatio = area.rows.filter((r) => r.ratio !== null);
  const row =
    pick === 'worst'
      ? (area.weakest ?? [...withRatio].sort((a, b) => (a.ratio as number) - (b.ratio as number))[0])
      : [...withRatio].sort((a, b) => (b.ratio as number) - (a.ratio as number))[0];
  return row ? `${row.label} · ${row.value}` : '';
}

export function levelHighlights(areas: DiagnosisArea[]): { best: LevelHighlight | null; worst: LevelHighlight | null } {
  const scored = scoredAreas(areas);
  if (scored.length < MIN_SCORED_AREAS) return { best: null, worst: null };
  const sorted = [...scored].sort((a, b) => (b.score as number) - (a.score as number));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.key === worst.key || best.score === worst.score) return { best: null, worst: null };
  return {
    best: { key: best.key, title: best.title, detail: rowDetail(best, 'best') },
    worst: { key: worst.key, title: worst.title, detail: rowDetail(worst, 'worst') },
  };
}
