import { describe, expect, it } from 'vitest';
import type { ReadinessCheck } from '../../data/athlete/types';
import { checkPct, computeRecoverySummary, RECENCY_WEIGHTS } from '../../engine/recovery';
import { makeProfile } from '../../engine/__fixtures';
import { buildPrepCompare, summarizePrepCompare } from './prepCompare';

const TODAY = '2026-11-22';
const iso = (back: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const bad = (back: number): ReadinessCheck => ({ date: iso(back), sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' });
const good = (back: number): ReadinessCheck => ({ date: iso(back), sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' });

describe('reparto de pesos por lo reciente', () => {
  it('los pesos suman uno', () => {
    expect(RECENCY_WEIGHTS.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 5);
  });

  it('con solo hoy y ayer, hoy pesa el doble: 40 hoy y 20 ayer dan algo más cerca de 40 que de 20', () => {
    // Dos check-ins de notas conocidas: se comprueba la media ponderada con sus propias notas.
    const today = good(0);
    const yesterday = bad(1);
    const a = checkPct(today);
    const b = checkPct(yesterday);
    const simple = computeRecoverySummary([yesterday, today], TODAY).score!;
    const recent = computeRecoverySummary([yesterday, today], TODAY, { recency: true }).score!;
    expect(simple).toBe(Math.round((a + b) / 2));
    expect(recent).toBe(Math.round((a * 0.5 + b * 0.25) / 0.75));
    expect(recent).toBeGreaterThan(simple);
    expect(recent).toBeLessThan(a);
    expect(recent).toBeGreaterThan(b);
  });

  it('sin la opción, la media simple de siempre no cambia', () => {
    const log = [bad(2), bad(1), good(0)];
    expect(computeRecoverySummary(log, TODAY, {}).score).toBe(computeRecoverySummary(log, TODAY).score);
  });

  it('un día bueno tras una semana mala sube más con el reparto por lo reciente', () => {
    const profile = { ...makeProfile(), readinessLog: [bad(6), bad(5), bad(4), bad(3), bad(2), bad(1), good(0)] };
    const rows = buildPrepCompare(profile, [], TODAY);
    const todayRow = rows.find((r) => r.iso === TODAY)!;
    expect(todayRow.now).not.toBeNull();
    expect(todayRow.recency!).toBeGreaterThan(todayRow.now!);
    expect(rows.map((r) => r.iso)).toEqual([TODAY, iso(1), iso(2), iso(3), iso(4), iso(5), iso(6)]);
    const summary = summarizePrepCompare(rows);
    expect(summary.days).toBeGreaterThan(0);
    expect(summary.biggest).not.toBeNull();
  });

  it('sin check-ins no hay filas ni resumen', () => {
    expect(buildPrepCompare({ ...makeProfile(), readinessLog: [] }, [], TODAY)).toEqual([]);
    expect(summarizePrepCompare([])).toEqual({ days: 0, avgShift: 0, biggest: null });
  });
});
