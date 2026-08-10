import type { MovementPattern } from '../data/movements/types';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById, olyMovements, strengthMovements } from '../data/movements';
import type { OlyFamily } from './periodization';
import type { PatternStrain } from './weakPoints';

const STRENGTH_MOVEMENT_IDS = new Set(strengthMovements.map((m) => m.id));
const OLY_MOVEMENT_IDS = new Set(olyMovements.map((m) => m.id));

/**
 * Patron del levantamiento principal de fuerza de un dia de historial, identificado por
 * pertenencia al catalogo de `strength.ts` (no por voto entre todos los movimientos del dia,
 * que se sesga hacia el bloque con mas entradas — p.ej. oly casi siempre aporta primer + principal).
 */
function dominantStrengthPattern(entry: SessionHistoryEntry): MovementPattern | null {
  for (const id of entry.movementIds) {
    if (STRENGTH_MOVEMENT_IDS.has(id)) return getMovementById(id)!.pattern;
  }
  return null;
}

/**
 * True si `pattern` fue el patron del levantamiento de fuerza principal en alguno de los ultimos
 * `lookbackDays` dias de entreno. Un coach de verdad no deja que el sesgo de un objetivo (aunque
 * sea "intensivo") ni el ciclo natural de la semana apilen el mismo patron pesado — tiron, hombro,
 * sentadilla — varios dias seguidos.
 */
export function wasPatternRecentlyDominant(pattern: MovementPattern, history: SessionHistoryEntry[], lookbackDays = 2): boolean {
  return history.slice(-lookbackDays).some((entry) => dominantStrengthPattern(entry) === pattern);
}

/** Familia de oly (snatch vs. clean/jerk) del levantamiento principal de un dia de historial. */
function dominantOlyFamily(entry: SessionHistoryEntry): OlyFamily | null {
  for (const id of entry.movementIds) {
    if (OLY_MOVEMENT_IDS.has(id)) return id.includes('snatch') ? 'snatch' : 'clean';
  }
  return null;
}

/** Mismo criterio que `wasPatternRecentlyDominant`, pero para la familia de oly (snatch vs. clean/jerk). */
export function wasOlyFamilyRecentlyDominant(family: OlyFamily, history: SessionHistoryEntry[], lookbackDays = 2): boolean {
  return history.slice(-lookbackDays).some((entry) => dominantOlyFamily(entry) === family);
}

const STRENGTH_PATTERN_CYCLE: MovementPattern[] = ['squat', 'hinge', 'verticalPush', 'horizontalPush'];

/**
 * Si `candidate` fue el patron de fuerza dominante en los ultimos dias, lo sustituye por otro
 * patron del ciclo que no lo haya sido. Se aplica siempre al patron final del dia, venga del ciclo
 * natural de la semana o de un objetivo forzandolo — el ciclo natural de 4 patrones puede coincidir
 * con uno forzado el dia anterior (p.ej. viernes forzado + lunes natural de la semana siguiente son
 * el mismo patron), y ese hueco no lo cierra solo bloquear el forzado de un objetivo.
 */
export function avoidPatternRepeat(candidate: MovementPattern, history: SessionHistoryEntry[]): MovementPattern {
  if (!wasPatternRecentlyDominant(candidate, history)) return candidate;
  const alternative = STRENGTH_PATTERN_CYCLE.find((p) => p !== candidate && !wasPatternRecentlyDominant(p, history));
  return alternative ?? candidate;
}

/** Mismo criterio que `avoidPatternRepeat`, pero para la familia de oly (solo snatch/clean, sin alternativa mas alla de la otra). */
export function avoidOlyFamilyRepeat(candidate: OlyFamily, history: SessionHistoryEntry[]): OlyFamily {
  if (!wasOlyFamilyRecentlyDominant(candidate, history)) return candidate;
  const alternative: OlyFamily = candidate === 'snatch' ? 'clean' : 'snatch';
  return wasOlyFamilyRecentlyDominant(alternative, history) ? candidate : alternative;
}

/** Patrones de fuerza que `computeWeakPoints` puede marcar directamente como MovementPattern validos. */
const WEAK_POINT_STRENGTH_KEYS: MovementPattern[] = ['squat', 'hinge', 'horizontalPush', 'verticalPush'];
/** Mas margen que `wasPatternRecentlyDominant` (2 dias): el objetivo es dar mas frecuencia al patron debil, no repetirlo el dia siguiente. */
const WEAK_POINT_LOOKBACK_DAYS = 4;
/** Probabilidad de aplicar el sesgo cuando hay un patron debil disponible — un coach real no reconstruye la semana entera alrededor de un solo punto flaco, solo le da mas frecuencia de la que tocaria por ciclo puro. */
export const WEAK_POINT_BIAS_CHANCE = 0.45;

/**
 * De los patrones de fuerza marcados "a trabajar" por `computeWeakPoints` (los 2 con peor
 * strainScore), devuelve el de mayor prioridad que no haya sido el patron principal en los
 * ultimos `WEAK_POINT_LOOKBACK_DAYS` dias — o null si no hay ninguno disponible (todos en
 * progreso, o los debiles ya se entrenaron hace poco).
 */
export function weakestUntrainedStrengthPattern(weakPoints: PatternStrain[], history: SessionHistoryEntry[]): MovementPattern | null {
  const candidates = weakPoints
    .filter((p) => p.status === 'a-trabajar' && (WEAK_POINT_STRENGTH_KEYS as string[]).includes(p.key))
    .map((p) => p.key as MovementPattern);
  return candidates.find((pattern) => !wasPatternRecentlyDominant(pattern, history, WEAK_POINT_LOOKBACK_DAYS)) ?? null;
}

/** Mismo criterio que `weakestUntrainedStrengthPattern`, para las dos familias de oly (snatch / clean & jerk). */
export function weakestUntrainedOlyFamily(weakPoints: PatternStrain[], history: SessionHistoryEntry[]): OlyFamily | null {
  const candidates = weakPoints
    .filter((p) => p.status === 'a-trabajar' && (p.key === 'snatch' || p.key === 'clean'))
    .map((p) => p.key as OlyFamily);
  return candidates.find((family) => !wasOlyFamilyRecentlyDominant(family, history, WEAK_POINT_LOOKBACK_DAYS)) ?? null;
}
