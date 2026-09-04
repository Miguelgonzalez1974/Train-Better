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
  updateHistoryTestLoad(date, testLoadKg) {
    localAthleteRepository.updateHistoryTestLoad(date, testLoadKg);
    void pushRemote();
  },
  appendBodyweightEntry(entry) {
    localAthleteRepository.appendBodyweightEntry(entry);
    void pushRemote();
  },
  saveReadinessCheck(entry) {
    localAthleteRepository.saveReadinessCheck(entry);
    void pushRemote();
  },
  appendSetFeedbackEntry(entry) {
    localAthleteRepository.appendSetFeedbackEntry(entry);
    void pushRemote();
  },
  deleteSetFeedbackEntry(date, movementId) {
    localAthleteRepository.deleteSetFeedbackEntry(date, movementId);
    void pushRemote();
  },
  saveWorkSet(entry) {
    localAthleteRepository.saveWorkSet(entry);
    void pushRemote();
  },
  clearWorkSet(date, movementId, setNumber) {
    localAthleteRepository.clearWorkSet(date, movementId, setNumber);
    void pushRemote();
  },
  clearWorkLogForDate(date) {
    localAthleteRepository.clearWorkLogForDate(date);
    void pushRemote();
  },
};
