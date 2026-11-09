import type { DailySession } from '../data/athlete/types';
import { applySkips, sessionParts, type PartKey, type Skips } from '../engine/sessionParts';
import { estimateSessionMinutes } from './sessionDuration';

/**
 * Cambiar la sesión de hoy hablando con Rex: «tengo 30 minutos», «sin accesorio», «solo fuerza». Aquí solo está el cálculo (puro): qué partes se
 * quitan y cuánto queda; las frases las escribe `rexAdapt.ts` y la pantalla aplica el resultado. Quitar una parte es lo mismo que marcarla como «No»
 * al cerrar la sesión (`applySkips`), pero aquí la sesión se queda sin ella desde ya. Nunca deja la sesión vacía y nunca toca el calentamiento ni la vuelta
 * a la calma. Los minutos son orientativos (`estimateSessionMinutes`), no un cronómetro.
 */

export interface AdaptRemoved {
  key: PartKey;
  /** «Accesorio», «Fuerza · Back Squat»… */
  label: string;
}

export interface AdaptPlan {
  /** La sesión ya sin las partes quitadas, marcada como editada y con el motivo anotado. */
  session: DailySession;
  removed: AdaptRemoved[];
  /** Minutos orientativos antes y después. */
  before: number;
  after: number;
  /** Solo al pedir minutos: ¿se llega a lo pedido sin quitar la fuerza ni el WOD? */
  reached: boolean | null;
}

export type AdaptRequest = { how: 'minutos'; minutes: number } | { how: 'sin'; parts: PartKey[] } | { how: 'solo'; parts: PartKey[] };

/** Lo primero que se quita para ganar tiempo, de menos a más importante. La fuerza y el WOD no se quitan solos. */
const DROP_ORDER: PartKey[] = ['accessory', 'skill', 'wod2', 'oly'];
const MAIN_PARTS: PartKey[] = ['strength', 'oly', 'wod1', 'wod2'];

export type AdaptRefusal = 'sin-sesion' | 'nada-que-quitar' | 'dejaria-vacia';

function build(session: DailySession, keys: PartKey[], reached: boolean | null, reason: string): AdaptPlan {
  const parts = sessionParts(session);
  const removed = parts.filter((p) => keys.includes(p.key)).map((p) => ({ key: p.key, label: p.label }));
  const skips: Skips = {};
  for (const k of keys) skips[k] = { reason: 'tiempo' };
  const adapted = applySkips(session, skips);
  const next: DailySession = {
    ...adapted,
    editedByAthlete: true,
    coachReasons: [reason, ...(session.coachReasons ?? [])],
  };
  return { session: next, removed, before: estimateSessionMinutes(session), after: estimateSessionMinutes(next), reached };
}

/** Las partes que la sesión tiene, o null si no hay sesión que cambiar (descanso, sesión propia). */
function presentKeys(session: DailySession): PartKey[] | null {
  const parts = sessionParts(session);
  return parts.length === 0 ? null : parts.map((p) => p.key);
}

export function planAdaptation(session: DailySession, request: AdaptRequest): AdaptPlan | AdaptRefusal {
  const present = presentKeys(session);
  if (!present) return 'sin-sesion';

  if (request.how === 'minutos') {
    const before = estimateSessionMinutes(session);
    const keys: PartKey[] = [];
    let current = session;
    let minutes = before;
    for (const k of DROP_ORDER) {
      if (minutes <= request.minutes) break;
      if (!present.includes(k) || keys.includes(k)) continue;
      // El oly solo se quita si queda otra pieza principal; la sesión nunca se queda vacía.
      const rest = present.filter((p) => !keys.includes(p) && p !== k && MAIN_PARTS.includes(p));
      if (k === 'oly' && rest.length === 0) continue;
      keys.push(k);
      const skips: Skips = {};
      for (const x of keys) skips[x] = {};
      current = applySkips(session, skips);
      minutes = estimateSessionMinutes(current);
    }
    if (keys.length === 0) return before <= request.minutes ? { session, removed: [], before, after: before, reached: true } : 'nada-que-quitar';
    const plan = build(session, keys, minutes <= request.minutes, `Lo cambiaste con Rex para que cupiera en ${request.minutes} min.`);
    return plan;
  }

  if (request.how === 'sin') {
    const keys = request.parts.filter((k) => present.includes(k));
    if (keys.length === 0) return 'nada-que-quitar';
    if (present.every((k) => keys.includes(k))) return 'dejaria-vacia';
    return build(session, keys, null, 'Lo cambiaste con Rex: sin ' + sessionParts(session).filter((p) => keys.includes(p.key)).map((p) => p.label.split(' · ')[0].toLowerCase()).join(' ni ') + '.');
  }

  // «Solo»: se queda con lo que pides y quita el resto de piezas.
  const keep = request.parts.filter((k) => present.includes(k));
  if (keep.length === 0) return 'nada-que-quitar';
  const keys = present.filter((k) => !keep.includes(k));
  if (keys.length === 0) return 'nada-que-quitar';
  return build(session, keys, null, 'Lo cambiaste con Rex: solo ' + sessionParts(session).filter((p) => keep.includes(p.key)).map((p) => p.label.split(' · ')[0].toLowerCase()).join(' y ') + '.');
}
