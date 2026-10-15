import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { estimatePlannedStrain } from './plannedStrain';
import { dayStrain, strainStatus, type StrainStatus } from './strain';

/**
 * Lo que el coach aprende de aciertos y fallos del objetivo de esfuerzo:
 *  - cuántos días caíste dentro, por encima o por debajo del objetivo que se fijó por la mañana;
 *  - cuánto se desvían tus sesiones de lo previsto (el esfuerzo que el coach estimó antes de entrenar frente al real).
 * Con eso corrige las estimaciones futuras y ajusta un poco el rango cuando el patrón es claro. Si hay poca muestra no
 * toca nada.
 */

/** Cuántos días con objetivo y sesión se miran para el recuento. */
const OUTCOME_WINDOW = 10;
/** Los últimos días que cuentan para el patrón (cuántos de ellos caen del mismo lado). */
const PATTERN_WINDOW = 6;
const PATTERN_MIN = 4;
const PATTERN_SAME_SIDE = 4;
/** Sesiones con previsión y resultado necesarias para corregir la estimación, y tope de la corrección. */
const BIAS_MIN_SAMPLE = 4;
const BIAS_MAX = 12;
const BIAS_WINDOW = 10;

export interface StrainLearning {
  /** Recuento de los últimos días con objetivo fijado y sesión hecha. */
  outcomes: { dentro: number; pasado: number; corto: number; total: number };
  /** Los últimos días (más antiguo primero), para ver el patrón reciente. */
  recent: StrainStatus[];
  /** Puntos de esfuerzo que se suman a lo previsto porque tus sesiones suelen salir por encima (+) o por debajo (−). 0 si hay poca muestra. */
  bias: number;
  biasSample: number;
  /** Patrón claro de los últimos días: te quedas corto, te pasas o ninguno. */
  pattern: 'corto' | 'pasado' | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** `history` es todo el historial; solo se usan los días anteriores a `todayIso`. */
export function learnStrain(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): StrainLearning {
  const past = history.filter((h) => h.date < todayIso);
  const byDate = new Map(past.map((h) => [h.date, h]));

  // Aciertos y fallos: solo los objetivos definitivos (con check-in), que son los que se fijaron de verdad.
  const outcomes: { date: string; status: StrainStatus }[] = [];
  for (const [date, target] of Object.entries(profile.strainTargets ?? {})) {
    const entry = byDate.get(date);
    if (!entry || target.provisional) continue;
    const real = dayStrain(entry);
    if (real === null) continue;
    outcomes.push({ date, status: strainStatus(real, target) });
  }
  outcomes.sort((a, b) => a.date.localeCompare(b.date));
  const window = outcomes.slice(-OUTCOME_WINDOW);
  const tally = { dentro: 0, pasado: 0, corto: 0, total: window.length };
  for (const o of window) {
    if (o.status === 'dentro') tally.dentro++;
    else if (o.status === 'pasado') tally.pasado++;
    else tally.corto++;
  }
  const recent = window.slice(-PATTERN_WINDOW).map((o) => o.status);
  const under = recent.filter((s) => s === 'por-debajo').length;
  const over = recent.filter((s) => s === 'pasado').length;
  const pattern = recent.length >= PATTERN_MIN ? (under >= PATTERN_SAME_SIDE ? 'corto' : over >= PATTERN_SAME_SIDE ? 'pasado' : null) : null;

  // Desviación de la previsión: lo que el coach habría estimado de cada sesión pasada (con el historial de entonces) frente a lo real.
  const diffs: number[] = [];
  const dated = past.filter((h) => profile.sessionCache?.[h.date]).sort((a, b) => a.date.localeCompare(b.date)).slice(-BIAS_WINDOW);
  for (const entry of dated) {
    const session = profile.sessionCache![entry.date];
    const planned = estimatePlannedStrain(session, past.filter((h) => h.date < entry.date));
    const real = dayStrain(entry);
    if (planned && real !== null) diffs.push(real - planned.strain);
  }
  const bias = diffs.length >= BIAS_MIN_SAMPLE ? Math.max(-BIAS_MAX, Math.min(BIAS_MAX, Math.round(median(diffs)))) : 0;

  return { outcomes: tally, recent, bias, biasSample: diffs.length, pattern };
}
