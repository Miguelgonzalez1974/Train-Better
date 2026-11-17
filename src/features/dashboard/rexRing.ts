import type { ExplainAction, ExplainId, ExplainTone, Explanation } from '../../engine/explainNumbers';
import type { AskAnswer } from './rexAsk';
import type { RexTarget } from './rexDashboard';

/**
 * Tocar un aro o un número del Dashboard es preguntarle a Rex de dónde sale: el panel de Rex se abre con la pregunta ya hecha y la
 * respuesta con el desglose real. Aquí se pasan las explicaciones de `engine/explainNumbers.ts` a respuestas de Rex y se escribe la pregunta
 * que se entiende que has hecho. Puro.
 */

/** Las cifras que entran en la pregunta (la nota de preparación, el esfuerzo de hoy…); null si aún no hay. */
export interface RingNumbers {
  readiness: number | null;
  real: number | null;
  planned: number | null;
}

/** La pregunta que se entiende que haces al tocar ese número («¿Por qué mi preparación es 72?»). */
export function ringQuestion(id: ExplainId, n: RingNumbers): string {
  const r = (v: number) => Math.round(v);
  switch (id) {
    case 'preparacion':
      return n.readiness !== null ? `¿Por qué mi preparación es ${r(n.readiness)}?` : '¿Cómo se calcula mi preparación?';
    case 'carga':
      return '¿Cómo voy de carga?';
    case 'realizado':
      return n.real !== null ? `¿Por qué mi esfuerzo de hoy es ${r(n.real)}?` : '¿Cómo ha ido el esfuerzo de hoy?';
    case 'esfuerzo':
      return '¿Cómo va mi esfuerzo?';
    case 'previsto':
      return n.planned !== null ? `¿Qué significa el esfuerzo previsto de ${r(n.planned)}?` : '¿Qué es el esfuerzo previsto?';
    case 'objetivo':
      return '¿De dónde sale mi objetivo de hoy?';
  }
}

const TONE: Record<ExplainTone, AskAnswer['tone']> = { good: 'good', mid: 'mid', bad: 'bad', info: 'info', plan: 'info', effort: 'gold', neutral: 'info' };

/** A qué lleva cada botón de una explicación, ya como destino de Rex. */
const ACTION_TARGET: Record<ExplainAction, RexTarget> = {
  'ver-preparacion': 'preparacion',
  'ver-esfuerzo': 'esfuerzo',
  'ver-carga': 'carga',
  recovery: 'movilidad',
  planificacion: 'planificacion',
};

/** Una explicación del anillo como respuesta de Rex, con su desglose y sus botones. */
export function explanationToAnswer(exp: Explanation): AskAnswer {
  return {
    lead: exp.lead,
    tone: TONE[exp.tone],
    text: exp.text,
    actions: exp.actions.map((a) => ({ label: a.label, target: ACTION_TARGET[a.action] })),
    rows: exp.rows,
    foot: exp.foot || undefined,
  };
}
