import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionLogEntry, ReadinessCheck, SessionHistoryEntry } from '../../data/athlete/types';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
});

const { localAthleteRepository: repo } = await import('../../data/athlete/localRepository');
const { previewMorning } = await import('./morningCommit');
const { computeReadinessScore } = await import('../../engine/readinessScore');
const { withCompanionLoad } = await import('../../engine/companionLoad');
const { makeProfile } = await import('../../engine/__fixtures');

const TODAY = '2026-11-22';
const iso = (back: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('la preparación de la tarjeta de la mañana', () => {
  beforeEach(() => store.clear());

  it('cuenta la carga del programa de fuerza, igual que el Dashboard (si no, las dos notas no coinciden)', () => {
    const history: SessionHistoryEntry[] = Array.from({ length: 28 }, (_, i) => ({ date: iso(i + 1), mesocycleWeek: 1, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 6, durationMin: 40 }));
    const companionLog: CompanionLogEntry[] = Array.from({ length: 10 }, (_, i) => ({ id: `p|${i}`, programId: 'p', index: i, date: iso(i + 1), outcome: 'hecha', rpe: 9, durationMin: 90 }));
    const readinessLog: ReadinessCheck[] = Array.from({ length: 7 }, (_, i) => ({ date: iso(i + 1), sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta', overall: 'bien' }));
    repo.saveProfile({ ...makeProfile(), readinessLog, companionLog });

    const answers = { overall: 'bien' as const };
    const preview = previewMorning(answers, history, TODAY);

    const profile = repo.getProfile();
    const today: ReadinessCheck = { date: TODAY, sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta', overall: 'bien' };
    const score = (h: SessionHistoryEntry[]) => computeReadinessScore({ readinessLog: [...readinessLog, today], hrvHistory: profile.hrvHistory, history: h, painFlags: profile.painFlags, today: new Date(`${TODAY}T12:00:00`) }).total;

    const withProgram = score(withCompanionLoad(history, companionLog));
    const withoutProgram = score(history);
    expect(withProgram).not.toBeNull();
    // Con el programa de fuerza la carga sube y la nota baja: el Dashboard enseña esta.
    expect(withProgram!).toBeLessThan(withoutProgram!);
    expect(preview.readiness).toBe(withProgram);
  });
});
