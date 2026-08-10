import { AthleteProfile, BodyweightEntry, DailySession, DEFAULT_PROFILE, SessionHistoryEntry } from './types';

const PROFILE_KEY = 'train-better:profile';
const HISTORY_KEY = 'train-better:history';
/** @deprecated Solo se lee para migrar el objetivo unico legado a `profile.goals`. */
const LEGACY_GOAL_KEY = 'train-better:goal';
const SESSION_CACHE_KEY = 'train-better:session-cache';
const HISTORY_LIMIT = 30;
const SESSION_CACHE_LIMIT = 60;
const BODYWEIGHT_LOG_LIMIT = 120;
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
  getCachedSession(dateIso: string): DailySession | null;
  saveCachedSession(session: DailySession): void;
  /** Descarta la sesion planificada de un dia (sin tocar el historial) para volver a elegir de cero. */
  deleteCachedSession(dateIso: string): void;
  getBodyweightLog(): BodyweightEntry[];
  appendBodyweightEntry(entry: BodyweightEntry): void;
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
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, trainingDatesLog }));
  },
  getCachedSession(dateIso) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    return cache[dateIso] ?? null;
  },
  saveCachedSession(session) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    cache[session.date] = session;
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(pruneSessionCache(cache)));
  },
  deleteCachedSession(dateIso) {
    const cache = readJson<Record<string, DailySession>>(SESSION_CACHE_KEY, {});
    delete cache[dateIso];
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
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
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, prs, trainingDatesLog: [] }));
  },
};
