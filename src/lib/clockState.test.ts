import { describe, expect, it, vi } from 'vitest';
import { clockBus, clockState } from './clockState';

describe('clockBus', () => {
  it('avisa a quien escucha con el modo pedido, y sin modo manda undefined (el cronometro del WOD)', () => {
    const fn = vi.fn();
    const off = clockBus.on(fn);
    expect(clockBus.open('rest')).toBe(1);
    clockBus.open();
    expect(fn.mock.calls).toEqual([['rest'], [undefined]]);
    off();
    expect(clockBus.open('workout')).toBe(0);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('clockState', () => {
  it('avisa solo cuando cambia, y deja de avisar al darse de baja', () => {
    clockState.setActive(false);
    const fn = vi.fn();
    const off = clockState.subscribe(fn);
    clockState.setActive(true);
    clockState.setActive(true);
    expect(clockState.isActive()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    clockState.setActive(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(clockState.isActive()).toBe(false);
  });
});
