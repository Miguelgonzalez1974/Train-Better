import { describe, expect, it } from 'vitest';
import type { AthleteProfile, DailySession, Goal, SessionHistoryEntry } from '../../data/athlete/types';
import { computeLevel } from '../../engine/levelCategories';
import { makeProfile } from '../../engine/__fixtures';
import { buildLevelCard, kgGoalFor, latestRecord, recentWods, type LevelCardInput } from './myLevelModel';

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
const card = (p: AthleteProfile = profile) => buildLevelCard({ profile: p, history: [], level: computeLevel({ profile: p, history: [], today }), todayIso: TODAY, todayPlan: null, sessionOn: () => null, readiness: null });

describe('la tarjeta Tu nivel', () => {
  it('lo que toca mejorar, tu peso y tu último récord', () => {
    const c = card();
    expect(c.improve.label).toMatch(/^a mejorar/);
    expect(c.weightKg).toBe(78.4);
    expect(c.line).toEqual({ icon: 'trophy', text: 'Último récord: ' + latestRecord(profile)!.label + ' 125 kg · hace 2 sem' });
    expect(c.total).toBe(8);
  });

  it('la primera marca de un levantamiento no es un récord', () => {
    expect(latestRecord({ ...profile, prLog: [{ date: '2026-10-01', key: 'snatch', kg: 65 }] })).toBeNull();
  });

  it('sin datos lo dice en vez de inventar', () => {
    const vacio = { ...base, prLog: [], bodyweightLog: [], workLog: [], setFeedbackLog: [] };
    const c = card(vacio);
    expect(c.weightKg).toBeNull();
    expect(c.stairs).toEqual({ zone: null, value: '—', label: 'falta tu año' });
    expect(c.step).toBeNull();
    expect(c.line.icon).toBe('info');
  });
});

describe('la tarjeta frente a otros: escalón, siguiente salto y test', () => {
  const athlete: AthleteProfile = {
    ...base,
    birthYear: 1974,
    prs: { ...base.prs, backSquat: 120, benchPress: 100, deadlift: 160, frontSquat: 95, strictPress: 60, snatch: 65, clean: 85, cleanAndJerk: 70 },
    bodyweightLog: [{ date: '2026-11-20', kg: 83 }],
  };
  const session = (over: Partial<DailySession> = {}): DailySession => ({ date: '2026-11-28', mesocycleWeek: 3, isRestDay: false, blocks: [{ block: 'oly', movementId: 'clean-and-jerk', sets: 5, reps: '1', loadKg: 60 }], ...over });
  const empty = session({ blocks: [] });
  const make = (over: Partial<LevelCardInput> = {}, day = '2026-11-28') => {
    const p = over.profile ?? athlete;
    return buildLevelCard({ profile: p, history: [], level: computeLevel({ profile: p, history: [], today: new Date(day + 'T12:00:00') }), todayIso: day, todayPlan: empty, sessionOn: () => null, readiness: 70, ...over });
  };

  it('la escalera de tu mejor categoría mientras no haya tres medidas', () => {
    expect(make().stairs).toEqual({ zone: 2, value: 'Intermedio', label: 'olímpicos' });
    const tres = { ...athlete, levelTests: [{ key: 'fran' as const, date: '2026-11-01', seconds: 500 }] };
    expect(make({ profile: tres }).stairs.label).toBe('en conjunto');
  });

  it('el salto más cercano, lo que te frena y qué día toca', () => {
    const c = make({ sessionOn: (iso) => (iso === '2026-12-01' ? session() : empty) });
    expect(c.step).toEqual({ tone: 'normal', timed: false, title: 'C&J: 72,5 kg y pasas a Intermedio', text: 'Te frena el jerk (clean 85) · toca el martes' });
    expect(make().step!.text).toBe('Te frena el jerk (clean 85)');
    expect(make({ sessionOn: () => session() }).step!.text).toBe('Te frena el jerk (clean 85) · toca mañana');
  });

  it('el día que toca invita a probar, salvo con poca energía o en descarga', () => {
    expect(make({ todayPlan: session() }).step).toMatchObject({ tone: 'today', title: 'Hoy toca C&J: 72,5 kg es Intermedio', text: 'Pruébalo solo si las series salen limpias' });
    expect(make({ todayPlan: session(), readiness: 35 }).step).toMatchObject({ tone: 'hold', title: 'C&J: a 1 kg de Intermedio', text: 'Hoy llegas con poca energía: sin pruebas' });
    expect(make({ todayPlan: session({ mesocycleWeek: 4 }) }).step).toMatchObject({ tone: 'hold', text: 'Esta semana no toca probar marca' });
  });

  it('un récord recién hecho que sube de escalón sale como conseguido, con el siguiente', () => {
    const p = { ...athlete, prLog: [{ date: '2026-08-30', key: 'snatch', kg: 50 }, { date: '2026-11-27', key: 'snatch', kg: 65 }] };
    expect(make({ profile: p }).step).toEqual({ tone: 'done', timed: false, title: 'Intermedio en snatch conseguido', text: 'Siguiente: C&J 72,5 kg para Intermedio' });
    expect(make({ profile: p }, '2026-12-01').step!.tone).toBe('normal');
  });

  it('el próximo test, el de hoy y el aplazado', () => {
    expect(make().test).toEqual({ text: 'Próximo test: Fran · lunes 30', when: 'en 2 días' });
    expect(make({}, '2026-11-29').test!.when).toBe('mañana');
    expect(make({}, '2026-11-30').test).toEqual({ text: 'Hoy: test Fran', when: '' });
    const aplazado = session({ levelTestPostponed: { key: 'fran', reason: 'preparacion' } });
    expect(make({ sessionOn: () => aplazado }).test).toEqual({ text: 'Fran aplazado', when: 'nueva fecha: lunes 7' });
    expect(make({ profile: { ...athlete, testPlan: { enabled: false } } }).test).toBeNull();
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
