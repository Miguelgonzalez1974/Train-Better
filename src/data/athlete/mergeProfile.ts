import type { AthleteProfile, DailySession, ExtraFoodEntry, SessionHistoryEntry, StrainTarget, WorkSetEntry } from './types';

/**
 * Fusion de dos estados del atleta (remoto y local) para la sincronizacion. Antes cada `pushRemote`
 * subia el perfil local entero con un `upsert` ciego: si dos dispositivos escribian entre dos
 * `pull`, el ultimo en subir pisaba los cambios del otro (se han perdido worksets, pesajes y cache
 * de sesiones asi). Ahora `pushRemote` lee lo remoto, lo fusiona con lo local y sube el resultado.
 *
 * Criterio: los campos "de log" (worklog, pesajes, historial, cache...) son estructuras de
 * append/upsert-por-clave -> se unen por clave. Los campos "de config" (PRs, macros, objetivos...)
 * son cambios deliberados y poco frecuentes -> gana el local (el dispositivo que acaba de tocarlo).
 *
 * BORRADOS: una union pura revive siempre lo que borras (el remoto aun lo tiene y vuelve en el siguiente
 * `pushRemote`: asi no se podia borrar un macrociclo, un objetivo o un apunte del diario). Por eso la fusion es de
 * tres vias: `SyncBase` guarda las claves de la ultima sincronizacion y lo que estaba ahi y ya no esta en el local
 * (borrado aqui) o en el remoto (borrado en otro dispositivo) se elimina del resultado. Sin base (primera
 * sincronizacion del dispositivo) se comporta como la union de siempre.
 */

/** Claves de lo que habia en la ultima sincronizacion, para distinguir "lo borraron" de "aun no ha llegado". */
export interface SyncBase {
  macrocycles?: string[];
  goals?: string[];
  strengthPrograms?: string[];
  customComplexes?: string[];
  customFoods?: string[];
  /** `fecha|id` de cada apunte del diario de nutricion. */
  extraFoods?: string[];
  workLog?: string[];
  setFeedbackLog?: string[];
  history?: string[];
  /** Fecha de inicio de la rampa de vuelta que habia (null si no habia). */
  rampStart?: string | null;
}

const workKey = (e: WorkSetEntry) => `${e.date}|${e.movementId}|${e.setNumber}`;
const feedbackKey = (e: { date: string; movementId: string }) => `${e.date}|${e.movementId}`;

/** Foto de las claves del estado ya fusionado, para la siguiente fusion. */
export function snapshotSyncBase(profile: AthleteProfile, history: SessionHistoryEntry[]): SyncBase {
  return {
    macrocycles: profile.macrocycles.map((m) => m.id),
    goals: profile.goals.map((g) => g.id),
    strengthPrograms: (profile.strengthPrograms ?? []).map((p) => p.id),
    customComplexes: (profile.customComplexes ?? []).map((c) => c.id),
    customFoods: (profile.nutritionPrefs?.customFoods ?? []).map((f) => f.id),
    extraFoods: Object.entries(profile.nutritionPrefs?.extraFoods ?? {}).flatMap(([iso, list]) => list.map((e) => `${iso}|${e.id}`)),
    workLog: (profile.workLog ?? []).map(workKey),
    setFeedbackLog: (profile.setFeedbackLog ?? []).map(feedbackKey),
    history: history.map((h) => h.date),
    rampStart: profile.intensityRamp?.startDate ?? null,
  };
}

/**
 * Quita del resultado de la union lo que se borro desde la ultima sincronizacion: estaba en la base y ya no esta en el
 * local (lo borraste aqui) o en el remoto (lo borraron en otro dispositivo). Lo que no estaba en la base es nuevo y se conserva.
 */
