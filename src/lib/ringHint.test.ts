import { describe, expect, it } from 'vitest';
import { markRingHintSeen, ringHintSeen } from './ringHint';

describe('la pista de los anillos', () => {
  it('no se ha visto hasta que se marca, y después se recuerda', () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(ringHintSeen(fake)).toBe(false);
    markRingHintSeen(fake);
    expect(ringHintSeen(fake)).toBe(true);
  });

  it('sin almacenamiento, o si falla, no rompe y la pista simplemente se vuelve a ver', () => {
    expect(ringHintSeen(null)).toBe(false);
    expect(() => markRingHintSeen(null)).not.toThrow();
    expect(ringHintSeen({ getItem: () => { throw new Error('bloqueado'); } })).toBe(false);
    expect(() => markRingHintSeen({ setItem: () => { throw new Error('lleno'); } })).not.toThrow();
  });
});