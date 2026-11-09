import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../data/athlete/types';
import { generateSessionForDate, hasActiveTrainingStructure } from '../engine/generateSession';
import { addDaysIso } from '../engine/periodization';
import { isRestMarked, withRestMarked, withRestUnmarked } from '../engine/restDays';
import { resolveWeekLocks } from '../engine/weekLocks';

/**
 * Mover las sesiones de la semana hablando con Rex: «pasa la sesión de hoy a mañana», «mañana no puedo entrenar», «intercambia el miércoles y el jueves». Aquí está
 * el cálculo (puro, sin guardar nada): la sesión de un día pasa a otro (o se intercambian dos), el día de origen queda de descanso elegido (no resta en el cumplimiento)
 * y las sesiones movidas se marcan como editadas, así el motor no las regenera ni las pisa al replanificar la semana. Solo de hoy en adelante y hasta dos semanas vista;
 * nada de lo ya entrenado, nada de la competición. Rex enseña el plan antes de aplicarlo.
 */

export interface MoveRequest {
  from: string;
  /** null = elegir Rex el hueco: el primer día de descanso de los siguientes seis. */
  to: string | null;
}

export type MoveRefusal = 'mismo-dia' | 'fuera-de-rango' | 'hecho' | 'sin-sesion' | 'sin-hueco' | 'competicion' | 'sin-estructura';

export interface MovePlan {
  from: string;
  to: string;
  /** true: los dos días tenían sesión y se intercambian; false: la de `from` pasa a `to` (que estaba de descanso) y `from` queda de descanso. */
  swap: boolean;
  fromSession: DailySession;
  /** La sesión que había en `to` (solo si swap). */
  toSession: DailySession | null;
  /** El perfil con las semanas bloqueadas y los descansos al día. Las sesiones nuevas van aparte (`writes`). */
  profile: AthleteProfile;
  /** Las sesiones que hay que guardar en la caché. */
  writes: DailySession[];
}

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MAX_AHEAD = 13;

/** «hoy», «mañana», «el jueves» (con la fecha si cae más allá de una semana). */
export function dayLabel(iso: string, todayIso: string): string {
  const diff = Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86_400_000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  const name = WEEKDAY[new Date(`${iso}T00:00:00`).getDay()];
  return diff <= 6 ? `el ${name}` : `el ${name} ${Number(iso.slice(8, 10))}`;
}

function sessionFor(profile: AthleteProfile, history: SessionHistoryEntry[], iso: string): DailySession {
  return profile.sessionCache?.[iso] ?? generateSessionForDate(profile, history.filter((h) => h.date < iso), new Date(`${iso}T00:00:00`), profile.goals);
}

const restSession = (like: DailySession, date: string, reason: string): DailySession => ({
  date,
  mesocycleWeek: like.mesocycleWeek,
  isRestDay: true,
  blocks: [],
  editedByAthlete: true,
  coachReasons: [reason],
});

export function planMove(profile: AthleteProfile, history: SessionHistoryEntry[], req: MoveRequest, todayIso: string): MovePlan | MoveRefusal {
  const inRange = (iso: string) => iso >= todayIso && iso <= addDaysIso(todayIso, MAX_AHEAD);
  if (!inRange(req.from) || (req.to !== null && !inRange(req.to))) return 'fuera-de-rango';
  if (req.to === req.from) return 'mismo-dia';
  const done = new Set(history.map((h) => h.date));
  if (done.has(req.from) || (req.to !== null && done.has(req.to))) return 'hecho';
  if (!hasActiveTrainingStructure(profile, req.from) || (req.to !== null && !hasActiveTrainingStructure(profile, req.to))) return 'sin-estructura';

  // Las semanas de los dos días con su bloqueo resuelto (lo mismo que haría Planificación al abrirlas).
  let locked = resolveWeekLocks(profile, history, profile.goals, req.from);
  if (req.to !== null) locked = resolveWeekLocks(locked, history, locked.goals, req.to);

  const fromS = sessionFor(locked, history, req.from);
  if (fromS.competition || fromS.isRestDay) return fromS.competition ? 'competicion' : 'sin-sesion';

  let to = req.to;
  if (to === null) {
    // El primer día de descanso (de plantilla, no elegido a propósito) de los siguientes seis, sin competición.
    for (let i = 1; i <= 6 && to === null; i++) {
      const iso = addDaysIso(req.from, i);
      if (!inRange(iso) || done.has(iso) || isRestMarked(locked.restDates, iso) || !hasActiveTrainingStructure(locked, iso)) continue;
      const s = sessionFor(resolveWeekLocks(locked, history, locked.goals, iso), history, iso);
      if (s.isRestDay && !s.competition) to = iso;
    }
    if (to === null) return 'sin-hueco';
  }
  const toS = sessionFor(locked, history, to);
  if (toS.competition) return 'competicion';

  const swap = !toS.isRestDay;
  const reasonMoved = `Lo moviste con Rex desde ${dayLabel(req.from, todayIso)}.`;
  const moved: DailySession = { ...fromS, date: to, editedByAthlete: true, coachReasons: [reasonMoved, ...(fromS.coachReasons ?? [])] };
  const writes: DailySession[] = [moved];
  let next = locked;
  if (swap) {
    writes.push({ ...toS, date: req.from, editedByAthlete: true, coachReasons: [`Intercambiada con ${dayLabel(to, todayIso)} con Rex.`, ...(toS.coachReasons ?? [])] });
  } else {
    writes.push(restSession(fromS, req.from, `Moviste la sesión de este día a ${dayLabel(to, todayIso)}.`));
    // El origen queda de descanso elegido (no resta en el cumplimiento) y el destino deja de serlo si lo estaba.
    next = withRestUnmarked(withRestMarked(next, req.from), to);
  }
  return { from: req.from, to, swap, fromSession: fromS, toSession: swap ? toS : null, profile: next, writes };
}
