import { describe, expect, it } from 'vitest';
import type { AthleteProfile, LevelTest, SessionHistoryEntry } from '../data/athlete/types';
import { mergeProfile, snapshotSyncBase } from '../data/athlete/mergeProfile';
import { makeProfile } from './__fixtures';
import { ageBandOf, computeReferenceLevel, FRAN_MASTERS, olyAgeFactor, placeOnScale, powerPercentiles, runStandard, testResults, zoneOfPosition, type RefCategory } from './levelReference';

const TODAY = new Date('2026-11-27T12:00:00');
const athlete = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  ...makeProfile(),
  birthYear: 1974,
  prs: { backSquat: 120, frontSquat: 95, benchPress: 100, deadlift: 160, strictPress: 60, clean: 85, snatch: 50, cleanAndJerk: 70 },
  variantPrs: { powerSnatch: 60, powerClean: 80 },
  bodyweightLog: [{ date: '2026-11-27', kg: 83 }],
  ...over,
});
const level = (profile = athlete(), history: SessionHistoryEntry[] = []) => computeReferenceLevel({ profile, history, today: TODAY });
const cat = (key: string, profile = athlete(), history: SessionHistoryEntry[] = []) => level(profile, history).categories.find((c) => c.key === key) as RefCategory;
const test = (key: LevelTest['key'], seconds: number, date = '2026-11-20'): LevelTest => ({ date, key, seconds });
const fran = (value: string, over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  date: '2026-11-10',
  mesocycleWeek: 2,
  movementIds: ['benchmark:fran', 'thruster'],
  rxOrScaled: 'rx',
  rpe: 9,
  durationMin: 20,
  wodResult: { scoreType: 'time', value },
  ...over,
});

describe('colocar un valor en la barra', () => {
  it('cuenta los cortes superados y sitúa el punto dentro de su tramo', () => {
    expect(placeOnScale(5, [10, 20, 30, 40], 0, 50)).toEqual({ zone: 0, position: 0.1 });
    expect(placeOnScale(10, [10, 20, 30, 40], 0, 50)).toEqual({ zone: 1, position: 0.2 });
    expect(placeOnScale(35, [10, 20, 30, 40], 0, 50)).toEqual({ zone: 3, position: 0.7 });
    expect(placeOnScale(999, [10, 20, 30, 40], 0, 50).zone).toBe(4);
    expect(placeOnScale(-5, [10, 20, 30, 40], 0, 50).position).toBe(0);
  });

  it('en tiempos, menos es mejor', () => {
    expect(placeOnScale(500, [400, 300, 200, 100], 600, 50)).toEqual({ zone: 0, position: 0.1 });
    expect(placeOnScale(250, [400, 300, 200, 100], 600, 50)).toEqual({ zone: 2, position: 0.5 });
    expect(placeOnScale(80, [400, 300, 200, 100], 600, 50).zone).toBe(4);
  });

  it('la posición nunca salta de escalón', () => {
    for (const v of [9.999, 19.999, 29.999, 39.999]) {
      const p = placeOnScale(v, [10, 20, 30, 40], 0, 50);
      expect(zoneOfPosition(p.position)).toBe(p.zone);
    }
  });
});

