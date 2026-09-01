import { AthleteProfile, BodyweightEntry, DailySession, DEFAULT_PROFILE, PrLogEntry, ReadinessCheck, SESSION_GEN_VERSION, SessionHistoryEntry, SetFeedbackEntry, WorkSetEntry } from './types';

const PROFILE_KEY = 'train-better:profile';
const HISTORY_KEY = 'train-better:history';
/** @deprecated Solo se lee para migrar el objetivo unico legado a `profile.goals`. */
const LEGACY_GOAL_KEY = 'train-better:goal';
const SESSION_CACHE_KEY = 'train-better:session-cache';
const HISTORY_LIMIT = 30;
const SESSION_CACHE_LIMIT = 60;
const BODYWEIGHT_LOG_LIMIT = 120;
const READINESS_LOG_LIMIT = 120;
const PR_LOG_LIMIT = 150;
/** Mismo orden de magnitud que los demas logs del perfil: ~4-5 meses de series principales valoradas a 4-5 dias/semana. */
const SET_FEEDBACK_LOG_LIMIT = 120;
/** ~6 levantamientos x 5 series x ~10 sesiones recientes — series a series completo del modo enfocado. */
const WORK_LOG_LIMIT = 300;
/** Cubre mas de un año a la maxima frecuencia (6 dias/semana ~ 313/año), con margen. */
const TRAINING_DATES_LOG_LIMIT = 400;

export interface AthleteRepository {
  getProfile(): AthleteProfile;
  saveProfile(profile: AthleteProfile): void;
  getHistory(): SessionHistoryEntry[];
  appendHistoryEntry(entry: SessionHistoryEntry): void;
  replaceHistory(history: SessionHistoryEntry[]): void;
  /**
   * Borra un unico dia del historial (por si se registro por error) — no toca la sesion
   * cacheada para esa fecha, asi el atleta puede volver a marcarla como completada si quiere.
   * Tambien saca esa fecha de `trainingDatesLog` para que no siga contando en "dias entrenados".
   */
  deleteHistoryEntry(date: string): void;
  /** Rellena a posteriori el testLoadKg de un dia ya registrado — para cuando una estimacion de e1RM (ver src/engine/e1rm.ts) se confirma despues de guardar la sesion, y el punto debil/progreso de objetivo (que leen testLoadKg) tambien deben verlo. */
  updateHistoryTestLoad(date: string, testLoadKg: number): void;
  getCachedSession(dateIso: string): DailySession | null;
  saveCachedSession(session: DailySession): void;
  /** Descarta la sesion planificada de un dia (sin tocar el historial) para volver a elegir de cero. */
  deleteCachedSession(dateIso: string): void;
  /**
   * Borra las sesiones cacheadas cuya fecha cae en [startDateIso, endDateIso] (ambos inclusive) —
   * para cuando se elimina el macrociclo o programa que las genero, y sus entrenos periodizados no
   * deben seguir mostrandose. Respeta las sesiones propias (`source: 'custom'`) y las elegidas a
   * mano (`swapLabel`): esas no dependen de ninguna estructura.
   */
  deleteCachedSessionsInRange(startDateIso: string, endDateIso: string): void;
  getBodyweightLog(): BodyweightEntry[];
  appendBodyweightEntry(entry: BodyweightEntry): void;
  getReadinessLog(): ReadinessCheck[];
  saveReadinessCheck(entry: ReadinessCheck): void;
  getSetFeedbackLog(): SetFeedbackEntry[];
  /** Registra (o sustituye, por dia+movimiento) el feedback en caliente de una primera serie de trabajo. */
  appendSetFeedbackEntry(entry: SetFeedbackEntry): void;
  /** Deshace el feedback de una serie (el atleta pulsa "cambiar" y no vuelve a elegir). */
  deleteSetFeedbackEntry(date: string, movementId: string): void;
  getWorkLog(): WorkSetEntry[];
  /** Registra (o sustituye, por date+movementId+setNumber) una serie de trabajo marcada en el modo enfocado. */
  saveWorkSet(entry: WorkSetEntry): void;
  /** Quita una serie registrada (el atleta la desmarca). */
  clearWorkSet(date: string, movementId: string, setNumber: number): void;
  /** Borra todas las series registradas de un dia — al deshacer/borrar esa sesion. */
  clearWorkLogForDate(date: string): void;
  /**
   * Borra historial de sesiones, cache de sesiones generadas, contador de dias entrenados y
   * pone los PRs a 0 — para arrancar un macrociclo nuevo sin datos previos influyendo en el
   * calculo de carga (ACWR), la rotacion de patrones o los reintentos de benchmarks. No toca
   * `macrocycles`, `goals` ni `bodyweightLog`.
   */
  resetTrainingData(): void;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Perfiles guardados antes de soportar varios macrociclos/objetivos tenian `mesocycleStartDate`
 * (una fecha suelta) y un objetivo unico bajo su propia clave. Se migran una sola vez a las listas
 * nuevas la primera vez que se lee el perfil, para no perder configuracion ya guardada.
 */
function migrateProfile(raw: AthleteProfile & { mesocycleStartDate?: string }): AthleteProfile {
  const profile: AthleteProfile = { ...DEFAULT_PROFILE, ...raw };

  if (!raw.macrocycles) {
    if (raw.mesocycleStartDate) {
      const start = new Date(raw.mesocycleStartDate);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 6);
      profile.macrocycles = [{ id: 'legacy', label: 'Macrociclo', startDate: raw.mesocycleStartDate, endDate: formatIsoDate(end) }];
    } else {
      profile.macrocycles = [];
    }
  }

