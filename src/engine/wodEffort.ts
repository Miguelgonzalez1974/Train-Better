/**
 * Elegir el WOD del día por su esfuerzo: de los WODs que ya encajan por duración, energía, dominio y molestias (ver
 * `wodSelection.ts`), se prefiere el que deja el esfuerzo previsto de la sesión DENTRO del objetivo de hoy (ver `strainTarget.ts`).
 *
 * Cómo se mide: la sesión ya generada con el WOD elegido tiene un esfuerzo previsto (RPE x minutos, con la curva de `strain.ts`).
 * Cambiar de WOD cambia solo esa parte: se quita lo que aportaba el WOD actual (según su perfil, `wodProfile.ts`) y se suma lo del
 * candidato, y de ahí sale el esfuerzo previsto de la sesión con cada candidato. Nunca se empuja a hacer más de la cuenta: pasarse del
 * objetivo castiga mucho más que quedarse corto.
 *
 * Tres modos (`AthleteProfile.wodEffortMode`): `off` (como antes), `shadow` (prueba: el coach calcula qué elegiría y lo cuenta
 * en las razones del día, pero sirve el WOD de siempre) y `on` (sirve el elegido por esfuerzo).
 */
import type { StrainTarget } from '../data/athlete/types';
import { strainFromSrpe } from './strain';
import type { PlannedStrain } from './plannedStrain';
import type { RankedWod } from './wodSelection';
import type { WodProfile } from './wodProfile';

export type WodEffortMode = 'off' | 'shadow' | 'on';
/** Por defecto el coach solo calcula y cuenta lo que elegiría: no cambia el WOD hasta que lo actives. */
export const DEFAULT_WOD_EFFORT_MODE: WodEffortMode = 'shadow';

/** Cuánto pesa el encaje de esfuerzo frente a la puntuación de siempre (duración, energía, dominio…). */
export const EFFORT_WEIGHT = 0.3;
/** Cuántos de los mejores candidatos de la puntuación normal se reordenan por esfuerzo. */
export const EFFORT_POOL = 20;
/** Si el WOD de siempre ya encaja con este grado (0-1), no se cambia: solo se mueve lo que de verdad se sale del objetivo. */
export const KEEP_IF_FIT_ATLEAST = 0.9;
/** Cuánto tiene que mejorar el encaje (0-1) para que merezca cambiar de WOD. */
export const MIN_FIT_GAIN = 0.1;
/** Por debajo del objetivo se tolera un margen (nunca se empuja a hacer más); por encima, casi nada. */
const UNDER_OK = 8;
const OVER_OK = 3;

/** RPE x minutos del WOD (la misma carga que usa el esfuerzo del día), o null si no se conoce su duración. */
export function wodSrpe(p: Pick<WodProfile, 'expectedMin' | 'expectedRpe'> | undefined | null): number | null {
  if (!p || p.expectedMin === null || p.expectedRpe === null) return null;
  return p.expectedMin * p.expectedRpe;
}

/**
 * Esfuerzo previsto de la sesión si el WOD fuera `candidate` en vez de `current`. `planned` es el de la sesión tal como está
 * generada. Con un perfil desconocido (sin duración) no se puede saber: null.
 */
export function strainWithCandidate(planned: Pick<PlannedStrain, 'rpe' | 'minutes' | 'bias'>, current: WodProfile | undefined, candidate: WodProfile | undefined): number | null {
  const now = wodSrpe(current);
  const next = wodSrpe(candidate);
  if (now === null || next === null) return null;
  const srpe = Math.max(0, planned.rpe * planned.minutes - now + next);
  return Math.max(0, Math.min(100, strainFromSrpe(srpe) + planned.bias));
}

/** 1 dentro del objetivo; algo menos si te quedas corto; mucho menos si te pasas. */
export function effortFitScore(strain: number, target: Pick<StrainTarget, 'low' | 'high'>): number {
  if (strain > target.high) {
    const over = strain - target.high;
    return over <= OVER_OK ? 1 - (0.4 * over) / OVER_OK : Math.max(0, 0.6 - (0.6 * (over - OVER_OK)) / 12);
  }
  if (strain < target.low) {
    const under = target.low - strain;
    return under <= UNDER_OK ? 1 - (0.3 * under) / UNDER_OK : Math.max(0.2, 0.7 - (0.5 * (under - UNDER_OK)) / 17);
  }
  return 1;
}

export interface EffortCandidate {
  ranked: RankedWod;
  /** Esfuerzo previsto de la sesión con este WOD (null si no se conoce su duración). */
  strain: number | null;
  /** Encaje de esfuerzo (0-1; 0,5 si no se conoce). */
  fit: number;
  /** Puntuación combinada: la de siempre y el encaje de esfuerzo. */
  combined: number;
}

/**
 * Reordena los mejores candidatos por esfuerzo. `profileOf` da el perfil de cada WOD del catálogo. Un candidato sin perfil
 * conocido queda con encaje neutro (0,5): no gana ni pierde por ello.
 */
export function rerankByEffort(
  ranked: RankedWod[],
  planned: Pick<PlannedStrain, 'rpe' | 'minutes' | 'bias'>,
  target: Pick<StrainTarget, 'low' | 'high'>,
  current: WodProfile | undefined,
  profileOf: (id: string) => WodProfile | undefined,
  weight = EFFORT_WEIGHT,
  pool = EFFORT_POOL,
): EffortCandidate[] {
  return ranked
    .slice(0, pool)
    .map((r) => {
      const strain = strainWithCandidate(planned, current, profileOf(r.wod.id));
      const fit = strain === null ? 0.5 : effortFitScore(strain, target);
      return { ranked: r, strain, fit, combined: (1 - weight) * r.score + weight * fit };
    })
    .sort((a, b) => b.combined - a.combined || a.ranked.wod.id.localeCompare(b.ranked.wod.id));
}
