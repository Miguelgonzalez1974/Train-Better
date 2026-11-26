import { describe, expect, it } from 'vitest';
import type { DailySession, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { makeProfile } from '../../engine/__fixtures';
import { buildActivityDetail, setFigure } from './activityDetail';

const DAY = '2026-11-25';
const entry = (over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: DAY, mesocycleWeek: 2, movementIds: ['push-press'], rxOrScaled: 'rx', rpe: 7, durationMin: 80, ...over });
const set = (movementId: string, block: 'strength' | 'oly', setNumber: number, kg: number, over: Partial<WorkSetEntry> = {}): WorkSetEntry => ({ date: DAY, movementId, block, setNumber, kg, reps: 3, ...over });
const session = (blocks: DailySession['blocks'], over: Partial<DailySession> = {}): DailySession => ({ date: DAY, mesocycleWeek: 2, isRestDay: false, blocks, ...over }) as DailySession;

const plan = session([
  { block: 'strength', movementId: 'push-press', sets: 4, reps: '3', loadKg: 60 },
  { block: 'oly', movementId: 'clean-high-pull', sets: 3, reps: '3', loadKg: 90 },
  { block: 'wod', movementId: 'row', reps: '10 cal', format: 'AMRAP 12 min' },
  { block: 'wod', movementId: 'dumbbell-snatch', reps: '10', loadKg: 22.5, format: 'AMRAP 12 min' },
  { block: 'accessory', movementId: 'bicep-curl', sets: 3, reps: '12' },
]);

const build = (over: Partial<Parameters<typeof buildActivityDetail>[0]> = {}) =>
  buildActivityDetail({ entry: entry(), session: plan, history: [entry()], profile: makeProfile(), workLog: [], ...over });

describe('la fuerza y la halterofilia del entreno', () => {
  it('cuenta solo las series de ese día, no las de otros (fallo corregido)', () => {
    const workLog = [
      ...[80, 85, 90].map((kg, i) => set('clean-high-pull', 'oly', i + 1, kg)),
      ...[60, 65, 70, 72.5].map((kg, i) => set('clean-high-pull', 'oly', i + 1, kg, { date: '2026-11-11' })),
      set('clean-high-pull', 'oly', 1, 75, { date: '2026-12-02' }),
    ];
    const oly = build({ workLog }).lifts.find((l) => l.block === 'oly')!;
    expect(oly.sets.map((s) => s.kg)).toEqual([80, 85, 90]);
    expect(oly).toMatchObject({ planned: 3, topKg: 90, delta: 17.5, record: true, trend: [72.5, 90] });
  });

  it('compara con la última vez y no cuenta una serie fallada como tope', () => {
    const workLog = [
      set('push-press', 'strength', 1, 55),
      set('push-press', 'strength', 2, 62.5),
      set('push-press', 'strength', 3, 70, { quality: 'fallada' }),
      set('push-press', 'strength', 1, 60, { date: '2026-11-18' }),
    ];
    const lift = build({ workLog }).lifts[0];
    expect(lift).toMatchObject({ block: 'strength', topKg: 62.5, delta: 2.5, record: true });
    expect(lift.sets[2]).toMatchObject({ kg: 70, quality: 'fallada' });
    expect(lift.pct).toBeGreaterThan(0);
  });

  it('una serie sin peso enseña las repeticiones, o que se hizo', () => {
    expect(setFigure({ kg: 62.5, reps: 3 })).toEqual({ value: '62,5', unit: '3 reps' });
    expect(setFigure({ kg: 40, reps: 0 })).toEqual({ value: '40', unit: 'kg' });
    expect(setFigure({ kg: 0, reps: 8 })).toEqual({ value: '8', unit: 'reps' });
    expect(setFigure({ kg: 0, reps: 0 })).toEqual({ value: '✓', unit: 'hecha' });
  });

  it('sin series anotadas enseña lo previsto; lo saltado no sale', () => {
    const detail = build();
    expect(detail.lifts.map((l) => [l.block, l.sets.length, l.prescription, l.delta])).toEqual([['strength', 0, '4×3 · 60 kg', null], ['oly', 0, '3×3 · 90 kg', null]]);
    const sinOly = build({ entry: entry({ skipped: [{ block: 'oly', reason: 'molestia' }] }) });
    expect(sinOly.lifts.map((l) => l.block)).toEqual(['strength']);
    expect(sinOly.skipped).toBe('Sin el oly, por la molestia.');
  });

  it('un cambio de ejercicio sale con lo anotado', () => {
    const detail = build({ workLog: [set('front-squat', 'strength', 1, 80)] });
    expect(detail.lifts.filter((l) => l.block === 'strength').map((l) => l.id)).toEqual(['front-squat']);
  });

  it('un día antiguo sin la sesión guardada sale de las series', () => {
    const detail = build({ session: null, workLog: [set('back-squat', 'strength', 1, 100)] });
    expect(detail.lifts).toHaveLength(1);
    expect(detail.lifts[0]).toMatchObject({ id: 'back-squat', planned: null, prescription: null });
    expect(build({ session: null }).fallback).toHaveLength(1);
  });
});

