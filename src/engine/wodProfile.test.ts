import { describe, expect, it } from 'vitest';
import { libraryWods } from '../data/library/libraryWods';
import { benchmarkWorkouts } from '../data/movements';
import { getWodCatalog, volumeEstimateAccuracy } from './wodCatalog';
import { allWodProfiles, durationModelAccuracy, getWodProfile } from './wodProfile';
import { matchMovement, parseLadder, structureFromBenchmark, structureFromLibrary } from './wodStructure';

const bm = (id: string) => {
  const w = benchmarkWorkouts.find((b) => b.id === id)!;
  return structureFromBenchmark(w.format, w.movements, w.timeCapMinutes ?? null);
};
const prof = (id: string) => getWodProfile(`bm:${id}`)!;

describe('wodStructure', () => {
  it('lee una escalera', () => {
    expect(parseLadder('21-15-9')).toEqual([21, 15, 9]);
    expect(parseLadder('21')).toBeNull();
  });

  it('Fran son tres escalones de thrusters y dominadas', () => {
    const s = bm('fran');
    expect(s.kind).toBe('forTime');
    expect(s.coverage).toBe('full');
    expect(s.work.map((l) => `${l.movementId}:${l.amount}`)).toEqual(['thruster:21', 'kipping-pull-up:21', 'thruster:15', 'kipping-pull-up:15', 'thruster:9', 'kipping-pull-up:9']);
  });

  it('Cindy es un AMRAP de 20 minutos con una vuelta de 5-10-15', () => {
    const s = bm('cindy');
    expect(s.kind).toBe('amrap');
    expect(s.fixedMinutes).toBe(20);
    expect(s.work.map((l) => l.amount)).toEqual([5, 10, 15]);
  });

  it('Helen: metros, repeticiones y la carga de la kettlebell en kilos', () => {
    const s = bm('helen');
    expect(s.work).toHaveLength(9);
    expect(s.work[0]).toMatchObject({ movementId: 'run', amount: 400, unit: 'm' });
    expect(s.work[1].loadKg).toBeGreaterThan(23);
    expect(s.work[1].loadKg).toBeLessThan(25);
  });

  it('Murph entiende "1 mile run"', () => {
    const s = bm('murph');
    expect(s.work[0]).toMatchObject({ movementId: 'run', unit: 'm' });
    expect(s.work[0].amount).toBeGreaterThan(1500);
    expect(s.coverage).toBe('full');
  });

  it('no parte por las comas de dentro de un paréntesis (DT)', () => {
    const s = bm('dt');
    expect(s.work.map((l) => l.movementId)).toContain('hang-clean');
    expect(s.coverage).toBe('full');
  });

  it('las alturas no son cargas: (24/20 in) no pesa', () => {
    const s = structureFromBenchmark('3 rondas for time: 10 box jumps (24/20 in), 10 thrusters (95/65 lb)', ['box-jump', 'thruster'], null);
    expect(s.work[0].loadKg).toBeUndefined();
    expect(s.work[1].loadKg).toBeCloseTo(95 * 0.4536, 0);
  });

  it('las notas de descanso no cuentan como trabajo que falta', () => {
    const s = structureFromBenchmark('2 rondas for time: 20 pull-ups, 20 push-ups; descanso 3:00 entre rondas', ['kipping-pull-up', 'push-up'], null);
    expect(s.coverage).toBe('full');
  });

  it('casa nombres con movimientos del WOD', () => {
    expect(matchMovement('Hang Power Cleans', ['hang-clean'])).toBe('hang-clean');
    expect(matchMovement('dobles unders', ['double-under', 'row'])).toBe('double-under');
    expect(matchMovement('Zumba', ['row', 'run'])).toBeNull();
  });

  it('la biblioteca se lee entera y los benchmarks en su mayor parte', () => {
    expect(libraryWods.every((w) => structureFromLibrary(w).coverage === 'full')).toBe(true);
    const cov = benchmarkWorkouts.map((w) => structureFromBenchmark(w.format, w.movements, w.timeCapMinutes ?? null).coverage);
    expect(cov.filter((c) => c === 'full').length / cov.length).toBeGreaterThan(0.65);
    expect(cov.filter((c) => c !== 'none').length / cov.length).toBeGreaterThan(0.85);
  });
});

