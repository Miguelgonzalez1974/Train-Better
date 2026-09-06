import { describe, it, expect } from 'vitest';
import { mergeProfile, mergeHistory } from './mergeProfile';
import { DEFAULT_PROFILE } from './types';
import type { AthleteProfile, SessionHistoryEntry, WorkSetEntry } from './types';

const base = (): AthleteProfile => JSON.parse(JSON.stringify(DEFAULT_PROFILE));
const ws = (date: string, movementId: string, setNumber: number, kg: number): WorkSetEntry => ({
  date,
  movementId,
  setNumber,
  kg,
  reps: 3,
  block: 'strength',
});

describe('mergeProfile — logs: union por clave', () => {
  it('worklog: une entradas de ambos dispositivos (no se pierde ninguna)', () => {
    const remote = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 100)] };
    const local = { ...base(), workLog: [ws('2026-03-02', 'deadlift', 1, 150)] };
    const merged = mergeProfile(remote, local);
    expect(merged.workLog).toHaveLength(2);
    expect(merged.workLog?.map((e) => e.movementId).sort()).toEqual(['back-squat', 'deadlift']);
  });

  it('worklog: en la misma serie (misma clave) gana el local', () => {
    const remote = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 100)] };
    const local = { ...base(), workLog: [ws('2026-03-01', 'back-squat', 1, 105)] };
    const merged = mergeProfile(remote, local);
    expect(merged.workLog).toHaveLength(1);
    expect(merged.workLog?.[0].kg).toBe(105);
  });

  it('pesajes y readiness: union por fecha', () => {
    const remote = { ...base(), bodyweightLog: [{ date: '2026-03-01', kg: 80 }] };
    const local = { ...base(), bodyweightLog: [{ date: '2026-03-03', kg: 79 }] };
    expect(mergeProfile(remote, local).bodyweightLog).toHaveLength(2);
  });

  it('prLog: union, dedup exacto por date+key+kg', () => {
    const p = { date: '2026-03-01', key: 'deadlift', kg: 200 };
    const remote = { ...base(), prLog: [p, { date: '2026-02-01', key: 'snatch', kg: 90 }] };
    const local = { ...base(), prLog: [p, { date: '2026-03-05', key: 'clean', kg: 120 }] };
    const merged = mergeProfile(remote, local);
    expect(merged.prLog).toHaveLength(3);
  });

  it('trainingDatesLog y reviewedMacroWeeks: union de sets', () => {
    const remote = { ...base(), trainingDatesLog: ['2026-03-01', '2026-03-02'], reviewedMacroWeeks: ['m:1'] };
    const local = { ...base(), trainingDatesLog: ['2026-03-02', '2026-03-03'], reviewedMacroWeeks: ['m:2'] };
    const merged = mergeProfile(remote, local);
    expect(merged.trainingDatesLog).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(merged.reviewedMacroWeeks?.sort()).toEqual(['m:1', 'm:2']);
  });

  it('sessionCache: la sesion propia del atleta gana a la generada', () => {
    const remote = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 1, isRestDay: false, blocks: [], genVersion: 14 } },
    };
    const local = {
      ...base(),
      sessionCache: { '2026-03-01': { date: '2026-03-01', mesocycleWeek: 0, isRestDay: false, blocks: [], source: 'custom' as const } },
    };
    const merged = mergeProfile(remote, local);
    expect(merged.sessionCache?.['2026-03-01'].source).toBe('custom');
  });
});

describe('mergeProfile — config: gana el local', () => {
  it('PRs: se toman los locales tal cual', () => {
    const remote = { ...base(), prs: { ...base().prs, deadlift: 200 } };
    const local = { ...base(), prs: { ...base().prs, deadlift: 190 } };
    expect(mergeProfile(remote, local).prs.deadlift).toBe(190);
  });

  it('objetivos: union por id, gana el local en misma id', () => {
    const remote: AthleteProfile = {
      ...base(),
      goals: [{ id: 'g1', type: 'subir-pr', movementId: 'snatch', targetDate: '2026-05-01', emphasis: 'moderado', createdAt: '2026-01-01' }],
    };
    const local: AthleteProfile = {
      ...base(),
      goals: [
        { id: 'g1', type: 'subir-pr', movementId: 'snatch', targetDate: '2026-05-01', emphasis: 'intensivo', createdAt: '2026-01-01' },
        { id: 'g2', type: 'elevar-fuerza', movementId: 'deadlift', targetDate: '2026-06-01', emphasis: 'moderado', createdAt: '2026-02-01' },
      ],
    };
    const merged = mergeProfile(remote, local);
    expect(merged.goals).toHaveLength(2);
    expect(merged.goals.find((g) => g.id === 'g1')?.emphasis).toBe('intensivo');
  });

  it('painFlags: la version con clearedDate (el atleta lo quito) gana', () => {
    const remote: AthleteProfile = {
      ...base(),
      painFlags: [{ id: 'p1', area: 'hombro', createdDate: '2026-03-01', until: null }],
    };
    const local: AthleteProfile = {
      ...base(),
      painFlags: [{ id: 'p1', area: 'hombro', createdDate: '2026-03-01', until: null, clearedDate: '2026-03-10' }],
    };
    expect(mergeProfile(remote, local).painFlags?.[0].clearedDate).toBe('2026-03-10');
  });

  it('un campo nuevo no contemplado se conserva desde lo remoto (no se pierde)', () => {
    const remote = { ...base(), _futuro: 42 } as unknown as AthleteProfile;
    const merged = mergeProfile(remote, base()) as unknown as { _futuro?: number };
    expect(merged._futuro).toBe(42);
  });
});

describe('mergeHistory', () => {
  const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
    date,
    mesocycleWeek: 1,
    movementIds: ['back-squat'],
    rxOrScaled: 'rx',
    rpe: 7,
    durationMin: 60,
    ...extra,
  });

  it('une dias distintos de ambos dispositivos', () => {
    expect(mergeHistory([entry('2026-03-01')], [entry('2026-03-02')])).toHaveLength(2);
  });

  it('en el mismo dia gana la entrada mas completa (testLoadKg / wodResult rellenados despues)', () => {
    const remote = [entry('2026-03-01')];
    const local = [entry('2026-03-01', { testLoadKg: 180 })];
    const merged = mergeHistory(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].testLoadKg).toBe(180);
  });
});
