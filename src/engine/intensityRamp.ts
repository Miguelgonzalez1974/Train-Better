import type { IntensityRamp } from '../data/athlete/types';
import { weeksSinceStart } from './periodization';

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
