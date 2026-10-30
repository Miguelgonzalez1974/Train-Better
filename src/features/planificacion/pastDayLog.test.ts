import { describe, expect, it } from 'vitest';
import { generateSessionForDate, toHistoryEntry } from '../../engine/generateSession';
import { consecutiveDates, makeMacro, makeProfile } from '../../engine/__fixtures';
import { dayStrain } from '../../engine/strain';
import { customDaySession, isHistorySorted, sortHistoryByDate } from './pastDayLog';
import type { SessionHistoryEntry } from '../../data/athlete/types';

const entry = (date: string): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });

describe('registrar un día pasado', () => {
  it('"hice otra cosa" es una sesión propia sin bloques, con la fecha de ese día', () => {
    const s = customDaySession('2026-10-30', 2);
    expect(s).toMatchObject({ date: '2026-10-30', mesocycleWeek: 2, isRestDay: false, source: 'custom', swapLabel: 'Otra cosa', editedByAthlete: true });
    expect(s.blocks).toEqual([]);
    const e = toHistoryEntry(s, 'rx', 6, 45);
    expect(e.date).toBe('2026-10-30');
    expect(e.movementIds).toEqual([]);
    expect(dayStrain(e)).toBeGreaterThan(0);
  });

  it('"hice lo previsto" guarda la sesión del coach con la fecha de ese día', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'a' })] });
    const day = consecutiveDates('2026-01-12', 5)[2];
    const session = generateSessionForDate(profile, [], day, profile.goals);
    const e = toHistoryEntry(session, 'scaled', 8, 55);
    expect(e.date).toBe(session.date);
    expect(e.rxOrScaled).toBe('scaled');
    expect(e.rpe).toBe(8);
    expect(e.durationMin).toBe(55);
    expect(e.movementIds.length).toBeGreaterThan(0);
  });

  it('el historial se deja por orden de fecha cuando el día registrado es anterior al último', () => {
    const h = [entry('2026-10-28'), entry('2026-10-31'), entry('2026-10-30')];
    expect(isHistorySorted(h)).toBe(false);
    expect(sortHistoryByDate(h).map((e) => e.date)).toEqual(['2026-10-28', '2026-10-30', '2026-10-31']);
    expect(isHistorySorted(sortHistoryByDate(h))).toBe(true);
  });

  it('ordenar es estable y no toca el original', () => {
    const a = { ...entry('2026-10-30'), rpe: 5 };
    const b = { ...entry('2026-10-30'), rpe: 9 };
    const h = [entry('2026-10-31'), a, b];
    const sorted = sortHistoryByDate(h);
    expect(sorted.slice(0, 2)).toEqual([a, b]);
    expect(h[0].date).toBe('2026-10-31');
  });

  it('un historial vacío o de un solo día ya está ordenado', () => {
    expect(isHistorySorted([])).toBe(true);
    expect(isHistorySorted([entry('2026-10-30')])).toBe(true);
  });
});
