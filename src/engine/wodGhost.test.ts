import { describe, expect, it } from 'vitest';
import type { DailySession, SessionHistoryEntry, WodSplitsRecord } from '../data/athlete/types';
import { benchmarkWorkouts } from '../data/movements';
import {
  buildSplitsRecord,
  cumulative,
  deltaText,
  ghostPosition,
  liveDelta,
  marksToSegments,
  parseTimeSeconds,
  pickGhost,
  roundsOfFormat,
  summarizeGhost,
  trackLabels,
  trackTotal,
  wodKeyOf,
  wodTrackInfo,
  type WodTrackInfo,
} from './wodGhost';

const wod = (blocks: Partial<DailySession['blocks'][number]>[]): DailySession => ({
  date: '2026-11-14',
  mesocycleWeek: 1,
  isRestDay: false,
  blocks: blocks.map((b) => ({ block: 'wod', movementId: 'thruster', ...b })) as DailySession['blocks'],
});
const three = (format = 'For Time (3 rondas)') => wod([{ movementId: 'thruster', format, reps: '10' }, { movementId: 'strict-pull-up', format, reps: '10' }, { movementId: 'burpee', format, reps: '10' }]);
const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 8, durationMin: 60, ...extra });

describe('rondas de un formato', () => {
  it('lee «N rondas», «N rounds» y las escaleras', () => {
    expect(roundsOfFormat('For Time (5 rondas)')).toBe(5);
    expect(roundsOfFormat('5 Rounds For Time')).toBe(5);
    expect(roundsOfFormat('21-15-9 For Time')).toBe(3);
    expect(roundsOfFormat('For Time')).toBe(1);
    expect(roundsOfFormat(undefined)).toBe(1);
  });
});

describe('de qué tramos consta el WOD', () => {
  it('un WOD por tiempo con rondas y movimientos se puede cronometrar de las dos formas, por rondas por defecto', () => {
    const info = wodTrackInfo(three(), 1, 'time')!;
    expect(info.rounds).toBe(3);
    expect(info.movements).toHaveLength(3);
    expect(info.modes).toEqual(['ronda', 'movimiento']);
    expect(info.defaultMode).toBe('ronda');
    expect(trackTotal(info, 'ronda')).toBe(3);
    expect(trackTotal(info, 'movimiento')).toBe(9);
    expect(trackLabels(info, 'ronda')).toEqual([]);
    expect(trackLabels(info, 'movimiento')).toHaveLength(3);
  });

  it('un chipper (una sola vuelta) solo se cronometra por movimientos', () => {
    const info = wodTrackInfo(three('For Time'), 1, 'time')!;
    expect(info.modes).toEqual(['movimiento']);
    expect(info.defaultMode).toBe('movimiento');
  });

  it('un AMRAP o un WOD sin nada que separar no lleva cinta', () => {
    expect(wodTrackInfo(three('AMRAP 12 min'), 1, 'rounds+reps')).toBeNull();
    expect(wodTrackInfo(wod([{ movementId: 'thruster', format: 'For Time' }]), 1, 'time')).toBeNull();
    expect(wodTrackInfo({ ...three(), blocks: [] }, 1, 'time')).toBeNull();
  });

  it('con demasiados tramos por movimientos no se ofrece ese modo', () => {
    const many = wod(Array.from({ length: 5 }, (_, i) => ({ movementId: ['thruster', 'strict-pull-up', 'burpee', 'box-jump', 'kettlebell-swing'][i], format: 'For Time (12 rondas)' })));
    const info = wodTrackInfo(many, 1, 'time');
    if (info) expect(info.modes).not.toContain('movimiento');
  });

  it('la clave de un benchmark es su id; la de un WOD generado depende de su formato y sus movimientos', () => {
    const bench = benchmarkWorkouts.find((w) => w.scoreType === 'time')!;
    expect(wodKeyOf(wod([{ movementId: `benchmark:${bench.id}` }]), 1)).toBe(`benchmark:${bench.id}`);
    expect(wodKeyOf(three(), 1)).toBe(wodKeyOf(three(), 1));
    expect(wodKeyOf(three(), 1)).not.toBe(wodKeyOf(three('For Time (5 rondas)'), 1));
  });
});

