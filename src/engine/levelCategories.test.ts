import { describe, expect, it } from 'vitest';
import type { LevelResult, SessionHistoryEntry } from '../data/athlete/types';
import { makeProfile } from './__fixtures';
import {
  allLevelResults,
  buildLevelResult,
  computeLevel,
  LEVEL_ORDER,
  levelResultsOfEntry,
  recency,
  resultValue,
} from './levelCategories';

const TODAY = new Date('2026-11-19T12:00:00');
const iso = (daysAgo: number) => new Date(TODAY.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const res = (daysAgo: number, category: LevelResult['category'], key: string, value: number, extra: Partial<LevelResult> = {}): LevelResult => ({
  date: iso(daysAgo),
  part: 1,
  category,
  key,
  scoreType: 'time',
  value,
  ...extra,
});
const entry = (daysAgo: number, extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: iso(daysAgo), mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 8, durationMin: 60, ...extra });
const level = (profile = makeProfile(), history: SessionHistoryEntry[] = []) => computeLevel({ profile, history, today: TODAY });
const cat = (snap: ReturnType<typeof level>, key: string) => snap.categories.find((c) => c.key === key)!;

describe('cuánto pierde una marca con el tiempo', () => {
  it('nada en 3 semanas; un 3 % por mes después; con suelo a los 12 meses', () => {
    expect(recency(0)).toBe(1);
    expect(recency(21)).toBe(1);
    expect(recency(61)).toBeCloseTo(0.96, 2);
    expect(recency(213)).toBeCloseTo(0.808, 2);
    expect(recency(365)).toBeGreaterThanOrEqual(0.64);
    expect(recency(2000)).toBeCloseTo(0.64, 5);
  });
});

describe('el resultado de un WOD como número', () => {
  it('tiempo, rondas con repeticiones, repeticiones y carga', () => {
    expect(resultValue({ scoreType: 'time', value: '6:12' })).toBe(372);
    expect(resultValue({ scoreType: 'time', value: 'CAP · 3+7', capped: true, capSeconds: 900 })).toBe(900);
    expect(resultValue({ scoreType: 'time', value: 'CAP', capped: true })).toBeNull();
    expect(resultValue({ scoreType: 'rounds+reps', value: '8+12' })).toBeCloseTo(8.12, 2);
    expect(resultValue({ scoreType: 'rounds+reps', value: '8' })).toBe(8);
    expect(resultValue({ scoreType: 'reps', value: '185 reps' })).toBe(185);
    expect(resultValue({ scoreType: 'load', value: '70 kg' })).toBe(70);
  });

  it('solo cuenta si fue en Rx, tiene categoría, clave y un valor medible; la estimación solo si es de la misma unidad', () => {
    const base = { date: iso(1), part: 1 as const, category: 'pesado' as const, key: 'bm:diane', result: { scoreType: 'time' as const, value: '6:12' }, rx: true };
    expect(buildLevelResult(base)).toMatchObject({ category: 'pesado', value: 372, scoreType: 'time' });
    expect(buildLevelResult({ ...base, rx: false })).toBeNull();
    expect(buildLevelResult({ ...base, category: null })).toBeNull();
    expect(buildLevelResult({ ...base, key: null })).toBeNull();
    expect(buildLevelResult({ ...base, result: { scoreType: 'time', value: '0:00' } })).toBeNull();
    expect(buildLevelResult({ ...base, ref: { unit: 'seconds', mid: 400 } })?.ref).toBe(400);
    expect(buildLevelResult({ ...base, ref: { unit: 'rounds', mid: 5 } })?.ref).toBeUndefined();
  });
});

