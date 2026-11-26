import { describe, expect, it } from 'vitest';
import type { AthleteProfile, CompanionLogEntry, ReadinessCheck, SessionHistoryEntry } from '../../data/athlete/types';
import { withCompanionLoad } from '../../engine/companionLoad';
import { computeAcwr } from '../../engine/loadMetrics';
import { makeProfile } from '../../engine/__fixtures';
import { loadHistoryFor, readinessAt } from '../../engine/readinessAt';
import { readinessLastDays } from '../../engine/readinessTrend';
import { buildStrainTarget } from '../../engine/strainTarget';
import { learnStrain } from '../../engine/strainLearning';
import { buildPastDayView, buildReadinessSeries, buildTrendPoints } from './pastDay';

/**
 * La preparación de un día sale igual por todos los caminos (Dashboard, día pasado, gráficas, objetivo del día, tendencia), con o sin
 * la carga del programa de fuerza ya sumada, y cuenta los días en los que solo se hizo ese programa.
 */

const TODAY = '2026-11-22';
const iso = (back: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const noon = (s: string) => new Date(`${s}T12:00:00`);

/** 28 días de historial, salvo los días 3 y 5 (solo hiciste el programa de fuerza), con check-in de hoy y de la semana. */
function scenario(withProgramOnlyDays: boolean): { profile: AthleteProfile; history: SessionHistoryEntry[] } {
  const skip = new Set([3, 5]);
  const history: SessionHistoryEntry[] = Array.from({ length: 28 }, (_, i) => i + 1)
    .filter((back) => !skip.has(back))
    .map((back) => ({ date: iso(back), mesocycleWeek: 1, movementIds: ['back-squat'], rxOrScaled: 'rx' as const, rpe: 6, durationMin: 40 }));
  const companionLog: CompanionLogEntry[] = [3, 5, 8, 9].map((back, i) => ({ id: `p|${i}`, programId: 'p', index: i, date: iso(back), outcome: 'hecha' as const, rpe: 9, durationMin: 90 }));
  const readinessLog: ReadinessCheck[] = Array.from({ length: 8 }, (_, i) => ({ date: iso(i), sleep: 'bien' as const, soreness: 'ninguno' as const, stress: 'bajo' as const, motivation: 'alta' as const, overall: 'bien' as const }));
  return { profile: { ...makeProfile(), readinessLog, ...(withProgramOnlyDays ? { companionLog } : {}) }, history };
}

describe('una sola preparación', () => {
  const { profile, history } = scenario(true);
  const yesterday = iso(1);

  it('da lo mismo con el historial crudo que con la carga ya sumada (sumar dos veces no duplica)', () => {
    const raw = readinessAt(profile, history, noon(TODAY)).total;
    const once = readinessAt(profile, withCompanionLoad(history, profile.companionLog), noon(TODAY)).total;
    const full = readinessAt(profile, loadHistoryFor(profile, history), noon(TODAY)).total;
    expect(raw).not.toBeNull();
    expect(once).toBe(raw);
    expect(full).toBe(raw);
  });

  it('los días en los que solo hiciste el programa de fuerza cuentan como carga', () => {
    const { profile: bare, history: sameHistory } = scenario(false);
    const withProgram = readinessAt(profile, history, noon(TODAY)).total!;
    const without = readinessAt(bare, sameHistory, noon(TODAY)).total!;
    expect(withProgram).toBeLessThan(without);
    // Y entran en la carga acumulada (un día de solo programa tiene su propia entrada, sin movimientos).
    const load = loadHistoryFor(profile, history);
    expect(load.find((h) => h.date === iso(3))).toMatchObject({ movementIds: [], durationMin: 90, rpe: 9 });
    expect(computeAcwr(load, noon(TODAY)).acwr).not.toBe(computeAcwr(history, noon(TODAY)).acwr);
  });

  it('el objetivo de esfuerzo, la tendencia, la gráfica y el día pasado usan la misma nota que el Dashboard', () => {
    const expected = readinessAt(profile, history, noon(yesterday)).total;
    expect(expected).not.toBeNull();

    expect(buildStrainTarget(profile, history, yesterday).readiness).toBe(expected);
    expect(buildStrainTarget(profile, loadHistoryFor(profile, history), yesterday).readiness).toBe(expected);
    expect(readinessLastDays(profile, history, yesterday, 1)[0]).toBe(expected);
    expect(buildReadinessSeries(profile, history, yesterday, 1)[0].total).toBe(expected);
    expect(buildPastDayView(profile, history, yesterday, learnStrain(profile, history, yesterday)).readiness.total).toBe(expected);
    expect(buildTrendPoints(profile, history, yesterday, TODAY, 3).find((p) => p.iso === yesterday)?.readiness).toBe(expected);
  });

  it('un día pasado de solo programa de fuerza tiene su esfuerzo', () => {
    const day = iso(3);
    expect(history.some((h) => h.date === day)).toBe(false);
    const view = buildPastDayView(profile, history, day, learnStrain(profile, history, day));
    expect(view.strain.real).not.toBeNull();
    expect(view.entry).toBeDefined();
  });
});
