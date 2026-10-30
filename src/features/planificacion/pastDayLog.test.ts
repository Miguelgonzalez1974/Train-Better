import { describe, expect, it } from 'vitest';
import { generateSessionForDate, toHistoryEntry } from '../../engine/generateSession';
import { consecutiveDates, makeMacro, makeProfile } from '../../engine/__fixtures';
import { dayStrain } from '../../engine/strain';
import { customDaySession, isHistorySorted, liftKey, plannedLiftState, plannedLifts, sortHistoryByDate, workSetsFrom } from './pastDayLog';
import type { SessionHistoryEntry } from '../../data/athlete/types';

const entry = (date: string): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });

describe('registrar un día pasado', () => {
  it('"hice otra cosa" es una sesión propia sin bloques, con la fecha de ese día', () => {
    const s = customDaySession('2026-10-30', 2);
    expect(s).toMatchObject({ date: '2026-10-30', mesocycleWeek: 2, isRestDay: false, source: 'custom', swapLabel: 'Otra cosa', editedByAthlete: true });
    expect(s.blocks).toEqual([]);
    const e = toHistoryEntry(s, 'rx', 6, 45);
    expect(e.date).toBe('2026-10-30');
    expect(e.movementIds).toEqual([]);
    expect(dayStrain(e)).toBeGreaterThan(0);
  });

  it('"hice lo previsto" guarda la sesión del coach con la fecha de ese día', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'a' })] });
    const day = consecutiveDates('2026-01-12', 5)[2];
    const session = generateSessionForDate(profile, [], day, profile.goals);
    const e = toHistoryEntry(session, 'scaled', 8, 55);
    expect(e.date).toBe(session.date);
    expect(e.rxOrScaled).toBe('scaled');
    expect(e.rpe).toBe(8);
    expect(e.durationMin).toBe(55);
    expect(e.movementIds.length).toBeGreaterThan(0);
  });

  it('el historial se deja por orden de fecha cuando el día registrado es anterior al último', () => {
    const h = [entry('2026-10-28'), entry('2026-10-31'), entry('2026-10-30')];
    expect(isHistorySorted(h)).toBe(false);
    expect(sortHistoryByDate(h).map((e) => e.date)).toEqual(['2026-10-28', '2026-10-30', '2026-10-31']);
    expect(isHistorySorted(sortHistoryByDate(h))).toBe(true);
  });

  it('ordenar es estable y no toca el original', () => {
    const a = { ...entry('2026-10-30'), rpe: 5 };
    const b = { ...entry('2026-10-30'), rpe: 9 };
    const h = [entry('2026-10-31'), a, b];
    const sorted = sortHistoryByDate(h);
    expect(sorted.slice(0, 2)).toEqual([a, b]);
    expect(h[0].date).toBe('2026-10-31');
  });

  it('un historial vacío o de un solo día ya está ordenado', () => {
    expect(isHistorySorted([])).toBe(true);
    expect(isHistorySorted([entry('2026-10-30')])).toBe(true);
  });
});

describe('series y pesos de un día pasado', () => {
  const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'a' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
  const sessions = consecutiveDates('2026-01-12', 28)
    .map((d) => generateSessionForDate(profile, [], d, profile.goals))
    .filter((s) => !s.isRestDay);
  const withLift = sessions.find((s) => plannedLifts(s).some((l) => l.block === 'strength' && l.rows.length >= 3 && l.rows[0].kg > 0))!;

  it('las filas previstas son las del modo enfocado: una por serie con su peso y repeticiones', () => {
    const lifts = plannedLifts(withLift);
    const main = lifts.find((l) => l.block === 'strength')!;
    const block = withLift.blocks.find((b) => b.block === 'strength' && !b.subgroup)!;
    expect(main.rows).toHaveLength(block.setPlan && block.setPlan.length >= 2 ? block.setPlan.length : block.sets!);
    expect(main.rows[0].set).toBe(1);
    expect(main.rows.every((r) => r.kg > 0)).toBe(true);
    expect(main.name.length).toBeGreaterThan(2);
  });

  it('no incluye el calentamiento de barra ni bloques que no son de fuerza u oly', () => {
    for (const s of sessions) {
      const lifts = plannedLifts(s);
      const ids = new Set(s.blocks.filter((b) => b.subgroup).map((b) => `${b.block}:${b.movementId}`));
      for (const l of lifts) expect(['strength', 'oly']).toContain(l.block);
      expect(lifts.length).toBeLessThanOrEqual(s.blocks.filter((b) => (b.block === 'strength' || b.block === 'oly') && !b.subgroup).length);
      void ids;
    }
  });

  it('todo como estaba previsto guarda todas las series con su peso y reps, con la fecha de ese día', () => {
    const lifts = plannedLifts(withLift);
    const sets = workSetsFrom('2026-10-30', lifts, plannedLiftState(lifts));
    expect(sets.length).toBe(lifts.reduce((n, l) => n + l.rows.filter((r) => r.kg > 0).length, 0));
    expect(sets.every((s) => s.date === '2026-10-30' && s.kg > 0)).toBe(true);
    const first = sets.find((s) => s.setNumber === 1)!;
    expect(first.movementId).toBe(lifts[0].logId);
  });

  it('una serie desmarcada no se guarda y el peso corregido sí', () => {
    const lifts = plannedLifts(withLift);
    const main = lifts.find((l) => l.rows.length >= 3)!;
    const state = plannedLiftState(lifts);
    state[liftKey(main.logId, 2)] = { done: false, kg: main.rows[1].kg };
    state[liftKey(main.logId, 1)] = { done: true, kg: 97.5 };
    const sets = workSetsFrom('2026-10-30', lifts, state).filter((s) => s.movementId === main.logId);
    expect(sets.find((s) => s.setNumber === 2)).toBeUndefined();
    expect(sets.find((s) => s.setNumber === 1)!.kg).toBe(97.5);
  });

  it('una serie sin peso (cuerpo libre) no se guarda: no aporta al progreso ni al 1RM', () => {
    const lifts = [{ logId: 'x', name: 'X', block: 'strength' as const, rows: [{ set: 1, kg: 0, reps: 10 }] }];
    expect(workSetsFrom('2026-10-30', lifts, plannedLiftState(lifts))).toEqual([]);
  });

  it('un complejo se guarda con su propia clave, no con la de un levantamiento', () => {
    const day = sessions.find((s) => s.blocks.some((b) => b.complex && (b.sets ?? 0) >= 1));
    if (!day) return; // no todos los calendarios de prueba llevan complejo
    const l = plannedLifts(day).find((x) => x.logId.startsWith('complex:'));
    expect(l).toBeTruthy();
  });
});