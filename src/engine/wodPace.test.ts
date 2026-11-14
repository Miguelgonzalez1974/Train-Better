import { describe, expect, it } from 'vitest';
import type { WodSplitsRecord } from '../data/athlete/types';
import { paceGhost, paceTip, roundTimes } from './wodPace';
import type { WodTrackInfo } from './wodGhost';

const info = (extra: Partial<WodTrackInfo> = {}): WodTrackInfo => ({
  key: 'gen:wod',
  part: 1,
  rounds: 10,
  movements: ['Row', 'Kipping Pull-Up', 'Ring Dip'],
  modes: ['ronda', 'movimiento'],
  defaultMode: 'ronda',
  targetSeconds: null,
  ...extra,
});
const rec = (date: string, segments: number[], extra: Partial<WodSplitsRecord> = {}): WodSplitsRecord => ({
  date,
  part: 1,
  key: 'gen:wod',
  mode: 'ronda',
  labels: [],
  segments,
  totalSeconds: segments.reduce((a, b) => a + b, 0),
  rx: true,
  ...extra,
});
// Sale a ~1:52 y acaba a ~2:31: la forma típica de quien arranca fuerte.
const fading = [112, 115, 118, 122, 127, 134, 141, 146, 148, 151];
const flat = [125, 124, 126, 125, 125, 126, 124, 125, 125, 126];

describe('tiempos por ronda de una marca', () => {
  it('por rondas son los tramos; por movimientos, la suma de cada vuelta; y solo si salen las rondas pedidas', () => {
    expect(roundTimes(rec('2026-11-01', [10, 20, 30]), 3)).toEqual([10, 20, 30]);
    expect(roundTimes(rec('2026-11-01', [10, 20, 30]), 4)).toBeNull();
    const byMove = rec('2026-11-01', [1, 2, 3, 4, 5, 6], { mode: 'movimiento', labels: ['A', 'B', 'C'] });
    expect(roundTimes(byMove, 2)).toEqual([6, 15]);
    expect(roundTimes(byMove, 3)).toBeNull();
  });
});

describe('pauta de ritmo de Rex', () => {
  const today = '2026-11-14';
  const ghosts = [rec('2026-10-20', fading), rec('2026-10-27', fading.map((s) => s + 2)), rec('2026-11-03', fading.map((s) => s - 2))];

  it('si sueles salir fuerte y hundirte, propone un ritmo entre tu salida y tu media y lo que tardarías', () => {
    const tip = paceTip({ info: info(), todayIso: today, history: [], ghosts })!;
    expect(tip).not.toBeNull();
    expect(tip.samples).toBe(3);
    expect(tip.opening).toBe(114);
    expect(tip.closing).toBe(150);
    expect(tip.basis).toBe('marcas');
    // Entre lo que ya sales y lo que haces de media, nunca más rápido que tu salida.
    expect(tip.pace).toBeGreaterThan(tip.opening);
    expect(tip.pace).toBeLessThan(131);
    expect(tip.pace % 5).toBe(0);
    expect(tip.projectedTotal).toBe(tip.pace * 10);
    expect(tip.lastDate).toBe('2026-11-03');
  });

  it('dice cuánto mejoraría tu mejor marca del mismo WOD, y solo si la mejora es clara', () => {
    const tip = paceTip({ info: info(), todayIso: today, history: [], ghosts })!;
    const best = Math.min(...ghosts.map((g) => g.totalSeconds));
    expect(tip.vsBest).toBe(best - tip.projectedTotal);
    // Con un ritmo ya regular que casi no cambia el total, no hay mejora que contar.
    const near = paceTip({ info: info(), todayIso: today, history: [], ghosts: ghosts.map((g, i) => rec(g.date, i === 0 ? fading.map((s) => s - 3) : fading)) })!;
    expect(near.vsBest === null || near.vsBest >= 10).toBe(true);
  });

  it('se calla sin base: pocos WODs, pocas rondas o un ritmo ya regular', () => {
    expect(paceTip({ info: info(), todayIso: today, history: [], ghosts: ghosts.slice(0, 1) })).toBeNull();
    expect(paceTip({ info: info({ rounds: 3 }), todayIso: today, history: [], ghosts: ghosts.map((g) => rec(g.date, [100, 120, 150])) })).toBeNull();
    expect(paceTip({ info: info(), todayIso: today, history: [], ghosts: ghosts.map((g) => rec(g.date, flat)) })).toBeNull();
    // Solo uno de los dos que se hunden: no es un patrón.
    expect(paceTip({ info: info(), todayIso: today, history: [], ghosts: [rec('2026-11-01', fading), rec('2026-11-02', flat)] })).toBeNull();
  });

  it('no cuenta lo de hoy ni lo que no se terminó, y lee también las marcas por movimientos', () => {
    expect(paceTip({ info: info(), todayIso: today, history: [], ghosts: [...ghosts.slice(0, 1), rec('2026-11-14', fading), rec('2026-11-01', fading, { capped: true })] })).toBeNull();
    const byMove = (date: string) => rec(date, fading.flatMap((s) => [s * 0.5, s * 0.3, s * 0.2]), { mode: 'movimiento', labels: ['Row', 'Kipping Pull-Up', 'Ring Dip'] });
    const tip = paceTip({ info: info(), todayIso: today, history: [], ghosts: [byMove('2026-11-01'), byMove('2026-11-02')] });
    expect(tip).not.toBeNull();
  });

  it('con otro WOD de las mismas rondas se ata al objetivo del coach, y si ese ritmo no se parece al tuyo, no propone nada', () => {
    const other = ghosts.map((g) => ({ ...g, key: 'otro' }));
    const tip = paceTip({ info: info({ targetSeconds: 1300 }), todayIso: today, history: [], ghosts: other })!;
    expect(tip.basis).toBe('objetivo');
    expect(tip.vsBest).toBeNull();
    expect(paceTip({ info: info({ targetSeconds: null }), todayIso: today, history: [], ghosts: other })).toBeNull();
    // 130 s/ronda frente a 60 s/ronda de objetivo: no son comparables.
    expect(paceTip({ info: info({ targetSeconds: 600 }), todayIso: today, history: [], ghosts: other })).toBeNull();
  });

  it('el fantasma de pauta reparte el ritmo constante entre los tramos de la forma de cronometrar', () => {
    const byRound = paceGhost(125, info(), 'ronda');
    expect(byRound.kind).toBe('pauta');
    expect(byRound.durations).toHaveLength(10);
    expect(byRound.totalSeconds).toBe(1250);
    expect(byRound.durations.every((d) => d === 125)).toBe(true);
    const byMove = paceGhost(125, info(), 'movimiento');
    expect(byMove.durations).toHaveLength(30);
    expect(byMove.totalSeconds).toBe(1250);
  });
});
