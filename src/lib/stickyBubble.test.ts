import { describe, expect, it } from 'vitest';
import { markStickyClosed, stickyClosed } from './stickyBubble';

function fake() {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('el globo fijo de Rex', () => {
  it('cerrado hoy no vuelve hoy, pero sí otro día o con otra frase', () => {
    const s = fake();
    expect(stickyClosed(s, '2026-11-06', 'cierre')).toBe(false);
    markStickyClosed(s, '2026-11-06', 'cierre');
    expect(stickyClosed(s, '2026-11-06', 'cierre')).toBe(true);
    expect(stickyClosed(s, '2026-11-07', 'cierre')).toBe(false);
    expect(stickyClosed(s, '2026-11-06', 'otro')).toBe(false);
  });

  it('cada marca (slot) va por separado: cerrar el globo no marca el lab como visto', () => {
    const s = fake();
    markStickyClosed(s, '2026-11-06', 'cierre');
    expect(stickyClosed(s, '2026-11-06', 'cierre', 'tb-lab-seen')).toBe(false);
    markStickyClosed(s, '2026-11-06', 'cierre', 'tb-lab-seen');
    expect(stickyClosed(s, '2026-11-06', 'cierre', 'tb-lab-seen')).toBe(true);
    expect(stickyClosed(s, '2026-11-06', 'cierre')).toBe(true);
  });

  it('sin almacenamiento o si falla, simplemente se ve', () => {
    expect(stickyClosed(null, '2026-11-06', 'cierre')).toBe(false);
    expect(stickyClosed({ getItem: () => { throw new Error('bloqueado'); } }, '2026-11-06', 'cierre')).toBe(false);
    expect(() => markStickyClosed(null, '2026-11-06', 'cierre')).not.toThrow();
  });
});
