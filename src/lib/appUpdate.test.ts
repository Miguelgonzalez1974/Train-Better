import { describe, expect, it, vi } from 'vitest';
import { appUpdate } from './appUpdate';

describe('aviso de versión nueva', () => {
  it('avisa a los suscritos solo cuando cambia el estado, y se puede quitar', () => {
    const listener = vi.fn();
    const off = appUpdate.subscribe(listener);
    expect(appUpdate.available()).toBe(false);
    appUpdate.setAvailable(true);
    appUpdate.setAvailable(true);
    expect(appUpdate.available()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    appUpdate.setAvailable(false);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    appUpdate.setAvailable(true);
    expect(listener).toHaveBeenCalledTimes(2);
    appUpdate.setAvailable(false);
  });
});
