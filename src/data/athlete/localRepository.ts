import { AthleteProfile, DEFAULT_PROFILE, Goal, SessionHistoryEntry } from './types';

const PROFILE_KEY = 'train-better:profile';
const HISTORY_KEY = 'train-better:history';
const GOAL_KEY = 'train-better:goal';
const HISTORY_LIMIT = 30;

export interface AthleteRepository {
  getProfile(): AthleteProfile;
  saveProfile(profile: AthleteProfile): void;
  getHistory(): SessionHistoryEntry[];
  appendHistoryEntry(entry: SessionHistoryEntry): void;
  replaceHistory(history: SessionHistoryEntry[]): void;
  getGoal(): Goal | null;
  saveGoal(goal: Goal): void;
  clearGoal(): void;
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
};
