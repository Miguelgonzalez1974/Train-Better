import { describe, it, expect } from 'vitest';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { getMovementById } from '../data/movements';
import type { DailySession } from '../data/athlete/types';

/**
 * Estilo E2MOM de carga creciente en el bloque de fuerza (patron frecuente en PushJerk: "10 min E2MOM:
 * 4 bench press + 2 strict pull-ups, sube 5% cada ronda"). Solo empuje/sentadilla, semanas 1-2.
 */
const FORMAT = 'E2MOM 10 min — carga creciente';
const PARTNER: Record<string, string> = { horizontalPush: 'strict-pull-up', verticalPush: 'strict-pull-up', squat: 'push-up' };

function sample(): DailySession[] {
  const out: DailySession[] = [];
  for (const n of [4, 5, 6] as const) {
    for (const id of ['a', 'b', 'c', 'd']) {
      const profile = makeProfile({ trainingDaysPerWeek: n, macrocycles: [makeMacro({ id })] });
      for (const d of consecutiveDates('2026-01-05', 140)) out.push(generateSessionForDate(profile, [], d, profile.goals));
    }
  }
  return out;
}
const sessions = sample();
const emom = sessions.filter((s) => s.blocks.some((b) => b.block === 'strength' && b.format === FORMAT));

describe('fuerza: estilo E2MOM de carga creciente', () => {
  it('sale, pero como un estilo mas (no monopoliza el bloque de fuerza de semanas 1-2)', () => {
    const eligible = sessions.filter((s) => s.mesocycleWeek <= 2 && s.blocks.some((b) => b.block === 'strength' && b.format !== 'Test 1RM'));
    expect(emom.length, 'nunca salio un E2MOM').toBeGreaterThan(10);
    const share = emom.length / eligible.length;
    expect(share, `${emom.length}/${eligible.length}`).toBeGreaterThan(0.03);
    expect(share, `${emom.length}/${eligible.length}`).toBeLessThan(0.3);
  });

  it('solo en semanas 1-2, con empuje o sentadilla, y con su companero antagonista', () => {
    const bad: string[] = [];
    for (const s of emom) {
      const strength = s.blocks.filter((b) => b.block === 'strength' && b.format === FORMAT);
      if (s.mesocycleWeek > 2) bad.push(`${s.date}: semana ${s.mesocycleWeek}`);
      if (strength.length !== 2) {
        bad.push(`${s.date}: ${strength.length} entradas`);
        continue;
      }
      const [main, partner] = strength;
      const pattern = getMovementById(main.movementId)?.pattern ?? '';
      if (!(pattern in PARTNER)) bad.push(`${s.date}: patron ${pattern}`);
      else if (partner.movementId !== PARTNER[pattern]) bad.push(`${s.date}: companero ${partner.movementId} para ${pattern}`);
      if (main.sets !== 5 || partner.sets !== 5) bad.push(`${s.date}: no son 5 rondas`);
      if (partner.loadKg) bad.push(`${s.date}: el companero lleva carga`);
      if (!(main.loadKg && main.loadKg > 0)) bad.push(`${s.date}: el principal no lleva carga`);
    }
    expect(bad).toEqual([]);
  });

  it('la carga sube estrictamente en cada ronda (R1..R5), la ultima es la carga del bloque y el salto entre rondas es acotado', () => {
    const bad: string[] = [];
    for (const s of emom) {
      const main = s.blocks.find((b) => b.block === 'strength' && b.format === FORMAT)!;
      const kgs = [...(main.notes ?? '').matchAll(/R(\d) (\d+(?:\.\d+)?) kg/g)].map((m) => Number(m[2]));
      if (kgs.length !== 5) {
        bad.push(`${s.date}: ${kgs.length} rondas en la nota`);
        continue;
      }
      if (!kgs.every((k, i) => i === 0 || k > kgs[i - 1])) bad.push(`${s.date}: no sube (${kgs.join(',')})`);
      if (kgs[4] !== main.loadKg) bad.push(`${s.date}: la ultima ronda (${kgs[4]}) no es la carga del bloque (${main.loadKg})`);
      // Salto entre rondas acotado: ~5% del PR, nunca un salto brusco.
      const maxStep = Math.max(...kgs.slice(1).map((k, i) => k - kgs[i]));
      if (maxStep > kgs[4] * 0.12) bad.push(`${s.date}: salto de ${maxStep} kg`);
    }
    expect(bad).toEqual([]);
  });
});
