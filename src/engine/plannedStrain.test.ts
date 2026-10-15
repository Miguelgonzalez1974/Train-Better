import { describe, it, expect } from 'vitest';
import { estimatePlannedStrain, planFit } from './plannedStrain';
import type { DailySession, SessionHistoryEntry } from '../data/athlete/types';

const session = (over: Partial<DailySession> = {}): DailySession => ({
  date: '2026-03-18',
  mesocycleWeek: 2,
  isRestDay: false,
  blocks: [
    { block: 'strength', movementId: 'back-squat', sets: 5 },
    { block: 'wod', movementId: 'wod', format: 'AMRAP 12 min' },
  ],
  ...over,
});
const done = (date: string, rpe: number, mesocycleWeek = 2): SessionHistoryEntry => ({ date, mesocycleWeek, movementIds: [], rxOrScaled: 'rx', rpe, durationMin: 60 });

describe('esfuerzo previsto de la sesión', () => {
  it('no hay estimación en descanso, sesión propia o sin bloques', () => {
    expect(estimatePlannedStrain(session({ isRestDay: true }), [])).toBeNull();
    expect(estimatePlannedStrain(session({ source: 'custom' }), [])).toBeNull();
    expect(estimatePlannedStrain(session({ blocks: [] }), [])).toBeNull();
  });

  it('sin historial usa el RPE típico de la semana del bloque', () => {
    expect(estimatePlannedStrain(session({ mesocycleWeek: 2 }), [])?.rpe).toBe(7);
    expect(estimatePlannedStrain(session({ mesocycleWeek: 4 }), [])?.rpe).toBe(5.5);
  });

  it('con historial usa cómo te salen las sesiones de esa semana del bloque', () => {
    const hist = [done('2026-03-02', 8.5), done('2026-03-04', 8.5), done('2026-03-09', 8.5), done('2026-03-10', 4, 1)];
    expect(estimatePlannedStrain(session(), hist)?.rpe).toBe(8.5);
  });

  it('una recuperación activa se estima como un RPE 3, y el día suave o duro ajusta el RPE', () => {
    const recovery = session({ blocks: [{ block: 'wod', movementId: 'air-bike', format: 'RPE 2 · 45 min total' }] });
    expect(estimatePlannedStrain(recovery, [done('2026-03-02', 8.5), done('2026-03-04', 8.5), done('2026-03-09', 8.5)])?.rpe).toBe(3);
    expect(estimatePlannedStrain(session({ dayIntensity: 'baja' }), [])?.rpe).toBe(6.3);
    expect(estimatePlannedStrain(session({ dayIntensity: 'alta' }), [])?.rpe).toBe(7.5);
  });

  it('una sesión más larga o más dura cuesta más esfuerzo; el doble WOD suma RPE', () => {
    const base = estimatePlannedStrain(session(), [])!;
    const longer = estimatePlannedStrain(session({ blocks: [...session().blocks, { block: 'accessory', movementId: 'row', sets: 6 }] }), [])!;
    expect(longer.strain).toBeGreaterThan(base.strain);
    expect(estimatePlannedStrain(session({ doubleWod: true }), [])!.rpe).toBe(base.rpe + 0.5);
  });

  it('compara con el objetivo: avisa si se pasa, y solo avisa de margen si sobra mucho', () => {
    const p = (strain: number) => ({ strain, rpe: 7, minutes: 60 });
    const target = { low: 50, high: 70 };
    expect(planFit(p(60), target).fit).toBe('dentro');
    expect(planFit(p(73), target).fit).toBe('dentro'); // dentro del margen de 3
    expect(planFit(p(78), target)).toEqual({ fit: 'se-pasa', diff: 8 });
    expect(planFit(p(45), target).fit).toBe('dentro');
    expect(planFit(p(38), target)).toEqual({ fit: 'se-queda-corta', diff: 12 });
  });
});
