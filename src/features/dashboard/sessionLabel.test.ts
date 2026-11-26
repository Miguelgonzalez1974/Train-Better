import { describe, expect, it } from 'vitest';
import type { DailySession, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { olyName, sessionLabel, shortLift } from './sessionLabel';

const DAY = '2026-11-26';
const entry = (over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: DAY, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 70, ...over });
const session = (blocks: DailySession['blocks'], over: Partial<DailySession> = {}): DailySession => ({ date: DAY, mesocycleWeek: 2, isRestDay: false, blocks, ...over }) as DailySession;
const set = (over: Partial<WorkSetEntry>): WorkSetEntry => ({ date: DAY, movementId: 'deadlift', block: 'strength', setNumber: 1, kg: 100, reps: 5, ...over }) as WorkSetEntry;

const dl = { block: 'strength' as const, movementId: 'deadlift' };
const wod = { block: 'wod' as const, movementId: 'burpee', format: 'AMRAP 12 min' };
const accessory = { block: 'accessory' as const, movementId: 'bicep-curl' };
const label = (blocks: DailySession['blocks'], e: Partial<SessionHistoryEntry> = {}, workLog: WorkSetEntry[] = [], over: Partial<DailySession> = {}) =>
  sessionLabel({ entry: entry(e), session: session(blocks, over), workLog });

describe('nombres cortos', () => {
  it('abrevia como en el box, también las variantes', () => {
    expect(shortLift('Deadlift (convencional)')).toBe('DL');
    expect(shortLift('Romanian Deadlift (RDL)')).toBe('RDL');
    expect(shortLift('Deficit Deadlift')).toBe('Deficit DL');
    expect(shortLift('Pause Back Squat')).toBe('Pause BS');
    expect(shortLift('Dumbbell Bench Press')).toBe('DB Bench');
    expect(shortLift('Push Press')).toBe('PP');
    expect(shortLift('Floor Press')).toBe('Floor Press');
  });

  it('en halterofilia basta la familia', () => {
    expect(olyName('Hang Power Snatch')).toBe('Snatch');
    expect(olyName('Clean and Jerk')).toBe('C&J');
    expect(olyName('Squat Clean')).toBe('Clean');
    expect(olyName('Split Jerk')).toBe('Jerk');
  });
});

describe('de qué iba la sesión', () => {
  it('fuerza y WOD, halterofilia y WOD, y solo WOD', () => {
    expect(label([dl, wod])).toBe('DL + WOD');
    expect(label([{ block: 'oly', movementId: 'power-snatch' }, wod])).toBe('Snatch + WOD');
    expect(label([wod])).toBe('WOD');
  });

  it('recuperación activa y doble WOD', () => {
    expect(label([{ block: 'wod', movementId: 'row', format: 'RPE 2 · 45 min total', title: 'Recuperación activa' }, accessory])).toBe('Recovery');
    expect(sessionLabel({ entry: entry({ wodBlocks: [{ block: 'wod', movementId: 'row', format: 'RPE 2 · 45 min total' }] }), session: null, workLog: [] })).toBe('Recovery');
    expect(label([dl, wod, wod], {}, [], { doubleWod: true })).toBe('Doble WOD');
    // Con una de las dos partes sin hacer ya no fue doble.
    expect(label([dl, wod, wod], { skipped: [{ block: 'wod', part: 2 }] }, [], { doubleWod: true })).toBe('DL + WOD');
  });

  it('lo que saltaste no se cuenta', () => {
    expect(label([dl, wod, accessory], { skipped: [{ block: 'wod' }] })).toBe('DL');
    expect(label([dl, wod], { skipped: [{ block: 'strength' }] })).toBe('WOD');
  });

  it('un día sin WOD se cuenta como fuerza y accesorio', () => {
    expect(label([dl, accessory])).toBe('Fuerza + accesorio');
    expect(label([accessory])).toBe('Accesorio');
  });

  it('si anotaste otro ejercicio, manda lo anotado', () => {
    expect(label([dl, wod], {}, [set({ movementId: 'front-squat' })])).toBe('FS + WOD');
    expect(label([dl, wod], {}, [set({}), set({ movementId: 'front-squat', kg: 140 })])).toBe('DL + WOD');
  });

  it('un día antiguo sin la sesión guardada sale de lo anotado', () => {
    const e = entry({ wodBlocks: [wod] });
    expect(sessionLabel({ entry: e, session: null, workLog: [set({ movementId: 'back-squat' })] })).toBe('BS + WOD');
    expect(sessionLabel({ entry: entry(), session: null, workLog: [] })).toBeUndefined();
  });

  it('«Hice otra cosa» ya se llama por su nombre', () => {
    expect(label([], {}, [], { source: 'custom', customTitle: 'Running' })).toBeUndefined();
  });
});
