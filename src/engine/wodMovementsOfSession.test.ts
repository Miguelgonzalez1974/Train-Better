import { describe, expect, it } from 'vitest';
import type { DailySession } from '../data/athlete/types';
import { wodMovementsOfSession } from './generateSession';

const session = (blocks: Partial<DailySession['blocks'][number]>[]): DailySession =>
  ({ date: '2026-12-01', mesocycleWeek: 2, isRestDay: false, blocks: blocks.map((b) => ({ block: 'wod', movementId: 'thruster', ...b })) }) as unknown as DailySession;

describe('movimientos del WOD de una sesion', () => {
  it('un WOD generado: cada movimiento con su parte y su carga Rx', () => {
    const r = wodMovementsOfSession(session([{ movementId: 'thruster', loadKg: 43 }, { movementId: 'strict-pull-up' }]));
    expect(r).toEqual([
      { movementId: 'thruster', part: 1, rxKg: 43 },
      { movementId: 'strict-pull-up', part: 1 },
    ]);
  });

  it('un doble WOD separa las dos partes, y no repite un movimiento dentro de una parte', () => {
    const r = wodMovementsOfSession(session([{ movementId: 'thruster', wodPart: 1 }, { movementId: 'thruster', wodPart: 1 }, { movementId: 'row', wodPart: 2 }]));
    expect(r.map((m) => `${m.part}|${m.movementId}`)).toEqual(['1|thruster', '2|row']);
  });

  it('un benchmark aporta sus movimientos reales; los que no son movimientos del catalogo se ignoran; lo que no es WOD no cuenta', () => {
    const r = wodMovementsOfSession(session([{ movementId: 'benchmark:fran' }, { block: 'strength', movementId: 'back-squat' }, { movementId: 'no-existe' }]));
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.part === 1)).toBe(true);
    expect(r.some((m) => m.movementId === 'back-squat' || m.movementId === 'no-existe')).toBe(false);
  });
});
