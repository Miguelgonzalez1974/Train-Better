import { describe, expect, it } from 'vitest';
import { benchmarkWorkouts } from '../data/movements';
import { getCatalogWod, getWodCatalog } from './wodCatalog';
import { programmedBlocks } from './wodStructure';

const dur = (id: string) => getCatalogWod(`bm:${id}`)!.durationMin;

describe('duraciones de formatos con bloques y descansos', () => {
  it('5 rondas de AMRAP 3 con 1 min de descanso entre rondas = 19 min (The Chief)', () => {
    expect(programmedBlocks('5 rondas de AMRAP 3 (1 min de descanso entre rondas): 3 power cleans')).toMatchObject({ minutes: 19, restMinutes: 4 });
    expect(dur('the-chief')).toBe(19);
  });

  it('10 series de AMRAP 1:30 con 30 seg de descanso = 19,5 min (Mayhem 142, antes 280)', () => {
    expect(dur('mayhem-142')).toBe(19.5);
    expect(dur('mayhem-146')).toBe(15.5);
  });

  it('bloques AMRAP en fila con descansos sueltos se suman', () => {
    expect(programmedBlocks('AMRAP 10:00: 10 Pull-Up; descanso 2 min; AMRAP 10:00: 16 lunges')?.minutes).toBe(22);
    expect(programmedBlocks('Bloques AMRAP 2-2-2-3 con 1 min de descanso entre bloques')?.minutes).toBe(12);
    expect(programmedBlocks('5 rondas: AMRAP 2:00: 15 cal Row; descanso 2 min')?.minutes).toBe(18);
  });

  it('una serie que empieza cada cierto tiempo cuenta el periodo, no solo el bloque', () => {
    expect(programmedBlocks('12 series de AMRAP 1:15 (nueva serie cada 3:00): 10 Box Jump')?.minutes).toBe(34.25);
  });

  it('series con varios bloques y descanso entre series (Mayhem 94) = 33 min', () => {
    expect(dur('mayhem-94')).toBe(33);
  });

  it('un AMRAP con distancias no confunde los metros con minutos', () => {
    expect(programmedBlocks('3 series: 4 min AMRAP 500/400m Ski Erg, descanso 1:00, 4 min AMRAP Run, descanso 3:00 entre series')?.minutes).toBe(33);
  });

  it('si el texto mezcla bloques con partes "for time" no inventa la duración', () => {
    expect(programmedBlocks('For time: 2000m Row; AMRAP 7:00: max Step-Up; For time: 1000m')).toBeNull();
    expect(programmedBlocks('2 bloques AMRAP 8 + ventana para 5RM')).toBeNull();
  });

  it('un AMRAP sencillo sigue igual', () => {
    expect(programmedBlocks('AMRAP 20 min: 5 pull-ups, 10 push-ups, 15 air squats')?.minutes).toBe(20);
    expect(dur('cindy')).toBe(20);
  });

  it('Fight Gone Bad dura 17 min (3 rondas x 5 estaciones de 1 min + 2 de descanso)', () => {
    expect(dur('fight-gone-bad')).toBe(17);
  });

  it('ningún benchmark declara una duración absurda', () => {
    const big = getWodCatalog().filter((w) => w.origin === 'benchmark' && (w.durationMin ?? 0) > 70);
    expect(big.map((w) => `${w.id} ${w.durationMin}`)).toEqual([]);
    expect(benchmarkWorkouts.length).toBeGreaterThan(1300);
  });
});
