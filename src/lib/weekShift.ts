import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../data/athlete/types';
import { hasActiveTrainingStructure } from '../engine/generateSession';
import { addDaysIso } from '../engine/periodization';
import { withRestMarked, withRestUnmarked } from '../engine/restDays';
import { resolveWeekLocks } from '../engine/weekLocks';
import { dayLabel, restSession, sessionFor, type MovePlan, type MoveRefusal } from './sessionMove';

/**
 * Reorganizar la semana de golpe con Rex: «desplaza la semana desde mañana» (cada sesión pasa al día siguiente hasta que un día de descanso lo absorbe) y
 * «inserta el martes en el viernes» (la sesión del martes pasa al viernes y las de entre medias suben un día, como al reordenar una lista). Los días de
 * descanso se quedan donde están; solo se mueven las sesiones. Puro: devuelve lo que habría que escribir y cómo estaba antes (para poder deshacer).
 * Solo de hoy en adelante, hasta dos semanas vista; no toca lo entrenado ni la competición.
 */

export type ShiftRequest = { kind: 'desplazar'; from: string } | { kind: 'insertar'; from: string; to: string };

export interface WeekChange {
  date: string;
  /** Lo que había en la caché de sesiones antes (null = nada guardado: la generaba el motor). */
  before: DailySession | null;
  after: DailySession;
}

export interface WeekRow {
  date: string;
  before: string;
  after: string;
}

export interface WeekPlan {
  kind: 'desplazar' | 'insertar' | 'mover';
  /** Lo que se pidió (para volver a pedirlo al confirmar). Ausente en un movimiento simple. */
  request?: ShiftRequest;
  changes: WeekChange[];
  /** El perfil con los descansos y las semanas bloqueadas al día; las sesiones van en `changes`. */
  profile: AthleteProfile;
  /** Los descansos elegidos de antes, para deshacer. */
  restBefore: string[];
  /** Los días que cambian, con cómo se llama la sesión antes y después. */
  rows: WeekRow[];
}

const MAX_AHEAD = 13;
const DESCANSO = 'descanso';

