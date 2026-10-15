import type { DailySession, SessionHistoryEntry, StrainTarget } from '../data/athlete/types';
import { estimateSessionMinutes } from '../lib/sessionDuration';
import { strainFromSrpe } from './strain';

/**
 * Esfuerzo PREVISTO de la sesión de hoy, para compararlo con el objetivo del día antes de empezar: duración estimada de
 * la sesión x RPE esperado, con la misma curva que el esfuerzo real (ver `strain.ts`). Es una estimación: el RPE
 * esperado sale de cómo te suelen salir las sesiones de esa semana del bloque (si hay historial) o de un valor típico.
 */

export interface PlannedStrain {
  strain: number;
  rpe: number;
  minutes: number;
}

/** RPE típico por semana del mesociclo cuando aún no hay historial suficiente: acumulación, intensificación, pico, descarga. */
const DEFAULT_RPE: Record<1 | 2 | 3 | 4, number> = { 1: 6.5, 2: 7, 3: 7.5, 4: 5.5 };
const PERSONAL_WINDOW_DAYS = 56;
const PERSONAL_MIN_SESSIONS = 3;
/** Un día de doble WOD es todo acondicionamiento: se nota más que su duración. */
const DOUBLE_WOD_RPE_BONUS = 0.5;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);
}

/** Sesión de recuperación activa (WOD "RPE 2" en bici): se siente como un 3, no como el RPE típico de la semana. */
const RECOVERY_RPE = 3;
/** Día suave o duro dentro de la semana (ver `DayIntensity` en weekPlan.ts). */
const DAY_INTENSITY_SHIFT = { alta: 0.5, baja: -0.7 } as const;

function isRecoverySession(session: DailySession): boolean {
  return session.blocks.some((b) => b.block === 'wod' && /^RPE 2\b/.test(b.format ?? ''));
}

function expectedRpe(session: DailySession, history: SessionHistoryEntry[]): number {
  if (isRecoverySession(session)) return RECOVERY_RPE;
  const week = session.mesocycleWeek;
  const sameWeek = history.filter((h) => h.mesocycleWeek === week && h.date < session.date && daysBetween(h.date, session.date) <= PERSONAL_WINDOW_DAYS);
  let rpe: number;
  if (sameWeek.length >= PERSONAL_MIN_SESSIONS) {
    rpe = sameWeek.reduce((s, h) => s + h.rpe, 0) / sameWeek.length;
  } else {
    rpe = DEFAULT_RPE[week === 1 || week === 2 || week === 3 || week === 4 ? week : 2];
  }
  if (session.doubleWod) rpe += DOUBLE_WOD_RPE_BONUS;
  if (session.dayIntensity) rpe += DAY_INTENSITY_SHIFT[session.dayIntensity];
  return Math.min(9.5, Math.max(4, Math.round(rpe * 10) / 10));
}

/** null si hoy no hay sesión que estimar (descanso, sesión propia o sin bloques). */
export function estimatePlannedStrain(session: DailySession, history: SessionHistoryEntry[]): PlannedStrain | null {
  if (session.isRestDay || session.source === 'custom' || session.blocks.length === 0) return null;
  const minutes = estimateSessionMinutes(session);
  if (minutes <= 0) return null;
  const rpe = expectedRpe(session, history);
  return { strain: strainFromSrpe(rpe * minutes), rpe, minutes };
}

export type PlanFit = 'dentro' | 'se-pasa' | 'se-queda-corta';

/** Por encima del objetivo se avisa con un margen pequeño; por debajo solo si sobra mucho (nunca se empuja a hacer más). */
const OVER_MARGIN = 3;
const UNDER_MARGIN = 8;

export function planFit(planned: PlannedStrain, target: Pick<StrainTarget, 'low' | 'high'>): { fit: PlanFit; diff: number } {
  if (planned.strain > target.high + OVER_MARGIN) return { fit: 'se-pasa', diff: planned.strain - target.high };
  if (planned.strain < target.low - UNDER_MARGIN) return { fit: 'se-queda-corta', diff: target.low - planned.strain };
  return { fit: 'dentro', diff: 0 };
}