describe('las categorías de WOD se van rellenando', () => {
  it('sin resultados: sin datos (y la constancia no es una categoría)', () => {
    const s = level();
    expect(s.categories.map((c) => c.key)).toEqual(LEVEL_ORDER);
    expect(LEVEL_ORDER).toHaveLength(8);
    expect(cat(s, 'pesado').confidence).toBe('sin-datos');
    expect(cat(s, 'pesado').score).toBeNull();
    expect(cat(s, 'pesado').need).toContain('Rx');
  });

  it('con un resultado es provisional; con dos del mismo WOD ya es fiable', () => {
    const one = level(makeProfile({ levelLog: [res(20, 'pesado', 'bm:diane', 400)] }));
    expect(cat(one, 'pesado').confidence).toBe('provisional');
    expect(cat(one, 'pesado').need).toContain('un resultado más');
    const two = level(makeProfile({ levelLog: [res(60, 'pesado', 'bm:diane', 420), res(20, 'pesado', 'bm:diane', 400)] }));
    expect(cat(two, 'pesado').confidence).toBe('fiable');
    expect(cat(two, 'pesado').score).toBe(100); // mejoraste: estás en tu mejor marca
  });

  it('si rindes menos que tu mejor vez, baja; si pasa el tiempo sin repetirlo, también', () => {
    const worse = level(makeProfile({ levelLog: [res(60, 'pesado', 'bm:diane', 400), res(20, 'pesado', 'bm:diane', 500)] }));
    expect(cat(worse, 'pesado').score).toBe(80); // 400 / 500
    const old = level(makeProfile({ levelLog: [res(213, 'pesado', 'bm:diane', 400), res(214, 'pesado', 'bm:diane', 410)] }));
    expect(cat(old, 'pesado').score).toBe(81);
  });

  it('la primera vez de un WOD se mide contra lo que estimaba el motor (sin pasarse de 100)', () => {
    const slower = level(makeProfile({ levelLog: [res(10, 'largo', 'gen:x', 1200, { ref: 1000 })] }));
    expect(cat(slower, 'largo').score).toBe(83);
    const faster = level(makeProfile({ levelLog: [res(10, 'largo', 'gen:y', 800, { ref: 1000 })] }));
    expect(cat(faster, 'largo').score).toBe(100);
  });

  it('en rondas y repeticiones, más es mejor', () => {
    const rounds = level(makeProfile({ levelLog: [res(40, 'resistencia', 'bm:cindy', 20, { scoreType: 'rounds+reps' }), res(10, 'resistencia', 'bm:cindy', 16, { scoreType: 'rounds+reps' })] }));
    expect(cat(rounds, 'resistencia').score).toBe(80);
  });

  it('lo que tiene más de 12 meses ya no cuenta', () => {
    expect(cat(level(makeProfile({ levelLog: [res(400, 'pesado', 'bm:diane', 400)] })), 'pesado').score).toBeNull();
  });

  it('hace 3 meses: la foto de entonces, y el cambio', () => {
    const profile = makeProfile({
      levelLog: [res(150, 'pesado', 'bm:diane', 500), res(100, 'pesado', 'bm:diane', 480), res(10, 'pesado', 'bm:diane', 400)],
    });
    const c = cat(level(profile), 'pesado');
    expect(c.score).toBe(100);
    expect(c.before).toBe(Math.round(100 * (480 / 480) * recency(100 - 90 > 0 ? 100 - 90 : 0)) );
    expect(c.delta).toBe(c.score! - c.before!);
  });
});

