import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeProfile } from './mergeProfile';
import { DEFAULT_PROFILE } from './types';
import type { AthleteProfile, SessionHistoryEntry, WodLogEntry } from './types';

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
const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  date,
  mesocycleWeek: 2,
  movementIds: ['thruster', 'pull-up'],
  rxOrScaled: 'scaled',
  rpe: 7,
  durationMin: 60,
  wodMovementIds: ['thruster', 'pull-up'],
  ...extra,
});

describe('registro largo del WOD', () => {
  beforeEach(() => store.clear());

  it('al guardar una sesion con el escalado anotado, queda una linea por fecha con lo escalado, el cap y la dureza', () => {
    repo.appendHistoryEntry(entry('2026-12-01', { wodScaling: [{ movementId: 'pull-up', kind: 'movimiento' }], wodFeel: 'duro', wodResult: { scoreType: 'time', value: 'CAP · 5+3', capped: true } }));
    const log = repo.getProfile().wodLog!;
    expect(log).toEqual([{ date: '2026-12-01', movementIds: ['thruster', 'pull-up'], scaling: [{ movementId: 'pull-up', kind: 'movimiento' }], capped: true, feel: 'duro' }]);
  });

  it('un Rx anotado (lista vacia) tambien se guarda; sin anotar el escalado, no', () => {
    repo.appendHistoryEntry(entry('2026-12-02', { wodScaling: [], rxOrScaled: 'rx' }));
    repo.appendHistoryEntry(entry('2026-12-03'));
    expect(repo.getProfile().wodLog?.map((e) => e.date)).toEqual(['2026-12-02']);
  });

  it('una fecha repetida se sustituye, y el registro llega mas atras que las 30 sesiones del historial', () => {
    for (let i = 0; i < 45; i++) repo.appendHistoryEntry(entry(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, { wodScaling: [] }));
    repo.appendHistoryEntry(entry('2026-01-01', { wodScaling: [{ movementId: 'thruster', kind: 'peso', loadKg: 30 }] }));
    expect(repo.getHistory()).toHaveLength(30);
    const log = repo.getProfile().wodLog!;
    expect(log).toHaveLength(45);
    expect(log.find((e) => e.date === '2026-01-01')!.scaling).toHaveLength(1);
  });

  it('deshacer una sesion quita su linea', () => {
    repo.appendHistoryEntry(entry('2026-12-02', { wodScaling: [] }));
    repo.deleteHistoryEntry('2026-12-02');
    expect(repo.getProfile().wodLog).toEqual([]);
  });

  it('al sincronizar se unen por fecha y gana la local', () => {
    const line = (date: string, feel: WodLogEntry['feel']): WodLogEntry => ({ date, movementIds: ['thruster'], scaling: [], feel });
    const merged = mergeProfile({ ...base(), wodLog: [line('2026-12-01', 'facil'), line('2026-12-02', 'justo')] }, { ...base(), wodLog: [line('2026-12-01', 'duro'), line('2026-12-03', 'justo')] });
    expect(merged.wodLog?.map((e) => e.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(merged.wodLog?.[0].feel).toBe('duro');
  });
});
