import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { isRealWodSelectionEnabled, setRealWodSelectionEnabled } from './generateSession';
import { consecutiveDates, makeProfile, simulateSessions } from './__fixtures';

const INITIAL = isRealWodSelectionEnabled();
beforeAll(() => setRealWodSelectionEnabled(false));
afterAll(() => setRealWodSelectionEnabled(INITIAL));

describe('halterofilia: muscle snatch / muscle clean en vez de los deadlift de oly', () => {
  // Se generan una vez apagada la selección de WODs reales (en `beforeAll`): el WOD cuenta en lo que se usó hace poco, y eso decide
  // el complejo del día, así que las dos pasadas del test de determinismo tienen que partir del mismo estado.
  let sessions: ReturnType<typeof simulateSessions> = [];
  let olyWork: ReturnType<typeof simulateSessions>[number]['blocks'][] = [];
  beforeAll(() => {
    sessions = simulateSessions(makeProfile({ trainingDaysPerWeek: 6 }), consecutiveDates('2026-01-05', 84));
    olyWork = sessions.map((s) => s.blocks.filter((b) => b.block === 'oly' && !b.subgroup));
  });

  it('el tirón tras el levantamiento ya no es snatch deadlift ni clean deadlift', () => {
    const ids = olyWork.flat().map((b) => b.movementId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('snatch-deadlift');
    expect(ids).not.toContain('clean-deadlift');
  });

  it('el muscle snatch y el muscle clean salen en una buena parte de los días de oly (como primer del complejo)', () => {
    const days = olyWork.filter((blocks) => blocks.length > 0);
    const withMuscle = days.filter((blocks) => blocks.some((b) => /^muscle-(snatch|clean)$/.test(b.movementId)));
    expect(days.length).toBeGreaterThan(10);
    expect(withMuscle.length / days.length).toBeGreaterThan(0.4);
    const ids = new Set(withMuscle.flatMap((blocks) => blocks.map((b) => b.movementId)));
    expect(ids.has('muscle-snatch')).toBe(true);
    expect(ids.has('muscle-clean')).toBe(true);
  });

  it('no es todo muscle: siguen entrando otros drills técnicos', () => {
    const primers = olyWork.flat().filter((b) => /^(muscle|tall|power|hang|pause|three-position|snatch-balance|barski)/.test(b.movementId));
    const others = primers.filter((b) => !b.movementId.startsWith('muscle-'));
    expect(others.length).toBeGreaterThan(0);
  });

  it('el mismo día sale siempre el mismo entreno (el sorteo del muscle es determinista)', () => {
    const again = simulateSessions(makeProfile({ trainingDaysPerWeek: 6 }), consecutiveDates('2026-01-05', 84));
    const ids = (ss: typeof sessions) => ss.map((s) => s.blocks.filter((b) => b.block === 'oly').map((b) => b.movementId).join(','));
    expect(ids(again)).toEqual(ids(sessions));
  });
});
