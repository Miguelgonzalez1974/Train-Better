import type { Headline } from '../../engine/analysisHeadline';
import type { ImbalanceStatus } from '../../engine/imbalances';
import type { LiftTier } from '../../engine/responseProfile';
import type { RuleVerdict } from '../../engine/progression';
import type { AthleteProfile } from '../../data/athlete/types';
import { applyPlan, commitItems, addDaysIso } from '../objetivos/rexFlow';

/**
 * Rex en el Análisis: una frase por pestaña con la conclusión (en vez de que tengas que interpretar números y barras) y, si hay un
 * levantamiento claro que mejorar, la propuesta de un objetivo «Subir PR» ya montado. Solo reordena lo que el Análisis ya calcula;
 * no inventa ningún dato. Puro: lo pinta `AnalysisView`.
 */

export type AnalysisTabId = 'fuerza' | 'equilibrio' | 'coach';

/** Los levantamientos para los que Objetivos sabe crear un «Subir PR» (id de movimiento + nombre). */
export const GOAL_LIFTS: Record<string, string> = {
  'back-squat': 'Sentadilla trasera',
  'bench-press': 'Press banca',
  deadlift: 'Peso muerto',
  'strict-press': 'Press militar',
  snatch: 'Snatch',
  'clean-and-jerk': 'Clean & jerk',
};

/** Del nombre del PR en el perfil (`prs`) al movimiento del objetivo. */
export const PR_KEY_TO_MOVEMENT: Record<string, string> = {
  backSquat: 'back-squat',
  benchPress: 'bench-press',
  deadlift: 'deadlift',
  strictPress: 'strict-press',
  snatch: 'snatch',
  cleanAndJerk: 'clean-and-jerk',
};

export type RexAnalysisTone = 'good' | 'warn' | 'neutral';

export interface GoalProposal {
  movementId: string;
  /** «Press banca». */
  label: string;
  /** Por qué se propone, en una frase corta. */
  why: string;
}

export interface AnalysisRexInput {
  tab: AnalysisTabId;
  headline: Headline;
  /** Total de los tres grandes en veces tu peso (null sin peso). */
  strengthRatio: number | null;
  perLift: { key: string; label: string; tier: LiftTier }[];
  imbalances: { label: string; status: ImbalanceStatus }[];
  /** Movimientos del lado flojo de un desequilibrio (ver `getImbalanceBias`). */
  weakLiftIds: string[];
  /** El coach ya tiene datos de sobra para ajustarte (`ResponseProfile.confident`) y cuántas semanas lleva. */
  confident: boolean;
  weeks: number;
  minWeeks: number;
  /** El libro de aciertos de las cargas. */
  ledger: { resolved: number; hits: number; rows: { label: string; verdict: RuleVerdict }[] };
  /** Movimientos que ya tienen un objetivo abierto: no se vuelve a proponer. */
  openGoalMovementIds: string[];
}

export interface AnalysisRex {
  lead: string;
  tone: RexAnalysisTone;
  text: string;
  proposal: GoalProposal | null;
}

const MIN_LEDGER_CASES = 5;
const WORKS_AT = 0.7;

const comma = (n: number) => String(n).replace('.', ',');

function fuerza(i: AnalysisRexInput): AnalysisRex {
  const lead = i.headline.tone === 'good' ? 'Vas bien de fuerza.' : i.headline.tone === 'warn' ? 'Ojo con tu fuerza.' : 'Aún hay pocos datos.';
  const ratio = i.strengthRatio !== null ? `Tu total es ${comma(Math.round(i.strengthRatio * 10) / 10)} veces tu peso. ` : '';
  const text = `${ratio}${i.headline.sentences[0] ?? ''}`.trim();

  // El levantamiento estancado o a la baja que aún no tiene un objetivo.
  const stuck = i.perLift.find((l) => (l.tier === 'regresion' || l.tier === 'lento') && PR_KEY_TO_MOVEMENT[l.key] && !i.openGoalMovementIds.includes(PR_KEY_TO_MOVEMENT[l.key]));
  const proposal: GoalProposal | null = stuck
    ? { movementId: PR_KEY_TO_MOVEMENT[stuck.key], label: GOAL_LIFTS[PR_KEY_TO_MOVEMENT[stuck.key]], why: stuck.tier === 'regresion' ? 'va a la baja' : 'lleva tiempo estancado' }
    : null;
  return { lead, tone: i.headline.tone, text, proposal };
}

