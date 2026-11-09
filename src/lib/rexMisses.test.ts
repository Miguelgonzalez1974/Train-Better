import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMisses, listMisses, recordMiss } from './rexMisses';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('frases que Rex no ha entendido', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: fakeStorage() }));
  afterEach(() => vi.unstubAllGlobals());

  it('guarda la frase con la pantalla y cuenta las repeticiones (sin distinguir mayúsculas)', () => {
    recordMiss('  Quiero   un  helado ', 'dashboard', new Date('2026-11-09T10:00:00Z'));
    recordMiss('quiero un helado', 'nutricion', new Date('2026-11-09T11:00:00Z'));
    const [m] = listMisses();
    expect(listMisses()).toHaveLength(1);
    expect(m).toMatchObject({ text: 'Quiero un helado', screen: 'nutricion', count: 2 });
  });

  it('las más recientes primero y un máximo de 60', () => {
    for (let i = 0; i < 70; i++) recordMiss(`frase ${i}`, 'dashboard', new Date(Date.UTC(2026, 10, 9, 0, i)));
    const list = listMisses();
    expect(list).toHaveLength(60);
    expect(list[0].text).toBe('frase 69');
  });

  it('no guarda frases vacías y se puede borrar', () => {
    recordMiss('   ', 'dashboard');
    expect(listMisses()).toEqual([]);
    recordMiss('algo', 'dashboard');
    clearMisses();
    expect(listMisses()).toEqual([]);
  });

  it('sin almacenamiento no falla', () => {
    vi.stubGlobal('window', undefined);
    expect(() => recordMiss('algo', 'dashboard')).not.toThrow();
    expect(listMisses()).toEqual([]);
  });
});