function dropDeleted<T>(merged: T[], keyOf: (x: T) => string, baseKeys: string[] | undefined, remote: T[] | undefined, local: T[] | undefined): T[] {
  if (!baseKeys || baseKeys.length === 0) return merged;
  const base = new Set(baseKeys);
  const inRemote = new Set((remote ?? []).map(keyOf));
  const inLocal = new Set((local ?? []).map(keyOf));
  return merged.filter((x) => {
    const k = keyOf(x);
    return !base.has(k) || (inRemote.has(k) && inLocal.has(k));
  });
}

// Topes — mismos valores que en `localRepository.ts` (una union fusionada puede superarlos).
const HISTORY_LIMIT = 30;
const SESSION_CACHE_LIMIT = 21;
const BODYWEIGHT_LOG_LIMIT = 120;
const READINESS_LOG_LIMIT = 120;
const PR_LOG_LIMIT = 150;
const SET_FEEDBACK_LOG_LIMIT = 120;
const WORK_LOG_LIMIT = 300;
const TRAINING_DATES_LOG_LIMIT = 400;
/** ~8-9 semanas de bloqueos (7 fechas cada una) — mas que de sobra, ver `pruneByProximityToToday`. */
const WEEKLY_LOCKS_LIMIT = 60;

const NUTRITION_SWAPS_LIMIT = 200;
const NUTRITION_DONE_DAYS_LIMIT = 30;
const NUTRITION_CUSTOM_DAYS_LIMIT = 60;
const NUTRITION_CUSTOM_FOODS_LIMIT = 200;
const NUTRITION_EXTRA_DAYS_LIMIT = 60;
const NUTRITION_EXTRAS_PER_DAY_LIMIT = 50;

const REGEN_VARIANTS_LIMIT = 14;

/** Union de las veces que se regenero cada dia: gana la mayor, y solo se guardan las fechas mas recientes. */
function mergeRegenVariants(remote?: Record<string, number>, local?: Record<string, number>): Record<string, number> | undefined {
  const merged: Record<string, number> = { ...(remote ?? {}) };
  for (const [date, n] of Object.entries(local ?? {})) merged[date] = Math.max(merged[date] ?? 0, n);
  return Object.keys(merged).length === 0 ? undefined : keepLatestKeys(merged, REGEN_VARIANTS_LIMIT);
}

const STRAIN_TARGETS_LIMIT = 45;

/** Objetivo de esfuerzo por dia: el definitivo (con check-in) gana al provisional; entre iguales, el local. */
function mergeStrainTargets(remote?: Record<string, StrainTarget>, local?: Record<string, StrainTarget>): Record<string, StrainTarget> | undefined {
  const merged: Record<string, StrainTarget> = { ...(remote ?? {}) };
  for (const [date, t] of Object.entries(local ?? {})) {
    const other = merged[date];
    merged[date] = other && !other.provisional && t.provisional ? other : t;
  }
  return Object.keys(merged).length === 0 ? undefined : keepLatestKeys(merged, STRAIN_TARGETS_LIMIT);
}

/** Se queda con las `limit` claves mas recientes de un objeto cuyas claves empiezan por una fecha ISO. */
function keepLatestKeys<T>(obj: Record<string, T>, limit: number): Record<string, T> {
  const keys = Object.keys(obj).sort();
  return Object.fromEntries(keys.slice(-limit).map((k) => [k, obj[k]]));
}

/** Extras (comida fuera de las 5 comidas) por fecha: se unen por id dentro de cada día, no "gana el local" entero — dos dispositivos pueden añadir extras distintos el mismo día y no queremos perder ninguno. */
function mergeExtraFoods(
  remote: Record<string, ExtraFoodEntry[]> | undefined,
  local: Record<string, ExtraFoodEntry[]> | undefined,
  baseKeys?: string[],
): Record<string, ExtraFoodEntry[]> {
  const dates = new Set([...Object.keys(remote ?? {}), ...Object.keys(local ?? {})]);
  const merged: Record<string, ExtraFoodEntry[]> = {};
  for (const iso of dates) {
    merged[iso] = dropDeleted(
      mergeByKey(remote?.[iso], local?.[iso], (e) => e.id, (e) => String(Math.round(e.hour * 100)).padStart(6, '0'), NUTRITION_EXTRAS_PER_DAY_LIMIT),
      (e) => `${iso}|${e.id}`,
      baseKeys,
      remote?.[iso],
      local?.[iso],
    );
  }
  return keepLatestKeys(merged, NUTRITION_EXTRA_DAYS_LIMIT);
}

