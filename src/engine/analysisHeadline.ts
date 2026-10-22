import type { LoadRow } from './loadLearning';
import type { LiftResponse } from './responseProfile';

/**
 * El titular del Análisis: una o dos frases con lo más importante de lo que enseñan las pestañas (fuerza y equilibrio),
 * para saber de un vistazo si hay algo que mirar sin abrir nada. Solo reordena lo que ya se calcula en otros sitios.
 */

export type HeadlineTone = 'good' | 'warn' | 'neutral';

export interface Headline {
  tone: HeadlineTone;
  /** Frases ya escritas, en orden de importancia. */
  sentences: string[];
}

export interface HeadlineInput {
  /** Lo que el coach ajusta por levantamiento (ver `buildLoadRows`). */
  loadRows: LoadRow[];
  /** Ritmo de progreso por levantamiento (ver `ResponseProfile.perLift`). */
  perLift: Pick<LiftResponse, 'key' | 'label' | 'ratePerMonthPct' | 'tier'>[];
  /** Parejas de movimientos descompensadas y equilibradas (ver `computeImbalances`). */
  desbalances: number;
  equilibrados: number;
}

const comma = (n: number) => String(n).replace('.', ',');
const rate = (pct: number) => `${pct > 0 ? '+' : ''}${comma(Math.round(pct * 10) / 10)} %/mes`;

export function analysisHeadline(input: HeadlineInput): Headline {
  const { loadRows, perLift, desbalances, equilibrados } = input;
  const stalled = perLift.find((l) => l.tier === 'regresion') ?? perLift.find((l) => l.tier === 'lento');
  const adjusted = [...loadRows].filter((r) => r.source !== null && r.direction !== 'igual').sort((a, b) => Math.abs(b.adjustPct) - Math.abs(a.adjustPct))[0];
  const fast = perLift.find((l) => l.tier === 'rapido');

  const sentences: string[] = [];
  let tone: HeadlineTone = 'neutral';

  if (stalled) {
    tone = 'warn';
    sentences.push(`${stalled.label} lleva tiempo ${stalled.tier === 'regresion' ? 'a la baja' : 'estancado'}: el coach le da más frecuencia.`);
  } else if (adjusted && adjusted.direction === 'sube') {
    tone = 'good';
    const extra = fast && fast.key !== adjusted.key ? ` y ${fast.label} ${rate(fast.ratePerMonthPct)}` : '';
    sentences.push(`Tu fuerza sube: ${adjusted.label} va un ${Math.abs(adjusted.adjustPct)} % por encima de lo previsto${extra}.`);
  } else if (adjusted) {
    tone = 'warn';
    sentences.push(`${adjusted.label} te está costando más de lo previsto: el coach baja la carga un ${Math.abs(adjusted.adjustPct)} %.`);
  } else if (fast) {
    tone = 'good';
    sentences.push(`${fast.label} progresa rápido (${rate(fast.ratePerMonthPct)}).`);
  } else {
    sentences.push('Aún hay pocos datos de fuerza: registra el peso real y el RPE de tus series para ver aquí cómo evolucionas.');
  }

  if (desbalances > 0) {
    tone = 'warn';
    sentences.push(`Hay ${desbalances} ${desbalances === 1 ? 'desequilibrio' : 'desequilibrios'} por corregir.`);
  } else if (equilibrados > 0) {
    sentences.push('Todo equilibrado.');
  }
  return { tone, sentences };
}