describe('modelo de duración', () => {
  it('acierta más que la estimación antigua por volumen (misma medida, mismos WODs)', () => {
    const now = durationModelAccuracy();
    const before = volumeEstimateAccuracy();
    expect(now.n).toBeGreaterThan(100);
    expect(now.within30).toBeGreaterThan(0.7);
    expect(now.within30).toBeGreaterThan(before.within30 + 0.05);
    expect(now.medianRatio).toBeGreaterThan(0.9);
    expect(now.medianRatio).toBeLessThan(1.1);
  });

  it('los clásicos duran lo que todo el mundo sabe', () => {
    const range = (id: string, lo: number, hi: number) => {
      const m = prof(id).expectedMin!;
      expect(m, id).toBeGreaterThanOrEqual(lo);
      expect(m, id).toBeLessThanOrEqual(hi);
    };
    range('fran', 4, 7);
    range('grace', 3, 6);
    range('isabel', 2, 5);
    range('diane', 5, 8);
    range('helen', 9, 14);
    range('karen', 8, 12);
    range('dt', 8, 12);
    range('nancy', 16, 24);
    range('murph', 38, 62);
  });

  it('lo que la fuente declara manda sobre el modelo', () => {
    expect(prof('cindy').expectedMin).toBe(20);
    expect(prof('cindy').durationSource).toBe('declarada');
    expect(prof('mikkos-triangle').expectedMin).toBe(39);
  });

  it('un EMOM sin minutos escritos no se inventa la duración', () => {
    expect(prof('kalsu').expectedMin).toBeNull();
    expect(prof('kalsu').confidence).toBe('baja');
  });

  it('Fight Gone Bad dura 17 minutos (3 rondas x 5 estaciones + 2 de descanso)', () => {
    expect(prof('fight-gone-bad').expectedMin).toBe(17);
  });
});

describe('perfil de esfuerzo', () => {
  const usable = new Set(getWodCatalog().filter((w) => w.usable).map((w) => w.id));
  const profiles = allWodProfiles().filter((p) => usable.has(p.id));

  it('cada WOD del catálogo tiene perfil y sus cifras son razonables', () => {
    expect(allWodProfiles()).toHaveLength(getWodCatalog().length);
    for (const p of profiles) {
      if (p.expectedMin !== null) {
        expect(p.expectedMin).toBeGreaterThan(0);
        expect(p.expectedMin).toBeLessThanOrEqual(90);
        expect(p.expectedRpe).toBeGreaterThanOrEqual(5);
        expect(p.expectedRpe).toBeLessThanOrEqual(9.5);
        expect(p.strain).toBeGreaterThanOrEqual(0);
        expect(p.strain).toBeLessThanOrEqual(100);
      }
      expect(p.load.score).toBeGreaterThanOrEqual(0);
      expect(p.load.score).toBeLessThanOrEqual(100);
    }
  });

  it('la energía ya no es "casi todo umbral": ningún sistema pasa del 60 % y todos pesan algo', () => {
    const counts = { potencia: 0, glucolitico: 0, mixto: 0, aerobico: 0 };
    let n = 0;
    for (const p of profiles) if (p.energy) { counts[p.energy] += 1; n += 1; }
    for (const [k, v] of Object.entries(counts)) {
      expect(v / n, k).toBeLessThan(0.6);
      expect(v / n, k).toBeGreaterThan(0.05);
    }
  });

  it('una parte buena de los perfiles es de confianza alta (duración declarada y estructura leída)', () => {
    expect(profiles.filter((p) => p.confidence === 'alta').length / profiles.length).toBeGreaterThan(0.3);
  });

  it('los WODs cortos y densos son potencia y los largos cíclicos, aeróbicos', () => {
    expect(['potencia', 'glucolitico']).toContain(prof('fran').energy);
    expect(prof('isabel').energy).toBe('potencia');
    expect(prof('murph').energy).toBe('aerobico');
    expect(prof('mikkos-triangle').energy).toBe('aerobico');
  });

  it('el esfuerzo (RPE x minutos) sube con la duración y el RPE baja en los largos', () => {
    expect(prof('murph').strain!).toBeGreaterThan(prof('fran').strain!);
    expect(prof('fran').expectedRpe!).toBeGreaterThan(prof('murph').expectedRpe!);
  });

  it('la carga mecánica separa lo ligero de lo pesado', () => {
    expect(prof('dt').load.score).toBeGreaterThan(prof('cindy').load.score);
    expect(prof('dt').load.tonnageKg).toBeGreaterThan(5000);
    expect(prof('fran').load.tonnageKg).toBeGreaterThan(1500);
    expect(prof('murph').load.impact).toBeGreaterThan(prof('fran').load.impact);
    expect(prof('annie').load.label).not.toBe('muy-alta');
    expect(prof('open-26-2').load.skill).toBe(3);
  });

  it('la dificultad técnica: muscle-up 3, halterofilia 2, dominadas 1, peso corporal 0', () => {
    expect(prof('jason').load.skill).toBe(3);
    expect(prof('isabel').load.skill).toBe(2);
    expect(prof('fran').load.skill).toBe(1);
    expect(prof('michael').load.skill).toBe(0);
  });
});
