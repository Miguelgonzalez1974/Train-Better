import { describe, expect, it } from 'vitest';
import type { AthleteProfile, EmphasisItem, EmphasisPlan, SessionHistoryEntry } from '../data/athlete/types';
import { ensureEmphasisPlan, formatRatio, MAX_EMPHASIS_ITEMS, nextReviewOn, ROTATED_PAUSE_DAYS } from './programmingEmphasis';
import { makeProfile } from './__fixtures';

const entry = (offset: number, over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => {
  const d = new Date('2026-10-01T12:00:00');
  d.setDate(d.getDate() + offset);
  return { date: d.toISOString().slice(0, 10), mesocycleWeek: 2, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 7, durationMin: 60, ...over };
};
const wod = (offset: number, system: SessionHistoryEntry['energySystem'], perf: number): SessionHistoryEntry => {
  const seconds = Math.round(600 / perf);
  return entry(offset, {
    energySystem: system,
    wodResult: { scoreType: 'time', value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` },
    wodTargetBase: { kind: 'for-time', unit: 'seconds', mid: 600 },
  });
};

/** WODs en Rx: potencia y umbral bien; los largos con rendimiento `longPerf` (y `longCount` de ellos). */
const history = (longPerf: number, longCount: number): SessionHistoryEntry[] => [
  wod(0, 'potencia', 1.04),
  wod(1, 'potencia', 1.04),
  wod(2, 'umbral', 0.97),
  wod(3, 'umbral', 0.97),
  wod(4, 'umbral', 0.97),
  ...Array.from({ length: longCount }, (_, i) => wod(5 + i, 'base-aerobica', longPerf)),
];

const profile = (plan?: EmphasisPlan): AthleteProfile =>
  makeProfile({ onboardedAt: '2026-10-30T00:00:00.000Z', bodyweightLog: [{ date: '2026-10-01', kg: 82 }], ...(plan ? { emphasisPlan: plan } : {}) });

const motorItem = (over: Partial<EmphasisItem> = {}): EmphasisItem => ({
  key: 'motor:base-aerobica',
  area: 'motor',
  row: 'base-aerobica',
  action: 'Más trabajo aeróbico y WODs largos',
  why: 'x',
  baseline: { ratio: 0.78, samples: 3 },
  stalled: 0,
  ...over,
});
const plan = (item: EmphasisItem | null, over: Partial<EmphasisPlan> = {}): EmphasisPlan => ({
  enabled: true,
  since: '2026-11-03',
  computedOn: '2026-11-03',
  reviewOn: '2026-12-01',
  items: item ? [item] : [],
  removed: [],
  ...over,
});
const REVIEW_DAY = new Date('2026-12-01T12:00:00');

describe('la revisión de las 4 semanas', () => {
  it('antes de la fecha no se revisa nada', () => {
    const p = profile(plan(motorItem()));
    expect(ensureEmphasisPlan(p, history(0.97, 8), new Date('2026-11-30T12:00:00'))).toBe(p);
  });

  it('graduar: llega a lo esperable con datos nuevos y pasa a mantener', () => {
    // los largos ya rinden al 97 %, con 6 WODs largos (3 más que al empezar)
    const next = ensureEmphasisPlan(profile(plan(motorItem())), history(0.97, 6), REVIEW_DAY).emphasisPlan!;
    const e = next.review!.entries[0];
    expect(e).toMatchObject({ key: 'motor:base-aerobica', decision: 'graduar', before: 0.78, newSamples: 3 });
    expect(e.now).toBeCloseTo(0.97, 2);
    expect(next.maintained).toEqual([{ key: 'motor:base-aerobica', action: 'Más trabajo aeróbico y WODs largos' }]);
    expect(next.items.map((i) => i.key)).not.toContain('motor:base-aerobica');
    expect(next.review!.seen).toBe(false);
    expect(next.reviewOn).toBe('2026-12-29');
  });

  it('seguir: mejora pero aún por detrás; el punto de partida pasa a ser el de ahora', () => {
    const next = ensureEmphasisPlan(profile(plan(motorItem())), history(0.86, 6), REVIEW_DAY).emphasisPlan!;
    expect(next.review!.entries[0].decision).toBe('seguir');
    const kept = next.items.find((i) => i.key === 'motor:base-aerobica')!;
    expect(kept.baseline!.ratio).toBeCloseTo(0.86, 2);
    expect(kept.baseline!.samples).toBe(6);
    expect(kept.stalled).toBe(0);
  });

  it('sin mejora: la primera vez sigue otras 4 semanas y la segunda (8 semanas) se rota', () => {
    const first = ensureEmphasisPlan(profile(plan(motorItem())), history(0.79, 6), REVIEW_DAY).emphasisPlan!;
    expect(first.review!.entries[0]).toMatchObject({ decision: 'seguir' });
    expect(first.items.find((i) => i.key === 'motor:base-aerobica')!.stalled).toBe(1);
    // 4 semanas después, con otros 3 datos y sin mejorar
    const second = ensureEmphasisPlan(profile(first), history(0.79, 9), new Date('2026-12-29T12:00:00')).emphasisPlan!;
    expect(second.review!.entries[0].decision).toBe('rotar');
    expect(second.items.map((i) => i.key)).not.toContain('motor:base-aerobica');
    expect(second.rotated).toEqual({ 'motor:base-aerobica': '2026-12-29' });
  });

  it('lo rotado no vuelve en 8 semanas', () => {
    const rotated = plan(null, { rotated: { 'motor:base-aerobica': '2026-12-20' }, items: [] , reviewOn: '2026-12-27' });
    const soon = ensureEmphasisPlan(profile(rotated), history(0.79, 9), new Date('2026-12-27T12:00:00')).emphasisPlan!;
    expect(soon.items.map((i) => i.key)).not.toContain('motor:base-aerobica');
    const later = ensureEmphasisPlan(profile(rotated), history(0.79, 9), new Date('2027-02-20T12:00:00')).emphasisPlan!;
    expect(ROTATED_PAUSE_DAYS).toBe(56);
    expect(later.items.map((i) => i.key)).toContain('motor:base-aerobica');
  });

  it('esperar: con menos de 3 datos nuevos no se decide nada, se revisa en 2 semanas y no se avisa', () => {
    const next = ensureEmphasisPlan(profile(plan(motorItem())), history(0.97, 4), REVIEW_DAY).emphasisPlan!;
    const e = next.review!.entries[0];
    expect(e.decision).toBe('esperar');
    expect(e.newSamples).toBe(1);
    expect(e.reason).toContain('hacen falta 3');
    expect(next.review!.seen).toBe(true);
    expect(next.reviewOn).toBe('2026-12-15');
    // lo que seguía, sigue, con el mismo punto de partida
    expect(next.items.find((i) => i.key === 'motor:base-aerobica')!.baseline).toEqual({ ratio: 0.78, samples: 3 });
  });

  it('lo que el atleta quitó no se revisa ni vuelve', () => {
    const next = ensureEmphasisPlan(profile(plan(motorItem(), { removed: ['motor:base-aerobica'] })), history(0.7, 6), REVIEW_DAY).emphasisPlan!;
    expect(next.review).toBeUndefined();
    expect(next.items.map((i) => i.key)).not.toContain('motor:base-aerobica');
    expect(next.removed).toEqual(['motor:base-aerobica']);
  });

  it('nunca más de dos cosas a la vez, y lo que sigue va antes que lo nuevo', () => {
    const next = ensureEmphasisPlan(profile(plan(motorItem())), history(0.86, 6), REVIEW_DAY).emphasisPlan!;
    expect(next.items.length).toBeLessThanOrEqual(MAX_EMPHASIS_ITEMS);
    expect(next.items[0].key).toBe('motor:base-aerobica');
  });

  it('un plan de antes de esta función (sin punto de partida) no decide: lo toma como punto de partida', () => {
    const old = motorItem({ baseline: undefined });
    const next = ensureEmphasisPlan(profile(plan(old)), history(0.8, 6), REVIEW_DAY).emphasisPlan!;
    expect(next.review!.entries[0].decision).toBe('esperar');
    expect(next.items[0].baseline).toBeDefined();
  });

  it('nextReviewOn: la fecha guardada o 28 días (7 si no había nada)', () => {
    expect(nextReviewOn(plan(motorItem(), { reviewOn: '2026-12-10' }))).toBe('2026-12-10');
    expect(nextReviewOn(plan(motorItem(), { reviewOn: undefined }))).toBe('2026-12-01');
    expect(nextReviewOn(plan(null, { reviewOn: undefined }))).toBe('2026-11-10');
  });

  it('formatRatio: el motor como porcentaje frente a lo estimado, el resto frente a lo esperable', () => {
    expect(formatRatio('motor', 0.78)).toBe('−22 %');
    expect(formatRatio('motor', 1.05)).toBe('+5 %');
    expect(formatRatio('fuerza', 0.83)).toBe('83 % de lo esperable');
  });
});
