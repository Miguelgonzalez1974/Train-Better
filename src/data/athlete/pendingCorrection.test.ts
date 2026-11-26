import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailySession, SessionHistoryEntry, WorkSetEntry } from './types';

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
const { dropPendingCorrection, keepPendingCorrection, recoverPendingCorrection } = await import('./pendingCorrection');

const DAY = '2026-11-27';
const entry = (over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: DAY, mesocycleWeek: 2, movementIds: ['bench-press'], rxOrScaled: 'rx', rpe: 8, durationMin: 62, wodResult: { scoreType: 'time', value: '4:12' }, ...over });
const set: WorkSetEntry = { date: DAY, movementId: 'bench-press', block: 'strength', setNumber: 1, kg: 67.5, reps: 5 };
const session = { date: DAY, mesocycleWeek: 2, isRestDay: false, editedByAthlete: true, blocks: [{ block: 'accessory', movementId: 'bicep-curl', loggedSets: 3 }] } as DailySession;

/** Lo que hace «Corregir la sesión» al empezar: guarda la copia, quita el registro y conserva las series. */
function startCorrection() {
  const snapshot = repo.snapshotDay(DAY);
  keepPendingCorrection({ snapshot, session });
  repo.deleteHistoryEntry(DAY);
  for (const s of snapshot.workLog) repo.saveWorkSet(s);
}

describe('una corrección a medias', () => {
  beforeEach(() => {
    store.clear();
    repo.appendHistoryEntry(entry());
    repo.saveWorkSet(set);
  });

  it('si la app se cierra antes de guardar, el día vuelve tal como estaba', () => {
    startCorrection();
    // Se cambia algo a medias y la app se cierra.
    repo.saveWorkSet({ ...set, kg: 90 });
    repo.saveCachedSession({ ...session, blocks: [] });
    expect(repo.getHistory()).toEqual([]);

    expect(recoverPendingCorrection(repo)).toBe(true);
    expect(repo.getHistory()).toEqual([entry()]);
    expect(repo.getProfile().workLog).toEqual([set]);
    expect(repo.getCachedSession(DAY)?.blocks).toEqual(session.blocks);
    // Y solo una vez.
    expect(recoverPendingCorrection(repo)).toBe(false);
    expect(repo.getHistory()).toHaveLength(1);
  });

  it('una vez guardada o cancelada, no se toca nada', () => {
    startCorrection();
    repo.appendHistoryEntry(entry({ rpe: 6 }));
    dropPendingCorrection();
    expect(recoverPendingCorrection(repo)).toBe(false);
    expect(repo.getHistory()).toEqual([entry({ rpe: 6 })]);
  });

  it('si ese día ya tiene otro registro, manda el nuevo', () => {
    startCorrection();
    repo.appendHistoryEntry(entry({ rpe: 5 }));
    repo.saveCachedSession({ ...session, blocks: [] });
    expect(recoverPendingCorrection(repo)).toBe(false);
    expect(repo.getHistory()).toEqual([entry({ rpe: 5 })]);
    expect(repo.getCachedSession(DAY)?.blocks).toEqual([]);
  });

  it('una copia ilegible se descarta sin romper nada', () => {
    store.set('train-better:pending-correction', '{roto');
    expect(recoverPendingCorrection(repo)).toBe(false);
    expect(store.has('train-better:pending-correction')).toBe(false);
    expect(repo.getHistory()).toHaveLength(1);
  });

  it('si devolverlo falla, la copia se conserva para otro intento', () => {
    startCorrection();
    const broken = { restoreDay: () => { throw new Error('sin espacio'); }, saveCachedSession: repo.saveCachedSession };
    expect(recoverPendingCorrection(broken)).toBe(false);
    expect(recoverPendingCorrection(repo)).toBe(true);
  });
});
