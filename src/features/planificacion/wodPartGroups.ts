/**
 * Agrupa las entradas de un bloque de WOD por parte (`wodPart`): un día normal es un solo grupo sin
 * parte (`part: null`); un día de doble WOD son dos grupos consecutivos (1 y 2), cada uno con los índices
 * globales de sus entradas en `session.blocks` (para poder editarlas). Puro, sin React.
 */
export interface WodPartGroup<T> {
  part: 1 | 2 | null;
  entries: T[];
  indices: number[] | undefined;
}

export function groupWodByPart<T extends { wodPart?: 1 | 2 }>(entries: T[], indices?: number[]): WodPartGroup<T>[] {
  if (!entries.some((e) => e.wodPart !== undefined)) return [{ part: null, entries, indices }];
  const groups: WodPartGroup<T>[] = [];
  entries.forEach((entry, i) => {
    const part = entry.wodPart ?? 1;
    const last = groups[groups.length - 1];
    if (last && last.part === part) {
      last.entries.push(entry);
      last.indices?.push(indices![i]);
    } else {
      groups.push({ part, entries: [entry], indices: indices ? [indices[i]] : undefined });
    }
  });
  return groups;
}