export function planWeekChange(
  profile: AthleteProfile,
  history: SessionHistoryEntry[],
  req: ShiftRequest,
  todayIso: string,
  label: (s: DailySession) => string,
): WeekPlan | MoveRefusal {
  const inRange = (iso: string) => iso >= todayIso && iso <= addDaysIso(todayIso, MAX_AHEAD);
  if (!inRange(req.from) || (req.kind === 'insertar' && !inRange(req.to))) return 'fuera-de-rango';
  if (req.kind === 'insertar' && req.from === req.to) return 'mismo-dia';
  const done = new Set(history.map((h) => h.date));

  // Las semanas que toca el cambio, con su bloqueo resuelto (lo mismo que haría Planificación al abrirlas).
  const lastDay = req.kind === 'insertar' ? (req.to > req.from ? req.to : req.from) : addDaysIso(req.from, 7);
  const firstDay = req.kind === 'insertar' && req.to < req.from ? req.to : req.from;
  let locked = profile;
  for (let d = firstDay; d <= lastDay; d = addDaysIso(d, 3)) locked = resolveWeekLocks(locked, history, locked.goals, d);
  locked = resolveWeekLocks(locked, history, locked.goals, lastDay);

  const cache = (iso: string) => locked.sessionCache?.[iso] ?? null;
  const get = (iso: string) => sessionFor(locked, history, iso);
  const blocked = (iso: string): MoveRefusal | null => {
    if (done.has(iso)) return 'hecho';
    if (!hasActiveTrainingStructure(locked, iso)) return 'sin-estructura';
    return get(iso).competition ? 'competicion' : null;
  };

  if (req.kind === 'desplazar') {
    // El primer día con sesión desde el pedido (los de descanso de delante se quedan como están).
    let start: string | null = null;
    for (let i = 0; i <= 6 && start === null; i++) {
      const iso = addDaysIso(req.from, i);
      if (!inRange(iso)) break;
      if (done.has(iso) || !hasActiveTrainingStructure(locked, iso)) continue;
      const s = get(iso);
      if (!s.isRestDay && !s.competition) start = iso;
    }
    if (start === null) return 'sin-sesion';
    // La cadena: días seguidos con sesión hasta el primer día de descanso, que absorbe el desplazamiento.
    const chain: string[] = [start];
    let absorber: string | null = null;
    for (let i = 1; i <= 7; i++) {
      const iso = addDaysIso(start, i);
      if (!inRange(iso)) break;
      const bad = blocked(iso);
      if (bad) return bad;
      if (get(iso).isRestDay) {
        absorber = iso;
        break;
      }
      chain.push(iso);
    }
    if (absorber === null) return 'sin-hueco';
    const startBlocked = blocked(start);
    if (startBlocked) return startBlocked;

    const days = [...chain, absorber];
    const olds = days.map((d) => get(d));
    const changes: WeekChange[] = [];
    const rows: WeekRow[] = [];
    // El primer día queda de descanso elegido; cada sesión pasa al día siguiente.
    changes.push({ date: start, before: cache(start), after: restSession(olds[0], start, `Desplazaste la semana con Rex: este día queda de descanso.`) });
    rows.push({ date: start, before: label(olds[0]), after: DESCANSO });
    for (let i = 1; i < days.length; i++) {
      const moved = olds[i - 1];
      changes.push({
        date: days[i],
        before: cache(days[i]),
        after: { ...moved, date: days[i], editedByAthlete: true, coachReasons: [`Lo desplazaste con Rex desde ${dayLabel(days[i - 1], todayIso)}.`, ...(moved.coachReasons ?? [])] },
      });
      rows.push({ date: days[i], before: i === days.length - 1 ? DESCANSO : label(olds[i]), after: label(moved) });
    }
    const next = withRestUnmarked(withRestMarked(locked, start), absorber);
    return { kind: 'desplazar', request: req, changes, profile: next, restBefore: profile.restDates ?? [], rows };
  }

  // Insertar: la sesión de `from` pasa a `to`; las que hay entre medias suben (o bajan) un día. Los descansos no se mueven.
  const lo = req.from < req.to ? req.from : req.to;
  const hi = req.from < req.to ? req.to : req.from;
  const slots: string[] = [];
  for (let d = lo; d <= hi; d = addDaysIso(d, 1)) {
    const bad = blocked(d);
    if (bad) return bad;
    if (!get(d).isRestDay) slots.push(d);
  }
  if (!slots.includes(req.from)) return 'sin-sesion';
  if (!slots.includes(req.to)) return 'sin-sesion';
  const olds = slots.map((d) => get(d));
  const fromIdx = slots.indexOf(req.from);
  const toIdx = slots.indexOf(req.to);
  const order = olds.map((_, i) => i);
  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, fromIdx);
  const changes: WeekChange[] = [];
  const rows: WeekRow[] = [];
  slots.forEach((date, i) => {
    const src = olds[order[i]];
    if (order[i] === i) return;
    changes.push({
      date,
      before: cache(date),
      after: { ...src, date, editedByAthlete: true, coachReasons: [`Lo reordenaste con Rex: antes era ${dayLabel(slots[order[i]], todayIso)}.`, ...(src.coachReasons ?? [])] },
    });
    rows.push({ date, before: label(olds[i]), after: label(src) });
  });
  if (changes.length === 0) return 'mismo-dia';
  return { kind: 'insertar', request: req, changes, profile: locked, restBefore: profile.restDates ?? [], rows };
}

/** De un movimiento simple (`planMove`) a un plan con lo mismo que los demás, para poder deshacerlo igual. */
export function weekPlanFromMove(plan: MovePlan, before: AthleteProfile, label: (s: DailySession) => string): WeekPlan {
  const changes: WeekChange[] = plan.writes.map((after) => ({ date: after.date, before: before.sessionCache?.[after.date] ?? null, after }));
  const rows: WeekRow[] = plan.writes.map((w) => {
    const prev = w.date === plan.from ? plan.fromSession : (plan.toSession ?? null);
    return { date: w.date, before: prev ? label(prev) : DESCANSO, after: w.isRestDay ? DESCANSO : label(w) };
  });
  return { kind: 'mover', changes, profile: plan.profile, restBefore: before.restDates ?? [], rows };
}

