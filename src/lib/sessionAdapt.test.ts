import { describe, expect, it } from 'vitest';
import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { parseAsk } from '../features/dashboard/rexAsk';
import { adaptProposalAnswer, confirmAdaptText } from '../features/dashboard/rexAdapt';
import { planAdaptation, type AdaptPlan } from './sessionAdapt';
import { estimateSessionMinutes } from './sessionDuration';

const block = (b: Partial<SessionBlockResult> & Pick<SessionBlockResult, 'block'>): SessionBlockResult => ({ movementId: 'back-squat', ...b });
const session = (blocks: SessionBlockResult[], over: Partial<DailySession> = {}): DailySession => ({ date: '2026-11-09', mesocycleWeek: 2, isRestDay: false, blocks, ...over });

const full = session(
  [
    block({ block: 'warmup', movementId: 'jumping-jacks' }),
    block({ block: 'strength', movementId: 'back-squat', sets: 5, reps: '5', loadKg: 100 }),
    block({ block: 'oly', movementId: 'power-clean', sets: 4, reps: '2', loadKg: 60 }),
    block({ block: 'wod', movementId: 'thruster', format: 'AMRAP 12 min', wodKind: 'amrap' }),
    block({ block: 'accessory', movementId: 'pull-up', sets: 3 }),
    block({ block: 'skill', movementId: 'handstand-hold', reps: '8 min' }),
    block({ block: 'cooldown', movementId: 'stretch' }),
  ],
  { energySystem: 'umbral' },
);

const plan = (r: Parameters<typeof planAdaptation>[1], s = full) => planAdaptation(s, r) as AdaptPlan;
const keys = (p: AdaptPlan) => p.removed.map((r) => r.key);

describe('cambiar la sesión por minutos', () => {
  it('quita primero accesorio y técnica, y solo lo justo', () => {
    const before = estimateSessionMinutes(full);
    const p = plan({ how: 'minutos', minutes: before - 3 });
    expect(keys(p)).toEqual(['accessory']);
    expect(p.reached).toBe(true);
    expect(p.after).toBeLessThan(p.before);
    expect(p.session.editedByAthlete).toBe(true);
    expect(p.session.blocks.some((b) => b.block === 'accessory')).toBe(false);
    expect(p.session.blocks.some((b) => b.block === 'strength')).toBe(true);
  });

  it('si no basta, quita también la técnica, el oly y, con doble WOD, la segunda pieza', () => {
    const p = plan({ how: 'minutos', minutes: 35 });
    expect(keys(p)).toContain('accessory');
    expect(keys(p)).toContain('skill');
    // La fuerza y el WOD no se quitan solos.
    expect(p.session.blocks.some((b) => b.block === 'strength')).toBe(true);
    expect(p.session.blocks.some((b) => b.block === 'wod')).toBe(true);
  });

  it('con un tiempo imposible lo dice (reached false) sin tocar la fuerza ni el WOD', () => {
    const p = plan({ how: 'minutos', minutes: 10 });
    expect(p.reached).toBe(false);
    expect(p.session.blocks.some((b) => b.block === 'strength')).toBe(true);
    expect(p.session.blocks.some((b) => b.block === 'wod')).toBe(true);
  });

  it('si ya cabe no quita nada', () => {
    const p = plan({ how: 'minutos', minutes: 180 });
    expect(p.removed).toEqual([]);
    expect(p.reached).toBe(true);
  });

  it('un día de descanso no se cambia', () => {
    expect(planAdaptation(session([], { isRestDay: true }), { how: 'minutos', minutes: 30 })).toBe('sin-sesion');
  });
});

