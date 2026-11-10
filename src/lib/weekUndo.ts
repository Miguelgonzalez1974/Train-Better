import type { DailySession } from '../data/athlete/types';
import type { WeekPlan } from './weekShift';

/**
 * Deshacer el último cambio de la semana hecho con Rex (mover, intercambiar, insertar, desplazar): se guarda cómo estaba cada día tocado y los descansos
 * elegidos, en este dispositivo y durante un día. Solo el último cambio; uno nuevo sustituye al anterior. Sin almacenamiento, no hay deshacer.
 */
const KEY = 'tb-week-undo';
const TTL_MS = 24 * 3_600_000;

export interface WeekUndo {
  at: number;
  /** Cómo se llamaba lo que se hizo («desplazar la semana desde mañana»). */
  label: string;
  /** Cómo estaba cada día tocado: la sesión de la caché, o null si no había (la generaba el motor). */
  sessions: { date: string; session: DailySession | null }[];
  restDates: string[];
}

export function buildUndo(plan: WeekPlan, label: string, now: number = Date.now()): WeekUndo {
  return { at: now, label, sessions: plan.changes.map((c) => ({ date: c.date, session: c.before })), restDates: plan.restBefore };
}

export function saveUndo(undo: WeekUndo): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(undo));
  } catch {
    /* sin almacenamiento: no hay deshacer */
  }
}

export function peekUndo(now: number = Date.now()): WeekUndo | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const u = raw ? (JSON.parse(raw) as WeekUndo) : null;
    return u && Array.isArray(u.sessions) && now - u.at <= TTL_MS ? u : null;
  } catch {
    return null;
  }
}

export function clearUndo(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nada que borrar */
  }
}
