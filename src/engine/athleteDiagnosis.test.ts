import { describe, expect, it } from 'vitest';
import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';
import { checkState, computeAthleteDiagnosis, REFERENCE_SCORE } from './athleteDiagnosis';
import { makeProfile } from './__fixtures';

const TODAY = new Date('2026-11-03T12:00:00');
const iso = (offset: number) => {
  const d = new Date('2026-09-01T12:00:00');
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const entry = (offset: number, over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  date: iso(offset),
  mesocycleWeek: 2,
  movementIds: ['back-squat'],
  rxOrScaled: 'rx',
  rpe: 7,
  durationMin: 60,
  ...over,
});

/** Un WOD en Rx por tiempo cuyo rendimiento frente a lo estimado (600 s) es `perf` (1,1 = un 10 % mejor). */
const wod = (offset: number, system: SessionHistoryEntry['energySystem'], perf: number): SessionHistoryEntry => {
  const seconds = Math.round(600 / perf);
  return entry(offset, {
    energySystem: system,
    wodResult: { scoreType: 'time', value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` },
    wodTargetBase: { kind: 'for-time', unit: 'seconds', mid: 600 },
  });
};

const area = (d: ReturnType<typeof computeAthleteDiagnosis>, key: string) => d.areas.find((a) => a.key === key)!;
const profile = (over: Partial<AthleteProfile> = {}) =>
  makeProfile({ onboardedAt: '2026-10-30T00:00:00.000Z', prs: { backSquat: 140, frontSquat: 115, benchPress: 105, deadlift: 165, strictPress: 70, clean: 105, snatch: 80, cleanAndJerk: 100 }, bodyweightLog: [{ date: '2026-10-01', kg: 82 }], ...over });

describe('Fuerza', () => {
  it('compara cada levantamiento con lo que tu sentadilla permite y señala el más flojo', () => {
    const d = computeAthleteDiagnosis({ profile: profile({ prs: { backSquat: 140, frontSquat: 115, benchPress: 80, deadlift: 165, strictPress: 70, clean: 105, snatch: 80, cleanAndJerk: 100 } }), history: [], today: TODAY });
    const f = area(d, 'fuerza');
    expect(f.rows.find((r) => r.id === 'deadlift')!.tone).toBe('good'); // 165 / (140 x 1,15) = 1,02
    expect(f.rows.find((r) => r.id === 'benchPress')!.tone).toBe('low'); // 80 / (140 x 0,75) = 0,76
    expect(f.weakest!.id).toBe('benchPress');
    expect(f.verdict).toContain('Press banca va por detrás');
    expect(f.rows[0].value).toBe('1,7× tu peso'); // 140 / 82
  });

  it('sin el alta ni marcas cambiadas o probadas, las marcas de fábrica no cuentan', () => {
    const d = computeAthleteDiagnosis({ profile: profile({ onboardedAt: undefined }), history: [], today: TODAY });
    expect(area(d, 'fuerza').confidence).toBe('sin-datos');
    expect(area(d, 'fuerza').need).toContain('Anota tu sentadilla');
  });

  it('una marca cambiada por el atleta cuenta aunque no haya hecho el alta', () => {
    const d = computeAthleteDiagnosis({ profile: profile({ onboardedAt: undefined, prLog: [{ date: '2026-10-20', key: 'backSquat', kg: 140 }] }), history: [], today: TODAY });
    expect(area(d, 'fuerza').rows.map((r) => r.id)).toEqual(['backSquat']);
  });

  it('la tendencia sube si una marca subió en las últimas 8 semanas', () => {
    const prLog = [
      { date: '2026-08-01', key: 'backSquat', kg: 130 },
      { date: '2026-10-20', key: 'backSquat', kg: 140 },
    ];
    expect(area(computeAthleteDiagnosis({ profile: profile({ prLog }), history: [], today: TODAY }), 'fuerza').trend).toBe('sube');
  });
});

describe('Halterofilia', () => {
  it('arrancada sobre dos tiempos cerca de 0,80 es buena y no señala nada', () => {
    const h = area(computeAthleteDiagnosis({ profile: profile(), history: [], today: TODAY }), 'halterofilia');
    expect(h.rows.find((r) => r.id === 'snatch')!.value).toBe('0,80');
    expect(h.tone).not.toBe('low');
  });

  it('una arrancada muy por detrás de tu dos tiempos lo dice', () => {
    const d = computeAthleteDiagnosis({ profile: profile({ prs: { backSquat: 140, frontSquat: 115, benchPress: 105, deadlift: 165, strictPress: 70, clean: 105, snatch: 62, cleanAndJerk: 100 } }), history: [], today: TODAY });
    const h = area(d, 'halterofilia');
    expect(h.weakest!.id).toBe('snatch');
    expect(h.verdict).toContain('arrancada va por detrás');
  });
});

describe('Motor', () => {
  it('con menos de 3 WODs en Rx dice qué falta en lugar de opinar', () => {
    const m = area(computeAthleteDiagnosis({ profile: profile(), history: [wod(0, 'umbral', 1), wod(1, 'umbral', 1)], today: TODAY }), 'motor');
    expect(m.confidence).toBe('sin-datos');
    expect(m.need).toBe('Necesito 3 WODs con resultado hechos en Rx; llevas 2.');
  });

  it('mide cada formato frente a lo estimado y señala el más flojo', () => {
    const history = [wod(0, 'potencia', 1.03), wod(1, 'potencia', 1.05), wod(2, 'umbral', 0.95), wod(3, 'umbral', 0.95), wod(4, 'base-aerobica', 0.78), wod(5, 'base-aerobica', 0.78)];
    const m = area(computeAthleteDiagnosis({ profile: profile(), history, today: TODAY }), 'motor');
    expect(m.rows.map((r) => [r.id, r.tone])).toEqual([
      ['potencia', 'good'],
      ['umbral', 'good'],
      ['base-aerobica', 'low'],
    ]);
    expect(m.weakest!.id).toBe('base-aerobica');
    expect(m.verdict).toContain('WOD largo');
    expect(m.verdict).toContain('22 % por debajo');
  });

  it('un WOD escalado no entra: no informa de cuánto rindes', () => {
    const history = [wod(0, 'umbral', 1), wod(1, 'umbral', 1), { ...wod(2, 'umbral', 0.7), rxOrScaled: 'scaled' as const }];
    expect(area(computeAthleteDiagnosis({ profile: profile(), history, today: TODAY }), 'motor').samples).toBe(2);
  });
});

describe('Gimnásticos', () => {
  it('hacen falta 6 sesiones con gimnásticos para opinar', () => {
    const g = area(computeAthleteDiagnosis({ profile: profile(), history: [entry(0, { movementIds: ['strict-pull-up'] })], today: TODAY }), 'gimnasticos');
    expect(g.need).toBe('Necesito 6 sesiones con dominadas, pino o muscle-ups; llevas 1.');
  });

  it('si los escalas la mayoría de veces, es donde hay margen', () => {
    const history = Array.from({ length: 8 }, (_, i) => entry(i, { movementIds: ['kipping-pull-up'], rxOrScaled: i < 2 ? 'rx' : 'scaled' }));
    const g = area(computeAthleteDiagnosis({ profile: profile(), history, today: TODAY }), 'gimnasticos');
    expect(g.tone).toBe('low');
    expect(g.verdict).toBe('Los escalas en 6 de 8 sesiones: es donde más margen tienes.');
  });
});

describe('El diagnóstico entero', () => {
  it('sin datos no inventa: lo dice', () => {
    const d = computeAthleteDiagnosis({ profile: profile({ onboardedAt: undefined }), history: [], today: TODAY });
    expect(d.headline).toContain('Aún no tengo datos suficientes');
    expect(d.focus).toEqual([]);
    expect(d.confidence).toBe('sin-datos');
  });

  it('nombra lo más sólido y lo que más margen tiene, y propone qué priorizar y qué mantener', () => {
    const history = [wod(0, 'potencia', 1.04), wod(1, 'potencia', 1.04), wod(2, 'umbral', 0.96), wod(3, 'umbral', 0.96), wod(4, 'base-aerobica', 0.78), wod(5, 'base-aerobica', 0.78)];
    const d = computeAthleteDiagnosis({ profile: profile(), history, today: TODAY });
    expect(d.headline).toContain('Lo que más margen tiene es tu motor');
    const first = d.focus[0];
    expect(first).toMatchObject({ key: 'motor', kind: 'prioridad', action: 'Más trabajo aeróbico y WODs largos' });
    expect(d.focus.some((f) => f.kind === 'mantener')).toBe(true);
    expect(d.wods).toBe(6);
  });

  it('el radar deja el ratio 1 en la referencia', () => {
    const d = computeAthleteDiagnosis({ profile: profile(), history: [], today: TODAY });
    expect(REFERENCE_SCORE).toBeGreaterThan(60);
    expect(REFERENCE_SCORE).toBeLessThan(80);
    expect(area(d, 'fuerza').score).not.toBeNull();
  });
});

describe('"No cuadra"', () => {
  const history = [wod(0, 'potencia', 1.04), wod(1, 'potencia', 1.04), wod(2, 'umbral', 0.96), wod(3, 'umbral', 0.96), wod(4, 'base-aerobica', 0.78), wod(5, 'base-aerobica', 0.78)];

  it('un área que dices que no cuadra deja de priorizarse', () => {
    const checks = { motor: { verdict: 'no-cuadra' as const, reason: 'cansado' as const, samples: 6, date: '2026-11-03' } };
    const d = computeAthleteDiagnosis({ profile: profile({ diagnosisChecks: checks }), history, today: TODAY });
    expect(d.focus.some((f) => f.key === 'motor')).toBe(false);
    expect(checkState(area(d, 'motor'), checks.motor)).toBe('no-cuadra');
  });

  it('con 3 datos nuevos desde que lo dijiste, se vuelve a preguntar y la prioridad vuelve', () => {
    const checks = { motor: { verdict: 'no-cuadra' as const, reason: 'cansado' as const, samples: 3, date: '2026-10-20' } };
    const d = computeAthleteDiagnosis({ profile: profile({ diagnosisChecks: checks }), history, today: TODAY });
    expect(checkState(area(d, 'motor'), checks.motor)).toBe('revisar');
    expect(d.focus.some((f) => f.key === 'motor')).toBe(true);
  });

  it('"Cuadra" se queda como está y sin respuesta es null', () => {
    const d = computeAthleteDiagnosis({ profile: profile(), history, today: TODAY });
    expect(checkState(area(d, 'motor'), { verdict: 'cuadra', samples: 6, date: '2026-11-03' })).toBe('cuadra');
    expect(checkState(area(d, 'motor'), undefined)).toBeNull();
  });
});
