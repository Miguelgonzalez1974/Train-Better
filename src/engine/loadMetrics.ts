import type { SessionHistoryEntry } from '../data/athlete/types';
import type { MovementPattern } from '../data/movements/types';
import { getMovementById } from '../data/movements';

export type AcwrZone = 'baja' | 'optima' | 'moderada' | 'alta';

export interface AcwrResult {
  acute: number;
  chronic: number;
  acwr: number | null;
  zone: AcwrZone;
  /** true si aun no hay sesiones recientes suficientes para confiar en el ratio (atleta nuevo o que vuelve de una pausa larga). */
  coldStart: boolean;
}

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;
/** Sesiones minimas en la ventana cronica para tratar el ACWR calculado como fiable. */
const COLD_START_MIN_SESSIONS = 4;
const COLD_START_ZONE: AcwrZone = 'moderada';

export const ACWR_ZONE_LABEL: Record<AcwrZone, string> = {
  baja: 'Baja carga',
  optima: 'Óptimo',
  moderada: 'Riesgo moderado',
  alta: 'Riesgo alto',
};

/** Orden de cautela de cada zona (a mayor numero, mas restrictiva) — usado solo para no relajar nunca una zona ya cautelosa. */
const ZONE_CAUTION_RANK: Record<AcwrZone, number> = { baja: 0, optima: 0, moderada: 1, alta: 2 };

/**
 * `new Date(dateIso)` sobre una fecha suelta ("2026-08-31", sin hora) la interpreta como
 * medianoche UTC — en una zona horaria detras de UTC eso cae en el dia local anterior, y
 * `.setHours(0,0,0,0)` (que opera en hora local) lo fija ahi en vez de corregirlo. Anadir la hora
 * explicita fuerza el parseo en hora local desde el principio, evitando el desfase de un dia.
 */