describe('las referencias', () => {
  it('toma tu franja de edad y la más cercana si no está', () => {
    expect([ageBandOf(25), ageBandOf(40), ageBandOf(52), ageBandOf(69), ageBandOf(80), ageBandOf(16)]).toEqual(['20-39', '40-44', '50-54', '65-69', '65-69', '20-39']);
  });

  it('interpola entre los pesos de la tabla y no se sale por los extremos', () => {
    const at80 = powerPercentiles('squat', 52, 80).values;
    const at85 = powerPercentiles('squat', 52, 85).values;
    const at83 = powerPercentiles('squat', 52, 83).values;
    expect(at83[1]).toBeCloseTo(at80[1] + (at85[1] - at80[1]) * 0.6, 5);
    expect(powerPercentiles('squat', 52, 40).values).toEqual(powerPercentiles('squat', 52, 60).values);
    expect(powerPercentiles('deadlift', 52, 200).values).toEqual(powerPercentiles('deadlift', 52, 130).values);
    for (const lift of ['squat', 'bench', 'deadlift'] as const) {
      for (const age of [25, 42, 47, 52, 57, 62, 67]) {
        for (let bw = 58; bw <= 135; bw += 3.5) {
          const v = powerPercentiles(lift, age, bw).values;
          expect(v).toHaveLength(6);
          expect([...v].sort((a, b) => a - b)).toEqual(v);
        }
      }
    }
  });

  it('la tabla de Fran y la marca patrón de 5 km van en el sentido correcto', () => {
    expect(FRAN_MASTERS.map(([s]) => s)).toEqual([...FRAN_MASTERS.map(([s]) => s)].sort((a, b) => a - b));
    expect(runStandard(30)).toBe(769);
    expect(runStandard(52)).toBe(891);
    expect(runStandard(60)).toBeGreaterThan(runStandard(52));
    expect(olyAgeFactor(52)).toBeCloseTo(0.78, 5);
    expect([olyAgeFactor(25), olyAgeFactor(90)]).toEqual([1, 0.6]);
  });
});

