import type { MovementPattern } from '../data/movements/types';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { getMovementById, olyMovements, strengthMovements } from '../data/movements';
import type { OlyFamily } from './periodization';
import type { PatternStrain } from './weakPoints';
import { daysBetween } from './loadMetrics';

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

/**
 * Ventana rodante para "esta semana" — 8 dias, no 7, a proposito: un atleta con cadencia semanal
 * fija (p.ej. Lunes/Miercoles/Viernes) tiene su sesion mas antigua exactamente a 7 dias de la
 * siguiente del mismo dia, así que una ventana de exactamente 7 la deja fuera justo cuando hace
 * falta contarla — con 8 sobra margen sin dejar de ser "la semana en curso".
 */
const WEEKLY_BALANCE_WINDOW_DAYS = 8;

/** Cuantas veces fue cada patron de fuerza el principal del dia dentro de la ventana semanal rodante. */
export function weeklyPatternCounts(history: SessionHistoryEntry[], referenceDate: Date = new Date()): Record<MovementPattern, number> {
  const counts = Object.fromEntries(STRENGTH_PATTERN_CYCLE.map((p) => [p, 0])) as Record<MovementPattern, number>;
  for (const entry of history) {
    const age = daysBetween(entry.date, referenceDate);
    if (age < 0 || age >= WEEKLY_BALANCE_WINDOW_DAYS) continue;
    const pattern = dominantStrengthPattern(entry);
    if (pattern && pattern in counts) counts[pattern]++;
  }
  return counts;
}

/**
 * Patron de fuerza ausente por completo en la ventana semanal rodante, una vez que ya se ha visto
 * una semana completa de sesiones de ESTE atleta (`totalSessions >= trainingDaysPerWeek`, no un
 * numero fijo) — comparar contra el propio ritmo del atleta es lo que evita falsos positivos: un
 * atleta de 4-6 dias/semana cubre los 4 patrones solo con completar su semana normal, asi que el
 * aviso nunca deberia saltarle. Pero para 3 dias/semana el ciclo natural de `trainingDayIndex % 4`
 * solo tiene sitio para 3 patrones por semana — `horizontalPush` nunca le toca por puro diseño del
 * ciclo, semana tras semana, para siempre. Y para 6 dias/semana el dia de recuperacion de mitad de
 * semana (jueves) se come el turno de un patron cada semana sin que nadie lo note. A diferencia de
 * `weakestUntrainedStrengthPattern` (rendimiento/estancamiento a largo plazo con datos de RPE y
 * carga), esto es reparto puro de la semana en curso — un coach real corrige el hueco de reparto
 * antes de que se convierta en un desequilibrio real de fuerza, no solo cuando ya duele.
 */
export function weeklyUnderTrainedPattern(
  history: SessionHistoryEntry[],
  referenceDate: Date,
  expectedWeeklySessions: number,
): MovementPattern | null {
  const counts = weeklyPatternCounts(history, referenceDate);
  const totalSessions = Object.values(counts).reduce((sum, c) => sum + c, 0);
  if (totalSessions < expectedWeeklySessions) return null;
  return STRENGTH_PATTERN_CYCLE.find((p) => counts[p] === 0) ?? null;
}
