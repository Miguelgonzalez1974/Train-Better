import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { toHistoryEntry } from './generateSession';
import { applySkips, describeSkipped, sessionParts, skippedParts } from './sessionParts';

const block = (b: Partial<SessionBlockResult> & Pick<SessionBlockResult, 'block'>): SessionBlockResult => ({ movementId: 'back-squat', ...b });
const session = (blocks: SessionBlockResult[], over: Partial<DailySession> = {}): DailySession => ({ date: '2026-11-03', mesocycleWeek: 2, isRestDay: false, blocks, ...over });

const normal = session(
  [
    block({ block: 'warmup', movementId: 'jumping-jacks' }),
    block({ block: 'strength', movementId: 'back-squat', sets: 5, reps: '5', loadKg: 100 }),
    block({ block: 'oly', movementId: 'power-clean', sets: 4, reps: '2', loadKg: 60 }),
    block({ block: 'wod', movementId: 'thruster', format: 'AMRAP 12', wodKind: 'amrap' }),
    block({ block: 'accessory', movementId: 'pull-up' }),
    block({ block: 'cooldown', movementId: 'stretch' }),
  ],
  { energySystem: 'umbral' },
);

describe('partes de la sesión por las que se pregunta', () => {
  it('fuerza, oly, WOD y accesorio, en ese orden; el calentamiento y la vuelta a la calma no', () => {
    const parts = sessionParts(normal);
    expect(parts.map((p) => p.key)).toEqual(['strength', 'oly', 'wod1', 'accessory']);
    expect(parts[0].label.startsWith('Fuerza')).toBe(true);
    expect(parts[2].label).toBe('WOD');
  });

  it('un día de doble WOD pregunta por las dos partes', () => {
    const double = session([block({ block: 'strength' }), block({ block: 'wod', wodPart: 1 }), block({ block: 'wod', wodPart: 2 })]);
    const parts = sessionParts(double);
    expect(parts.map((p) => [p.key, p.label])).toEqual([
      ['strength', expect.stringMatching(/^Fuerza/)],
      ['wod1', 'WOD · parte 1'],
      ['wod2', 'WOD · parte 2'],
    ]);
  });

  it('un día de descanso o una sesión propia no preguntan nada', () => {
    expect(sessionParts(session([], { isRestDay: true }))).toEqual([]);
    expect(sessionParts(session([block({ block: 'wod' })], { source: 'custom' }))).toEqual([]);
  });
});

describe('lo que no se hizo no entra en el historial', () => {
  it('sin skips la sesión es la misma', () => {
    expect(applySkips(normal, {})).toBe(normal);
  });

  it('sin el WOD: fuera sus movimientos, su formato y el sistema energético; la fuerza y el oly siguen', () => {
    const full = toHistoryEntry(normal, 'rx', 7, 60);
    expect(full.wodFormatKind).toBe('amrap');
    expect(full.energySystem).toBe('umbral');
    const entry = toHistoryEntry(applySkips(normal, { wod1: { reason: 'molestia' } }), 'rx', 5, 50);
    expect(entry.wodFormatKind).toBeUndefined();
    expect(entry.wodMovementIds).toBeUndefined();
    expect(entry.energySystem).toBeUndefined();
    expect(entry.movementIds).not.toContain('thruster');
    expect(entry.movementIds).toContain('back-squat');
    expect(entry.olyFamily).toBe('clean');
  });

  it('sin la fuerza: el patrón de fuerza del día no se anota', () => {
    const entry = toHistoryEntry(applySkips(normal, { strength: {} }), 'rx', 6, 45);
    expect(entry.strengthPattern).toBeUndefined();
    expect(entry.wodFormatKind).toBe('amrap');
  });

  it('en un doble WOD, saltarse solo la parte 2 deja la parte 1', () => {
    const double = session([block({ block: 'wod', movementId: 'thruster', wodPart: 1, wodKind: 'amrap' }), block({ block: 'wod', movementId: 'row', wodPart: 2 })], { energySystem: 'potencia' });
    const applied = applySkips(double, { wod2: {} });
    expect(applied.blocks.map((b) => b.movementId)).toEqual(['thruster']);
    expect(applied.energySystem).toBe('potencia');
  });
});

describe('cómo se guarda y se cuenta', () => {
  it('se guarda cada parte con su motivo, en el orden de la sesión', () => {
    expect(skippedParts({ wod1: { reason: 'molestia' }, accessory: {} })).toEqual([{ block: 'wod', part: 1, reason: 'molestia' }, { block: 'accessory' }]);
    expect(skippedParts({})).toEqual([]);
  });

  it('"Sin el WOD, por la molestia."', () => {
    expect(describeSkipped([{ block: 'wod', part: 1, reason: 'molestia' }])).toBe('Sin el WOD, por la molestia.');
    expect(describeSkipped([{ block: 'wod', part: 1, reason: 'competicion' }])).toBe('Sin el WOD, pensando en la competición.');
    expect(describeSkipped([{ block: 'wod', part: 1 }])).toBe('Sin el WOD.');
    expect(describeSkipped([{ block: 'wod', part: 1, reason: 'otro' }])).toBe('Sin el WOD.');
  });

  it('varias partes se juntan; con motivos distintos no se nombra ninguno', () => {
    expect(describeSkipped([{ block: 'wod', reason: 'tiempo' }, { block: 'accessory', reason: 'tiempo' }])).toBe('Sin el WOD y el accesorio, por falta de tiempo.');
    expect(describeSkipped([{ block: 'oly', reason: 'molestia' }, { block: 'wod', reason: 'cansancio' }])).toBe('Sin el oly y el WOD.');
    expect(describeSkipped([{ block: 'wod', part: 1 }, { block: 'wod', part: 2 }])).toBe('Sin el WOD (parte 1) y el WOD (parte 2).');
  });

  it('si no se saltó nada no hay frase', () => {
    expect(describeSkipped(undefined)).toBeNull();
    expect(describeSkipped([])).toBeNull();
  });
});