describe('el fantasma', () => {
  const info: WodTrackInfo = { key: 'bm:x', part: 1, rounds: 3, movements: ['Thruster', 'Pull-up'], modes: ['ronda', 'movimiento'], defaultMode: 'ronda', targetSeconds: 600 };
  const rec = (date: string, mode: 'ronda' | 'movimiento', segments: number[], extra: Partial<WodSplitsRecord> = {}): WodSplitsRecord => ({
    date,
    part: 1,
    key: 'bm:x',
    mode,
    labels: mode === 'movimiento' ? ['Thruster', 'Pull-up'] : [],
    segments,
    totalSeconds: segments.reduce((a, b) => a + b, 0),
    rx: true,
    ...extra,
  });

  it('elige la mejor marca anterior con parciales, ignorando las que acabaron en el cap y las de hoy', () => {
    const ghosts = [rec('2026-10-01', 'ronda', [200, 210, 220]), rec('2026-10-08', 'ronda', [190, 200, 205]), rec('2026-10-15', 'ronda', [100, 100], { capped: true }), rec('2026-11-14', 'ronda', [1, 1, 1])];
    const g = pickGhost({ info, mode: 'ronda', todayIso: '2026-11-14', history: [], ghosts })!;
    expect(g.kind).toBe('parciales');
    expect(g.date).toBe('2026-10-08');
    expect(g.totalSeconds).toBe(595);
  });

  it('una marca por movimientos sirve por rondas (se suman los movimientos de cada ronda)', () => {
    const g = pickGhost({ info, mode: 'ronda', todayIso: '2026-11-14', history: [], ghosts: [rec('2026-10-01', 'movimiento', [60, 40, 62, 41, 63, 42])] })!;
    expect(g.durations).toEqual([100, 103, 105]);
  });

  it('una marca por rondas no sirve por movimientos: sin parciales a ese nivel, cae al ritmo constante de su tiempo final', () => {
    const history = [entry('2026-10-01', { movementIds: ['benchmark:x'], wodResult: { scoreType: 'time', value: '9:00' } })];
    const g = pickGhost({ info: { ...info, key: 'benchmark:x' }, mode: 'movimiento', todayIso: '2026-11-14', history, ghosts: [{ ...rec('2026-10-02', 'ronda', [180, 180, 180]), key: 'benchmark:x' }] })!;
    expect(g.kind).toBe('marca');
    expect(g.totalSeconds).toBe(540);
    expect(g.durations).toHaveLength(6);
    expect(g.durations.every((d) => d === 90)).toBe(true);
  });

  it('sin ninguna marca, el objetivo del coach a ritmo constante; sin objetivo, nada', () => {
    const e = pickGhost({ info, mode: 'ronda', todayIso: '2026-11-14', history: [], ghosts: [] })!;
    expect(e.kind).toBe('estimado');
    expect(e.durations).toEqual([200, 200, 200]);
    expect(pickGhost({ info: { ...info, targetSeconds: null }, mode: 'ronda', todayIso: '2026-11-14', history: [], ghosts: [] })).toBeNull();
  });

  it('las marcas de otro WOD no cuentan, y los parciales que ya están en el historial también sirven', () => {
    const history = [entry('2026-10-01', { wodSplits: [rec('2026-10-01', 'ronda', [150, 150, 150])] })];
    expect(pickGhost({ info, mode: 'ronda', todayIso: '2026-11-14', history, ghosts: [] })!.totalSeconds).toBe(450);
    expect(pickGhost({ info: { ...info, key: 'otro', targetSeconds: null }, mode: 'ronda', todayIso: '2026-11-14', history, ghosts: [] })).toBeNull();
  });

  it('un tiempo se lee de «m:ss» y «h:mm:ss»', () => {
    expect(parseTimeSeconds('12:40')).toBe(760);
    expect(parseTimeSeconds('1:02:03')).toBe(3723);
    expect(parseTimeSeconds('CAP · 3+7')).toBeNull();
  });
});

describe('ir por delante o por detrás', () => {
  const durations = [100, 100, 100];
  it('el fantasma avanza por los tramos', () => {
    expect(cumulative(durations)).toEqual([100, 200, 300]);
    expect(ghostPosition(durations, 50)).toMatchObject({ index: 0, frac: 0.5, finished: false });
    expect(ghostPosition(durations, 150)).toMatchObject({ index: 1, frac: 0.5 });
    expect(ghostPosition(durations, 400)).toMatchObject({ finished: true });
  });

  it('con el último tramo cerrado, la diferencia exacta; esperando, al menos lo que ya lleva de ventaja el fantasma', () => {
    expect(liveDelta(durations, [90], 120)).toBe(10); // cerraste el 1 a los 90 s, el fantasma a los 100
    expect(liveDelta(durations, [110], 150)).toBe(-10);
    expect(liveDelta(durations, [90], 230)).toBe(-30); // el fantasma cerró el 2 a los 200 y tú sigues
    expect(liveDelta(durations, [], 40)).toBe(0);
    expect(liveDelta(durations, [90, 190, 280], 280)).toBe(20);
  });

  it('se cuenta en palabras', () => {
    expect(deltaText(11)).toBe('11 s por delante');
    expect(deltaText(-65)).toBe('1:05 por detrás');
    expect(deltaText(1)).toBe('igualado');
  });
});

