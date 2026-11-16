import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult, SessionHistoryEntry } from '../data/athlete/types';
import { toHistoryEntry } from './generateSession';
import { capProgressText, wodDoneInfos } from './wodDone';

const wod = (): SessionBlockResult[] => [
  { block: 'wod', movementId: 'row', reps: '200m', format: 'For Time (5 rondas)' },
  { block: 'wod', movementId: 'kipping-pull-up', reps: '10', format: 'For Time (5 rondas)' },
];
const session = (date: string): DailySession => ({ date, mesocycleWeek: 1, isRestDay: false, blocks: wod() });
const entry = (date: string, value: string, extra: Partial<SessionHistoryEntry['wodResult']> = {}, rx: 'rx' | 'scaled' = 'rx'): SessionHistoryEntry =>
  toHistoryEntry(session(date), rx, 8, 60, { scoreType: 'time', value, ...extra });

describe('el pie del WOD de una sesión hecha', () => {
  it('sin una marca anterior enseña el resultado y Rx, sin comparación ni «mejor marca»', () => {
    const e = entry('2026-11-16', '14:30');
    const info = wodDoneInfos(session('2026-11-16'), e, [e])[1]!;
    expect(info).toMatchObject({ value: '14:30', rx: true, best: false, versus: null, capped: false });
  });

  it('batir tu mejor marca anterior da «mejor marca» y los segundos de ventaja con su fecha', () => {
    const old = entry('2026-11-10', '15:10');
    const e = entry('2026-11-16', '14:30');
    const info = wodDoneInfos(session('2026-11-16'), e, [old, e])[1]!;
    expect(info.best).toBe(true);
    expect(info.versus).toEqual({ delta: 40, date: '2026-11-10', outcome: 'gana' });
  });

  it('ir más lento que tu mejor marca la enseña por detrás y sin «mejor marca»; cerca es empate', () => {
    const a = entry('2026-11-03', '14:00');
    const b = entry('2026-11-16', '14:30');
    expect(wodDoneInfos(session('2026-11-16'), b, [a, b])[1]).toMatchObject({ best: false, versus: { delta: -30, outcome: 'pierde' } });
    const c = entry('2026-11-16', '14:01');
    expect(wodDoneInfos(session('2026-11-16'), c, [a, c])[1]!.versus!.outcome).toBe('empata');
  });

  it('un WOD parado en el cap enseña su resultado pero no se compara, y el escalado se nota', () => {
    const a = entry('2026-11-03', '14:00');
    const e = entry('2026-11-16', 'CAP · 3+7', { capped: true }, 'scaled');
    const info = wodDoneInfos(session('2026-11-16'), e, [a, e])[1]!;
    expect(info).toMatchObject({ value: 'CAP · 3+7', capped: true, rx: false, best: false, versus: null });
  });

  it('un WOD parado en el cap lleva los segundos del cap, y lo hecho se dice en palabras', () => {
    const e = entry('2026-11-16', 'CAP · 6', { capped: true, capSeconds: 1200 });
    expect(wodDoneInfos(session('2026-11-16'), e, [e])[1]!.capSeconds).toBe(1200);
    expect(capProgressText('CAP · 6')).toBe('6 rondas');
    expect(capProgressText('CAP · 1')).toBe('1 ronda');
    expect(capProgressText('CAP · 3+7')).toBe('3 rondas + 7 reps');
    expect(capProgressText('CAP · 40 reps')).toBe('40 reps');
    expect(capProgressText('CAP')).toBe('Sin acabar');
  });

  it('una sesión sin resultado anotado no enseña nada', () => {
    const e = toHistoryEntry(session('2026-11-16'), 'rx', 8, 60);
    expect(wodDoneInfos(session('2026-11-16'), e, [e])).toEqual({});
  });
});
