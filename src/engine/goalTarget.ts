import type { Goal, PersonalRecords, PrLogEntry } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { isoDiffDays } from './periodization';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';

/**
 * La meta en kilos de un objetivo de fuerza o halterofilia: cuánto falta, a qué ritmo hay que subir, a qué ritmo subes de verdad y dónde
 * llegarías a la fecha. Todo sale de la marca actual (`prs`), del punto de partida del objetivo (`startKg`) y del registro de marcas
 * (`prLog`). Puro: la fecha entra por parámetro.
 */

/** Tipos de objetivo que admiten una meta en kilos. */
export const KG_GOAL_TYPES: Goal['type'][] = ['subir-pr', 'elevar-fuerza', 'mejorar-potencia'];

/** Ventana (días) y datos mínimos para fiarse de tu ritmo real; por debajo se usa un ritmo típico. */
export const RATE_WINDOW_DAYS = 84;
export const RATE_MIN_POINTS = 2;
export const RATE_MIN_SPAN_DAYS = 21;
/** Ritmo típico de subida cuando aún no hay datos: un 0,5 % de la marca por semana. */
export const TYPICAL_WEEKLY_PCT = 0.005;
/** Cuánto por detrás de la línea del tiempo (en fracción del camino) se considera ir por detrás. */
const BEHIND_MARGIN = 0.15;
/** Si lo necesario es más del doble de lo que subes, la meta es ambiciosa. */
const AMBITIOUS_RATIO = 2;

export type TargetKind = 'conseguida' | 'va-al-dia' | 'va-por-detras' | 'ambiciosa';

export interface GoalTargetStatus {
  key: keyof PersonalRecords;
  targetKg: number;
  currentKg: number;
  startKg: number | null;
  remainingKg: number;
  weeksLeft: number;
  /** Kilos por semana que hacen falta desde hoy. */
  neededPerWeek: number;
  /** Kilos por semana a los que subes (medidos o, sin datos, típicos). */
  actualPerWeek: number;
  /** true si el ritmo sale de tus marcas; false = ritmo típico por falta de datos. */
  rateKnown: boolean;
  /** Dónde llegarías a la fecha si sigues a ese ritmo. */
  projectedKg: number;
  /** Dónde deberías estar hoy según la línea recta desde la salida hasta la meta (null sin punto de partida). */
  expectedTodayKg: number | null;
  kind: TargetKind;
}

/** La marca (`prs`) que mide un objetivo de fuerza u oly, o null si no tiene una. */
export function goalPrKey(goal: Pick<Goal, 'movementId'>): keyof PersonalRecords | null {
  if (!goal.movementId) return null;
  const movement = getMovementById(goal.movementId);
  if (!movement) return null;
  return resolveStrengthPRKey(movement) ?? resolveOlyPRKey(movement) ?? null;
}

/** Un objetivo admite meta en kilos si es de fuerza u oly y su levantamiento tiene marca. */
export function supportsKgTarget(goal: Pick<Goal, 'type' | 'movementId'>): boolean {
  return KG_GOAL_TYPES.includes(goal.type) && goalPrKey(goal) !== null;
}

/** Kilos por semana a los que subió esa marca en las últimas semanas; null si no hay datos suficientes. */
export function liftRatePerWeek(prLog: PrLogEntry[] | undefined, key: string, todayIso: string): number | null {
  const since = new Date(`${todayIso}T00:00:00`);
  since.setDate(since.getDate() - RATE_WINDOW_DAYS);
  const sinceIso = toIso(since);
  const points = (prLog ?? []).filter((e) => e.key === key && e.date >= sinceIso && e.date <= todayIso).sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < RATE_MIN_POINTS) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const span = isoDiffDays(first.date, last.date);
  if (span < RATE_MIN_SPAN_DAYS) return null;
  return (last.kg - first.kg) / (span / 7);
}

export const typicalRatePerWeek = (currentKg: number): number => currentKg * TYPICAL_WEEKLY_PCT;

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundToHalf = (n: number) => Math.round(n * 2) / 2;

/** Metas que Rex propone: un 3 %, un 6 % y un 10 % por encima de la marca actual, a múltiplos de 2,5 kg y siempre al menos 2,5 más. */
export function suggestedTargets(currentKg: number): number[] {
  const step = 2.5;
  const out: number[] = [];
  for (const pct of [0.03, 0.06, 0.1]) {
    const kg = Math.max(currentKg + step, Math.round((currentKg * (1 + pct)) / step) * step);
    if (!out.includes(kg)) out.push(kg);
  }
  return out;
}

