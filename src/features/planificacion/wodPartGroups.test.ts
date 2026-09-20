import { describe, it, expect } from 'vitest';
import { groupWodByPart } from './wodPartGroups';

const e = (id: string, wodPart?: 1 | 2) => ({ id, wodPart });

describe('groupWodByPart', () => {
  it('un WOD normal (sin partes) es un solo grupo, tal cual y con sus indices', () => {
    const entries = [e('a'), e('b'), e('c')];
    const g = groupWodByPart(entries, [4, 5, 6]);
    expect(g).toHaveLength(1);
    expect(g[0].part).toBeNull();
    expect(g[0].entries).toBe(entries);
    expect(g[0].indices).toEqual([4, 5, 6]);
  });

  it('un dia doble son dos grupos consecutivos, cada uno con los indices globales de sus entradas', () => {
    const entries = [e('a', 1), e('b', 1), e('c', 2), e('d', 2), e('e', 2)];
    const g = groupWodByPart(entries, [3, 4, 5, 6, 7]);
    expect(g.map((x) => x.part)).toEqual([1, 2]);
    expect(g[0].entries.map((x) => x.id)).toEqual(['a', 'b']);
    expect(g[0].indices).toEqual([3, 4]);
    expect(g[1].entries.map((x) => x.id)).toEqual(['c', 'd', 'e']);
    expect(g[1].indices).toEqual([5, 6, 7]);
  });

  it('sin indices (vista de solo lectura) tambien agrupa; y no pierde ni duplica entradas', () => {
    const entries = [e('a', 1), e('b', 2), e('c', 2)];
    const g = groupWodByPart(entries);
    expect(g.map((x) => x.indices)).toEqual([undefined, undefined]);
    expect(g.flatMap((x) => x.entries.map((y) => y.id))).toEqual(['a', 'b', 'c']);
  });

  it('una entrada sin parte dentro de un dia con partes cuenta como parte 1 (nunca se pierde)', () => {
    const g = groupWodByPart([e('a'), e('b', 1), e('c', 2)], [0, 1, 2]);
    expect(g.map((x) => [x.part, x.entries.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it('un bloque vacio devuelve un grupo vacio sin romper', () => {
    expect(groupWodByPart([], [])).toEqual([{ part: null, entries: [], indices: [] }]);
  });
});