describe('Tu nivel frente a gente como tú', () => {
  it('sin año de nacimiento no compara, pero enseña tus marcas', () => {
    const l = level(athlete({ birthYear: undefined }));
    expect(l).toMatchObject({ age: null, measured: 0, overall: null });
    expect(l.categories[0].marks.map((m) => [m.value, m.placement])).toEqual([
      ['120 kg', null],
      ['160 kg', null],
      ['100 kg', null],
    ]);
  });

  it('sin peso corporal no compara kilos', () => {
    const l = level(athlete({ bodyweightLog: [] }));
    expect(l.categories.filter((c) => c.placement)).toHaveLength(0);
  });

  it('fuerza: cada levantamiento con su escalón, lo que falta y a cuántos adelantas', () => {
    const c = cat('fuerza');
    expect(c.tag).toBe('medido');
    const [squat, deadlift, bench] = c.marks;
    expect(squat.placement?.zone).toBe(0);
    expect(squat.next).toBe('a 2 kg de Novato');
    expect(deadlift.placement?.zone).toBe(1);
    expect(deadlift.next).toMatch(/^a \d+(,5)? kg de Intermedio$/);
    expect(bench.placement?.zone).toBe(1);
    for (const m of c.marks) expect(m.detail).toMatch(/^por delante del \d+ %$/);
    // Por debajo del corte de Novato (percentil 10) no se redondea a «10 %».
    expect(squat.detail).toBe('por delante del 9 %');
    expect(c.against).toContain('más de 700 en tu peso');
    expect(c.against).toContain('50 a 54');
    expect(c.placement!.position).toBeCloseTo(c.marks.reduce((s, m) => s + m.placement!.position, 0) / 3, 5);
  });

  it('olímpicos: escala orientativa por peso y edad, y avisa si un power pasa al completo', () => {
    const c = cat('olimpicos');
    expect(c.tag).toBe('orientativo');
    expect(c.marks.map((m) => [m.key, m.placement?.zone, m.next])).toEqual([
      ['snatch', 1, 'a 5 kg de Intermedio'],
      ['cleanAndJerk', 1, 'a 1 kg de Intermedio'],
    ]);
    expect(c.warning).toBe('Tu power snatch (60 kg) pasa a tu snatch (50 kg). Revisa esas marcas.');
    expect(cat('olimpicos', athlete({ variantPrs: { powerSnatch: 45 } })).warning).toBeNull();
  });

  it('con dos categorías no hay nivel global; con tres, sí', () => {
    const two = level();
    expect(two).toMatchObject({ measured: 2, measurable: 4, overall: null });
    const three = level(athlete({ levelTests: [test('run5k', 1440)] }));
    expect(three.measured).toBe(3);
    expect(three.overall).not.toBeNull();
  });

  it('5 km: porcentaje por edad y tiempo que falta', () => {
    const c = cat('largo', athlete({ levelTests: [test('run5k', 1440)] }));
    // 891 / 1440 = 62 % → Intermedio; Avanzado (70 %) pide 21:13.
    expect(c.marks[0]).toMatchObject({ value: '24:00', next: 'a 2:48 de Avanzado' });
    expect(c.marks[0].detail).toContain('62 % por edad');
    expect(c.placement?.zone).toBe(2);
  });

  it('Fran: sale del historial en Rx; ni escalado ni cortado por tiempo cuentan', () => {
    const c = cat('velocidad', athlete(), [fran('5:11')]);
    expect(c.marks[0]).toMatchObject({ value: '5:11' });
    expect(c.marks[0].detail).toContain('por delante del 50 %');
    expect(c.placement?.zone).toBe(2);
    expect(cat('velocidad', athlete(), [fran('5:11', { rxOrScaled: 'scaled' })]).marks).toHaveLength(0);
    expect(cat('velocidad', athlete(), [fran('5:11', { wodResult: { scoreType: 'time', value: '5:11', capped: true, capSeconds: 311 } })]).marks).toHaveLength(0);
  });

  it('Fran: los extremos de la tabla no inventan percentiles', () => {
    expect(cat('velocidad', athlete({ levelTests: [test('fran', 110)] })).marks[0].detail).toContain('más del 90 %');
    expect(cat('velocidad', athlete({ levelTests: [test('fran', 700)] })).marks[0].detail).toContain('menos del 10 %');
    expect(cat('velocidad', athlete({ levelTests: [test('fran', 110)] })).marks[0].next).toBeNull();
  });

  it('por debajo de 35 años Fran no tiene referencia', () => {
    const young = athlete({ birthYear: 1996, levelTests: [test('fran', 300)] });
    expect(cat('velocidad', young)).toMatchObject({ tag: 'solo contra ti', placement: null, against: null });
    expect(level(young).measurable).toBe(3);
  });

  it('el remo solo se mide contra ti y no cuenta para el global', () => {
    const profile = athlete({ levelTests: [test('row2k', 462), test('row2k', 475, '2026-09-01')] });
    const c = cat('resistencia', profile);
    expect(c).toMatchObject({ tag: 'solo contra ti', placement: null });
    expect(c.marks[0]).toMatchObject({ value: '7:42' });
    expect(c.marks[0].detail).toContain('13 s menos que tu segundo mejor');
    expect(level(profile).measured).toBe(2);
  });

  it('un test de hace más de un año ya no cuenta y se dice', () => {
    const c = cat('largo', athlete({ levelTests: [test('run5k', 1440, '2025-06-01')] }));
    expect(c.placement).toBeNull();
    expect(c.missing).toContain('más de un año');
  });

  it('lo apuntado a mano manda sobre el historial del mismo día', () => {
    const profile = athlete({ levelTests: [test('fran', 290, '2026-11-10')] });
    expect(testResults(profile, [fran('5:11')], 'fran')).toEqual([{ date: '2026-11-10', seconds: 290, manual: true }]);
  });
});

describe('sincronizar los datos de nivel', () => {
  it('un test quitado no vuelve y el año de nacimiento no se pierde con un dispositivo nuevo', () => {
    const both = athlete({ onboardedAt: '2026-01-01', levelTests: [test('fran', 300), test('run5k', 1440)] });
    const base = snapshotSyncBase(both, []);
    const merged = mergeProfile(both, { ...both, levelTests: [test('run5k', 1440)] }, [], [], base);
    expect(merged.levelTests?.map((t) => t.key)).toEqual(['run5k']);
    const fresh = { ...makeProfile(), onboardedAt: undefined, birthYear: undefined };
    expect(mergeProfile(both, fresh).birthYear).toBe(1974);
    expect(mergeProfile({ ...both, birthYear: undefined }, both).birthYear).toBe(1974);
  });
});
