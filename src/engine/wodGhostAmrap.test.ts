import { describe, expect, it } from 'vitest';
import type { DailySession, SessionHistoryEntry, WodSplitsRecord } from '../data/athlete/types';
import { amrapDeltaText, amrapFamily, amrapPaceInsight, amrapStanding, buildSplitsRecord, pickGhost, summarizeGhost, wodTrackInfo, type WodTrackInfo } from './wodGhost';
import { wodCapFor } from './wodCap';
import { getWodScoreType } from './wodScoring';

const wod = (blocks: Partial<DailySession['blocks'][number]>[]): DailySession => ({
  date: '2026-11-19',
  mesocycleWeek: 1,
  isRestDay: false,
  blocks: blocks.map((b) => ({ block: 'wod', movementId: 'thruster', ...b })) as DailySession['blocks'],
});
const amrapSession = (format = 'AMRAP 12 min') => wod([{ movementId: 'thruster', format, reps: '10' }, { movementId: 'burpee', format, reps: '10' }]);
/** La recuperación activa tal como la genera el coach: bici y un corte durante 45 minutos. */
const recovery = (cut = 'row') =>
  wod([
    { movementId: 'air-bike', format: 'RPE 2 · 45 min total', reps: '45 min total', title: 'Recuperación activa' },
    { movementId: cut, format: 'RPE 2 · 45 min total', reps: '500m', title: 'Recuperación activa' },
  ]);
const entry = (date: string, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 8, durationMin: 60, ...extra });
const infoOf = (s: DailySession) => wodTrackInfo(s, 1, getWodScoreType(s, 1), wodCapFor(s, 1))!;
const record = (date: string, info: WodTrackInfo, segments: number[], extra: Partial<WodSplitsRecord> = {}): WodSplitsRecord => ({
  date,
  part: 1,
  key: info.key,
  mode: 'ronda',
  labels: [],
  segments,
  totalSeconds: segments.reduce((a, b) => a + b, 0),
  rx: true,
  amrap: true,
  ...(info.family ? { family: info.family } : {}),
  ...extra,
});

describe('la recuperación activa se cronometra como un AMRAP de 45 minutos', () => {
  it('«RPE 2 · 45 min total» se puntúa por rondas y el reloj tiene un tope de 45 min (fin del AMRAP)', () => {
    const s = recovery();
    expect(getWodScoreType(s, 1)).toBe('rounds+reps');
    expect(wodCapFor(s, 1)).toEqual({ seconds: 45 * 60, kind: 'amrap' });
    const info = infoOf(s);
    expect(info.kind).toBe('amrap');
    expect(info.capSeconds).toBe(2700);
    expect(info.family).toBe('amrap|45|rec');
  });

  it('un AMRAP normal también: tramos = rondas, sin total fijo, y su familia es su duración', () => {
    const info = infoOf(amrapSession());
    expect(info.kind).toBe('amrap');
    expect(info.modes).toEqual(['ronda']);
    expect(info.capSeconds).toBe(720);
    expect(info.family).toBe('amrap|12');
  });

  it('sin saber que es un AMRAP (sin límite) o con un WOD por tiempo, nada cambia', () => {
    expect(wodTrackInfo(amrapSession(), 1, 'rounds+reps')).toBeNull();
    expect(amrapFamily(null, undefined)).toBe('amrap|x');
  });
});

