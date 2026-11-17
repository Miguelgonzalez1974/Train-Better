import { describe, expect, it } from 'vitest';
import { PER_DUMBBELL_ACCESSORY_IDS } from '../data/movements/loadUnits';
import { SESSION_GEN_VERSION, type DailySession } from '../data/athlete/types';
import { generateSessionForDate, isCachedSessionStale, planWeekLocks } from './generateSession';
import { consecutiveDates, makeProfile } from './__fixtures';

/**
 * Un movimiento de mancuernas (Dumbbell Bench Press) nunca es el levantamiento principal de fuerza: su carga sale como % del 1RM de la
 * barra, y con una mancuerna en cada mano ese número era absurdo (62,5 kg). Como accesorio, con su propia carga «c/u», sí puede salir.
 */
describe('el levantamiento principal de fuerza nunca es de mancuernas', () => {
  const p = makeProfile({ trainingDaysPerWeek: 6, prs: { ...makeProfile().prs, benchPress: 100 } });

  it('en 26 semanas no sale ninguno como fuerza principal', () => {
    const dates = consecutiveDates('2026-01-05', 182);
    // Solo el levantamiento principal: el complemento del día (p. ej. elevaciones laterales) va aparte, con su propia carga.
    const mains = dates.flatMap((d) => generateSessionForDate(p, [], d, p.goals).blocks.filter((b) => b.block === 'strength' && b.sets && b.reps && !b.accessoryRole && b.movementId !== 'lateral-raise').map((b) => b.movementId));
    expect(mains.length).toBeGreaterThan(40);
    expect(mains.filter((id) => id.startsWith('dumbbell-'))).toEqual([]);
  });

  it('un bloqueo antiguo que fijó el press con mancuernas se ignora, y la sesión cacheada no se considera vieja por eso', () => {
    const monday = new Date('2026-03-02T12:00:00');
    const locks = planWeekLocks(p, [], monday, p.goals);
    const stale = Object.fromEntries(Object.entries(locks).map(([iso, l]) => [iso, l.strengthMovementId ? { ...l, strengthMovementId: 'dumbbell-bench-press' } : l]));
    const withStale = { ...p, weeklyLocks: stale };
    let checked = 0;
    for (const [iso, l] of Object.entries(stale)) {
      if (!l.strengthMovementId) continue;
      const s: DailySession = { ...generateSessionForDate(withStale, [], new Date(`${iso}T12:00:00`), withStale.goals), genVersion: SESSION_GEN_VERSION };
      const main = s.blocks.find((b) => b.block === 'strength')?.movementId;
      expect(PER_DUMBBELL_ACCESSORY_IDS.has(main ?? ''), iso).toBe(false);
      expect(isCachedSessionStale(s, l), iso).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('como accesorio puede salir con carga por mancuerna, muy lejos del peso de la barra', () => {
    const dates = consecutiveDates('2026-01-05', 182);
    const loads = dates.flatMap((d) => generateSessionForDate(p, [], d, p.goals).blocks.filter((b) => b.block === 'accessory' && b.movementId === 'dumbbell-bench-press' && b.loadKg).map((b) => b.loadKg!));
    for (const kg of loads) expect(kg).toBeLessThan(45);
  });
});
