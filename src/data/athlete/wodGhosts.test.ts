import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeProfile } from './mergeProfile';
import { DEFAULT_PROFILE } from './types';
import type { AthleteProfile, SessionHistoryEntry, WodSplitsRecord } from './types';

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

const base = (): AthleteProfile => JSON.parse(JSON.stringify(DEFAULT_PROFILE));
const record = (date: string, segments: number[], part: 1 | 2 = 1): WodSplitsRecord => ({
  date,
  part,
  key: 'benchmark:fran',
  mode: 'movimiento',
  labels: ['Thruster', 'Pull-up'],
  segments,
  totalSeconds: segments.reduce((a, b) => a + b, 0),
  rx: true,
});
const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60, ...extra });

describe('parciales del WOD para el modo fantasma', () => {
  beforeEach(() => store.clear());

  it('al guardar una sesión con parciales, quedan también en el perfil (llegan más atrás que el historial)', () => {
    repo.appendHistoryEntry(entry('2026-12-01', { wodSplits: [record('2026-12-01', [60, 40])] }));
    expect(repo.getProfile().wodGhosts).toEqual([record('2026-12-01', [60, 40])]);
    for (let i = 0; i < 40; i++) repo.appendHistoryEntry(entry(`2027-01-${String(1 + (i % 28)).padStart(2, '0')}`));
    expect(repo.getHistory()).toHaveLength(30);
    expect(repo.getProfile().wodGhosts?.[0].date).toBe('2026-12-01');
  });

  it('una sesión sin parciales no crea nada, y una fecha repetida se sustituye', () => {
    repo.appendHistoryEntry(entry('2026-12-02'));
    expect(repo.getProfile().wodGhosts).toBeUndefined();
    repo.appendHistoryEntry(entry('2026-12-03', { wodSplits: [record('2026-12-03', [70, 50])] }));
    repo.appendHistoryEntry(entry('2026-12-03', { wodSplits: [record('2026-12-03', [65, 45])] }));
    expect(repo.getProfile().wodGhosts).toHaveLength(1);
    expect(repo.getProfile().wodGhosts![0].segments).toEqual([65, 45]);
  });

  it('un doble WOD guarda las dos partes, y deshacer la sesión las quita', () => {
    repo.appendHistoryEntry(entry('2026-12-04', { wodSplits: [record('2026-12-04', [60, 40], 1), record('2026-12-04', [30, 30], 2)] }));
    expect(repo.getProfile().wodGhosts?.map((g) => g.part)).toEqual([1, 2]);
    repo.deleteHistoryEntry('2026-12-04');
    expect(repo.getProfile().wodGhosts).toEqual([]);
  });

  it('al sincronizar se unen por fecha y parte, y gana la local', () => {
    const merged = mergeProfile({ ...base(), wodGhosts: [record('2026-12-01', [60, 40]), record('2026-12-02', [60, 40])] }, { ...base(), wodGhosts: [record('2026-12-01', [50, 30]), record('2026-12-03', [60, 40])] });
    expect(merged.wodGhosts?.map((g) => g.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(merged.wodGhosts?.[0].segments).toEqual([50, 30]);
  });
});
