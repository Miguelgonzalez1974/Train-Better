import { describe, it, expect } from 'vitest';
import { allMovements, getMovementById } from './index';

describe('catalogo de movimientos', () => {
  it('no tiene ids duplicados', () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const m of allMovements) {
      if (seen.has(m.id)) dups.push(m.id);
      seen.add(m.id);
    }
    expect(dups).toEqual([]);
  });

  it('todo progressionOf apunta a un id real', () => {
    const broken = allMovements
      .filter((m) => m.progressionOf && !getMovementById(m.progressionOf))
      .map((m) => `${m.id} -> ${m.progressionOf}`);
    expect(broken).toEqual([]);
  });

  it('progressionOf no forma ciclos', () => {
    const cyclic: string[] = [];
    for (const start of allMovements) {
      const seen = new Set<string>();
      let cur = start;
      while (cur.progressionOf) {
        if (seen.has(cur.id)) {
          cyclic.push(start.id);
          break;
        }
        seen.add(cur.id);
        const next = getMovementById(cur.progressionOf);
        if (!next) break;
        cur = next;
      }
    }
    expect(cyclic).toEqual([]);
  });

  it('cada movimiento declara al menos un bloque y un patron', () => {
    const bad = allMovements.filter((m) => m.blocks.length === 0 || !m.pattern).map((m) => m.id);
    expect(bad).toEqual([]);
  });
});
