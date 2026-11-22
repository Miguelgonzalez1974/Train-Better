import { describe, expect, it } from 'vitest';
import { displayHrv, loadHrvUnit, parseHrv, saveHrvUnit, stepHrv } from './hrvUnit';

describe('hrvUnit', () => {
  it('enseña el valor en la unidad elegida', () => {
    expect(displayHrv(43, 'ms')).toBe('43');
    expect(displayHrv(42.5, 'ms')).toBe('42,5');
    expect(displayHrv(42.5, 'nota')).toBe('7,5');
  });

  it('lee lo escrito en la unidad elegida y lo devuelve en milisegundos', () => {
    expect(parseHrv('43', 'ms')).toBe(43);
    expect(parseHrv('42,5', 'ms')).toBe(42.5);
    expect(parseHrv('7,5', 'nota')).toBeCloseTo(42.5, 0);
  });

  it('rechaza lo vacío, lo ilegible y lo imposible', () => {
    expect(parseHrv('', 'ms')).toBeNull();
    expect(parseHrv('abc', 'ms')).toBeNull();
    expect(parseHrv('5', 'ms')).toBeNull();
    expect(parseHrv('900', 'ms')).toBeNull();
    expect(parseHrv('3', 'nota')).toBeNull();
    expect(parseHrv('7,5', 'ms')).toBeNull();
  });

  it('los botones dan un paso de 1 ms o de 0,1 de nota', () => {
    expect(stepHrv(43, 'ms', 1)).toBe(44);
    expect(stepHrv(43, 'ms', -1)).toBe(42);
    expect(displayHrv(stepHrv(42.5, 'nota', 1), 'nota')).toBe('7,6');
    expect(displayHrv(stepHrv(42.5, 'nota', -1), 'nota')).toBe('7,4');
  });

  it('los pasos no se salen de lo posible', () => {
    expect(stepHrv(15, 'ms', -1)).toBe(15);
    expect(stepHrv(250, 'ms', 1)).toBe(250);
  });

  it('recuerda la unidad y tolera que no haya almacenamiento', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadHrvUnit(store)).toBe('ms');
    saveHrvUnit(store, 'nota');
    expect(loadHrvUnit(store)).toBe('nota');
    expect(loadHrvUnit(null)).toBe('ms');
    expect(() => saveHrvUnit(null, 'nota')).not.toThrow();
  });
});
