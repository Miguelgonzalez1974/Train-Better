import type { AthleteProfile, HardnessLogEntry, SessionHistoryEntry } from '../data/athlete/types';
import type { HardnessSituation } from './hardness';
import { dayStrain, strainStatus } from './strain';

/**
 * Cómo aguantas la dureza que subes. Cada vez que subes un día se guarda lo que se sabía (situación, previsión, objetivo); cuando el
 * día pasa se mira cómo salió: el esfuerzo real frente al objetivo y cómo llegaste a la mañana siguiente frente a lo que es normal en
 * ti. De ahí salen tres cosas, todas en forma de aviso o sugerencia (nunca bloquean):
 *  - tolerancia por situación y nivel («aguantas +1 en semana normal», «+2 en taper lo pagas»),
 *  - una corrección de la previsión de esfuerzo para los días que subes,
 *  - cuándo sugerirte que subas.
 * Con poca muestra no dice nada. Un día aislado no cuenta: un mal día puede ser el sueño o el estrés.
 */

/** Veces que hay que haber subido en una situación y nivel antes de opinar. */
export const HARDNESS_MIN_SAMPLE = 3;
/** Preparación del día siguiente por debajo de lo normal: «regular» desde 6 puntos, «caro» desde 12. */
const DROP_REGULAR = 6;
const DROP_COSTLY = 12;
/** Cuánto se pasa del objetivo para que cuente como regular (cualquier exceso) o caro (10 o más). */
const OVER_COSTLY = 10;
/** Días normales con preparación al día siguiente necesarios para saber qué es «lo normal» en ti. */
const BASELINE_MIN = 6;
/** Sesiones con previsión y resultado necesarias para corregir la previsión de la dureza, y tope de la corrección. */
const BIAS_MIN_SAMPLE = 4;
const BIAS_MAX = 8;
/** Margen que tiene que quedar bajo el techo del objetivo para sugerir que subas. */
const SUGGEST_ROOM = 8;
/** Si uno de los últimos días subidos salió caro, no se sugiere durante estos días. */
const SUGGEST_COOLDOWN_DAYS = 4;

export type HardnessVerdict = 'bien' | 'regular' | 'caro' | 'pendiente' | 'no-hecho';

export interface HardnessOutcome extends HardnessLogEntry {
  verdict: HardnessVerdict;
  /** Esfuerzo real del día (null si no se entrenó). */
  real: number | null;
  /** Preparación de la mañana siguiente y cuánto por debajo de lo normal estaba (null si no se sabe). */
  nextReadiness: number | null;
  drop: number | null;
}

export type ToleranceTier = 'aguanta' | 'regular' | 'paga' | 'sin-datos';

export interface HardnessTolerance {
  n: number;
  bien: number;
  regular: number;
  caro: number;
  tier: ToleranceTier;
  /** Media de lo que bajó la preparación al día siguiente en los días caros y regulares (puntos), o null. */
  avgDrop: number | null;
}

export interface HardnessLearning {
  outcomes: HardnessOutcome[];
  /** Por situación y nivel, clave `situacion|nivel`. */
  bySituation: Record<string, HardnessTolerance>;
  /** Por nivel, con todas las situaciones juntas. */
  byLevel: Record<1 | 2, HardnessTolerance>;
  /** Puntos que se suman a la previsión de un día con la dureza subida (0 si hay poca muestra). */
  bias: number;
  biasSample: number;
  /** Cuántos días subidos hay ya valorados. */
  evaluated: number;
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tally(list: HardnessOutcome[]): HardnessTolerance {
  const done = list.filter((o) => o.verdict === 'bien' || o.verdict === 'regular' || o.verdict === 'caro');
  const bien = done.filter((o) => o.verdict === 'bien').length;
  const regular = done.filter((o) => o.verdict === 'regular').length;
  const caro = done.filter((o) => o.verdict === 'caro').length;
  const n = done.length;
  let tier: ToleranceTier = 'sin-datos';
  if (n >= HARDNESS_MIN_SAMPLE) {
    if (caro >= 2 || caro / n >= 0.4) tier = 'paga';
    else if (bien / n >= 0.67 && caro === 0) tier = 'aguanta';
    else tier = 'regular';
  }
  const drops = done.filter((o) => o.verdict !== 'bien' && o.drop !== null).map((o) => o.drop as number);
  return { n, bien, regular, caro, tier, avgDrop: drops.length > 0 ? Math.round(drops.reduce((s, d) => s + d, 0) / drops.length) : null };
}

/** `history` es todo el historial; solo se valoran los días anteriores a `todayIso`. */
export function learnHardness(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): HardnessLearning {
  const byDate = new Map(history.map((h) => [h.date, h]));
  // Solo los días que siguen marcados como subidos (si luego volviste a normal, el apunte ya no vale).
  const log = (profile.hardnessLog ?? []).filter((e) => profile.hardness?.[e.date] === e.level);
  const hardDates = new Set(log.map((e) => e.date));

  // Lo normal en ti: la preparación de la mañana siguiente a un día de entreno SIN la dureza subida.
  const normalNext: number[] = [];
  for (const h of history) {
    if (h.date >= todayIso || hardDates.has(h.date)) continue;
    const r = profile.strainTargets?.[addDays(h.date, 1)]?.readiness;
    if (typeof r === 'number') normalNext.push(r);
  }
  const baseline = normalNext.length >= BASELINE_MIN ? median(normalNext) : null;

  const outcomes: HardnessOutcome[] = log
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const entry = byDate.get(e.date);
      const real = entry ? dayStrain(entry) : null;
      const nextReadiness = profile.strainTargets?.[addDays(e.date, 1)]?.readiness ?? null;
      const drop = baseline !== null && typeof nextReadiness === 'number' ? Math.round(baseline - nextReadiness) : null;
      let verdict: HardnessVerdict;
      if (e.date >= todayIso) verdict = 'pendiente';
      else if (real === null) verdict = 'no-hecho';
      else {
        const target = e.targetLow !== null && e.targetHigh !== null ? { low: e.targetLow, high: e.targetHigh } : null;
        const over = target && strainStatus(real, target) === 'pasado' ? real - target.high : 0;
        if ((drop !== null && drop >= DROP_COSTLY) || over >= OVER_COSTLY) verdict = 'caro';
        else if ((drop !== null && drop >= DROP_REGULAR) || over > 0) verdict = 'regular';
        else verdict = 'bien';
      }
      return { ...e, verdict, real, nextReadiness: typeof nextReadiness === 'number' ? nextReadiness : null, drop };
    });

  const bySituation: Record<string, HardnessTolerance> = {};
  for (const key of new Set(outcomes.map((o) => `${o.situation}|${o.level}`))) {
    bySituation[key] = tally(outcomes.filter((o) => `${o.situation}|${o.level}` === key));
  }
  const byLevel = { 1: tally(outcomes.filter((o) => o.level === 1)), 2: tally(outcomes.filter((o) => o.level === 2)) } as Record<1 | 2, HardnessTolerance>;

  const diffs = outcomes.filter((o) => o.real !== null && o.predicted !== null && (o.verdict === 'bien' || o.verdict === 'regular' || o.verdict === 'caro')).map((o) => (o.real as number) - (o.predicted as number));
  const bias = diffs.length >= BIAS_MIN_SAMPLE ? Math.max(-BIAS_MAX, Math.min(BIAS_MAX, Math.round(median(diffs)))) : 0;

  return { outcomes, bySituation, byLevel, bias, biasSample: diffs.length, evaluated: byLevel[1].n + byLevel[2].n };
}

