import { describe, expect, it } from 'vitest';
import type { Goal } from '../data/athlete/types';
import { competitionTile, rpeTrend, topRiser } from './analysisStats';

const goal = (targetDate: string, over: Partial<Goal> = {}): Goal => ({ id: 'g', type: 'preparar-competicion', targetDate, emphasis: 'equilibrado', createdAt: '2026-01-01', ...over }) as Goal;

describe('levantamiento que más ha subido', () => {
  it('elige el de mayor mejora relativa, no el de más kilos', () => {
    const prLog = [
      { date: '2026-01-01', key: 'backSquat', kg: 100 },
      { date: '2026-06-01', key: 'backSquat', kg: 120 },
      { date: '2026-01-01', key: 'snatch', kg: 60 },
      { date: '2026-06-01', key: 'snatch', kg: 75 },
    ];
    expect(topRiser(prLog, ['backSquat', 'snatch'])).toEqual({ key: 'snatch', deltaPct: 25 });
  });

  it('si nada ha subido (o solo hay un test), null', () => {
    expect(topRiser([{ date: '2026-01-01', key: 'snatch', kg: 60 }], ['snatch'])).toBeNull();
    const flat = [
      { date: '2026-01-01', key: 'snatch', kg: 60 },
      { date: '2026-06-01', key: 'snatch', kg: 58 },
    ];
    expect(topRiser(flat, ['snatch'])).toBeNull();
  });
});

describe('RPE de la semana frente al mes', () => {
  it('más duro, más suave o igual, con 0,3 de margen', () => {
    expect(rpeTrend(6.8, 6.3)).toBe('duro');
    expect(rpeTrend(5.9, 6.3)).toBe('suave');
    expect(rpeTrend(6.4, 6.3)).toBe('igual');
  });

  it('sin sesiones esta semana o este mes, null', () => {
    expect(rpeTrend(null, 6.3)).toBeNull();
    expect(rpeTrend(6.3, null)).toBeNull();
  });
});

describe('cuenta atrás de la competición', () => {
  const goals = [goal('2026-11-06', { eventEndDate: '2026-11-07' })];

  it('dentro de la ventana de fases dice los días y la fase', () => {
    expect(competitionTile(goals, new Date('2026-10-22T12:00:00'), 5)).toEqual({ value: '15 d', word: 'pico', close: false });
    expect(competitionTile(goals, new Date('2026-10-30T12:00:00'), 5)).toEqual({ value: '7 d', word: 'taper', close: true });
  });

  it('el día de la competición dice Hoy y después Post', () => {
    expect(competitionTile(goals, new Date('2026-11-07T12:00:00'), 5)?.value).toBe('Hoy');
    expect(competitionTile(goals, new Date('2026-11-09T12:00:00'), 5)?.value).toBe('Post');
  });

  it('todavía lejos, solo los días que faltan', () => {
    expect(competitionTile(goals, new Date('2026-09-01T12:00:00'), 5)).toEqual({ value: '66 d', word: 'por delante', close: false });
  });

  it('sin competición o ya pasada, null', () => {
    expect(competitionTile([], new Date('2026-10-22T12:00:00'), 5)).toBeNull();
    expect(competitionTile(undefined, new Date('2026-10-22T12:00:00'), 5)).toBeNull();
    expect(competitionTile(goals, new Date('2026-12-20T12:00:00'), 5)).toBeNull();
  });
});
