import { describe, expect, it } from 'vitest';
import { addDays, type FormSeries, type FormWindow } from '../../engine/formCurve';
import type { LoadTag } from '../../engine/formPlan';
import { formRowNote, windowCause, type FormModel } from './formModel';

const TODAY = '2026-10-31';
const plan: FormSeries = { points: [], todayIndex: 0, ready: true, sessions: 20, spanDays: 40 };
const win = (start: number, end: number, peak = 10): FormWindow => ({ start: addDays(TODAY, start), end: addDays(TODAY, end), days: end - start + 1, peakIso: addDays(TODAY, start), peak });

function model(over: Partial<FormModel> = {}): FormModel {
  const windows = over.windows ?? [];
  return { todayIso: TODAY, comp: null, plan, windows, allWindows: over.allWindows ?? windows, tags: new Map<string, LoadTag>(), ...over };
}

describe('formRowNote', () => {
  it('sin ventanas a la vista no dice nada (la fila usa su frase de siempre)', () => {
    expect(formRowNote(model())).toBeNull();
  });

  it('con una ventana abierta hoy dice hasta cuándo dura', () => {
    expect(formRowNote(model({ allWindows: [win(-1, 3)], windows: [win(-1, 3)] }))).toMatch(/^Ventana abierta hasta el /);
    expect(formRowNote(model({ allWindows: [win(-2, 0)], windows: [win(-2, 0)] }))).toBe('Ventana abierta hoy: buen día para apretar');
  });

  it('con una ventana por venir dice cuántos días faltan', () => {
    expect(formRowNote(model({ windows: [win(5, 8)] }))).toMatch(/^Próxima ventana en 5 días · /);
    expect(formRowNote(model({ windows: [win(1, 3)] }))).toMatch(/^Próxima ventana mañana · /);
  });

  it('si la próxima ventana es la de la competición lo dice', () => {
    const comp = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };
    expect(formRowNote(model({ comp, windows: [win(5, 6)] }))).toMatch(/^Llegas en ventana a la competición · /);
  });
});

describe('windowCause', () => {
  it('la ventana de la competición se distingue', () => {
    const comp = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };
    expect(windowCause(win(5, 6), model({ comp })).kind).toBe('competicion');
  });

  it('el motivo sale de lo que pasó en los días anteriores', () => {
    const tags = new Map<string, LoadTag>([[addDays(TODAY, 9), 'recuperacion']]);
    expect(windowCause(win(11, 14), model({ tags })).label).toBe('Tras recuperarte de la competición');
    const descarga = new Map<string, LoadTag>([[addDays(TODAY, 22), 'descarga']]);
    expect(windowCause(win(24, 27), model({ tags: descarga })).label).toBe('Tras tu semana de descarga');
    expect(windowCause(win(24, 27), model()).label).toBe('Tras unos días de menos carga');
  });
});