  if (!raw.goals) {
    const legacyGoal = readJson<(AthleteProfile['goals'][number] & { id?: string }) | null>(LEGACY_GOAL_KEY, null);
    profile.goals = legacyGoal ? [{ ...legacyGoal, id: legacyGoal.id ?? 'legacy' }] : [];
  }

  return profile;
}

/**
 * Mantiene `prLog` al dia: cada vez que un valor de `prs`/`variantPrs` cambia (test real, e1RM
 * confirmado o edicion manual — todos pasan por `saveProfile`), añade un punto. La PRIMERA vez que
 * hay PRs y no hay log (alta, o tras `resetTrainingData`) siembra un punto base por cada
 * levantamiento con peso, para tener desde donde medir el progreso. No registra ceros ni un cambio
 * que deje el valor igual que el ultimo punto ya registrado.
 */
function appendPrChanges(prev: AthleteProfile, next: AthleteProfile): PrLogEntry[] {
  const log = [...(next.prLog ?? prev.prLog ?? [])];
  const today = formatIsoDate(new Date());
  const lastKgByKey = new Map<string, number>();
  for (const entry of log) lastKgByKey.set(entry.key, entry.kg);

  const pairs: [string, number | undefined, number | undefined][] = [];
  for (const key of Object.keys(next.prs) as (keyof AthleteProfile['prs'])[]) {
    pairs.push([key, prev.prs?.[key], next.prs[key]]);
  }
  for (const key of Object.keys(next.variantPrs ?? {})) {
    const k = key as keyof NonNullable<AthleteProfile['variantPrs']>;
    pairs.push([key, prev.variantPrs?.[k], next.variantPrs?.[k]]);
  }

  const seedingBaseline = log.length === 0;
  for (const [key, before, after] of pairs) {
    if (typeof after !== 'number' || after <= 0) continue;
    if (seedingBaseline) {
      log.push({ date: today, key, kg: after });
      lastKgByKey.set(key, after);
      continue;
    }
    if (after === before) continue;
    if (lastKgByKey.get(key) === after) continue;
    log.push({ date: today, key, kg: after });
    lastKgByKey.set(key, after);
  }

  return log.slice(-PR_LOG_LIMIT);
}

/** Igual que HISTORY_LIMIT: evita que la cache de sesiones generadas crezca sin limite con el tiempo. */
function pruneSessionCache(cache: Record<string, DailySession>): Record<string, DailySession> {
  const dates = Object.keys(cache).sort();
  if (dates.length <= SESSION_CACHE_LIMIT) return cache;
  const pruned = { ...cache };
  for (const date of dates.slice(0, dates.length - SESSION_CACHE_LIMIT)) delete pruned[date];
  return pruned;
}

