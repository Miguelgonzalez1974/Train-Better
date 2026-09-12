import { describe, it, expect } from 'vitest';
import { getNutritionTip } from './nutritionTips';
import type { DailySession } from '../data/athlete/types';

function makeSession(overrides: Partial<DailySession> = {}): DailySession {
  return { date: '2026-01-05', mesocycleWeek: 1, isRestDay: false, blocks: [], ...overrides };
}

describe('getNutritionTip', () => {
  it('null en dia de descanso', () => {
    expect(getNutritionTip(makeSession({ isRestDay: true }))).toBeNull();
  });

  it('null en sesion propia (el atleta escribio la suya)', () => {
    expect(getNutritionTip(makeSession({ source: 'custom' }))).toBeNull();
  });

  it('dia de recuperacion o intensidad baja: consejo suave, sin "durante"', () => {
    const tip = getNutritionTip(makeSession({ energySystem: 'recuperacion' }));
    expect(tip?.during).toBeUndefined();
    const tip2 = getNutritionTip(makeSession({ dayIntensity: 'baja' }));
    expect(tip2?.during).toBeUndefined();
  });

  it('acondicionamiento largo (base-aerobica o foco metcon): trae "durante"', () => {
    const tip = getNutritionTip(makeSession({ energySystem: 'base-aerobica' }));
    expect(tip?.during).toBeTruthy();
    const tip2 = getNutritionTip(makeSession({ dayEmphasis: 'metcon' }));
    expect(tip2?.during).toBeTruthy();
  });

  it('dia de fuerza o potencia: sin "durante", con foco en no ir muy lleno', () => {
    const tip = getNutritionTip(makeSession({ dayEmphasis: 'fuerza' }));
    expect(tip?.during).toBeUndefined();
    expect(tip?.before).toMatch(/hidratado/);
  });

  it('todo consejo trae "antes" y "despues" no vacios', () => {
    const scenarios: Partial<DailySession>[] = [
      {},
      { energySystem: 'potencia' },
      { energySystem: 'umbral' },
      { dayEmphasis: 'fuerza' },
      { dayEmphasis: 'metcon' },
      { dayIntensity: 'alta' },
    ];
    for (const overrides of scenarios) {
      const tip = getNutritionTip(makeSession(overrides));
      expect(tip?.before.length ?? 0, JSON.stringify(overrides)).toBeGreaterThan(0);
      expect(tip?.after.length ?? 0, JSON.stringify(overrides)).toBeGreaterThan(0);
    }
  });
});
