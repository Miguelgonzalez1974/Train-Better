import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionHistoryEntry, WodSplitsRecord, WorkSetEntry } from './types';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
});

const { localAthleteRepository: repo } = await import('./localRepository');

const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: ['bench-press'], rxOrScaled: 'rx', rpe: 8, durationMin: 62, ...extra });
const set = (date: string, n: number): WorkSetEntry => ({ date, movementId: 'bench-press', block: 'strength', setNumber: n, kg: 67.5, reps: 5 });
const split: WodSplitsRecord = { date: '2026-11-17', part: 1, key: 'benchmark:x', mode: 'ronda', labels: [], segments: [60, 62], totalSeconds: 122, rx: true };

describe('deshacer el registro y volver a registrar', () => {
  beforeEach(() => store.clear());

  it('devuelve la entrada, los días entrenados, las series anotadas y los parciales del WOD', () => {
    repo.appendHistoryEntry(entry('2026-11-16'));
    repo.appendHistoryEntry(entry('2026-11-17', { wodSplits: [split] }));
    repo.saveWorkSet(set('2026-11-17', 1));
    repo.saveWorkSet(set('2026-11-17', 2));
    repo.saveWorkSet(set('2026-11-16', 1));
    const snapshot = repo.snapshotDay('2026-11-17');
    expect(snapshot.entry?.date).toBe('2026-11-17');
    expect(snapshot.workLog).toHaveLength(2);

    repo.deleteHistoryEntry('2026-11-17');
    expect(repo.getHistory().map((e) => e.date)).toEqual(['2026-11-16']);
    expect(repo.getProfile().workLog?.filter((e) => e.date === '2026-11-17')).toEqual([]);
    expect(repo.getProfile().trainingDatesLog).not.toContain('2026-11-17');
    expect(repo.getProfile().wodGhosts ?? []).toEqual([]);

    expect(repo.restoreDay(snapshot)).toBe(true);
    expect(repo.getHistory().map((e) => e.date)).toEqual(['2026-11-16', '2026-11-17']);
    expect(repo.getProfile().workLog?.filter((e) => e.date === '2026-11-17')).toHaveLength(2);
    expect(repo.getProfile().workLog?.filter((e) => e.date === '2026-11-16')).toHaveLength(1);
    expect(repo.getProfile().trainingDatesLog).toContain('2026-11-17');
    expect(repo.getProfile().wodGhosts).toEqual([split]);
  });

  it('un día más antiguo vuelve a su sitio por fecha, no al final', () => {
    repo.appendHistoryEntry(entry('2026-11-15'));
    repo.appendHistoryEntry(entry('2026-11-16'));
    const snapshot = repo.snapshotDay('2026-11-15');
    repo.deleteHistoryEntry('2026-11-15');
    repo.restoreDay(snapshot);
    expect(repo.getHistory().map((e) => e.date)).toEqual(['2026-11-15', '2026-11-16']);
  });

  it('si ese día ya tiene otro registro, o no había nada, no hace nada', () => {
    repo.appendHistoryEntry(entry('2026-11-17'));
    const snapshot = repo.snapshotDay('2026-11-17');
    expect(repo.restoreDay(snapshot)).toBe(false);
    expect(repo.getHistory()).toHaveLength(1);
    expect(repo.restoreDay(repo.snapshotDay('2026-11-30'))).toBe(false);
  });
});
