import type { AthleteProfile, DailySession, SessionHistoryEntry, WorkSetEntry } from './types';

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

/** Fecha ISO local de "hoy" — mismo formato que `toLocalIsoDate` del motor, calculado aqui sin importar `engine/` (esta capa de datos se mantiene independiente). */
function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Recorta un mapa por fecha ISO a las `limit` claves mas CERCANAS a hoy (para adelante y para
 * atras), no las alfabeticamente mas recientes. Bug real: WeekStrip cachea dias futuros lejanos al
 * previsualizarlos: con 21+ de esos, "hoy" quedaba como la fecha mas "antigua" en orden de texto
 * (por detras de un monton de fechas futuras) y se recortaba — la sesion de hoy, ya entrenada,
 * desaparecia de la cache tras sincronizar. Hoy nunca se recorta, pase lo que pase con el cupo.
 */
function pruneByProximityToToday<T>(map: Record<string, T>, limit: number): Record<string, T> {
  const dates = Object.keys(map);
  if (dates.length <= limit) return map;
  const today = localTodayIso();
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const distance = (d: string) => Math.abs(new Date(`${d}T00:00:00`).getTime() - todayMs);
  const kept = new Set([...dates].sort((a, b) => distance(a) - distance(b)).slice(0, limit));
  kept.add(today);
  const out: Record<string, T> = {};
  for (const d of dates) if (kept.has(d)) out[d] = map[d];
  return out;
}

/** Hubo entreno real ese dia: series de fuerza/oly registradas, o una sesion ya cerrada (RPE + duracion) en el historial. */
function hasRealActivity(workLog: WorkSetEntry[] | undefined, history: SessionHistoryEntry[] | undefined, date: string): boolean {
  if ((workLog ?? []).some((e) => e.date === date && e.kg > 0)) return true;
  return (history ?? []).some((e) => e.date === date);
}

function mergeSessionCache(
  remote: Record<string, DailySession> | undefined,
  local: Record<string, DailySession> | undefined,
  remoteWorkLog: WorkSetEntry[] | undefined,
  localWorkLog: WorkSetEntry[] | undefined,
  remoteHistory: SessionHistoryEntry[] | undefined,
  localHistory: SessionHistoryEntry[] | undefined,
): Record<string, DailySession> {
  const out: Record<string, DailySession> = { ...(remote ?? {}) };
  for (const [date, localS] of Object.entries(local ?? {})) {
    const remoteS = out[date];
    if (!remoteS) {
      out[date] = localS;
      continue;
    }
    // La sesion propia, elegida o corregida a mano por el atleta gana a la generada sin tocar.
    const isChosen = (s: DailySession) => s.source === 'custom' || Boolean(s.swapLabel) || Boolean(s.editedByAthlete);
    if (isChosen(localS) && !isChosen(remoteS)) {
      out[date] = localS;
      continue;
    }
    if (isChosen(remoteS) && !isChosen(localS)) {
      out[date] = remoteS;
      continue;
    }
    // Empate de "elegida a mano": gana el lado contra el que ya hay entreno real registrado ese dia
    // -- esa es la sesion que el atleta de verdad siguio, no la que resulte llegar la ultima al push
    // (bug real: un segundo dispositivo con una cache vieja de "hoy" pisaba la sesion recien
    // entrenada al sincronizar mas tarde, porque el genVersion de ambas builds era el mismo).
    const localHasWork = hasRealActivity(localWorkLog, localHistory, date);
    const remoteHasWork = hasRealActivity(remoteWorkLog, remoteHistory, date);
    if (localHasWork && !remoteHasWork) {
      out[date] = localS;
      continue;
    }
    if (remoteHasWork && !localHasWork) {
      out[date] = remoteS;
      continue;
    }
    out[date] = (localS.genVersion ?? 0) >= (remoteS.genVersion ?? 0) ? localS : remoteS;
  }
  return pruneByProximityToToday(out, SESSION_CACHE_LIMIT);
}

/**
 * `remoteHistory`/`localHistory`: el historial vive fuera de `AthleteProfile` (se sincroniza aparte,
 * ver `mergeHistory` en remoteSync.ts) pero `mergeSessionCache` necesita saber si un dia ya tiene
 * entreno real registrado — se pasan aqui solo para esa comprobacion, no se devuelven.
 */
export function mergeProfile(
  remote: AthleteProfile,
  local: AthleteProfile,
  remoteHistory?: SessionHistoryEntry[],
  localHistory?: SessionHistoryEntry[],
): AthleteProfile {
  // Un dispositivo recien instalado (o con el almacenamiento local vaciado) arranca en
  // `DEFAULT_PROFILE` — sin `onboardedAt` local. Si esos valores de fabrica (PRs base, 4
  // dias/semana...) "ganan por ser el local" en la primera sincronizacion de ese dispositivo,
  // pisan en silencio los datos reales del atleta que ya vivian en remoto. Bug real detectado: tras
  // reinstalar la app, "6 dias/semana" volvio a "4" (el valor de DEFAULT_PROFILE) porque local
  // ganaba sin condicion. Con el local sin onboarding, esos campos ceden a remoto.
  const localIsFresh = !local.onboardedAt;
  return {
    // Base = remoto, para que un campo NUEVO que aun no contemple esta funcion no se pierda al subir.
    ...remote,
    // --- config: gana el local, salvo que el local sea un perfil recien instalado sin configurar ---
    prs: localIsFresh ? remote.prs : local.prs,
    variantPrs: (localIsFresh ? remote.variantPrs : local.variantPrs) ?? remote.variantPrs,
    trainingDaysPerWeek: localIsFresh ? remote.trainingDaysPerWeek : local.trainingDaysPerWeek,
    onboardedAt: local.onboardedAt ?? remote.onboardedAt,
    intensityRamp: (localIsFresh ? remote.intensityRamp : local.intensityRamp) ?? remote.intensityRamp,

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
    sessionCache: mergeSessionCache(remote.sessionCache, local.sessionCache, remote.workLog, local.workLog, remoteHistory, localHistory),
  };
}
