import { describe, expect, it } from 'vitest';
import type { Goal, PrLogEntry } from '../data/athlete/types';
import { goalPrKey, goalTargetStatus, liftRatePerWeek, normalizeKgTarget, suggestedTargets, supportsKgTarget, targetFeedback } from './goalTarget';
import { getGoalProgress, isGoalBehindSchedule, targetKgProgress } from './goalProgress';

const goal = (extra: Partial<Goal> = {}): Goal => ({ id: 'g', type: 'subir-pr', movementId: 'back-squat', targetDate: '2027-03-15', emphasis: 'moderado', createdAt: '2026-11-10', targetKg: 190, startKg: 170, ...extra });
const log = (...points: [string, number][]): PrLogEntry[] => points.map(([date, kg]) => ({ date, key: 'backSquat', kg }));
const TODAY = new Date('2026-12-22T12:00:00');

describe('que objetivos admiten meta en kilos', () => {
  it('fuerza y oly con un levantamiento que tiene marca; el resto, no', () => {
    expect(supportsKgTarget(goal())).toBe(true);
    expect(supportsKgTarget(goal({ type: 'mejorar-potencia', movementId: 'snatch' }))).toBe(true);
    expect(supportsKgTarget(goal({ movementId: undefined }))).toBe(false);
    expect(supportsKgTarget(goal({ type: 'elevar-resistencia', movementId: undefined }))).toBe(false);
    expect(supportsKgTarget(goal({ type: 'preparar-competicion', movementId: undefined }))).toBe(false);
    expect(goalPrKey(goal())).toBe('backSquat');
  });

  it('las metas que propone Rex son un 3, 6 y 10 % mas, a multiplos de 2,5 kg', () => {
    expect(suggestedTargets(170)).toEqual([175, 180, 187.5]);
    // con marcas bajas siempre al menos 2,5 kg mas
    for (const kg of suggestedTargets(40)) expect(kg).toBeGreaterThanOrEqual(42.5);
  });
});

describe('ritmo real de subida', () => {
  it('kilos por semana entre la primera y la ultima marca de las ultimas 12 semanas', () => {
    expect(liftRatePerWeek(log(['2026-10-27', 167.5], ['2026-12-22', 175]), 'backSquat', '2026-12-22')).toBeCloseTo(0.94, 2);
  });

  it('sin marcas suficientes (menos de 2, o menos de 3 semanas entre ellas) no hay ritmo', () => {
    expect(liftRatePerWeek(log(['2026-12-01', 170]), 'backSquat', '2026-12-22')).toBeNull();
    expect(liftRatePerWeek(log(['2026-12-10', 170], ['2026-12-22', 175]), 'backSquat', '2026-12-22')).toBeNull();
    expect(liftRatePerWeek(undefined, 'backSquat', '2026-12-22')).toBeNull();
  });

  it('las marcas de hace mas de 12 semanas no cuentan', () => {
    expect(liftRatePerWeek(log(['2026-06-01', 120], ['2026-12-20', 170]), 'backSquat', '2026-12-22')).toBeNull();
  });
});

