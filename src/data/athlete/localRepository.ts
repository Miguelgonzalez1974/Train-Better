import { AthleteProfile, DailySession, DEFAULT_PROFILE, Goal, SessionHistoryEntry } from './types';

const PROFILE_KEY = 'train-better:profile';
const HISTORY_KEY = 'train-better:history';
const GOAL_KEY = 'train-better:goal';
const SESSION_CACHE_KEY = 'train-better:session-cache';
const HISTORY_LIMIT = 30;
const SESSION_CACHE_LIMIT = 60;

export interface AthleteRepository {
  getProfile(): AthleteProfile;
  saveProfile(profile: AthleteProfile): void;
  getHistory(): SessionHistoryEntry[];
  appendHistoryEntry(entry: SessionHistoryEntry): void;
  replaceHistory(history: SessionHistoryEntry[]): void;
  getGoal(): Goal | null;
  saveGoal(goal: Goal): void;
  clearGoal(): void;
  getCachedSession(dateIso: string): DailySession | null;
  saveCachedSession(session: DailySession): void;
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
    return readJson<AthleteProfile>(PROFILE_KEY, DEFAULT_PROFILE);
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
  },
  replaceHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
  },
  getGoal() {
    return readJson<Goal | null>(GOAL_KEY, null);
  },
  saveGoal(goal) {
    localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
  },
  clearGoal() {
    localStorage.removeItem(GOAL_KEY);
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
};
