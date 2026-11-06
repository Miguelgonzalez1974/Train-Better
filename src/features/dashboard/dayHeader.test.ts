import { describe, expect, it } from 'vitest';
import type { Macrocycle } from '../../data/athlete/types';
import { headerDate, macroChip } from './dayHeader';

const macro = (o: Partial<Macrocycle> = {}): Macrocycle => ({ id: 'm', label: 'Prep competición', startDate: '2026-10-12', endDate: '2026-11-22', ...o });

describe('la fecha de la cabecera', () => {
  it('día de la semana, número y mes corto', () => {
    expect(headerDate('2026-11-06')).toBe('Viernes 6 nov');
    expect(headerDate('2026-11-01')).toBe('Domingo 1 nov');
    expect(headerDate('2026-12-31')).toBe('Jueves 31 dic');
  });
});

describe('el macro activo en la cabecera', () => {
  it('nombre y semana dentro del macro', () => {
    expect(macroChip([macro()], '2026-11-06', null)).toEqual({ label: 'Prep competición', week: 'sem. 4/6', countdown: null });
  });

  it('con competición por delante cuenta los días; el día mismo o pasada no', () => {
    expect(macroChip([macro()], '2026-11-06', 31)?.countdown).toBe('31 d');
    expect(macroChip([macro()], '2026-11-06', 0)?.countdown).toBeNull();
    expect(macroChip([macro()], '2026-11-06', -2)?.countdown).toBeNull();
  });

  it('sin macro activo hoy no hay nada, y un nombre vacío no deja la etiqueta en blanco', () => {
    expect(macroChip([], '2026-11-06', null)).toBeNull();
    expect(macroChip([macro({ startDate: '2026-12-01', endDate: '2026-12-30' })], '2026-11-06', null)).toBeNull();
    expect(macroChip([macro({ label: '  ' })], '2026-11-06', null)?.label).toBe('Macrociclo');
  });
});
