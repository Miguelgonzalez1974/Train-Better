import { describe, expect, it } from 'vitest';
import type { StrengthProgram } from '../data/athlete/types';
import { companionIndexForDate } from './companionSchedule';

const program = (over: Partial<NonNullable<StrengthProgram['companion']>> = {}): StrengthProgram & { companion: NonNullable<StrengthProgram['companion']> } => ({
  id: 'p', startDate: '2026-11-09', endDate: '2027-01-03', method: 'texas', lifts: [],
  companion: { weekdays: [0, 2, 4], weeks: 8, cursor: 0, deferrals: 0, ...over },
});

// Hoy es martes 10 nov 2026; el programa (lunes, miércoles y viernes) empezó ayer.
const TODAY = '2026-11-10';

describe('qué sesión del programa toca cada día', () => {
  it('desde la que va por delante, una por cada día del programa', () => {
    // Ya se hizo la del lunes (cursor 1, resuelta el 9): la siguiente es la del miércoles.
    const p = program({ cursor: 1, lastResolvedOn: '2026-11-09' });
    expect(companionIndexForDate(p, '2026-11-11', TODAY)).toBe(1);
    expect(companionIndexForDate(p, '2026-11-13', TODAY)).toBe(2);
    expect(companionIndexForDate(p, '2026-11-16', TODAY)).toBe(3);
  });

  it('los días que no son del programa no tienen sesión, ni los pasados', () => {
    const p = program({ cursor: 1, lastResolvedOn: '2026-11-09' });
    expect(companionIndexForDate(p, '2026-11-12', TODAY)).toBeNull();
    expect(companionIndexForDate(p, '2026-11-10', TODAY)).toBeNull();
    expect(companionIndexForDate(p, '2026-11-09', TODAY)).toBeNull();
  });

  it('si la del lunes quedó pendiente se ofrece hoy, y las demás siguen detrás', () => {
    const p = program({ cursor: 0 });
    expect(companionIndexForDate(p, '2026-11-10', TODAY)).toBe(0);
    expect(companionIndexForDate(p, '2026-11-11', TODAY)).toBe(1);
  });

  it('si hoy la aplazas, empieza mañana', () => {
    const p = program({ cursor: 0, declinedOn: TODAY });
    expect(companionIndexForDate(p, '2026-11-10', TODAY)).toBeNull();
    expect(companionIndexForDate(p, '2026-11-11', TODAY)).toBe(0);
  });

  it('con pausa empieza después, y no hay nada tras la última sesión ni fuera del programa', () => {
    expect(companionIndexForDate(program({ cursor: 1, lastResolvedOn: '2026-11-09', pausedUntil: '2026-11-15' }), '2026-11-16', TODAY)).toBe(1);
    expect(companionIndexForDate(program({ cursor: 24 }), '2026-11-13', TODAY)).toBeNull();
    expect(companionIndexForDate(program({ cursor: 1, lastResolvedOn: '2026-11-09' }), '2027-02-01', TODAY)).toBeNull();
  });
});
