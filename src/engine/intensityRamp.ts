import type { IntensityRamp } from '../data/athlete/types';
import { weeksSinceStart } from './periodization';
import { daysBetween } from './loadMetrics';

/** Intensidad de partida en la primera semana de rampa (60% de la carga objetivo) — sube linealmente hasta el 100% en la ultima semana configurada. */
export const RAMP_FLOOR = 0.6;

export type RampDomain = 'strength' | 'oly' | 'wod';

function weeksForDomain(ramp: IntensityRamp | undefined, domain: RampDomain): number {
  if (!ramp) return 0;
  if (domain === 'strength') return ramp.strengthWeeks;
  if (domain === 'oly') return ramp.olyWeeks;
  return ramp.wodWeeks;
}

/**
 * Multiplicador 0.6-1 para la carga de fuerza/oly de hoy segun la rampa configurada — 1 (sin
 * efecto) si no hay rampa activa, si ese dominio tiene 0 semanas, o si ya se completaron las
 * semanas configuradas. Se combina con el resto de factores de autorregulacion multiplicando,
 * igual que ya se hace con ACWR y RPE.
 */
export function getRampFactor(ramp: IntensityRamp | undefined, domain: RampDomain, today: Date): number {
  const weeks = weeksForDomain(ramp, domain);
  if (!ramp || weeks <= 0) return 1;
  const elapsed = weeksSinceStart(ramp.startDate, today);
  if (elapsed >= weeks) return 1;
  return RAMP_FLOOR + (1 - RAMP_FLOOR) * (elapsed / weeks);
}

/** true mientras la rampa de WOD siga en marcha — se usa para suavizar formato/exigencia, no una carga que multiplicar. */
export function isWodRampActive(ramp: IntensityRamp | undefined, today: Date): boolean {
  const weeks = weeksForDomain(ramp, 'wod');
  if (!ramp || weeks <= 0) return false;
  return weeksSinceStart(ramp.startDate, today) < weeks;
}

/** Resumen legible ("Rampa de vuelta: fuerza semana 2/4 · wod semana 2/2") o null si no hay ninguna rampa vigente hoy. */
export function describeRampStatus(ramp: IntensityRamp | undefined, today: Date): string | null {
  if (!ramp) return null;
  const elapsed = weeksSinceStart(ramp.startDate, today);
  const parts: string[] = [];
  if (ramp.strengthWeeks > 0 && elapsed < ramp.strengthWeeks) parts.push(`fuerza semana ${elapsed + 1}/${ramp.strengthWeeks}`);
  if (ramp.olyWeeks > 0 && elapsed < ramp.olyWeeks) parts.push(`oly semana ${elapsed + 1}/${ramp.olyWeeks}`);
  if (ramp.wodWeeks > 0 && elapsed < ramp.wodWeeks) parts.push(`wod semana ${elapsed + 1}/${ramp.wodWeeks}`);
  if (parts.length === 0) return null;
  return `Rampa de vuelta: ${parts.join(' · ')}`;
}

/** A partir de este hueco sin entrenar se sugiere una rampa — menos y es solo un descanso normal. */
export const RETURN_GAP_MIN_DAYS = 10;

export interface ReturnRampSuggestion {
  gapDays: number;
  ramp: IntensityRamp;
}

/** Ultima fecha de entreno antes de hoy, a partir de `trainingDatesLog` — no de `history`, que se recorta a 30 sesiones y podria perder el rastro en una pausa larga. */
function lastTrainingDateBefore(trainingDatesLog: string[] | undefined, todayIso: string): string | undefined {
  return (trainingDatesLog ?? []).filter((d) => d < todayIso).sort().pop();
}

/** Un coach real no da la misma vuelta a alguien que ha faltado 10 dias que a alguien que vuelve tras dos meses — a mas hueco, rampa mas larga y mas conservadora. */
function rampWeeksForGap(gapDays: number): Pick<IntensityRamp, 'strengthWeeks' | 'olyWeeks' | 'wodWeeks'> {
  if (gapDays >= 42) return { strengthWeeks: 6, olyWeeks: 6, wodWeeks: 4 };
  if (gapDays >= 21) return { strengthWeeks: 4, olyWeeks: 4, wodWeeks: 3 };
  return { strengthWeeks: 2, olyWeeks: 2, wodWeeks: 1 };
}

/**
 * Si el atleta entrena hoy tras un hueco de `RETURN_GAP_MIN_DAYS` dias o mas sin ninguna sesion
 * registrada, y no hay ya una rampa vigente, propone una nueva con duracion segun la severidad del
 * hueco. Nunca se activa sola — solo se calcula la sugerencia, activarla de verdad es cosa del
 * atleta (ver el banner en `Planificacion.tsx`). Si el atleta entrena de nuevo sin aceptarla, el
 * hueco se cierra solo al dia siguiente y la sugerencia deja de aparecer — no hace falta guardar
 * un "ya lo pregunte" en ningun sitio.
 */
export function suggestReturnRamp(
  trainingDatesLog: string[] | undefined,
  currentRamp: IntensityRamp | undefined,
  todayIso: string,
): ReturnRampSuggestion | null {
  const today = new Date(`${todayIso}T00:00:00`);
  if (describeRampStatus(currentRamp, today)) return null;

  const lastDate = lastTrainingDateBefore(trainingDatesLog, todayIso);
  if (!lastDate) return null;

  const gapDays = daysBetween(lastDate, today);
  if (gapDays < RETURN_GAP_MIN_DAYS) return null;

  return { gapDays, ramp: { startDate: todayIso, ...rampWeeksForGap(gapDays) } };
}
