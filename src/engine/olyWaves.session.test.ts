import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateSessionForDate, isRealWodSelectionEnabled, setRealWodSelectionEnabled } from './generateSession';
import { consecutiveDates, makeProfile } from './__fixtures';
import { getMovementById } from '../data/movements';
import type { DailySession, Goal, SessionBlockResult } from '../data/athlete/types';

const REAL_WOD_INITIAL = isRealWodSelectionEnabled();
beforeAll(() => setRealWodSelectionEnabled(false));
afterAll(() => setRealWodSelectionEnabled(REAL_WOD_INITIAL));

const START = '2026-01-05';
const isWave = (b: SessionBlockResult) => b.block === 'oly' && Boolean(b.waveSize);

function waveDays(sessions: DailySession[]) {
  return sessions.flatMap((s) => {
    const main = s.blocks.find(isWave);
    return main ? [{ session: s, main }] : [];
  });
}

describe('olas en la parte olímpica (sesiones generadas)', () => {
  const profile = makeProfile({ trainingDaysPerWeek: 6 });
  const sessions = consecutiveDates(START, 120).map((d) => generateSessionForDate(profile, [], d, profile.goals));
  const waves = waveDays(sessions);

  it('salen de vez en cuando: ni nunca ni todos los días de oly', () => {
    const olyDays = sessions.filter((s) => s.blocks.some((b) => b.block === 'oly' && !b.subgroup)).length;
    expect(waves.length).toBeGreaterThan(3);
    expect(waves.length).toBeLessThan(olyDays * 0.6);
  });

  it('el plan es coherente: una serie por fila, la última es la carga fuerte y las olas suben', () => {
    for (const { main } of waves) {
      const plan = main.setPlan!;
      expect(plan.length).toBe(main.sets);
      expect(plan.length % main.waveSize!).toBe(0);
      expect(plan[plan.length - 1].kg).toBe(main.loadKg);
      expect(main.format).toMatch(/^Olas · \d × /);
      const size = main.waveSize!;
      for (let w = 1; w < plan.length / size; w++) expect(plan[(w + 1) * size - 1].kg).toBeGreaterThan(plan[w * size - 1].kg);
    }
  });

  it('la estructura se mantiene: el primer técnico va antes, y el tirón después, con el primer técnico en 3 series como mucho', () => {
    for (const { session, main } of waves) {
      const oly = session.blocks.filter((b) => b.block === 'oly' && !b.subgroup);
      const mainIdx = oly.indexOf(main);
      expect(mainIdx, `${session.date}: sin primer técnico antes de las olas`).toBeGreaterThan(0);
      expect(oly[mainIdx - 1].sets ?? 0).toBeLessThanOrEqual(3);
      const pull = oly[mainIdx + 1];
      if (pull) expect(getMovementById(pull.movementId)?.id).toMatch(/pull/);
    }
  });

  it('no hay olas en la semana de descarga ni en el día de test', () => {
    for (const { session } of waves) {
      expect(session.mesocycleWeek, session.date).not.toBe(4);
      // Un día de test de fuerza no impide las olas en oly; sí lo haría un test de oly.
      expect(session.blocks.some((b) => b.block === 'oly' && b.format === 'Test 1RM'), session.date).toBe(false);
    }
  });

  it('con una competición cerca (pico y taper) no hay olas', () => {
    const goal: Goal = { id: 'c1', type: 'preparar-competicion', targetDate: '2026-03-20', eventEndDate: '2026-03-21', emphasis: 'intensivo', createdAt: '2026-01-01' };
    const comp = makeProfile({ trainingDaysPerWeek: 6, goals: [goal] });
    // Los 21 días antes de la competición: del pico-1 a la víspera.
    const days = consecutiveDates('2026-02-27', 21);
    const generated = days.map((d) => generateSessionForDate(comp, [], d, comp.goals));
    expect(generated.some((s) => s.competition), 'la competición debería estar activa').toBe(true);
    expect(generated.filter((s) => s.blocks.some((b) => b.block === 'oly' && !b.subgroup)).length, 'sin días de oly no prueba nada').toBeGreaterThan(3);
    expect(waveDays(generated).map((w) => w.session.date)).toEqual([]);
  });
});
