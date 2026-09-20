import { describe, it, expect } from 'vitest';
import { libraryWods } from './libraryWods';
import { getMovementById } from '../movements';

const nums = (s: string) => (s.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+/g) ?? []).map(Number);

describe('biblioteca de WODs reales', () => {
  it('es grande y los ids son unicos', () => {
    expect(libraryWods.length).toBeGreaterThan(1000);
    expect(new Set(libraryWods.map((w) => w.id)).size).toBe(libraryWods.length);
  });

  it('cada linea apunta a un movimiento del catalogo y trae una cantidad legible', () => {
    const bad: string[] = [];
    for (const w of libraryWods) {
      if (w.lines.length < 2) bad.push(`${w.id}: menos de 2 lineas`);
      for (const [id, reps] of w.lines) {
        if (!getMovementById(id)) bad.push(`${w.id}: movimiento ${id} no existe`);
        if (!/^(\d+(-\d+)*( (cal|m|s|min))?|\d+\/\d+ cal|máx( cal)?)$/.test(reps)) bad.push(`${w.id}: cantidad rara "${reps}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('las cantidades de cada linea salen del texto original (no se inventa ningun numero)', () => {
    const bad: string[] = [];
    for (const w of libraryWods) {
      const pool = nums(w.original);
      for (const [, reps] of w.lines) for (const n of nums(reps)) if (!pool.includes(n)) bad.push(`${w.id}: ${n} no esta en el original`);
    }
    expect(bad).toEqual([]);
  });

  it('el tipo de puntuacion es coherente con la cabecera', () => {
    const bad: string[] = [];
    for (const w of libraryWods) {
      if (/AMRAP/i.test(w.header) && w.scoreType !== 'rounds+reps') bad.push(`${w.id}: AMRAP con ${w.scoreType}`);
      if (/for time/i.test(w.header) && !/max/i.test(w.header) && w.scoreType !== 'time') bad.push(`${w.id}: for time con ${w.scoreType}`);
    }
    expect(bad).toEqual([]);
  });
});
