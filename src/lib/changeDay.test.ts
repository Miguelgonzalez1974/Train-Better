import { describe, expect, it } from 'vitest';
import { parseAsk } from '../features/dashboard/rexAsk';
import { changeDayActionsAnswer, changeDayPickAnswer } from '../features/dashboard/rexChangeDay';

const TODAY = '2026-03-02'; // lunes
const MONDAY = 1;
const read = (t: string) => parseAsk(t, MONDAY);

describe('«Cambiar día»', () => {
  it('se entiende con o sin día', () => {
    expect(read('cambiar dia')).toEqual({ kind: 'cambiar-dia', from: null });
    expect(read('Cambiar día')).toEqual({ kind: 'cambiar-dia', from: null });
    expect(read('cambiar de día')).toEqual({ kind: 'cambiar-dia', from: null });
    expect(read('cambiar dia el jueves')).toEqual({ kind: 'cambiar-dia', from: 3 });
    expect(read('cambiar dia mañana')).toEqual({ kind: 'cambiar-dia', from: 1 });
    expect(read('cambiar dia hoy')).toEqual({ kind: 'cambiar-dia', from: 0 });
  });

  it('lo de antes sigue igual', () => {
    expect(read('mover la sesión')).toEqual({ kind: 'mover-ayuda' });
    expect(read('cambia el miércoles por el jueves')).toMatchObject({ kind: 'mover', from: 2, to: 3 });
    expect(read('cambiar la sesión de hoy').kind).not.toBe('cambiar-dia');
  });

  it('paso 1: cada botón de día vuelve a leerse como ese día', () => {
    const a = changeDayPickAnswer([{ iso: '2026-03-02' }, { iso: '2026-03-03' }, { iso: '2026-03-05' }], TODAY);
    expect(a.actions.map((x) => x.label)).toEqual(['Hoy', 'Mañana', 'El jueves']);
    expect(a.actions.map((x) => read(x.ask!))).toEqual([
      { kind: 'cambiar-dia', from: 0 },
      { kind: 'cambiar-dia', from: 1 },
      { kind: 'cambiar-dia', from: 3 },
    ]);
  });

  it('sin días con sesión lo dice, sin botones', () => {
    expect(changeDayPickAnswer([], TODAY).actions).toEqual([]);
  });

  it('paso 2: pasarla a otro día, intercambio, que elija Rex y desplazar, todo como frases que se entienden', () => {
    const a = changeDayActionsAnswer('2026-03-05', [{ iso: '2026-03-06' }, { iso: '2026-03-04', swap: true }], true, true, TODAY);
    expect(a.actions.map((x) => x.label)).toEqual(['Al viernes', 'Con el miércoles (intercambio)', 'Que elija Rex', 'Desplazar la semana desde aquí']);
    const intents = a.actions.map((x) => read(x.ask!));
    expect(intents[0]).toEqual({ kind: 'mover', from: 3, to: 4, confirmed: false });
    expect(intents[1]).toEqual({ kind: 'mover', from: 3, to: 2, confirmed: false });
    expect(intents[2]).toEqual({ kind: 'mover', from: 3, to: null, confirmed: false });
    expect(intents[3]).toEqual({ kind: 'desplazar', from: 3, confirmed: false });
  });

  it('el día de hoy y mañana se dicen con sus palabras', () => {
    const a = changeDayActionsAnswer(TODAY, [{ iso: '2026-03-03' }], false, true, TODAY);
    expect(read(a.actions[0].ask!)).toEqual({ kind: 'mover', from: 0, to: 1, confirmed: false });
    expect(read(a.actions[1].ask!)).toEqual({ kind: 'mover', from: 0, to: null, confirmed: false });
  });
});
