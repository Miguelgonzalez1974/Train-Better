import { describe, expect, it } from 'vitest';
import type { Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { computeLevel } from '../../engine/levelCategories';
import { makeProfile } from '../../engine/__fixtures';
import { buildLevelCard, kgGoalFor, latestRecord, recentWods } from './myLevelModel';

const TODAY = '2026-11-25';
const base = makeProfile();
const profile = {
  ...base,
  prs: { ...base.prs, backSquat: 125, snatch: 65 },
  prLog: [
    { date: '2026-09-01', key: 'backSquat', kg: 115 },
    { date: '2026-11-10', key: 'backSquat', kg: 125 },
    { date: '2026-10-01', key: 'snatch', kg: 65 },
  ],
  bodyweightLog: [
    { date: '2026-11-01', kg: 79 },
    { date: '2026-11-20', kg: 78.4 },
  ],
};
const today = new Date(`${TODAY}T12:00:00`);
const card = (p = profile) => buildLevelCard({ profile: p, level: computeLevel({ profile: p, history: [], today }), todayIso: TODAY });

describe('la tarjeta Tu nivel', () => {
  it('lo que más sube, lo que toca mejorar y el peso', () => {
    const c = card();
    expect(c.figures[0].value).toMatch(/^\+\d+(,\d)? kg$/);
    expect(c.figures[0].label).toBe('sube más: sentadilla');
    expect(c.figures[1].label).toMatch(/^a mejorar/);
    expect(c.figures[2]).toEqual({ value: '78,4 kg', label: 'tu peso' });
    expect(c.line).toEqual({ icon: 'trophy', text: 'Último récord: ' + latestRecord(profile)!.label + ' 125 kg · hace 2 sem' });
    expect(c.total).toBe(8);
  });

  it('la primera marca de un levantamiento no es un récord', () => {
    expect(latestRecord({ ...profile, prLog: [{ date: '2026-10-01', key: 'snatch', kg: 65 }] })).toBeNull();
  });

  it('sin datos lo dice en vez de inventar', () => {
    const vacio = { ...base, prLog: [], bodyweightLog: [], workLog: [], setFeedbackLog: [] };
    const c = card(vacio as typeof profile);
    expect(c.figures[0]).toEqual({ value: '—', label: 'sin subidas en 8 semanas' });
    expect(c.figures[2]).toEqual({ value: '—', label: 'apunta tu peso' });
    expect(c.line.icon).toBe('info');
  });
});

describe('las listas de la pantalla', () => {
  const goal = (extra: Partial<Goal>): Goal => ({ id: 'g', type: 'subir-pr', movementId: 'back-squat', targetDate: '2027-03-15', emphasis: 'moderado', createdAt: '2026-11-01', targetKg: 135, startKg: 115, ...extra });

  it('la meta en kilos solo de un objetivo abierto de ese levantamiento', () => {
    expect(kgGoalFor([goal({})], 'backSquat', TODAY)).toBe(135);
    expect(kgGoalFor([goal({ targetDate: '2026-11-01' })], 'backSquat', TODAY)).toBeNull();
    expect(kgGoalFor([goal({})], 'snatch', TODAY)).toBeNull();
  });

  it('los resultados recientes, con la mejor marca de un benchmark repetido', () => {
    const e = (date: string, value: string): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: ['benchmark:fran'], rxOrScaled: 'rx', rpe: 8, durationMin: 20, wodResult: { scoreType: 'time', value } });
    const list = recentWods([e('2026-09-01', '5:30'), e('2026-11-01', '4:58'), { ...e('2026-11-02', '0:00') }]);
    expect(list.map((w) => [w.title, w.value, w.best])).toEqual([
      ['Fran', '4:58', true],
      ['Fran', '5:30', false],
    ]);
  });
});