export const localAthleteRepository: AthleteRepository = {
  getProfile() {
    const raw = readJson<AthleteProfile & { mesocycleStartDate?: string }>(PROFILE_KEY, DEFAULT_PROFILE);
    return migrateProfile(raw);
  },
  saveProfile(profile) {
    const prev = migrateProfile(readJson<AthleteProfile & { mesocycleStartDate?: string }>(PROFILE_KEY, DEFAULT_PROFILE));
    const prLog = appendPrChanges(prev, profile);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, prLog }));
  },
  getHistory() {
    return readJson<SessionHistoryEntry[]>(HISTORY_KEY, []);
  },
  appendHistoryEntry(entry) {
    const history = readJson<SessionHistoryEntry[]>(HISTORY_KEY, []);
    const updated = [...history, entry].slice(-HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));

    const profile = localAthleteRepository.getProfile();
    const trainingDatesLog = [...new Set([...(profile.trainingDatesLog ?? []), entry.date])]
      .sort()
      .slice(-TRAINING_DATES_LOG_LIMIT);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, trainingDatesLog }));
  },
  replaceHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
  },
  deleteHistoryEntry(date) {
    const history = readJson<SessionHistoryEntry[]>(HISTORY_KEY, []);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.filter((entry) => entry.date !== date)));

    const profile = localAthleteRepository.getProfile();
    const trainingDatesLog = (profile.trainingDatesLog ?? []).filter((d) => d !== date);
    const workLog = (profile.workLog ?? []).filter((e) => e.date !== date);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, trainingDatesLog, workLog }));
  },
  updateHistoryTestLoad(date, testLoadKg) {
    const history = readJson<SessionHistoryEntry[]>(HISTORY_KEY, []);
    const updated = history.map((entry) => (entry.date === date ? { ...entry, testLoadKg } : entry));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  },
  getCachedSession(dateIso) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    return cache[dateIso] ?? null;
  },
  saveCachedSession(session) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    // Sella con la version del motor con la que se genero — ver `SESSION_GEN_VERSION`.
    cache[session.date] = { ...session, genVersion: SESSION_GEN_VERSION };
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(pruneSessionCache(cache)));
  },
  deleteCachedSession(dateIso) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    delete cache[dateIso];
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
  },
  deleteCachedSessionsInRange(startDateIso, endDateIso) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    let changed = false;
    for (const [date, session] of Object.entries(cache)) {
      if (date < startDateIso || date > endDateIso) continue;
      if (session.source === 'custom' || session.swapLabel) continue;
      delete cache[date];
      changed = true;
    }
    if (changed) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
  },
  getBodyweightLog() {
    return localAthleteRepository.getProfile().bodyweightLog ?? [];
  },
  appendBodyweightEntry(entry) {
    const profile = localAthleteRepository.getProfile();
    const withoutSameDate = (profile.bodyweightLog ?? []).filter((e) => e.date !== entry.date);
    const bodyweightLog = [...withoutSameDate, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-BODYWEIGHT_LOG_LIMIT);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, bodyweightLog }));
  },
  getReadinessLog() {
    return localAthleteRepository.getProfile().readinessLog ?? [];
  },
  saveReadinessCheck(entry) {
    const profile = localAthleteRepository.getProfile();
    const withoutSameDate = (profile.readinessLog ?? []).filter((e) => e.date !== entry.date);
    const readinessLog = [...withoutSameDate, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-READINESS_LOG_LIMIT);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, readinessLog }));
  },
  getSetFeedbackLog() {
    return localAthleteRepository.getProfile().setFeedbackLog ?? [];
  },
  appendSetFeedbackEntry(entry) {
    const profile = localAthleteRepository.getProfile();
    const withoutSame = (profile.setFeedbackLog ?? []).filter((e) => !(e.date === entry.date && e.movementId === entry.movementId));
    const setFeedbackLog = [...withoutSame, entry]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-SET_FEEDBACK_LOG_LIMIT);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, setFeedbackLog }));
  },
  deleteSetFeedbackEntry(date, movementId) {
    const profile = localAthleteRepository.getProfile();
    const setFeedbackLog = (profile.setFeedbackLog ?? []).filter((e) => !(e.date === date && e.movementId === movementId));
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, setFeedbackLog }));
  },
  getWorkLog() {
    return localAthleteRepository.getProfile().workLog ?? [];
  },
  saveWorkSet(entry) {
    const profile = localAthleteRepository.getProfile();
    const without = (profile.workLog ?? []).filter(
      (e) => !(e.date === entry.date && e.movementId === entry.movementId && e.setNumber === entry.setNumber),
    );
    const workLog = [...without, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-WORK_LOG_LIMIT);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, workLog }));
  },
  clearWorkSet(date, movementId, setNumber) {
    const profile = localAthleteRepository.getProfile();
    const workLog = (profile.workLog ?? []).filter(
      (e) => !(e.date === date && e.movementId === movementId && e.setNumber === setNumber),
    );
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, workLog }));
  },
  clearWorkLogForDate(date) {
    const profile = localAthleteRepository.getProfile();
    const workLog = (profile.workLog ?? []).filter((e) => e.date !== date);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, workLog }));
  },
  resetTrainingData() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({}));
    const profile = localAthleteRepository.getProfile();
    const prs: AthleteProfile['prs'] = {
      backSquat: 0,
      frontSquat: 0,
      benchPress: 0,
      deadlift: 0,
      strictPress: 0,
      clean: 0,
      snatch: 0,
      cleanAndJerk: 0,
    };
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ ...profile, prs, variantPrs: {}, trainingDatesLog: [], prLog: [], setFeedbackLog: [], workLog: [] }),
    );
  },
};