describe('lo que se guarda y el resumen al cerrar', () => {
  const info: WodTrackInfo = { key: 'bm:x', part: 1, rounds: 1, movements: ['Wall balls', 'Pull-ups', 'Remo'], modes: ['movimiento'], defaultMode: 'movimiento', targetSeconds: null };

  it('los instantes de cierre pasan a segundos por tramo', () => {
    expect(marksToSegments([115, 245, 360])).toEqual([115, 130, 115]);
  });

  it('un WOD terminado guarda todos sus tramos; uno parado antes, solo los hechos y marcado como no terminado', () => {
    const done = buildSplitsRecord({ date: '2026-11-14', info, mode: 'movimiento', marks: [115, 245, 360], totalSeconds: 360, rx: true })!;
    expect(done.segments).toEqual([115, 130, 115]);
    expect(done.labels).toEqual(['Wall balls', 'Pull-ups', 'Remo']);
    expect(done.capped).toBeUndefined();
    const part = buildSplitsRecord({ date: '2026-11-14', info, mode: 'movimiento', marks: [115, 245], totalSeconds: 600, rx: true })!;
    expect(part.capped).toBe(true);
    expect(buildSplitsRecord({ date: '2026-11-14', info, mode: 'movimiento', marks: [], totalSeconds: 10, rx: true })).toBeNull();
  });

  it('compara tramo a tramo con el fantasma y dice dónde se pierde', () => {
    const record = buildSplitsRecord({ date: '2026-11-14', info, mode: 'movimiento', marks: [111, 241, 380], totalSeconds: 380, rx: true })!;
    const ghost = { kind: 'parciales' as const, date: '2026-10-03', durations: [115, 130, 105], totalSeconds: 350, rx: true };
    const s = summarizeGhost(record, ghost);
    expect(s.rows.map((r) => r.delta)).toEqual([4, 0, -34]);
    expect(s.totalDelta).toBe(-30);
    expect(s.outcome).toBe('pierde');
    expect(s.insight).toMatch(/Remo/);
    expect(s.note).toBeNull();
  });

  it('con una marca mejor que la del fantasma, gana; y avisa si uno fue Rx y el otro escalado', () => {
    const record = buildSplitsRecord({ date: '2026-11-14', info, mode: 'movimiento', marks: [100, 200, 300], totalSeconds: 300, rx: false })!;
    const ghost = { kind: 'parciales' as const, durations: [115, 130, 105], totalSeconds: 350, rx: true };
    const s = summarizeGhost(record, ghost);
    expect(s.outcome).toBe('gana');
    expect(s.totalDelta).toBe(50);
    expect(s.note).toMatch(/escalaste/);
  });

  it('sin fantasma solo cuenta los tramos, y por movimientos junta el mismo movimiento de todas las rondas', () => {
    const twoRounds: WodTrackInfo = { ...info, rounds: 2, movements: ['A', 'B'] };
    const record = buildSplitsRecord({ date: '2026-11-14', info: twoRounds, mode: 'movimiento', marks: [30, 90, 120, 180], totalSeconds: 180, rx: true })!;
    const s = summarizeGhost(record, null);
    expect(s.totalDelta).toBeNull();
    expect(s.rows[2].label).toBe('A · R2');
    expect(s.insight).toMatch(/B/);
    // con fantasma, las dos rondas de B suman su pérdida
    const g = { kind: 'parciales' as const, durations: [30, 30, 30, 30], totalSeconds: 120, rx: true };
    expect(summarizeGhost(record, g).insight).toMatch(/B.*(?:más lento)/);
  });

  it('el fantasma estimado a ritmo constante no se pasa por parciales', () => {
    const record = buildSplitsRecord({ date: '2026-11-14', info, mode: 'movimiento', marks: [100, 200, 300], totalSeconds: 300, rx: true })!;
    const est = { kind: 'estimado' as const, durations: [120, 120, 120], totalSeconds: 360, rx: null };
    const s = summarizeGhost(record, est);
    expect(s.ghost?.kind).toBe('estimado');
    expect(s.totalDelta).toBe(60);
    expect(s.note).toBeNull();
  });
});