describe('el fantasma de un AMRAP', () => {
  const info = infoOf(recovery());

  it('el mismo WOD exacto: tu mejor vez (la de más rondas); con las mismas, la más rápida', () => {
    const exactRecs = [record('2026-11-01', info, [300, 310, 320, 330]), record('2026-11-08', info, [280, 290, 300, 310, 320]), record('2026-11-10', info, [270, 280, 290, 300, 310])];
    const g = pickGhost({ info, mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: exactRecs })!;
    expect(g.kind).toBe('parciales');
    expect(g.durations).toHaveLength(5);
    expect(g.date).toBe('2026-11-10'); // 5 rondas más rápidas que las del día 8
    expect(g.approx).toBeUndefined();
  });

  it('con otros movimientos (WOD generado distinto) usa tu última vez de la misma familia, y lo dice', () => {
    const other = infoOf(recovery('ski-erg'));
    expect(other.key).not.toBe(info.key);
    const g = pickGhost({ info, mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: [record('2026-11-12', other, [300, 310, 320, 330, 340, 350])] })!;
    expect(g.kind).toBe('parciales');
    expect(g.approx).toBe(true);
    expect(g.durations).toHaveLength(6);
  });

  it('otra duración u otra clase de AMRAP no sirve (no es de la familia)', () => {
    const cindy = infoOf(amrapSession('AMRAP 20 min'));
    const g = pickGhost({ info, mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: [record('2026-11-12', cindy, [100, 100, 100])] });
    expect(g).toBeNull();
  });

  it('un registro de un WOD por tiempo nunca es el fantasma de un AMRAP', () => {
    const ghosts: WodSplitsRecord[] = [{ date: '2026-11-12', part: 1, key: info.key, mode: 'ronda', labels: [], segments: [100, 100, 100], totalSeconds: 300, rx: true }];
    expect(pickGhost({ info, mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts })).toBeNull();
  });

  it('sin parciales: las rondas que anotaste en este WOD, a ritmo constante durante el AMRAP', () => {
    const s = amrapSession();
    const i = infoOf(s);
    const history = [entry('2026-11-05', { movementIds: [], wodResult: { scoreType: 'rounds+reps', value: '6+4' }, wodBlocks: s.blocks } as Partial<SessionHistoryEntry>)];
    const g = pickGhost({ info: i, mode: 'ronda', todayIso: '2026-11-19', history, ghosts: [] })!;
    expect(g.kind).toBe('marca');
    expect(g.durations).toHaveLength(6);
    expect(g.totalSeconds).toBe(720);
  });

  it('sin nada anterior, el objetivo de rondas del coach; y si tampoco hay, ninguno', () => {
    const s = amrapSession();
    s.blocks[0].wodTarget = { scoreType: 'rounds+reps', unit: 'rounds', low: 5, high: 7, display: '~5-7 rondas' };
    const g = pickGhost({ info: infoOf(s), mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: [] })!;
    expect(g.kind).toBe('estimado');
    expect(g.durations).toHaveLength(6);
    expect(pickGhost({ info: infoOf(amrapSession()), mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: [] })).toBeNull();
  });
});

describe('un WOD por tiempo también usa la familia: mismas rondas aunque cambien los movimientos', () => {
  const timed = (m1: string, m2: string) => wod([{ movementId: m1, format: 'For Time (3 rondas)', reps: '10' }, { movementId: m2, format: 'For Time (3 rondas)', reps: '10' }]);
  it('si el exacto no existe, tus parciales de otro «3 rondas por tiempo» como referencia aproximada', () => {
    const a = timed('thruster', 'burpee');
    const b = timed('box-jump', 'strict-pull-up');
    const ia = wodTrackInfo(a, 1, 'time')!;
    const ib = wodTrackInfo(b, 1, 'time')!;
    expect(ia.family).toBe('time|3r');
    expect(ia.key).not.toBe(ib.key);
    const past = buildSplitsRecord({ date: '2026-11-10', info: ib, mode: 'ronda', marks: [200, 410, 600], totalSeconds: 600, rx: true })!;
    expect(past.family).toBe('time|3r');
    const g = pickGhost({ info: ia, mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: [past] })!;
    expect(g.kind).toBe('parciales');
    expect(g.approx).toBe(true);
    // El exacto, si existe, gana al parecido.
    const exact = buildSplitsRecord({ date: '2026-11-12', info: ia, mode: 'ronda', marks: [220, 440, 700], totalSeconds: 700, rx: true })!;
    expect(pickGhost({ info: ia, mode: 'ronda', todayIso: '2026-11-19', history: [], ghosts: [past, exact] })!.approx).toBeUndefined();
  });
});

