import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAsk } from '../features/dashboard/rexAsk';
import { buildUndo, clearUndo, peekUndo, saveUndo } from './weekUndo';
import type { WeekPlan } from './weekShift';

const MONDAY = 1;
const read = (t: string) => parseAsk(t, MONDAY);

describe('leer las frases de reorganizar la semana (hoy es lunes)', () => {
  it('desplazar la semana desde un día (por defecto, mañana)', () => {
    expect(read('desplaza la semana desde mañana')).toEqual({ kind: 'desplazar', from: 1, confirmed: false });
    expect(read('desplaza la semana')).toEqual({ kind: 'desplazar', from: 1, confirmed: false });
    expect(read('corre todo un día desde el miércoles')).toEqual({ kind: 'desplazar', from: 2, confirmed: false });
    expect(read('retrasa todas las sesiones desde hoy')).toEqual({ kind: 'desplazar', from: 0, confirmed: false });
  });

  it('insertar el martes en el viernes', () => {
    expect(read('inserta el martes en el viernes')).toEqual({ kind: 'mover', from: 1, to: 4, confirmed: false, mode: 'insertar' });
  });

  it('confirmar vuelve a leerse con los mismos días', () => {
    expect(read('confirmo insertar 1 4')).toEqual({ kind: 'mover', from: 1, to: 4, confirmed: true, mode: 'insertar' });
    expect(read('confirmo desplazar 1')).toEqual({ kind: 'desplazar', from: 1, confirmed: true });
    expect(read('confirmo intercambiar 1 4')).toMatchObject({ kind: 'mover', from: 1, to: 4, confirmed: true });
  });

  it('deshacer el cambio de la semana, distinto de deshacer una sesión acortada', () => {
    expect(read('deshaz el cambio de la semana')).toEqual({ kind: 'mover-deshacer' });
    expect(read('revierte el movimiento')).toEqual({ kind: 'mover-deshacer' });
    expect(read('deshaz el cambio')).toEqual({ kind: 'adaptar-deshacer' });
  });

  it('lo de antes sigue igual: pasar una sesión a otro día e intercambiar', () => {
    expect(read('pasa la sesión del martes al viernes')).toEqual({ kind: 'mover', from: 1, to: 4, confirmed: false });
    expect(read('intercambia el miércoles y el jueves')).toEqual({ kind: 'mover', from: 2, to: 3, confirmed: false });
    expect(read('mañana no puedo entrenar')).toEqual({ kind: 'mover', from: 1, to: null, confirmed: false });
  });
});

function fakeStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe('deshacer el último cambio de la semana', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: fakeStorage() }));
  afterEach(() => vi.unstubAllGlobals());

  const plan = { changes: [{ date: '2026-11-11', before: null, after: { date: '2026-11-11', mesocycleWeek: 1, isRestDay: true, blocks: [] } }], restBefore: ['2026-11-01'] } as unknown as WeekPlan;

  it('se guarda cómo estaba cada día y los descansos, y se recupera', () => {
    saveUndo(buildUndo(plan, 'desplazar la semana', 1000));
    const u = peekUndo(2000)!;
    expect(u.label).toBe('desplazar la semana');
    expect(u.sessions).toEqual([{ date: '2026-11-11', session: null }]);
    expect(u.restDates).toEqual(['2026-11-01']);
  });

  it('caduca a las 24 horas y se puede borrar', () => {
    saveUndo(buildUndo(plan, 'x', 1000));
    expect(peekUndo(1000 + 25 * 3_600_000)).toBeNull();
    clearUndo();
    expect(peekUndo(2000)).toBeNull();
  });
});
