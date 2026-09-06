import type { AthleteProfile, DailySession, SessionHistoryEntry } from './types';

/**
 * Fusion de dos estados del atleta (remoto y local) para la sincronizacion. Antes cada `pushRemote`
 * subia el perfil local entero con un `upsert` ciego: si dos dispositivos escribian entre dos
 * `pull`, el ultimo en subir pisaba los cambios del otro (se han perdido worksets, pesajes y cache
 * de sesiones asi). Ahora `pushRemote` lee lo remoto, lo fusiona con lo local y sube el resultado.
 *
 * Criterio: los campos "de log" (worklog, pesajes, historial, cache...) son estructuras de
 * append/upsert-por-clave -> se unen por clave. Los campos "de config" (PRs, macros, objetivos...)
 * son cambios deliberados y poco frecuentes -> gana el local (el dispositivo que acaba de tocarlo).
 * Un borrado que el otro dispositivo aun no sincronizo puede "revivir" una entrada; es un mal mucho
 * menor que perder datos en silencio, y volver a borrar es un toque.
 */

// Topes — mismos valores que en `localRepository.ts` (una union fusionada puede superarlos).
const HISTORY_LIMIT = 30;
const SESSION_CACHE_LIMIT = 21;
const BODYWEIGHT_LOG_LIMIT = 120;
const READINESS_LOG_LIMIT = 120;
const PR_LOG_LIMIT = 150;
const SET_FEEDBACK_LOG_LIMIT = 120;
const WORK_LOG_LIMIT = 300;
const TRAINING_DATES_LOG_LIMIT = 400;

/** Une dos listas por una clave; en colision gana `pick` (por defecto, la de `b` = local). Ordena por `sortKey` y recorta a `limit` (los mas recientes). */
function mergeByKey<T>(
  a: T[] | undefined,
  b: T[] | undefined,
  keyOf: (x: T) => string,
  sortKey: (x: T) => string,
  limit: number,
  pick: (remote: T, local: T) => T = (_remote, local) => local,
): T[] {
  const map = new Map<string, T>();
  for (const x of a ?? []) map.set(keyOf(x), x);
  for (const x of b ?? []) {
    const k = keyOf(x);
    const prev = map.get(k);
    map.set(k, prev ? pick(prev, x) : x);
  }
  return [...map.values()].sort((x, y) => sortKey(x).localeCompare(sortKey(y))).slice(-limit);
}

/** Union de sets de strings, ordenada y recortada. */
function mergeStringSet(a: string[] | undefined, b: string[] | undefined, limit: number): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])].sort().slice(-limit);
}

/** En una entrada de historial de un mismo dia, gana la que trae mas informacion (testLoadKg / wodResult rellenados despues). */
function pickRicherHistory(remote: SessionHistoryEntry, local: SessionHistoryEntry): SessionHistoryEntry {
  const score = (e: SessionHistoryEntry) => (e.testLoadKg != null ? 1 : 0) + (e.wodResult != null ? 1 : 0) + (e.wodMovementIds != null ? 1 : 0);
  return score(local) >= score(remote) ? local : remote;
}

export function mergeHistory(
  remote: SessionHistoryEntry[] | undefined,
  local: SessionHistoryEntry[] | undefined,
): SessionHistoryEntry[] {
  return mergeByKey(remote, local, (e) => e.date, (e) => e.date, HISTORY_LIMIT, pickRicherHistory);
}

function mergeSessionCache(
  remote: Record<string, DailySession> | undefined,
  local: Record<string, DailySession> | undefined,
): Record<string, DailySession> {
  const out: Record<string, DailySession> = { ...(remote ?? {}) };
  for (const [date, localS] of Object.entries(local ?? {})) {
    const remoteS = out[date];
    if (!remoteS) {
      out[date] = localS;
      continue;
    }
    // La sesion propia / elegida a mano del atleta gana a la generada.
    const isChosen = (s: DailySession) => s.source === 'custom' || Boolean(s.swapLabel);
    if (isChosen(localS) && !isChosen(remoteS)) out[date] = localS;
    else if (isChosen(remoteS) && !isChosen(localS)) out[date] = remoteS;
    else out[date] = (localS.genVersion ?? 0) >= (remoteS.genVersion ?? 0) ? localS : remoteS;
  }
  // Recorta a las fechas mas recientes.
  const dates = Object.keys(out).sort();
  for (const d of dates.slice(0, Math.max(0, dates.length - SESSION_CACHE_LIMIT))) delete out[d];
  return out;
}

export function mergeProfile(remote: AthleteProfile, local: AthleteProfile): AthleteProfile {
  return {
    // Base = remoto, para que un campo NUEVO que aun no contemple esta funcion no se pierda al subir.
    ...remote,
    // --- config: gana el local ---
    prs: local.prs,
    variantPrs: local.variantPrs ?? remote.variantPrs,
    trainingDaysPerWeek: local.trainingDaysPerWeek,
    onboardedAt: local.onboardedAt ?? remote.onboardedAt,
    intensityRamp: local.intensityRamp ?? remote.intensityRamp,

    // --- estructuras con id: union, gana el local en misma id ---
    macrocycles: mergeByKey(remote.macrocycles, local.macrocycles, (m) => m.id, (m) => m.startDate, 999),
    goals: mergeByKey(remote.goals, local.goals, (g) => g.id, (g) => g.createdAt ?? '', 999),
    strengthPrograms: mergeByKey(remote.strengthPrograms, local.strengthPrograms, (p) => p.id, (p) => p.startDate, 999),
    // Un aviso de dolor con `clearedDate` = "el atleta lo quito"; esa version gana sobre la que aun lo tiene activo.
    painFlags: mergeByKey(
      remote.painFlags,
      local.painFlags,
      (f) => f.id,
      (f) => f.createdDate,
      999,
      (r, l) => (l.clearedDate ? l : r.clearedDate ? r : l),
    ),
    reviewedMacroWeeks: mergeStringSet(remote.reviewedMacroWeeks, local.reviewedMacroWeeks, 999),

    // --- logs: union por clave ---
    workLog: mergeByKey(
      remote.workLog,
      local.workLog,
      (e) => `${e.date}|${e.movementId}|${e.setNumber}`,
      (e) => e.date,
      WORK_LOG_LIMIT,
    ),
    bodyweightLog: mergeByKey(remote.bodyweightLog, local.bodyweightLog, (e) => e.date, (e) => e.date, BODYWEIGHT_LOG_LIMIT),
    readinessLog: mergeByKey(remote.readinessLog, local.readinessLog, (e) => e.date, (e) => e.date, READINESS_LOG_LIMIT),
    setFeedbackLog: mergeByKey(
      remote.setFeedbackLog,
      local.setFeedbackLog,
      (e) => `${e.date}|${e.movementId}`,
      (e) => e.date,
      SET_FEEDBACK_LOG_LIMIT,
      (r, l) => (l.estimated1rm != null || l.actualKg != null ? l : r.estimated1rm != null || r.actualKg != null ? r : l),
    ),
    prLog: mergeByKey(
      remote.prLog,
      local.prLog,
      (e) => `${e.date}|${e.key}|${e.kg}`,
      (e) => e.date,
      PR_LOG_LIMIT,
    ),
    trainingDatesLog: mergeStringSet(remote.trainingDatesLog, local.trainingDatesLog, TRAINING_DATES_LOG_LIMIT),
    sessionCache: mergeSessionCache(remote.sessionCache, local.sessionCache),
  };
}