describe('el WOD, el accesorio y lo demás', () => {
  it('resultado, movimientos, escalados, sensación y parciales', () => {
    const detail = build({
      entry: entry({
        wodResult: { scoreType: 'rounds+reps', value: '10' },
        rxOrScaled: 'scaled',
        wodFeel: 'duro',
        wodScaling: [{ movementId: 'dumbbell-snatch', kind: 'peso', loadKg: 17.5, rxKg: 22.5 }],
        wodSplits: [{ date: DAY, part: 1, key: 'x', mode: 'ronda', labels: [], segments: [60, 64, 70], totalSeconds: 194, rx: false }],
      }),
    });
    expect(detail.wods).toHaveLength(1);
    expect(detail.wods[0]).toMatchObject({ result: '10', rx: false, format: 'AMRAP 12 min', feel: 'Te pareció duro', splits: { mode: 'ronda', segments: [60, 64, 70] } });
    expect(detail.wods[0].moves).toHaveLength(2);
    expect(detail.wods[0].scaled[0]).toContain('17,5 kg (Rx 22,5)');
  });

  it('la marca anterior de un WOD con nombre', () => {
    const fran = session([{ block: 'wod', movementId: 'benchmark:fran', format: 'For Time' }]);
    const before = entry({ date: '2026-10-01', movementIds: ['benchmark:fran'], wodResult: { scoreType: 'time', value: '4:58' } });
    const detail = build({ session: fran, history: [before, entry()], entry: entry({ wodResult: { scoreType: 'time', value: '4:40' } }) });
    expect(detail.wods[0]).toMatchObject({ result: '4:40', previous: '4:58', moves: [] });
  });

  it('un WOD saltado no sale; en un doble sale la parte hecha', () => {
    expect(build({ entry: entry({ skipped: [{ block: 'wod' }] }) }).wods).toEqual([]);
    const double = session(
      [
        { block: 'wod', movementId: 'row', format: 'For Time', wodPart: 1 },
        { block: 'wod', movementId: 'burpee', format: 'AMRAP 8 min', wodPart: 2 },
      ],
      { doubleWod: true },
    );
    expect(build({ session: double, entry: entry({ skipped: [{ block: 'wod', part: 1 }] }) }).wods.map((w) => w.part)).toEqual([2]);
  });

  it('el accesorio con lo anotado y lo previsto', () => {
    expect(build().accessory).toEqual([expect.objectContaining({ text: '3×12' })]);
    const logged = session([{ block: 'accessory', movementId: 'bicep-curl', sets: 3, reps: '12', loggedSets: 2, loggedKg: 14 }]);
    expect(build({ session: logged }).accessory[0].text).toBe('2 series · 14 kg');
  });

  it('«Hice otra cosa» enseña lo que apuntaste, y un dato raro no deja la pantalla en blanco', () => {
    const custom = session([], { source: 'custom', customTitle: 'Running', customNote: 'Resultado: 8 km.' });
    expect(build({ session: custom })).toMatchObject({ lifts: [], wods: [], note: 'Resultado: 8 km.', fallback: [] });
    const rota = { ...plan, blocks: null } as unknown as DailySession;
    expect(() => build({ session: rota, workLog: [set('push-press', 'strength', 1, 60)] })).not.toThrow();
  });
});