/**
 * Preferencias de nutricion: la lista de alimentos excluidos y el horario son config (gana el local si lo
 * tiene); los cambios de alimento y las comidas hechas se unen por clave/fecha, gana el local en la misma.
 * Los alimentos propios se unen por id (gana el local si el mismo id cambió en los dos sitios).
 */
function mergeNutritionPrefs(remote: AthleteProfile['nutritionPrefs'], local: AthleteProfile['nutritionPrefs'], base?: SyncBase): AthleteProfile['nutritionPrefs'] {
  if (!remote && !local) return undefined;
  return {
    excludedFoodIds: local?.excludedFoodIds ?? remote?.excludedFoodIds,
    staples: local?.staples ?? remote?.staples,
    trainingHours: { ...(remote?.trainingHours ?? {}), ...(local?.trainingHours ?? {}) },
    swaps: keepLatestKeys({ ...(remote?.swaps ?? {}), ...(local?.swaps ?? {}) }, NUTRITION_SWAPS_LIMIT),
    doneMeals: keepLatestKeys({ ...(remote?.doneMeals ?? {}), ...(local?.doneMeals ?? {}) }, NUTRITION_DONE_DAYS_LIMIT),
    // Por fecha: gana el local (el día entero que el atleta acaba de tocar); las demás fechas de ambos dispositivos se conservan.
    customMeals: keepLatestKeys({ ...(remote?.customMeals ?? {}), ...(local?.customMeals ?? {}) }, NUTRITION_CUSTOM_DAYS_LIMIT),
    customFoods: dropDeleted(
      mergeByKey(remote?.customFoods, local?.customFoods, (f) => f.id, (f) => f.id, NUTRITION_CUSTOM_FOODS_LIMIT),
      (f) => f.id,
      base?.customFoods,
      remote?.customFoods,
      local?.customFoods,
    ),
    extraFoods: mergeExtraFoods(remote?.extraFoods, local?.extraFoods, base?.extraFoods),
  };
}

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
  const score = (e: SessionHistoryEntry) =>
    (e.testLoadKg != null ? 1 : 0) + (e.wodResult != null ? 1 : 0) + (e.wodResult2 != null ? 1 : 0) + (e.wodMovementIds != null ? 1 : 0);
  return score(local) >= score(remote) ? local : remote;
}

export function mergeHistory(
  remote: SessionHistoryEntry[] | undefined,
  local: SessionHistoryEntry[] | undefined,
  base?: SyncBase,
): SessionHistoryEntry[] {
  return dropDeleted(mergeByKey(remote, local, (e) => e.date, (e) => e.date, HISTORY_LIMIT, pickRicherHistory), (e) => e.date, base?.history, remote, local);
}