export function daysBetween(dateIso: string, reference: Date): number {
  const diffMs = new Date(reference).setHours(0, 0, 0, 0) - new Date(`${dateIso}T00:00:00`).setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function classifyAcwr(acwr: number | null): AcwrZone {
  if (acwr === null) return 'optima';
  if (acwr < 0.8) return 'baja';
  if (acwr <= 1.3) return 'optima';
  if (acwr <= 1.5) return 'moderada';
  return 'alta';
}

/**
 * Un coach real no le da carga plena a un atleta del que no conoce su tolerancia: con menos de
 * `COLD_START_MIN_SESSIONS` sesiones recientes (atleta nuevo, o que vuelve de una pausa larga y por
 * tanto no tiene sesiones en la ventana cronica) se aplica cautela minima aunque el ratio en si de
 * "optima" — pero nunca se relaja una zona que el propio ratio ya marque como mas restrictiva.
 */
function applyColdStart(zone: AcwrZone, sessionsInWindow: number): AcwrZone {
  if (sessionsInWindow >= COLD_START_MIN_SESSIONS) return zone;
  return ZONE_CAUTION_RANK[zone] >= ZONE_CAUTION_RANK[COLD_START_ZONE] ? zone : COLD_START_ZONE;
}

/**
 * Acute:Chronic Workload Ratio a partir de sRPE (RPE x duracion en min) de cada sesion.
 * ACWR = carga aguda (suma ultimos 7 dias) / carga cronica (media semanal de los ultimos 28 dias).
 * Zonas basadas en la literatura de gestion de carga (Gabbett et al.): <0.8 baja, 0.8-1.3 optima,
 * 1.3-1.5 moderada, >1.5 alta.
 */
export function computeAcwr(history: SessionHistoryEntry[], referenceDate: Date = new Date()): AcwrResult {
  let acute = 0;
  let chronicSum = 0;
  let sessionsInWindow = 0;

  for (const entry of history) {
    const age = daysBetween(entry.date, referenceDate);
    if (age < 0 || age >= CHRONIC_WINDOW_DAYS) continue;
    sessionsInWindow++;
    const srpe = entry.rpe * entry.durationMin;
    chronicSum += srpe;
    if (age < ACUTE_WINDOW_DAYS) acute += srpe;
  }

  const chronic = chronicSum / (CHRONIC_WINDOW_DAYS / 7);
  const acwr = chronic > 0 ? acute / chronic : null;
  const coldStart = sessionsInWindow < COLD_START_MIN_SESSIONS;
  const zone = applyColdStart(classifyAcwr(acwr), sessionsInWindow);

  return { acute, chronic, acwr, zone, coldStart };
}

// ---- Fatiga por zona (ACWR por patron de movimiento) ----

export interface PatternFatigue {
  /** sRPE atribuido a este patron en los ultimos 7 dias. */
  acute: number;
  /** Media semanal de sRPE de este patron en los ultimos 28 dias. */
  chronicWeekly: number;
  /** acute / chronicWeekly, o null si no hay carga cronica para este patron. */
  ratio: number | null;
  /** true cuando el patron esta claramente sobrecargado esta semana respecto a su propia norma. */
  overcooked: boolean;
}

/** Ratio agudo:cronico por patron a partir del cual la zona se considera sobrecargada — mismo umbral que la zona "alta" del ACWR global. */
const PATTERN_FATIGUE_RATIO_THRESHOLD = 1.5;
/** Piso del factor de carga por fatiga de zona: nunca quita mas del 25% (encima ya actua el ACWR global). */
const PATTERN_FATIGUE_FLOOR = 0.75;
/** Cuanto baja el factor por cada 0.1 de ratio por encima del umbral. */
const PATTERN_FATIGUE_SLOPE = 0.3;
/** Sesiones minimas en la ventana cronica para fiarse del ratio por patron (mismo cold-start que el ACWR). */
const PATTERN_FATIGUE_MIN_CHRONIC_SESSIONS = 4;
/** Un ratio alto salido de una sola sesion aguda es ruido — hacen falta al menos 2 dias que toquen el patron. */
const PATTERN_FATIGUE_MIN_ACUTE_HITS = 2;

/** Patrones distintos que aparecen en los movimientos de una sesion (ignora ids no resueltos, p.ej. `benchmark:*`). */
function sessionPatterns(entry: SessionHistoryEntry): Set<MovementPattern> {
  const patterns = new Set<MovementPattern>();
  for (const id of entry.movementIds) {
    const movement = getMovementById(id);
    if (movement) patterns.add(movement.pattern);
  }
  return patterns;
}

/**
 * ACWR pero por zona: reparte el sRPE de cada sesion a partes iguales entre los patrones de
 * movimiento que toco ese dia (fuerza, oly, accesorios y WOD por igual — una zona se carga con
 * todo, no solo con el levantamiento principal), y compara la carga aguda (7 dias) de cada patron
 * con su propia media semanal cronica (28 dias). El ACWR global ya frena cuando la carga TOTAL
 * sube; esto capta lo que se le escapa: el atleta rebalancea y machaca una zona concreta mientras
 * afloja en otras, con el total sin inmutarse.
 */
export function computePatternFatigue(
  history: SessionHistoryEntry[],
  referenceDate: Date = new Date(),
): Map<MovementPattern, PatternFatigue> {
  const acuteLoad = new Map<MovementPattern, number>();
  const chronicLoad = new Map<MovementPattern, number>();
  const acuteHits = new Map<MovementPattern, number>();
  let chronicSessions = 0;

  for (const entry of history) {
    const age = daysBetween(entry.date, referenceDate);
    if (age < 0 || age >= CHRONIC_WINDOW_DAYS) continue;
    chronicSessions++;
    const patterns = sessionPatterns(entry);
    if (patterns.size === 0) continue;
    const share = (entry.rpe * entry.durationMin) / patterns.size;
    for (const pattern of patterns) {
      chronicLoad.set(pattern, (chronicLoad.get(pattern) ?? 0) + share);
      if (age < ACUTE_WINDOW_DAYS) {
        acuteLoad.set(pattern, (acuteLoad.get(pattern) ?? 0) + share);
        acuteHits.set(pattern, (acuteHits.get(pattern) ?? 0) + 1);
      }
    }
  }

  const result = new Map<MovementPattern, PatternFatigue>();
  for (const [pattern, chronicSum] of chronicLoad) {
    const chronicWeekly = chronicSum / (CHRONIC_WINDOW_DAYS / 7);
    const acute = acuteLoad.get(pattern) ?? 0;
    const ratio = chronicWeekly > 0 ? acute / chronicWeekly : null;
    const overcooked =
      ratio !== null &&
      ratio > PATTERN_FATIGUE_RATIO_THRESHOLD &&
      chronicSessions >= PATTERN_FATIGUE_MIN_CHRONIC_SESSIONS &&
      (acuteHits.get(pattern) ?? 0) >= PATTERN_FATIGUE_MIN_ACUTE_HITS;
    result.set(pattern, { acute, chronicWeekly, ratio, overcooked });
  }
  return result;
}

/** ¿Esta esa zona sobrecargada ahora mismo? — para no sesgar la seleccion hacia un patron ya machacado. */
export function isPatternOvercooked(fatigue: Map<MovementPattern, PatternFatigue>, pattern: MovementPattern): boolean {
  return fatigue.get(pattern)?.overcooked ?? false;
}

/**
 * Factor de carga (<= 1) para hoy dado el/los patron(es) implicados: rampa acotada segun cuanto se
 * pase el ratio del umbral, con piso en `PATTERN_FATIGUE_FLOOR`. 1 si ninguno esta sobrecargado.
 */
export function getPatternFatigueFactor(fatigue: Map<MovementPattern, PatternFatigue>, patterns: MovementPattern[]): number {
  let factor = 1;
  for (const pattern of patterns) {
    const f = fatigue.get(pattern);
    if (!f?.overcooked || f.ratio === null) continue;
    const scaled = 1 - (f.ratio - PATTERN_FATIGUE_RATIO_THRESHOLD) * PATTERN_FATIGUE_SLOPE;
    factor = Math.min(factor, Math.max(PATTERN_FATIGUE_FLOOR, scaled));
  }
  return factor;
}

/** Lista de patrones sobrecargados hoy — p.ej. para excluirlos del pool del WOD. */
export function overcookedPatterns(fatigue: Map<MovementPattern, PatternFatigue>): MovementPattern[] {
  return [...fatigue.entries()].filter(([, f]) => f.overcooked).map(([pattern]) => pattern);
}

const ACWR_TREND_DAYS = 21;

/**
 * Serie diaria del ratio ACWR de los ultimos `days` dias — mismo `computeAcwr` de siempre, llamado
 * una vez por dia con una fecha de referencia distinta cada vez, en vez de un calculo nuevo. Da
 * contexto de tendencia a la cifra puntual del gauge (¿llevamos 3 semanas subiendo hacia zona alta,
 * o es un pico aislado de hoy?), no solo el snapshot de hoy.
 */
export function getAcwrTrend(history: SessionHistoryEntry[], days: number = ACWR_TREND_DAYS, referenceDate: Date = new Date()): (number | null)[] {
  const series: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() - i);
    series.push(computeAcwr(history, date).acwr);
  }
  return series;
}