describe('guardar y comparar un AMRAP', () => {
  const info = infoOf(recovery());

  it('el registro lleva cada ronda, es de AMRAP y su familia, y nunca queda «sin terminar»', () => {
    const r = buildSplitsRecord({ date: '2026-11-19', info, mode: 'ronda', marks: [300, 610, 930], totalSeconds: 2700, rx: true })!;
    expect(r.amrap).toBe(true);
    expect(r.segments).toEqual([300, 310, 320]);
    expect(r.family).toBe('amrap|45|rec');
    expect(r.capped).toBeUndefined();
    expect(buildSplitsRecord({ date: '2026-11-19', info, mode: 'ronda', marks: [], totalSeconds: 100, rx: true })).toBeNull();
  });

  it('más rondas que el fantasma gana; menos pierde; con las mismas, el tiempo', () => {
    const ghost = { kind: 'parciales' as const, durations: [300, 300, 300, 300], totalSeconds: 1200, rx: true };
    const more = summarizeGhost(record('2026-11-19', info, [290, 290, 290, 290, 290]), ghost);
    expect(more.amrap).toEqual({ rounds: 5, ghostRounds: 4, roundsDiff: 1 });
    expect(more.outcome).toBe('gana');
    const less = summarizeGhost(record('2026-11-19', info, [300, 300, 300]), ghost);
    expect(less.outcome).toBe('pierde');
    const same = summarizeGhost(record('2026-11-19', info, [280, 290, 295, 295]), ghost);
    expect(same.outcome).toBe('gana');
    expect(same.totalDelta).toBe(40);
    expect(summarizeGhost(record('2026-11-19', info, [300, 300, 300, 300]), ghost).outcome).toBe('empata');
    expect(more.rows[0].delta).toBe(10);
    expect(more.rows[4].delta).toBeNull(); // la ronda 5 no la hizo el fantasma
  });

  it('sin fantasma solo cuenta las rondas; con uno aproximado lo avisa', () => {
    const none = summarizeGhost(record('2026-11-19', info, [300, 300, 300]), null);
    expect(none.outcome).toBeNull();
    expect(none.amrap).toEqual({ rounds: 3, ghostRounds: null, roundsDiff: null });
    const approx = summarizeGhost(record('2026-11-19', info, [300, 300, 300]), { kind: 'parciales', durations: [300, 300, 300], totalSeconds: 900, rx: true, approx: true });
    expect(approx.note).toContain('aproximada');
  });
});

describe('cómo vas en directo en un AMRAP', () => {
  it('con rondas del fantasma por delante, la diferencia es de tiempo; si las superas, cuentas rondas', () => {
    const durations = [300, 300, 300];
    expect(amrapDeltaText(amrapStanding(durations, [280], 290))).toBe('20 s por delante');
    expect(amrapDeltaText(amrapStanding(durations, [310], 320))).toBe('10 s por detrás');
    expect(amrapDeltaText(amrapStanding(durations, [280, 560, 840, 1100], 1150))).toBe('+1 ronda sobre el fantasma');
    expect(amrapDeltaText(amrapStanding(durations, [280, 560, 840, 1100, 1300], 1310))).toBe('+2 rondas sobre el fantasma');
  });
});

describe('el ritmo de un AMRAP', () => {
  it('constante, con caída o acabando más rápido; con menos de 4 rondas no dice nada', () => {
    expect(amrapPaceInsight([300, 300, 300])).toBeNull();
    expect(amrapPaceInsight([300, 305, 300, 310])).toContain('Ritmo constante');
    expect(amrapPaceInsight([300, 300, 360, 400])).toContain('cayó');
    expect(amrapPaceInsight([400, 380, 330, 300])).toContain('más rápido que empezaste');
  });
});