describe('las categorías de barra salen de tus marcas', () => {
  it('Power lifts: lo mejor de las últimas semanas frente a tu mejor marca de 12 meses', () => {
    const profile = makeProfile({
      prLog: [
        { date: iso(300), key: 'backSquat', kg: 150 },
        { date: iso(30), key: 'backSquat', kg: 135 },
        { date: iso(10), key: 'deadlift', kg: 180 },
      ],
    });
    const c = cat(level(profile), 'power-lifts');
    expect(c.confidence).toBe('fiable'); // dos barras con marca
    expect(c.detail).toContain('Sentadilla 89'); // 135 / 150 con la marca de hace un mes y un pequeño desgaste
    expect(c.detail).toContain('Peso muerto 100');
  });

  it('sin marcas anotadas, el PR actual cuenta desde el alta; sin alta, nada', () => {
    const withOnboarding = cat(level(makeProfile({ onboardedAt: `${iso(100)}T00:00:00.000Z` })), 'olimpicos');
    expect(withOnboarding.score).not.toBeNull();
    expect(cat(level(makeProfile({ onboardedAt: undefined })), 'olimpicos').score).toBeNull();
  });

  it('las series de trabajo (1RM estimado) y los tests también cuentan; una serie fallada no', () => {
    const profile = makeProfile({
      prLog: [{ date: iso(200), key: 'backSquat', kg: 150 }],
      workLog: [
        { date: iso(7), movementId: 'back-squat', block: 'strength', setNumber: 1, kg: 120, reps: 5 }, // 140 estimado
        { date: iso(6), movementId: 'back-squat', block: 'strength', setNumber: 1, kg: 200, reps: 1, quality: 'fallada' },
      ],
    });
    const c = cat(level(profile), 'power-lifts');
    expect(c.detail).toContain('Sentadilla 93'); // 140 / 150
  });
});

describe('el número único', () => {
  const full = (days = 10): LevelResult[] =>
    (['velocidad', 'resistencia', 'peso-corporal', 'pesado'] as const).flatMap((c, i) => [res(days + 30 + i, c, `k-${c}`, 400), res(days + i, c, `k-${c}`, 400)]);

  it('hacen falta 3 categorías con datos; la constancia no entra', () => {
    expect(level(makeProfile({ onboardedAt: undefined, levelLog: [res(10, 'pesado', 'a', 400)] })).overall).toBeNull();
    const s = level(makeProfile({ onboardedAt: undefined, levelLog: full() }));
    expect(s.filled).toBe(4);
    expect(s.overall).toBe(100);
    expect(s.categories.some((c) => (c.key as string) === 'constancia')).toBe(false);
  });

  it('el cambio compara las mismas categorías de entonces y de hoy', () => {
    const profile = makeProfile({
      onboardedAt: undefined,
      levelLog: (['velocidad', 'resistencia', 'pesado'] as const).flatMap((c, i) => [res(150 + i, c, `k-${c}`, 400), res(100 + i, c, `k-${c}`, 400), res(10 + i, c, `k-${c}`, 500)]),
    });
    const s = level(profile);
    expect(s.overallBefore).not.toBeNull();
    expect(s.delta).not.toBeNull();
    expect(s.delta!).toBeLessThan(0); // hoy rindes menos que entonces
  });
});

describe('de dónde salen los resultados', () => {
  it('un WOD de referencia del historial se clasifica hacia atrás y cuenta si fue en Rx', () => {
    const e = entry(5, { movementIds: ['benchmark:diane'], wodResult: { scoreType: 'time', value: '6:30' } });
    const r = levelResultsOfEntry(e, { deadlift: 180 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ category: 'pesado', key: 'benchmark:diane', value: 390 });
    expect(levelResultsOfEntry({ ...e, rxOrScaled: 'scaled' }, { deadlift: 180 })).toEqual([]);
  });

  it('la categoría guardada manda sobre una nueva clasificación, y una parte no hecha no cuenta', () => {
    const e = entry(5, { movementIds: ['benchmark:diane'], wodResult: { scoreType: 'time', value: '6:30' }, wodCategories: { 1: 'ligero' } });
    expect(levelResultsOfEntry(e, { deadlift: 180 })[0].category).toBe('ligero');
    expect(levelResultsOfEntry({ ...e, skipped: [{ block: 'wod', part: 1 }] }, { deadlift: 180 })).toEqual([]);
  });

  it('el registro largo y el historial se suman sin repetirse (gana el registro largo)', () => {
    const profile = makeProfile({ levelLog: [res(5, 'pesado', 'benchmark:diane', 380)] });
    const e = entry(5, { movementIds: ['benchmark:diane'], wodResult: { scoreType: 'time', value: '6:30' } });
    const all = allLevelResults(profile, [e]);
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(380);
    expect(allLevelResults(makeProfile(), [e])[0].value).toBe(390);
  });
});
