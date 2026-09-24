import { describe, expect, it } from 'vitest';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import { allMovements, benchmarkWorkouts } from '../data/movements';
import { EXCLUDED_MOVEMENT_IDS, usesExcludedMovement } from '../data/movements/excluded';
import { SKILL_PROGRESSIONS } from '../data/movements/skillProgressions';
import { libraryWods } from '../data/library/libraryWods';
import type { DailySession } from '../data/athlete/types';

/**
 * Movimientos que el atleta pidió no programar nunca (pistol squat, con sus versiones asistidas): no pueden salir
 * en ningún bloque ni como escalón de una progresión, aunque tenga un objetivo antiguo de pistol en el perfil.
 */

const PISTOL_GOAL = [
  { id: 'g1', type: 'mejorar-gimnasticos', movementId: 'pistol-squat', targetDate: '2027-01-01', emphasis: 'alto', createdAt: '2026-08-01' },
] as never;

function sessions(): DailySession[] {
  const out: DailySession[] = [];
  for (const n of [3, 4, 5, 6] as const) {
    for (const id of ['a', 'b', 'c']) {
      const profile = makeProfile({ trainingDaysPerWeek: n, macrocycles: [makeMacro({ id })], goals: PISTOL_GOAL, bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
      for (const d of consecutiveDates('2026-01-05', 112)) out.push(generateSessionForDate(profile, [], d, profile.goals));
    }
  }
  return out;
}

describe('movimientos excluidos (pistol)', () => {
  it('no estan en el catalogo, ni en las progresiones de habilidades, ni en la biblioteca de WODs', () => {
    for (const m of allMovements) {
      expect(EXCLUDED_MOVEMENT_IDS.has(m.id), m.id).toBe(false);
      for (const ref of [...m.scaling.easier, ...m.scaling.harder]) expect(EXCLUDED_MOVEMENT_IDS.has(ref), `${m.id} -> ${ref}`).toBe(false);
    }
    for (const p of SKILL_PROGRESSIONS) {
      expect(EXCLUDED_MOVEMENT_IDS.has(p.targetMovementId)).toBe(false);
      for (const s of p.steps) expect(EXCLUDED_MOVEMENT_IDS.has(s.movementId)).toBe(false);
    }
    for (const w of libraryWods) expect(usesExcludedMovement(w.lines.map(([id]) => id), w.original), w.id).toBe(false);
  });

  it('en 4 meses de sesiones (3 a 6 dias, con un objetivo antiguo de pistol) no sale ningun pistol en ningun bloque', () => {
    const all = sessions();
    expect(all.length).toBeGreaterThan(1000);
    const bad: string[] = [];
    let benchmarks = 0;
    for (const s of all) {
      for (const b of s.blocks) {
        const text = `${b.movementId} ${b.title ?? ''} ${b.notes ?? ''}`;
        if (/pistol/i.test(text)) bad.push(`${s.date} ${b.block}: ${b.movementId}`);
        if (b.movementId.startsWith('benchmark:')) {
          benchmarks++;
          const wod = benchmarkWorkouts.find((w) => w.id === b.movementId.slice('benchmark:'.length));
          if (wod && usesExcludedMovement(wod.movements, wod.format)) bad.push(`${s.date}: benchmark ${wod.name}`);
        }
      }
    }
    expect(benchmarks, 'la prueba no ejercita los WODs de referencia').toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});
