import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult, SessionHistoryEntry } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import { buildSessionSummaryData, e1rmSuggestionKey, findE1rmSuggestions, prMessageOfDay, summaryHighlight } from './sessionSummary';

const profile = makeProfile({ prs: { ...makeProfile().prs, benchPress: 100, clean: 100 } });
const blocks: SessionBlockResult[] = [
  { block: 'strength', movementId: 'bench-press', sets: 3, reps: '5', loadKg: 95 },
  { block: 'wod', movementId: 'benchmark:x' },
  { block: 'oly', movementId: 'power-clean', sets: 4, reps: '2', loadKg: 60 },
];
const session: DailySession = { date: '2026-11-17', mesocycleWeek: 2, isRestDay: false, blocks };
const entry = (extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: '2026-11-17', mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe: 9, durationMin: 60, ...extra });

describe('sugerencias de 1RM desde lo guardado', () => {
  it('con Rx y RPE alto sugiere el levantamiento cuyo 1RM estimado supera tu marca', () => {
    const s = findE1rmSuggestions(session, entry(), profile);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ movementName: 'Bench Press', currentKg: 100, target: { kind: 'root', key: 'benchPress' } });
    expect(s[0].estimatedKg).toBeGreaterThan(100);
    expect(e1rmSuggestionKey(s[0])).toBe('root:benchPress');
  });

  it('sin Rx, con RPE bajo, con la parte no hecha o en un día de test no sugiere nada', () => {
    expect(findE1rmSuggestions(session, entry({ rxOrScaled: 'scaled' }), profile)).toEqual([]);
    expect(findE1rmSuggestions(session, entry({ rpe: 6 }), profile)).toEqual([]);
    expect(findE1rmSuggestions(session, entry({ skipped: [{ block: 'strength' }] }), profile)).toEqual([]);
    const test: DailySession = { ...session, blocks: [{ ...blocks[0], format: 'Test 1RM' }, blocks[1]] };
    expect(findE1rmSuggestions(test, entry(), profile)).toEqual([]);
  });

  it('cuando el PR ya se actualizó, la sugerencia desaparece sola', () => {
    const updated = { ...profile, prs: { ...profile.prs, benchPress: 112 } };
    expect(findE1rmSuggestions(session, entry(), updated)).toEqual([]);
  });
});

describe('PR de hoy y resumen', () => {
  it('el mensaje de PR sale del registro de PRs de ese día, con el último valor de cada levantamiento', () => {
    const p = { ...profile, prLog: [{ date: '2026-11-16', key: 'backSquat', kg: 140 }, { date: '2026-11-17', key: 'benchPress', kg: 105 }, { date: '2026-11-17', key: 'benchPress', kg: 107.5 }] };
    expect(prMessageOfDay(p, '2026-11-17')).toBe('Nuevo PR registrado: Bench Press a 107.5 kg.');
    expect(prMessageOfDay(p, '2026-11-18')).toBeNull();
    // Varios a la vez: en plural; y con muchos, solo se cuenta cuántos son.
    const two = { ...profile, prLog: [{ date: '2026-11-17', key: 'benchPress', kg: 105 }, { date: '2026-11-17', key: 'clean', kg: 102 }] };
    expect(prMessageOfDay(two, '2026-11-17')).toBe('Nuevos PRs registrados: Bench Press a 105 kg, Clean a 102 kg.');
    const many = { ...profile, prLog: ['backSquat', 'frontSquat', 'benchPress', 'deadlift'].map((key) => ({ date: '2026-11-17', key, kg: 100 })) };
    expect(prMessageOfDay(many, '2026-11-17')).toBe('Nuevos PRs en 4 levantamientos.');
  });

  it('junta todo y la frase corta destaca el PR o las sugerencias pendientes', () => {
    const p = { ...profile, prLog: [{ date: '2026-11-17', key: 'clean', kg: 102 }] };
    const data = buildSessionSummaryData({ session, entry: entry(), profile: p, history: [entry()], now: new Date('2026-11-17T12:00:00') });
    expect(data.prMessage).toBe('Nuevo PR registrado: Clean a 102 kg.');
    expect(data.e1rmSuggestions.length).toBeGreaterThan(0);
    expect(data.weekCount).toEqual(expect.objectContaining({ done: expect.any(Number), planned: expect.any(Number) }));
    expect(summaryHighlight(data)).toBe('Nuevo PR registrado: Clean a 102 kg. Una sugerencia de 1RM por confirmar.');
    expect(summaryHighlight({ ...data, prMessage: null, e1rmSuggestions: [] })).toBeNull();
  });
});