/** La rampa de vuelta: gana el local salvo que se haya borrado (aqui o en el otro dispositivo) desde la ultima sincronizacion. */
function mergeRamp(remote: AthleteProfile, local: AthleteProfile, localIsFresh: boolean, base?: SyncBase): AthleteProfile['intensityRamp'] {
  const rr = remote.intensityRamp;
  const lr = local.intensityRamp;
  const baseStart = base?.rampStart ?? null;
  if (!localIsFresh && baseStart) {
    if (!lr && (!rr || rr.startDate === baseStart)) return undefined;
    if (!rr && lr && lr.startDate === baseStart) return undefined;
  }
  return (localIsFresh ? rr : lr) ?? rr;
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
  base?: SyncBase,
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
    strengthSplit: (localIsFresh ? remote.strengthSplit : local.strengthSplit) ?? remote.strengthSplit,
    wodSources: (localIsFresh ? remote.wodSources : local.wodSources) ?? remote.wodSources,
    onboardedAt: local.onboardedAt ?? remote.onboardedAt,
    intensityRamp: mergeRamp(remote, local, localIsFresh, base),

    // --- estructuras con id: union, gana el local en misma id; lo borrado desde la ultima sincronizacion no vuelve ---
    macrocycles: dropDeleted(mergeByKey(remote.macrocycles, local.macrocycles, (m) => m.id, (m) => m.startDate, 999), (m) => m.id, base?.macrocycles, remote.macrocycles, local.macrocycles),
    goals: dropDeleted(mergeByKey(remote.goals, local.goals, (g) => g.id, (g) => g.createdAt ?? '', 999), (g) => g.id, base?.goals, remote.goals, local.goals),
    strengthPrograms: dropDeleted(
      mergeByKey(remote.strengthPrograms, local.strengthPrograms, (p) => p.id, (p) => p.startDate, 999),
      (p) => p.id,
      base?.strengthPrograms,
      remote.strengthPrograms,
      local.strengthPrograms,
    ),
    // Los complejos propios se unen por id (gana el local si el mismo id cambió en los dos sitios); lo borrado no vuelve. Favoritos y
    // ocultos son preferencias: gana el local si las ha tocado en este dispositivo.
    customComplexes: dropDeleted(
      mergeByKey(remote.customComplexes, local.customComplexes, (c) => c.id, (c) => c.id, 999),
      (c) => c.id,
      base?.customComplexes,
      remote.customComplexes,
      local.customComplexes,
    ),
    complexPrefs: local.complexPrefs ?? remote.complexPrefs,
    // Dureza pedida por día: union por fecha, gana el local en la misma fecha (el 0 de «volver a normal» también gana), solo las recientes.
    hardnessLog: remote.hardnessLog || local.hardnessLog ? mergeByKey(remote.hardnessLog, local.hardnessLog, (e) => e.date, (e) => e.date, 120) : undefined,
    hardness: remote.hardness || local.hardness ? pruneByProximityToToday({ ...(remote.hardness ?? {}), ...(local.hardness ?? {}) }, 60) : undefined,
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
    workLog: dropDeleted(
      mergeByKey(remote.workLog, local.workLog, workKey, (e) => e.date, WORK_LOG_LIMIT),
      workKey,
      base?.workLog,
      remote.workLog,
      local.workLog,
    ),
    bodyweightLog: mergeByKey(remote.bodyweightLog, local.bodyweightLog, (e) => e.date, (e) => e.date, BODYWEIGHT_LOG_LIMIT),
    readinessLog: mergeByKey(remote.readinessLog, local.readinessLog, (e) => e.date, (e) => e.date, READINESS_LOG_LIMIT),
    setFeedbackLog: dropDeleted(
      mergeByKey(
        remote.setFeedbackLog,
        local.setFeedbackLog,
        feedbackKey,
        (e) => e.date,
        SET_FEEDBACK_LOG_LIMIT,
        (r, l) => (l.estimated1rm != null || l.actualKg != null ? l : r.estimated1rm != null || r.actualKg != null ? r : l),
      ),
      feedbackKey,
      base?.setFeedbackLog,
      remote.setFeedbackLog,
      local.setFeedbackLog,
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
    // Union por fecha, gana el local en la misma fecha (es una decision de planificacion deliberada,
    // igual criterio que el resto de campos "de config") — recortado igual que sessionCache.
    nutritionPrefs: mergeNutritionPrefs(remote.nutritionPrefs, local.nutritionPrefs, base),
    // Veces regenerado cada dia: la mayor de las dos (regenerar en cualquier dispositivo gana), solo las fechas recientes.
    regenVariants: mergeRegenVariants(remote.regenVariants, local.regenVariants),
    weeklyLocks: pruneByProximityToToday({ ...(remote.weeklyLocks ?? {}), ...(local.weeklyLocks ?? {}) }, WEEKLY_LOCKS_LIMIT),
    strainTargets: mergeStrainTargets(remote.strainTargets, local.strainTargets),
  };
}
