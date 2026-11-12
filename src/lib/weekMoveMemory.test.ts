import { describe, expect, it } from 'vitest';
import { loadWeekMoveMemory, saveWeekMoveMemory, withWeekMoveStatus } from './weekMoveMemory';

const store = (initial: string | null = null) => {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_: string, v: string) => {
      value = v;
    },
    get value() {
      return value;
    },
  };
};

describe('memoria de la propuesta de mover la semana', () => {
  it('apunta lo que pasó con una semana sin tocar la anterior', () => {
    const a = withWeekMoveStatus({}, '2026-03-09', 'later');
    const b = withWeekMoveStatus(a, '2026-03-16', 'applied');
    expect(a).toEqual({ '2026-03-09': 'later' });
    expect(b).toEqual({ '2026-03-09': 'later', '2026-03-16': 'applied' });
  });

  it('solo conserva las últimas semanas', () => {
    let m = {};
    for (let i = 1; i <= 12; i++) m = withWeekMoveStatus(m, `2026-03-${String(i).padStart(2, '0')}`, 'later');
    expect(Object.keys(m)).toHaveLength(8);
    expect(Object.keys(m)[0]).toBe('2026-03-05');
  });

  it('se guarda y se lee, y si falla o está roto devuelve vacío', () => {
    const s = store();
    saveWeekMoveMemory(s, { '2026-03-09': 'applied' });
    expect(loadWeekMoveMemory(s)).toEqual({ '2026-03-09': 'applied' });
    expect(loadWeekMoveMemory(store('no es json'))).toEqual({});
    expect(loadWeekMoveMemory(store('{"2026-03-09":"otra cosa"}'))).toEqual({});
    expect(loadWeekMoveMemory(null)).toEqual({});
  });
});