describe('quitar una parte o quedarse solo con una', () => {
  it('sin accesorio quita solo el accesorio y anota el motivo', () => {
    const p = plan({ how: 'sin', parts: ['accessory'] });
    expect(keys(p)).toEqual(['accessory']);
    expect(p.session.coachReasons?.[0]).toMatch(/sin accesorio/);
  });

  it('sin el WOD quita todas sus piezas y el sistema energético', () => {
    const p = plan({ how: 'sin', parts: ['wod1', 'wod2'] });
    expect(p.session.blocks.some((b) => b.block === 'wod')).toBe(false);
    expect(p.session.energySystem).toBeUndefined();
  });

  it('solo fuerza deja la fuerza y quita el resto de piezas (no el calentamiento)', () => {
    const p = plan({ how: 'solo', parts: ['strength'] });
    expect(keys(p).sort()).toEqual(['accessory', 'oly', 'skill', 'wod1'].sort());
    expect(p.session.blocks.map((b) => b.block)).toEqual(['warmup', 'strength', 'cooldown']);
  });

  it('quitarlo todo, o algo que no hay, se rechaza', () => {
    expect(planAdaptation(full, { how: 'sin', parts: ['strength', 'oly', 'wod1', 'accessory', 'skill'] })).toBe('dejaria-vacia');
    const noOly = session([block({ block: 'strength', sets: 3 }), block({ block: 'wod', format: 'AMRAP 8 min' })]);
    expect(planAdaptation(noOly, { how: 'sin', parts: ['oly'] })).toBe('nada-que-quitar');
  });
});

describe('leer las frases', () => {
  const read = (t: string) => parseAsk(t, 1);

  it('minutos de varias formas', () => {
    expect(read('tengo 30 minutos')).toMatchObject({ kind: 'adaptar', request: { how: 'minutos', minutes: 30 }, confirmed: false });
    expect(read('solo tengo 45 min hoy')).toMatchObject({ request: { how: 'minutos', minutes: 45 } });
    expect(read('tengo media hora')).toMatchObject({ request: { how: 'minutos', minutes: 30 } });
    expect(read('hoy tengo una hora')).toMatchObject({ request: { how: 'minutos', minutes: 60 } });
    expect(read('tengo 1h30')).toMatchObject({ request: { how: 'minutos', minutes: 90 } });
    expect(read('acorta la sesion a 40 minutos')).toMatchObject({ request: { how: 'minutos', minutes: 40 } });
  });

  it('quitar partes y quedarse solo con una', () => {
    expect(read('hoy sin accesorio')).toMatchObject({ kind: 'adaptar', request: { how: 'sin', parts: ['accessory'] } });
    expect(read('quita el wod')).toMatchObject({ request: { how: 'sin', parts: ['wod1', 'wod2'] } });
    expect(read('no quiero hacer oly ni tecnica')).toMatchObject({ request: { how: 'sin', parts: ['skill', 'oly'] } });
    expect(read('solo fuerza')).toMatchObject({ request: { how: 'solo', parts: ['strength'] } });
    expect(read('hoy solo el wod y el accesorio')).toMatchObject({ request: { how: 'solo', parts: ['accessory', 'wod1', 'wod2'] } });
  });

  it('confirmar y deshacer', () => {
    expect(read('confirmo cambio minutos 30')).toMatchObject({ kind: 'adaptar', request: { how: 'minutos', minutes: 30 }, confirmed: true });
    expect(read('confirmo cambio sin accesorio tecnica')).toMatchObject({ request: { how: 'sin', parts: ['accessory', 'skill'] }, confirmed: true });
    expect(read('deshaz el cambio')).toEqual({ kind: 'adaptar-deshacer' });
  });

  it('el botón de confirmar vuelve a leerse como lo pedido', () => {
    const p = plan({ how: 'sin', parts: ['accessory', 'skill'] });
    const ans = adaptProposalAnswer({ how: 'sin', parts: ['accessory', 'skill'] }, p);
    const ask = ans.actions[0].ask!;
    expect(ask).toBe(confirmAdaptText({ how: 'sin', parts: ['accessory', 'skill'] }));
    expect(read(ask)).toMatchObject({ kind: 'adaptar', confirmed: true, request: { how: 'sin' } });
  });

  it('acortar sin decir cuánto pregunta cuánto', () => {
    expect(read('acortar la sesion')).toEqual({ kind: 'adaptar-ayuda' });
    expect(read('tengo poco tiempo')).toEqual({ kind: 'adaptar-ayuda' });
  });

  it('lo que no es cambiar la sesión sigue siendo lo que era', () => {
    expect(read('cuanto dura la sesion de hoy').kind).not.toBe('adaptar');
    expect(read('hoy no entreno').kind).toBe('no-plan');
    expect(read('me duele el hombro').kind).toBe('dolor');
    expect(read('otro wod de 10 minutos').kind).toBe('otro-wod');
    expect(read('voy a faltar 3 dias').kind).toBe('faltar');
    expect(read('apunta 82,4 kg')).toEqual({ kind: 'peso', kg: 82.4 });
    expect(read('que toca mañana').kind).toBe('dia');
  });
});