/** El estado de la meta en kilos de un objetivo, o null si no tiene meta o no se puede medir (sin marca o fecha pasada). */
export function goalTargetStatus(goal: Goal, prs: Partial<PersonalRecords> | undefined, prLog: PrLogEntry[] | undefined, today: Date): GoalTargetStatus | null {
  if (!goal.targetKg || !supportsKgTarget(goal)) return null;
  const key = goalPrKey(goal) as keyof PersonalRecords;
  const currentKg = prs?.[key];
  if (!currentKg) return null;
  const todayIso = toIso(today);
  const daysLeft = isoDiffDays(todayIso, goal.targetDate);
  const startKg = goal.startKg ?? null;
  const remainingKg = Math.max(0, goal.targetKg - currentKg);
  const weeksLeft = Math.max(0, daysLeft / 7);

  const measured = liftRatePerWeek(prLog, key, todayIso);
  const rateKnown = measured !== null;
  const actualPerWeek = Math.max(0, measured ?? typicalRatePerWeek(currentKg));
  const neededPerWeek = weeksLeft > 0 ? remainingKg / weeksLeft : remainingKg > 0 ? Infinity : 0;
  const projectedKg = currentKg + actualPerWeek * weeksLeft;

  let expectedTodayKg: number | null = null;
  let timeFrac = 0;
  if (startKg !== null) {
    const total = isoDiffDays(goal.createdAt.slice(0, 10), goal.targetDate);
    timeFrac = total > 0 ? Math.min(1, Math.max(0, isoDiffDays(goal.createdAt.slice(0, 10), todayIso) / total)) : 1;
    expectedTodayKg = startKg + (goal.targetKg - startKg) * timeFrac;
  }

  let kind: TargetKind;
  if (currentKg >= goal.targetKg) kind = 'conseguida';
  else {
    const behindLine = startKg !== null && goal.targetKg > startKg && (currentKg - startKg) / (goal.targetKg - startKg) < timeFrac - BEHIND_MARGIN;
    // Con ritmo medido manda la proyección; sin él, la línea desde la salida (un ritmo típico es una suposición, no una prueba).
    const short = projectedKg < goal.targetKg * 0.985;
    const behind = rateKnown || startKg === null ? short : behindLine;
    if (!behind) kind = 'va-al-dia';
    else kind = neededPerWeek > actualPerWeek * AMBITIOUS_RATIO ? 'ambiciosa' : 'va-por-detras';
  }

  return {
    key,
    targetKg: goal.targetKg,
    currentKg,
    startKg,
    remainingKg: round1(remainingKg),
    weeksLeft: round1(weeksLeft),
    neededPerWeek: Number.isFinite(neededPerWeek) ? round1(neededPerWeek) : neededPerWeek,
    actualPerWeek: round1(actualPerWeek),
    rateKnown,
    projectedKg: roundToHalf(projectedKg),
    expectedTodayKg: expectedTodayKg === null ? null : roundToHalf(expectedTodayKg),
    kind,
  };
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const kgText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

/** Lo que Rex dice al elegir la meta: cuánto hay que subir por semana, a qué ritmo subes y dónde llegarías. */
export function targetFeedback(status: GoalTargetStatus, dateText: string): string {
  const weeks = Math.round(status.weeksLeft);
  const needed = `${kgText(status.neededPerWeek)} por semana`;
  const when = `Para el ${dateText} ${weeks === 1 ? 'queda 1 semana' : `quedan ${weeks} semanas`}: necesitas subir ${needed}.`;
  const rate = status.rateKnown ? `Con tu historial subes ${kgText(status.actualPerWeek)} por semana` : `Aún no tengo suficientes marcas tuyas, así que cuento con un ritmo típico de ${kgText(status.actualPerWeek)} por semana`;
  if (status.kind === 'conseguida') return `Esa marca ya la tienes (${kgText(status.currentKg)}).`;
  if (status.kind === 'va-al-dia') return `${when} ${rate}: es realista.`;
  if (status.kind === 'va-por-detras') return `${when} ${rate}: llegarías a unos ${kgText(status.projectedKg)}. Vas justo, pero se puede.`;
  return `${when} ${rate}: llegarías a unos ${kgText(status.projectedKg)}. Es una meta ambiciosa para esa fecha.`;
}


/**
 * Deja coherente la meta en kilos de un objetivo al guardarlo: sin meta (o sin un levantamiento que la admita) no se guarda ni meta ni
 * punto de partida; con meta, el punto de partida es la marca de ese momento, y no cambia mientras la meta siga siendo la misma.
 */
export function normalizeKgTarget(goal: Goal, prs: Partial<PersonalRecords> | undefined, before?: Goal): Goal {
  const key = goalPrKey(goal);
  const current = key ? prs?.[key] : undefined;
  if (!goal.targetKg || !supportsKgTarget(goal) || !current) {
    if (goal.targetKg === undefined && goal.startKg === undefined) return goal;
    const { targetKg: _t, startKg: _s, ...rest } = goal;
    return rest;
  }
  // Si cambia la meta o el levantamiento, la línea de avance parte de la marca de ahora; si no, se conserva el punto de partida.
  const sameLift = before && before.movementId === goal.movementId && before.startKg !== undefined;
  return { ...goal, startKg: sameLift ? (before.startKg as number) : current };
}
export interface TargetAdjustments {
  /** Una meta más baja que sí se alcanza al ritmo de ahora (múltiplo de 2,5 kg, por encima de tu marca), o null si no tiene sentido. */
  lowerKg: number | null;
  /** La fecha en la que llegarías a la meta al ritmo de ahora, si es entre 1 y 12 semanas más tarde; null si no. */
  moveDate: string | null;
  /** Cuántas semanas se retrasa esa fecha. */
  moveWeeks: number | null;
}

/** Lo que se puede proponer cuando la meta no se alcanza a la fecha: bajar el peso o mover la fecha. */
export function proposeTargetAdjustments(goal: Goal, status: GoalTargetStatus, todayIso: string): TargetAdjustments {
  const lowered = Math.floor(status.projectedKg / 2.5) * 2.5;
  const lowerKg = Math.max(status.currentKg + 2.5, lowered);
  let moveDate: string | null = null;
  let moveWeeks: number | null = null;
  if (status.actualPerWeek > 0 && status.remainingKg > 0) {
    const weeksNeeded = Math.ceil(status.remainingKg / status.actualPerWeek);
    const target = new Date(`${todayIso}T00:00:00`);
    target.setDate(target.getDate() + weeksNeeded * 7);
    const iso = toIso(target);
    const extra = Math.ceil(isoDiffDays(goal.targetDate, iso) / 7);
    if (extra >= 1 && extra <= 12) {
      moveDate = iso;
      moveWeeks = extra;
    }
  }
  return { lowerKg: lowerKg < status.targetKg ? lowerKg : null, moveDate, moveWeeks };
}
