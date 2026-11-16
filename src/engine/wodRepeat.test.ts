import { describe, expect, it } from 'vitest';
import type { AthleteProfile, DailySession, SessionBlockResult, SessionHistoryEntry } from '../data/athlete/types';
import { getWodCatalog } from './wodCatalog';
import { toHistoryEntry } from './generateSession';
import { applyRepeatedWod, listRepeatableWods } from './wodRepeat';
import { wodKeyOf, wodKeyOfBlocks, historyWodKey } from './wodGhost';

const profile = { prs: { backSquat: 150 }, trainingDaysPerWeek: 5, macrocycles: [], goals: [], strengthPrograms: [], painFlags: [], bodyweightLog: [{ date: '2026-11-01', kg: 80 }] } as unknown as AthleteProfile;
const wod = (movements: [string, string][], format = 'For Time (5 rondas)'): SessionBlockResult[] => movements.map(([movementId, reps]) => ({ block: 'wod', movementId, reps, format, notes: 'nota larga'.repeat(20) }));
const session = (date: string, blocks: SessionBlockResult[]): DailySession => ({ date, mesocycleWeek: 1, isRestDay: false, blocks });
const entry = (date: string, blocks: SessionBlockResult[], value?: string): SessionHistoryEntry => {
  const e = toHistoryEntry(session(date, blocks), 'rx', 8, 60, value ? { scoreType: 'time', value } : undefined);
  return e;
};
const ROW_PULL = wod([['row', '200m'], ['kipping-pull-up', '10'], ['ring-dip', '5']]);
const THRUSTER = wod([['thruster', '10'], ['burpee', '10']], 'AMRAP 12 min');

describe('guardar el WOD en el historial', () => {
  it('guarda los bloques del WOD sin las notas largas, y la clave del historial los reconoce como el mismo WOD', () => {
    const e = entry('2026-11-10', ROW_PULL, '14:30');
    expect(e.wodBlocks).toHaveLength(3);
    expect(e.wodBlocks!.every((b) => b.notes === undefined)).toBe(true);
    expect(historyWodKey(e)).toBe(wodKeyOf(session('2026-11-20', ROW_PULL), 1));
    expect(historyWodKey(e)).toBe(wodKeyOfBlocks(e.wodBlocks!, 1));
  });

  it('una sesión sin WOD, o con solo la nota libre de una sesión propia, no guarda bloques', () => {
    expect(entry('2026-11-10', [{ block: 'strength', movementId: 'back-squat', sets: 3, reps: '5' }]).wodBlocks).toBeUndefined();
    expect(entry('2026-11-10', [{ block: 'wod', movementId: 'custom-wod-note', notes: 'hice otra cosa' }]).wodBlocks).toBeUndefined();
  });
});

describe('qué WODs se pueden repetir', () => {
  it('agrupa por WOD, cuenta las veces, da la última fecha y el mejor tiempo', () => {
    const history = [entry('2026-11-03', ROW_PULL, '15:10'), entry('2026-11-06', THRUSTER), entry('2026-11-10', ROW_PULL, '14:30'), entry('2026-11-12', ROW_PULL, '14:55')];
    const list = listRepeatableWods(history, profile, []);
    expect(list).toHaveLength(2);
    const row = list.find((w) => w.times === 3)!;
    expect(row.lastDate).toBe('2026-11-12');
    expect(row.best).toEqual({ text: '14:30', date: '2026-11-10' });
    expect(row.summary).toContain('Row');
    expect(row.blocks).toHaveLength(3);
  });

  it('los que tienen parciales salen primero', () => {
    const history = [entry('2026-11-03', ROW_PULL, '15:10'), entry('2026-11-12', THRUSTER)];
    const key = historyWodKey(history[0])!;
    const withSplits = listRepeatableWods(history, profile, [{ date: '2026-11-03', part: 1, key, mode: 'ronda', labels: [], segments: [60, 62, 64], totalSeconds: 186, rx: true }]);
    expect(withSplits[0].key).toBe(key);
    expect(withSplits[0].withSplits).toBe(true);
    expect(withSplits[1].withSplits).toBe(false);
    // Con parciales que no acabaron en el cap no cuentan.
    const capped = listRepeatableWods(history, profile, [{ date: '2026-11-03', part: 1, key, mode: 'ronda', labels: [], segments: [60], totalSeconds: 60, rx: true, capped: true }]);
    expect(capped.every((w) => !w.withSplits)).toBe(true);
  });

  it('una entrada anterior a guardar los bloques se reconstruye por su id de catálogo; sin id no se puede', () => {
    const cat = getWodCatalog().find((w) => w.usable && w.origin === 'benchmark')!;
    const old = { date: '2026-10-20', mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 50, wodCatalogId: cat.id, wodResult: { scoreType: 'time', value: '10:00' } } as SessionHistoryEntry;
    const generatedOld = { date: '2026-10-21', mesocycleWeek: 1, movementIds: ['thruster'], rxOrScaled: 'rx', rpe: 7, durationMin: 50 } as SessionHistoryEntry;
    const list = listRepeatableWods([old, generatedOld], profile, []);
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe(cat.id);
    expect(list[0].blocks[0].wodCatalogId).toBe(cat.id);
    expect(list[0].best?.text).toBe('10:00');
  });
});

describe('poner el WOD repetido en una sesión', () => {
  const base = session('2026-11-20', [
    { block: 'warmup', movementId: 'hip-halo' },
    { block: 'strength', movementId: 'back-squat', sets: 3, reps: '5' },
    ...wod([['run', '400m'], ['air-bike', '15 cal']]),
    { block: 'accessory', movementId: 'plank' },
  ]);

  it('cambia solo los bloques de WOD, en su sitio, y marca la sesión como editada', () => {
    const next = applyRepeatedWod(base, ROW_PULL);
    expect(next.blocks.map((b) => b.block)).toEqual(['warmup', 'strength', 'wod', 'wod', 'wod', 'accessory']);
    expect(next.blocks.filter((b) => b.block === 'wod').map((b) => b.movementId)).toEqual(['row', 'kipping-pull-up', 'ring-dip']);
    expect(next.editedByAthlete).toBe(true);
    expect(base.blocks.filter((b) => b.block === 'wod')[0].movementId).toBe('run');
  });

  it('el WOD puesto tiene la misma clave que el guardado: el fantasma lo encuentra', () => {
    const saved = entry('2026-11-10', ROW_PULL, '14:30');
    const next = applyRepeatedWod(base, listRepeatableWods([saved], profile, [])[0].blocks);
    expect(wodKeyOf(next, 1)).toBe(historyWodKey(saved));
  });

  it('si la sesión no tenía WOD, lo añade al final del cuerpo de la sesión', () => {
    const noWod = session('2026-11-20', [{ block: 'strength', movementId: 'back-squat', sets: 3, reps: '5' }]);
    expect(applyRepeatedWod(noWod, ROW_PULL).blocks.map((b) => b.block)).toEqual(['strength', 'wod', 'wod', 'wod']);
  });
});
