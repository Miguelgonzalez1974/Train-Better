import type { AthleteProfile, DailySession, SessionBlockResult, SessionHistoryEntry } from '../data/athlete/types';
import { extraLoadLog } from './companionLoad';

/**
 * Lo que SUMA energía un día (ver `energy.ts`): un descanso que decides, la movilidad y los estiramientos, y una sesión de recuperación suave (que
 * suma en vez de restar). Son una decisión de diseño más que algo medido, por eso van con tope y juntas aquí. Puro.
 */

/** Un día marcado como descanso en el que no has entrenado. */
export const REST_BONUS = 10;
/** Cada estos minutos de movilidad suman un punto, con un máximo al día. */
export const MOBILITY_MINUTES_PER_POINT = 5;
export const MOBILITY_BONUS_MAX = 6;
/** Una sesión de recuperación hecha de verdad suave (hasta este RPE) suma en vez de restar. */
export const RECOVERY_BONUS = 5;
export const RECOVERY_MAX_RPE = 2;
/** Lo máximo que puede sumar un día entre todo. */
export const DAY_BONUS_MAX = 15;

export interface DayBonus {
  rest: number;
  recovery: number;
  mobility: number;
  /** La suma de las tres, ya con el tope. */
  total: number;
  /** El RPE × minutos de la sesión de recuperación: esa carga no gasta energía. */
  recoverySrpe: number;
}

export const NO_BONUS: DayBonus = { rest: 0, recovery: 0, mobility: 0, total: 0, recoverySrpe: 0 };

/** Los puntos de unos minutos de movilidad (sin el tope del día). */
export const mobilityPoints = (minutes: number): number => Math.min(MOBILITY_BONUS_MAX, Math.max(0, Math.round(minutes / MOBILITY_MINUTES_PER_POINT)));

/** El WOD de un día de recuperación activa. */
export const isRecoveryBlock = (b: Pick<SessionBlockResult, 'title' | 'format'>): boolean => b.title === 'Recuperación activa' || /^RPE 2\b/.test(b.format ?? '');

export type BonusProfile = Pick<AthleteProfile, 'restDates' | 'mobilityLog' | 'workouts' | 'companionLog' | 'sessionCache'>;

/**
 * El RPE × minutos de la sesión de ese día si fue una recuperación suave; 0 si no. Vale con el historial crudo o con la carga ya sumada (se
 * descuenta lo del programa de fuerza y los entrenos añadidos para juzgar solo la sesión).
 */
function recoverySrpeOf(profile: BonusProfile, entry: SessionHistoryEntry, cached: DailySession | undefined): number {
  if (cached?.source === 'custom' || (entry.skipped ?? []).some((p) => p.block === 'wod')) return 0;
  const wod = entry.wodBlocks?.length ? entry.wodBlocks : (cached?.blocks ?? []).filter((b) => b.block === 'wod');
  if (!wod.some(isRecoveryBlock)) return 0;
  const extra = entry.companionLoadMin ? extraLoadLog(profile).filter((c) => c.date === entry.date && c.outcome === 'hecha') : [];
  const minutes = entry.durationMin - (entry.companionLoadMin ?? 0);
  if (!(minutes > 0)) return 0;
  const srpe = entry.rpe * entry.durationMin - extra.reduce((s, c) => s + (c.rpe ?? 0) * (c.durationMin ?? 0), 0);
  // Medio punto de margen por los redondeos al sumar la carga.
  return srpe / minutes <= RECOVERY_MAX_RPE + 0.05 ? Math.round(srpe) : 0;
}

/** Lo que suma cada día (solo salen los días que suman algo). */
export function dayBonuses(profile: BonusProfile, history: SessionHistoryEntry[]): Map<string, DayBonus> {
  const trained = new Set([
    ...history.map((h) => h.date),
    ...extraLoadLog(profile)
      .filter((c) => c.outcome === 'hecha')
      .map((c) => c.date),
  ]);
  const recovery = new Map<string, number>();
  for (const entry of history) {
    const srpe = recoverySrpeOf(profile, entry, profile.sessionCache?.[entry.date]);
    if (srpe > 0) recovery.set(entry.date, srpe);
  }
  const mobility = new Map<string, number>();
  for (const m of profile.mobilityLog ?? []) mobility.set(m.date, (mobility.get(m.date) ?? 0) + m.minutes);
  const rest = new Set((profile.restDates ?? []).filter((d) => !trained.has(d)));

  const out = new Map<string, DayBonus>();
  for (const date of new Set([...rest, ...recovery.keys(), ...mobility.keys()])) {
    const r = rest.has(date) ? REST_BONUS : 0;
    const v = recovery.has(date) ? RECOVERY_BONUS : 0;
    // Con el tope del día se recorta primero la movilidad.
    const m = Math.min(mobilityPoints(mobility.get(date) ?? 0), DAY_BONUS_MAX - r - v);
    const total = r + v + m;
    if (total > 0) out.set(date, { rest: r, recovery: v, mobility: m, total, recoverySrpe: recovery.get(date) ?? 0 });
  }
  return out;
}
