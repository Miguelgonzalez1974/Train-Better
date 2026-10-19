import type { AthleteProfile, DayLightColor, DayLightInfo, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import type { CompetitionDay } from './competition';
import { computeAcwr } from './loadMetrics';
import { computeReadinessScore } from './readinessScore';

/**
 * El semáforo del día: con lo que cuentas por la mañana y lo que miden tus datos, el día sale verde, ámbar o rojo y eso
 * cambia lo que entrenas (no solo el porcentaje de la carga), como haría un entrenador de verdad:
 *   - Verde: sesión completa y permiso para apretar algo más en el WOD.
 *   - Ámbar: mantienes el estímulo con menos coste: una serie menos de fuerza, WOD más corto y una sola superserie de accesorio.
 *   - Rojo: no es día de entrenar duro: sesión de recuperación activa (movilidad, técnica ligera y aeróbico suave).
 * Solo hay semáforo si hiciste el check-in de hoy y hay nota de preparación; si no, el día sale como siempre.
 */

/** Preparación (0-100) desde la que el día es verde y por debajo de la cual (incluida) es rojo. */
export const LIGHT_GREEN_FROM = 65;
export const LIGHT_RED_UNTIL = 40;
/** Cerca de una competición se aprieta menos: hay que llegar fresco, no acumular fatiga. */
export const LIGHT_GREEN_FROM_PEAK = 70;
export const LIGHT_RED_UNTIL_PEAK = 45;
/** Una HRV por debajo de tu rango solo hunde un día ámbar a rojo si la preparación ya va floja. */
const HRV_RED_BELOW = 50;

/** Cuánto recorta (o sube) un día de cada color: series de fuerza y oly, y volumen del WOD. */
export const AMBER_STRENGTH_SETS = 0.8;
export const AMBER_WOD_VOLUME = 0.75;
export const GREEN_WOD_VOLUME = 1.05;
/** Superseries de accesorio máximas en día ámbar. */
export const AMBER_MAX_SUPERSETS = 1;

export interface DayLightInput {
  /** Preparación de hoy (0-100); null = sin nota, sin semáforo. */
  readiness: number | null;
  /** La HRV (media de 7 días, o la de hoy si no hay media) cae por debajo de tu rango. */
  hrvLow: boolean;
  /** Carga acumulada muy alta (ACWR en zona alta). */
  loadHigh: boolean;
  /** Agujetas fuertes en alguna zona (o el eje de agujetas en "alto"). */
  soreStrong: boolean;
  /** Hay una competición cerca (pico, taper o activación): umbrales más exigentes. */
  nearCompetition: boolean;
}

const COLORS: DayLightColor[] = ['rojo', 'ambar', 'verde'];
export const LIGHT_LABEL: Record<DayLightColor, { name: string; short: string }> = {
  verde: { name: 'Día verde', short: 'a por todas' },
  ambar: { name: 'Día ámbar', short: 'mantener sin acumular' },
  rojo: { name: 'Día rojo', short: 'recuperar' },
};

/** El color del día y sus motivos, a partir de los datos de hoy (puro: sin perfil ni historial). */
export function computeDayLight(input: DayLightInput): DayLightInfo | null {
  const { readiness, hrvLow, loadHigh, soreStrong, nearCompetition } = input;
  if (readiness === null) return null;
  const greenFrom = nearCompetition ? LIGHT_GREEN_FROM_PEAK : LIGHT_GREEN_FROM;
  const redUntil = nearCompetition ? LIGHT_RED_UNTIL_PEAK : LIGHT_RED_UNTIL;
  let level = readiness >= greenFrom ? 2 : readiness > redUntil ? 1 : 0;
  const reasons = [`Preparación ${readiness} %`];

  if (hrvLow && level === 2) {
    level = 1;
    reasons.push('HRV por debajo de tu rango');
  } else if (hrvLow && level === 1 && readiness < HRV_RED_BELOW) {
    level = 0;
    reasons.push('HRV por debajo de tu rango');
  }
  if (loadHigh && level === 2) {
    level = 1;
    reasons.push('carga acumulada muy alta');
  }
  if (soreStrong && level === 2) {
    level = 1;
    reasons.push('agujetas fuertes');
  }
  if (nearCompetition && level === 2) reasons.push('cerca de la competición: sin empujar de más');
  return { color: COLORS[level], reasons };
}

/**
 * El semáforo de `date` con el perfil y el historial: calcula la preparación (con el check-in de hoy) y recoge el resto de
 * señales. Null si no hay check-in hoy o aún no hay nota.
 */
export function resolveDayLight(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  date: Date,
  check: ReadinessCheck | undefined,
  comp: CompetitionDay | null,
): DayLightInfo | null {
  if (!check) return null;
  const score = computeReadinessScore({ readinessLog: profile.readinessLog, history, setFeedbackLog: profile.setFeedbackLog, painFlags: profile.painFlags, today: date });
  const acwr = computeAcwr(history, date);
  return computeDayLight({
    readiness: score.total,
    hrvLow: check.hrvVs === 'bajo',
    loadHigh: !acwr.coldStart && acwr.zone === 'alta',
    soreStrong: check.soreness === 'alto' || Object.values(check.soreZones ?? {}).some((level) => level === 2),
    nearCompetition: comp !== null && (comp.phase === 'pico-1' || comp.phase === 'pico' || comp.phase === 'taper' || comp.phase === 'activacion'),
  });
}

/** Lo que el semáforo hace a la sesión de hoy, en una frase para "por qué mi sesión es así". */
export function lightReason(light: DayLightInfo, applied: { push: boolean; hasAccessory: boolean }): string {
  const why = light.reasons.join(', ');
  if (light.color === 'rojo') return `Día rojo (${why}): hoy no toca entrenar duro, la sesión es recuperación activa — movilidad, técnica ligera y aeróbico suave. Mañana te lo agradecerá.`;
  if (light.color === 'ambar') {
    return `Día ámbar (${why}): mantienes el estímulo con menos coste — una serie menos de fuerza, un WOD más corto${applied.hasAccessory ? ' y una sola superserie de accesorio' : ''}.`;
  }
  return applied.push
    ? `Día verde (${why}): llegas bien, así que hay permiso para apretar algo más en el WOD.`
    : `Día verde (${why}): la sesión va completa, tal como está prevista.`;
}
