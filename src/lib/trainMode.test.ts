import { describe, expect, it } from 'vitest';
import { clearListStart, clockLabel, elapsedMinutes, listStartedAt, LIST_START_MAX_MS, readTrainMode, writeTrainMode } from './trainMode';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('trainMode', () => {
  it('recuerda el modo y ignora valores raros', () => {
    const s = memoryStore();
    expect(readTrainMode(s)).toBeNull();
    writeTrainMode(s, 'list');
    expect(readTrainMode(s)).toBe('list');
    s.setItem('train-better.trainMode', 'otro');
    expect(readTrainMode(s)).toBeNull();
    expect(readTrainMode(null)).toBeNull();
  });

  it('un almacenamiento que falla no rompe nada', () => {
    const broken = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    };
    expect(readTrainMode(broken)).toBeNull();
    expect(() => writeTrainMode(broken, 'cards')).not.toThrow();
    expect(listStartedAt(broken, '2026-11-21', 1000)).toBe(1000);
  });

  it('guarda la hora de inicio del día y la reutiliza', () => {
    const s = memoryStore();
    expect(listStartedAt(s, '2026-11-21', 1_000_000)).toBe(1_000_000);
    expect(listStartedAt(s, '2026-11-21', 1_500_000)).toBe(1_000_000);
  });

  it('empieza de nuevo si es otro día, si es muy vieja o si se borró', () => {
    const s = memoryStore();
    listStartedAt(s, '2026-11-21', 1_000_000);
    expect(listStartedAt(s, '2026-11-22', 2_000_000)).toBe(2_000_000);
    expect(listStartedAt(s, '2026-11-22', 2_000_000 + LIST_START_MAX_MS + 1)).toBe(2_000_000 + LIST_START_MAX_MS + 1);
    clearListStart(s);
    expect(listStartedAt(s, '2026-11-22', 9_000_000)).toBe(9_000_000);
  });

  it('los minutos del cierre salen redondeados y acotados', () => {
    expect(elapsedMinutes(0, 62 * 60000 + 20000)).toBe(62);
    expect(elapsedMinutes(0, 3 * 60000)).toBe(10);
    expect(elapsedMinutes(0, 9 * 3600000)).toBe(240);
  });

  it('formatea el reloj', () => {
    expect(clockLabel(32 * 60000 + 18000)).toBe('32:18');
    expect(clockLabel(3600000 + 5 * 60000 + 9000)).toBe('1:05:09');
    expect(clockLabel(-5)).toBe('00:00');
  });
});
