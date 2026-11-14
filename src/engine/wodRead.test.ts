import { describe, expect, it } from 'vitest';
import type { WodSplitsRecord } from '../data/athlete/types';
import type { Ghost } from './wodGhost';
import { movementIdByName, readWod } from './wodRead';

const record = (segments: number[], extra: Partial<WodSplitsRecord> = {}): WodSplitsRecord => ({
  date: '2026-11-14',
  part: 1,
  key: 'k',
  mode: 'ronda',
  labels: [],
  segments,
  totalSeconds: segments.reduce((a, b) => a + b, 0),
  rx: true,
  ...extra,
});
const ghost = (durations: number[]): Ghost => ({ kind: 'parciales', date: '2026-11-01', durations, totalSeconds: durations.reduce((a, b) => a + b, 0), rx: true });
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('lectura de Rex tras el WOD', () => {
  it('detecta el hundimiento: una racha de rondas que pierdes, y si recuperas al final', () => {
    // 10 rondas contra un fantasma de 120: bien las 4 primeras, cuatro lentas (5 a 8), y recuperas.
    const seg = [110, 110, 110, 110, 130, 135, 132, 133, 105, 105];
    const r = readWod(record(seg), ghost(flat(10, 120)))!;
    expect(r.lead).toContain('rondas 5 a 8');
    expect(r.lead).toContain('perdiste');
    expect(r.lead).toContain('recuperaste al final');
    expect(r.tip).toContain('5 a 8');
  });

  it('no dice «recuperaste» si no recuperas', () => {
    const seg = [110, 110, 110, 110, 130, 135, 132, 133, 130, 131];
    const r = readWod(record(seg), ghost(flat(10, 120)))!;
    expect(r.lead).toContain('rondas 5 a 10');
    expect(r.lead).not.toContain('recuperaste');
  });

  it('un ritmo limpio no dice nada, y una racha corta o pequeña tampoco', () => {
    expect(readWod(record(flat(10, 118)), ghost(flat(10, 120)))).toBeNull();
    // Una sola ronda perdida (no es racha).
    expect(readWod(record([110, 110, 150, 110, 110, 110]), ghost(flat(6, 120)))).toBeNull();
    // Dos rondas perdidas por poco: no llega a la pérdida mínima.
    expect(readWod(record([110, 110, 124, 124, 110, 110]), ghost(flat(6, 120)))).toBeNull();
  });

  it('si pierdes en casi todas las rondas no es un hundimiento sino tu ritmo: no se cuenta como racha', () => {
    expect(readWod(record(flat(10, 130)), ghost(flat(10, 120)))).toBeNull();
    expect(readWod(record([110, 130, 130, 130, 130, 130, 130, 130, 130, 130]), ghost(flat(10, 120)))).toBeNull();
  });

  it('sin fantasma lee la caída propia: las dos últimas rondas contra las dos primeras', () => {
    const r = readWod(record([100, 102, 110, 118, 125, 130, 140, 150]), null)!;
    expect(r.lead).toContain('Fuiste cayendo');
    expect(r.tip).toMatch(/abre unos \d+ s más tranquilo/);
    expect(readWod(record(flat(8, 100)), null)).toBeNull();
  });

  it('con menos de 4 rondas no hay hundimiento que leer', () => {
    expect(readWod(record([100, 140, 180]), null)).toBeNull();
  });

  it('por movimientos, cada movimiento frente al fantasma por ronda, y el que más cede es el punto flojo', () => {
    const labels = ['Row', 'Kipping Pull-Up', 'Ring Dip'];
    const g = ghost(flat(12, 40)); // 4 rondas x 3 movimientos a 40 s
    const seg = Array.from({ length: 4 }, () => [50, 37, 40]).flat();
    const r = readWod(record(seg, { mode: 'movimiento', labels }), g)!;
    expect(r.rows.map((x) => [x.name, x.slowerPerRound])).toEqual([
      ['Row', 10],
      ['Kipping Pull-Up', -3],
      ['Ring Dip', 0],
    ]);
    expect(r.weak?.name).toBe('Row');
    // El Row es cardio: no hay objetivo para trabajarlo, solo se cuida el ritmo.
    expect(r.weak?.movementId).toBeNull();
  });

  it('si el movimiento flojo tiene objetivo propio (gimnásticos), ofrece trabajarlo', () => {
    const labels = ['Row', 'Kipping Pull-Up', 'Ring Dip'];
    const seg = Array.from({ length: 4 }, () => [40, 52, 40]).flat();
    const r = readWod(record(seg, { mode: 'movimiento', labels }), ghost(flat(12, 40)))!;
    expect(r.weak?.name).toBe('Kipping Pull-Up');
    expect(r.weak?.movementId).not.toBeNull();
    expect(movementIdByName('kipping pull-up')).toBe(r.weak?.movementId);
  });

  it('un movimiento que cede poco no es punto flojo', () => {
    const labels = ['Row', 'Kipping Pull-Up'];
    const seg = Array.from({ length: 4 }, () => [41, 40]).flat();
    expect(readWod(record(seg, { mode: 'movimiento', labels }), ghost(flat(8, 40)))).toBeNull();
  });

  it('no compara con un fantasma de otra forma (otros tramos)', () => {
    // Ritmo propio regular y un fantasma de 3 tramos para 6: no se compara ni se inventa un hundimiento.
    expect(readWod(record([110, 110, 112, 110, 110, 112]), ghost(flat(3, 120)))).toBeNull();
  });
});
