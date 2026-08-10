import type { AthleteRepository } from './localRepository';
import { localAthleteRepository } from './localRepository';
import { pushRemote } from './remoteSync';

/** Misma interfaz que el repositorio local, pero cada escritura dispara ademas una sincronizacion a Supabase (fire-and-forget). */
export const athleteRepository: AthleteRepository = {
  ...localAthleteRepository,
  saveProfile(profile) {
    localAthleteRepository.saveProfile(profile);
    void pushRemote();
  },
  appendHistoryEntry(entry) {
    localAthleteRepository.appendHistoryEntry(entry);
    void pushRemote();
  },
  deleteHistoryEntry(date) {
    localAthleteRepository.deleteHistoryEntry(date);
    void pushRemote();
  },
  appendBodyweightEntry(entry) {
    localAthleteRepository.appendBodyweightEntry(entry);
    void pushRemote();
  },
};