describe('estado de la meta', () => {
  const prs = { backSquat: 175 };

  it('va al dia cuando a tu ritmo llegas', () => {
    const s = goalTargetStatus(goal(), prs, log(['2026-10-27', 165], ['2026-12-22', 175]), TODAY)!;
    expect(s.kind).toBe('va-al-dia');
    expect(s.rateKnown).toBe(true);
    expect(s.remainingKg).toBe(15);
    expect(s.projectedKg).toBeGreaterThanOrEqual(187.5);
  });

  it('va por detras cuando a tu ritmo no llegas pero se puede', () => {
    const s = goalTargetStatus(goal(), prs, log(['2026-10-27', 167.5], ['2026-12-22', 175]), TODAY)!;
    expect(s.kind).toBe('va-por-detras');
    expect(s.neededPerWeek).toBeGreaterThan(s.actualPerWeek);
  });

  it('ambiciosa cuando hace falta mas del doble de tu ritmo', () => {
    expect(goalTargetStatus(goal({ targetKg: 200 }), prs, log(['2026-10-27', 167.5], ['2026-12-22', 175]), TODAY)!.kind).toBe('ambiciosa');
  });

  it('conseguida cuando la marca ya llega', () => {
    expect(goalTargetStatus(goal(), { backSquat: 190 }, undefined, TODAY)!.kind).toBe('conseguida');
  });

  it('sin marcas suficientes usa un ritmo tipico, lo dice, y mide contra la linea desde la salida', () => {
    const s = goalTargetStatus(goal(), prs, undefined, TODAY)!;
    expect(s.rateKnown).toBe(false);
    expect(s.actualPerWeek).toBeCloseTo(0.9, 1);
    // 175 kg frente a unos 176,5 esperables hoy: dentro del margen, va al dia
    expect(s.kind).toBe('va-al-dia');
    expect(goalTargetStatus(goal(), { backSquat: 171 }, undefined, TODAY)!.kind).not.toBe('va-al-dia');
  });

  it('sin meta, sin marca actual o de un levantamiento que no se mide, no hay estado', () => {
    expect(goalTargetStatus(goal({ targetKg: undefined }), prs, undefined, TODAY)).toBeNull();
    expect(goalTargetStatus(goal(), {}, undefined, TODAY)).toBeNull();
    expect(goalTargetStatus(goal({ type: 'elevar-resistencia', movementId: undefined }), prs, undefined, TODAY)).toBeNull();
  });

  it('el texto de Rex dice cuanto hay que subir, el ritmo y donde llegarias', () => {
    const s = goalTargetStatus(goal({ targetKg: 200 }), prs, log(['2026-10-27', 167.5], ['2026-12-22', 175]), TODAY)!;
    const text = targetFeedback(s, '15 mar');
    expect(text).toContain('15 mar');
    expect(text).toContain('por semana');
    expect(text).toContain('ambiciosa');
  });
});

describe('el avance en kilos manda sobre el tiempo', () => {
  it('lo recorrido de la salida a la meta, entre 0 y 1', () => {
    expect(targetKgProgress(goal(), { backSquat: 180 })).toBe(0.5);
    expect(targetKgProgress(goal(), { backSquat: 160 })).toBe(0);
    expect(targetKgProgress(goal(), { backSquat: 200 })).toBe(1);
    expect(targetKgProgress(goal({ targetKg: undefined }), { backSquat: 180 })).toBeNull();
    expect(targetKgProgress(goal({ startKg: undefined }), { backSquat: 180 })).toBeNull();
  });

  it('el objetivo va por detras si los kilos van por debajo de la linea del tiempo, y no sin meta en kilos', () => {
    // a 6 semanas de 18 (un tercio), solo llevas 1 kg de 20: por detras
    expect(isGoalBehindSchedule(goal(), [], TODAY, { backSquat: 171 })).toBe(true);
    expect(isGoalBehindSchedule(goal(), [], TODAY, { backSquat: 177 })).toBe(false);
    // con los kilos por delante del tiempo, el avance sube
    expect(getGoalProgress(goal(), [], TODAY, { backSquat: 188 })).toBeGreaterThan(0.85);
  });
});

describe('guardar la meta', () => {
  const prs = { backSquat: 175 };
  it('con meta, el punto de partida es la marca de ahora y se conserva mientras la meta siga en el mismo levantamiento', () => {
    expect(normalizeKgTarget(goal({ startKg: undefined }), prs).startKg).toBe(175);
    expect(normalizeKgTarget(goal({ targetKg: 195 }), prs, goal({ startKg: 170 })).startKg).toBe(170);
    expect(normalizeKgTarget(goal({ movementId: 'bench-press', startKg: undefined }), { benchPress: 110 }, goal({ startKg: 170 })).startKg).toBe(110);
  });

  it('sin meta, o sin marca de la que partir, no se guarda ninguna de las dos', () => {
    const none = normalizeKgTarget(goal({ targetKg: undefined, startKg: 170 }), prs);
    expect(none.targetKg).toBeUndefined();
    expect(none.startKg).toBeUndefined();
    expect(normalizeKgTarget(goal(), {}).targetKg).toBeUndefined();
  });
});