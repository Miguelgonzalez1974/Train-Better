import { describe, it, expect } from 'vitest';
import { generateSessionForDate, isCachedSessionStale, planWeekLocks } from './generateSession';
import { consecutiveDates, makeProfile } from './__fixtures';
import { mergeProfile } from '../data/athlete/mergeProfile';
import { SESSION_GEN_VERSION, type DailySession } from '../data/athlete/types';

/**
 * "Regenerar sesion" (boton "Otro WOD"): cada pulsacion sube la variante del dia en `profile.regenVariants`, que entra en
 * la semilla del WOD. Cambia el WOD; la fuerza, el oly y el accesorio (fijados por el bloqueo semanal) no.
 */

const profile = (over: Parameters<typeof makeProfile>[0] = {}) => makeProfile({ trainingDaysPerWeek: 6, bodyweightLog: [{ date: '2026-01-01', kg: 82 }], ...over });
const days = consecutiveDates('2026-01-12', 6); // L..S de una semana con macro activo (Intensificacion)
const iso = (d: Date) => d.toISOString().slice(0, 10);

const wodOf = (s: DailySession) => s.blocks.filter((b) => b.block === 'wod').map((b) => `${b.movementId}|${b.reps}|${b.format}`).join(';');
const fixedOf = (s: DailySession) =>
  s.blocks
    .filter((b) => b.block === 'strength' || b.block === 'oly' || (b.block === 'accessory' && b.accessoryRole))
    .map((b) => b.movementId)
    .join(',');

describe('regenerar: otro WOD', () => {
  it('sin variante (o con 0) la sesion es la de siempre, y es determinista', () => {
    const p = profile();
    for (const d of days) {
      const a = generateSessionForDate(p, [], d, p.goals);
      const b = generateSessionForDate({ ...p, regenVariants: { [iso(d)]: 0 } }, [], d, p.goals);
      expect(JSON.stringify(b), iso(d)).toBe(JSON.stringify(a));
      expect(a.regenVariant).toBeUndefined();
    }
  });

  it('con variante el WOD cambia en casi todos los dias de WOD, sin tocar fuerza, oly ni accesorio', () => {
    const p = profile();
    let changed = 0;
    let wodDays = 0;
    for (const d of days) {
      const base = generateSessionForDate(p, [], d, p.goals);
      // Sin WOD, o con un benchmark de dia de test fijado por la semana (no es un WOD de programacion elegido): nada que regenerar.
      if (!base.blocks.some((b) => b.block === 'wod') || base.blocks.some((b) => b.movementId.startsWith('benchmark:') && !b.wodCatalogId)) continue;
      wodDays++;
      const variants = [1, 2, 3, 4].map((v) => generateSessionForDate({ ...p, regenVariants: { [iso(d)]: v } }, [], d, p.goals));
      if (variants.some((s) => wodOf(s) !== wodOf(base))) changed++;
      for (const s of variants) expect(fixedOf(s), `${iso(d)}: fuerza/oly/accesorio`).toBe(fixedOf(base));
    }
    expect(wodDays).toBeGreaterThan(2);
    // El boton prueba hasta 4 variantes seguidas: casi siempre alguna cambia el WOD (uno fijado por la semana no puede).
    expect(changed, `${changed}/${wodDays}`).toBeGreaterThanOrEqual(wodDays - 1);
  });

  it('la misma variante da siempre el mismo WOD, y queda marcada en la sesion', () => {
    const p = profile({ regenVariants: { '2026-01-14': 2 } });
    const d = days[2];
    const a = generateSessionForDate(p, [], d, p.goals);
    const b = generateSessionForDate(p, [], d, p.goals);
    expect(wodOf(a)).toBe(wodOf(b));
    expect(a.regenVariant).toBe(2);
  });

  it('una cacheada de otra variante esta vieja; de la misma, no', () => {
    const p = profile({ regenVariants: { '2026-01-14': 1 } });
    const d = days[2];
    const s: DailySession = { ...generateSessionForDate(p, [], d, p.goals), genVersion: SESSION_GEN_VERSION };
    expect(isCachedSessionStale(s, undefined, undefined, undefined, 1)).toBe(false);
    expect(isCachedSessionStale(s, undefined, undefined, undefined, 2)).toBe(true);
    const older: DailySession = { ...s, regenVariant: undefined };
    expect(isCachedSessionStale(older, undefined, undefined, undefined, 0)).toBe(false);
    expect(isCachedSessionStale(older, undefined, undefined, undefined, 1)).toBe(true);
  });

  it('planificar la semana no depende de las regeneraciones (el bloqueo semanal no cambia)', () => {
    const p = profile();
    const monday = days[0];
    const a = planWeekLocks(p, [], monday, p.goals, { plannedOn: iso(monday) });
    const b = planWeekLocks({ ...p, regenVariants: Object.fromEntries(days.map((d) => [iso(d), 3])) }, [], monday, p.goals, { plannedOn: iso(monday) });
    expect(b).toEqual(a);
  });

  it('al sincronizar gana la mayor cantidad de regeneraciones de cada dia y solo se guardan los dias recientes', () => {
    const remote = profile({ regenVariants: { '2026-01-14': 3, '2026-01-13': 1 } });
    const local = profile({ regenVariants: { '2026-01-14': 1, '2026-01-15': 2 } });
    const merged = mergeProfile(remote, local);
    expect(merged.regenVariants).toEqual({ '2026-01-13': 1, '2026-01-14': 3, '2026-01-15': 2 });
    const many = profile({ regenVariants: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`2026-02-${String(i + 1).padStart(2, '0')}`, 1])) });
    expect(Object.keys(mergeProfile(many, many).regenVariants ?? {}).length).toBe(14);
  });
});