function equilibrio(i: AnalysisRexInput): AnalysisRex {
  const off = i.imbalances.filter((g) => g.status === 'desbalance');
  const ok = i.imbalances.filter((g) => g.status === 'equilibrado');
  if (off.length > 0) {
    const weak = i.weakLiftIds.find((id) => GOAL_LIFTS[id] && !i.openGoalMovementIds.includes(id));
    return {
      lead: off.length === 1 ? 'Hay un desequilibrio.' : 'Hay desequilibrios.',
      tone: 'warn',
      text: `${off.length === 1 ? 'Se desvía' : `Se desvían ${off.length} parejas`}: ${off.map((g) => g.label.toLowerCase()).join(', ')}.${weak ? ` El lado flojo es ${GOAL_LIFTS[weak].toLowerCase()}.` : ''}`,
      proposal: weak ? { movementId: weak, label: GOAL_LIFTS[weak], why: 'es el lado flojo de un desequilibrio' } : null,
    };
  }
  if (ok.length > 0) return { lead: 'Todo equilibrado.', tone: 'good', text: 'Ninguna pareja de movimientos se desvía de lo que cabe esperar.', proposal: null };
  return { lead: 'Faltan datos.', tone: 'neutral', text: 'Aún no hay marcas suficientes para comparar parejas de movimientos.', proposal: null };
}

function coach(i: AnalysisRexInput): AnalysisRex {
  if (!i.confident) {
    return { lead: 'Aún te estoy conociendo.', tone: 'neutral', text: `Llevo ${i.weeks} de ${i.minWeeks} semanas de datos para ajustarte las cargas con confianza.`, proposal: null };
  }
  const { resolved, hits } = i.ledger;
  if (resolved < MIN_LEDGER_CASES) {
    return { lead: 'El coach te conoce.', tone: 'good', text: 'Aún no hay suficientes decisiones de carga con resultado para medir cuánto acierta.', proposal: null };
  }
  const rate = hits / resolved;
  const pct = Math.round(rate * 100);
  const doubtful = i.ledger.rows.find((r) => r.verdict === 'dudosa');
  const works = rate >= WORKS_AT;
  return {
    lead: works ? 'El coach acierta.' : 'El coach duda.',
    tone: works ? 'good' : 'warn',
    text: `${hits} de ${resolved} decisiones de carga salieron bien (${pct} %).${doubtful ? ` Lo que menos funciona: ${doubtful.label.toLowerCase()}.` : ''}`,
    proposal: null,
  };
}

/** La frase de Rex para la pestaña que se está mirando. */
export function analysisRexLine(input: AnalysisRexInput): AnalysisRex {
  if (input.tab === 'fuerza') return fuerza(input);
  if (input.tab === 'equilibrio') return equilibrio(input);
  return coach(input);
}

/** Semanas del objetivo que Rex propone desde el Análisis. */
export const PROPOSAL_WEEKS = 8;

/** Los movimientos que ya tienen un objetivo abierto (con fecha por delante). */
export function openGoalMovements(profile: Pick<AthleteProfile, 'goals'>, todayIso: string): string[] {
  return profile.goals.flatMap((g) => (g.movementId && g.targetDate >= todayIso ? [g.movementId] : []));
}

/** El perfil con un objetivo «Subir PR» nuevo (8 semanas, énfasis moderado): lo mismo que crearía Rex en Objetivos. */
export function addSubirPrGoal(profile: AthleteProfile, movementId: string, todayIso: string): AthleteProfile {
  const state = {
    type: 'subir-pr' as const,
    movementId,
    detail: GOAL_LIFTS[movementId],
    weeks: PROPOSAL_WEEKS,
    targetDate: addDaysIso(todayIso, PROPOSAL_WEEKS * 7),
    push: 'moderado' as const,
  };
  return applyPlan(profile, commitItems('obj', state, { profile, todayIso }));
}