export function toleranceFor(learning: HardnessLearning, situation: HardnessSituation, level: 1 | 2): HardnessTolerance {
  return learning.bySituation[`${situation}|${level}`] ?? { n: 0, bien: 0, regular: 0, caro: 0, tier: 'sin-datos', avgDrop: null };
}

export interface PersonalNote {
  tier: Exclude<ToleranceTier, 'sin-datos'>;
  line: string;
}

const dropText = (t: HardnessTolerance) => (t.avgDrop !== null && t.avgDrop >= DROP_REGULAR ? ` Al día siguiente llegaste de media ${t.avgDrop} puntos de preparación por debajo de lo habitual.` : '');

/**
 * Lo que sabe el coach de ti para esta situación y nivel, en una frase con tus datos; si en esta situación no hay muestra, mira el nivel
 * en general. null si no hay nada que decir.
 */
export function personalHardnessNote(learning: HardnessLearning, situation: HardnessSituation, level: 1 | 2): PersonalNote | null {
  const here = toleranceFor(learning, situation, level);
  const scope = here.tier !== 'sin-datos' ? here : learning.byLevel[level];
  if (scope.tier === 'sin-datos') return null;
  const where = here.tier !== 'sin-datos' ? 'en esta situación' : 'en general';
  const times = `${scope.n} ${scope.n === 1 ? 'vez' : 'veces'}`;
  if (scope.tier === 'aguanta') return { tier: 'aguanta', line: `Las últimas ${times} que subiste +${level} ${where} te salió bien (${scope.bien} de ${scope.n}).` };
  if (scope.tier === 'paga') return { tier: 'paga', line: `${scope.caro} de las últimas ${times} que subiste +${level} ${where} lo pagaste.${dropText(scope)}` };
  return { tier: 'regular', line: `Con +${level} ${where}: ${scope.bien} bien, ${scope.regular} regular y ${scope.caro} caro (de ${scope.n}).` };
}

export interface HardnessSuggestion {
  level: 1;
  text: string;
}

/**
 * ¿Le sugiere el coach que suba hoy? Solo con datos tuyos (aguantas +1 en esta situación), llegando bien (semáforo verde), con margen
 * bajo el techo de tu objetivo y sin que uno de los últimos días subidos haya salido caro.
 */
export function suggestHardness(input: {
  learning: HardnessLearning;
  situation: HardnessSituation;
  light: 'verde' | 'ambar' | null;
  /** Ya está subida hoy, o hoy no se ofrece. */
  offered: boolean;
  planned: number | null;
  target: { low: number; high: number } | null;
  todayIso: string;
}): HardnessSuggestion | null {
  const { learning, situation, light, offered, planned, target, todayIso } = input;
  if (!offered || light !== 'verde' || planned === null || !target) return null;
  const t = toleranceFor(learning, situation, 1);
  if (t.tier !== 'aguanta') return null;
  if (planned + SUGGEST_ROOM > target.high) return null;
  const recentCostly = learning.outcomes.some((o) => o.verdict === 'caro' && o.date >= addDays(todayIso, -SUGGEST_COOLDOWN_DAYS));
  if (recentCostly) return null;
  return { level: 1, text: `Hoy hay margen: las últimas ${t.n} veces que subiste +1 en esta situación te salió bien (${t.bien} de ${t.n}).` };
}
