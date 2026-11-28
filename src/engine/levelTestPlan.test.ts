import { describe, expect, it } from 'vitest';
import type { AthleteProfile, LevelTestKey, SessionHistoryEntry } from '../data/athlete/types';
import { mergeProfile } from '../data/athlete/mergeProfile';
import { benchmarkWorkouts } from '../data/movements';
import { blockOrderOf } from '../features/planificacion/DaySessionBlocks';
import { makeMacro, makeProfile } from './__fixtures';
import { generateSessionForDate, planWeekLocks, wodMovementsOfSession } from './generateSession';
import { nextTestOfSameKind, TEST_PLAN_ANCHOR, TEST_WOD_ID, testBriefing, testCandidate, testNotice, testNote, testRetryDate, upcomingTests, withTestSkipped } from './levelTestPlan';
import { computeReferenceLevel } from './levelReference';
import { sessionParts } from './sessionParts';
import { getWodCatalog } from './wodCatalog';
import { getWodScoreType } from './wodScoring';

const athlete = (over: Partial<AthleteProfile> = {}): AthleteProfile =>
  makeProfile({ trainingDaysPerWeek: 6, birthYear: 1974, macrocycles: [makeMacro({ startDate: '2026-11-02', endDate: '2027-04-04' })], ...over });
const day = (iso: string) => new Date(`${iso}T12:00:00`);
const session = (iso: string, profile = athlete(), history: SessionHistoryEntry[] = []) => generateSessionForDate(profile, history, day(iso), profile.goals);
const done = (date: string, key: LevelTestKey, value: string, over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  date,
  mesocycleWeek: 1,
  movementIds: [`benchmark:${TEST_WOD_ID[key]}`],
  rxOrScaled: 'rx',
  rpe: 9,
  durationMin: 60,
  wodResult: { scoreType: 'time', value },
  ...over,
});

describe('el calendario de tests', () => {
  it('uno cada 4 semanas, rotando, en lunes', () => {
    expect(upcomingTests(athlete(), [], '2026-11-27')).toEqual([
      { key: 'fran', date: '2026-11-30' },
      { key: 'row2k', date: '2026-12-28' },
      { key: 'run5k', date: '2027-01-25' },
    ]);
    expect(nextTestOfSameKind('2026-11-30')).toBe('2027-02-22');
    expect(day(TEST_PLAN_ANCHOR).getDay()).toBe(1);
  });

  it('solo se ofrece en lunes y mientras el hueco siga pendiente', () => {
    expect(testCandidate(athlete(), [], '2026-11-23')).toBeNull();
    expect(testCandidate(athlete(), [], '2026-12-01')).toBeNull();
    expect(testCandidate(athlete(), [], '2026-12-07')?.key).toBe('fran');
    expect(testCandidate(athlete(), [done('2026-11-30', 'fran', '6:40')], '2026-12-07')).toBeNull();
  });

  it('un resultado hecho por tu cuenta poco antes ya vale', () => {
    const profile = athlete({ levelTests: [{ date: '2026-11-20', key: 'fran', seconds: 400 }] });
    expect(upcomingTests(profile, [], '2026-11-27')[0]).toEqual({ key: 'row2k', date: '2026-12-28' });
  });

  it('aplazar pasa al lunes siguiente; sin lunes libres, al siguiente test', () => {
    let profile = withTestSkipped(athlete(), '2026-11-30');
    expect(upcomingTests(profile, [], '2026-11-27', 1)).toEqual([{ key: 'fran', date: '2026-12-07' }]);
    for (const d of ['2026-12-07', '2026-12-14', '2026-12-21']) profile = withTestSkipped(profile, d);
    expect(upcomingTests(profile, [], '2026-11-27', 1)).toEqual([{ key: 'row2k', date: '2026-12-28' }]);
  });

  it('un test que no sale vuelve el lunes siguiente mientras quede hueco, no tres meses después', () => {
    // Aplazado por el coach (nada apuntado): el siguiente lunes del mismo hueco.
    expect(testRetryDate(athlete(), '2026-11-30')).toBe('2026-12-07');
    expect(testRetryDate(athlete(), '2026-12-14')).toBe('2026-12-21');
    // En el último lunes del hueco ya no queda sitio: su siguiente turno.
    expect(testRetryDate(athlete(), '2026-12-21')).toBe('2027-02-22');
    // Se saltan los lunes que hayas aplazado tú.
    expect(testRetryDate(withTestSkipped(athlete(), '2026-12-07'), '2026-11-30')).toBe('2026-12-14');
    expect(testRetryDate(athlete({ testPlan: { enabled: false } }), '2026-11-30')).toBeNull();
  });

  it('avisa la semana antes y se puede apagar', () => {
    expect(testNotice(athlete(), [], '2026-11-27')).toEqual({ key: 'fran', date: '2026-11-30', inDays: 3 });
    expect(testNotice(athlete(), [], '2026-11-30')).toBeNull();
    const off = athlete({ testPlan: { enabled: false } });
    expect(upcomingTests(off, [], '2026-11-27')).toEqual([]);
    expect(testCandidate(off, [], '2026-11-30')).toBeNull();
  });

  it('la ficha dice a qué apuntar y tu marca anterior', () => {
    const brief = testBriefing(athlete({ levelTests: [{ date: '2026-08-01', key: 'fran', seconds: 420 }] }), [], 'fran', '2026-11-30');
    expect(brief.targets).toEqual([
      { zone: 'Novato', seconds: 488 },
      { zone: 'Intermedio', seconds: 364 },
    ]);
    expect(testNote(brief)).toContain('Para Novato: 8:08 o menos · Intermedio: 6:04 o menos. Tu marca anterior: 7:00');
    expect(testBriefing(athlete(), [], 'run5k', '2026-11-30').targets.map((t) => t.seconds)).toEqual([1782, 1485]);
    expect(testBriefing(athlete(), [], 'row2k', '2026-11-30').targets).toEqual([]);
  });
});

describe('la sesión de un día de test', () => {
  it('el test es el WOD, va antes de la fuerza y la fuerza va ligera y sin accesorio', () => {
    const s = session('2026-11-30');
    const normal = session('2026-11-30', athlete({ testPlan: { enabled: false } }));
    expect(s.levelTest).toEqual({ key: 'fran' });
    expect(s.blocks.filter((b) => b.block === 'wod').map((b) => b.movementId)).toEqual(['benchmark:fran']);
    const order = s.blocks.map((b) => b.block);
    expect(order.indexOf('wod')).toBeLessThan(order.indexOf('strength'));
    expect(order).not.toContain('accessory');
    const sets = (x: typeof s) => x.blocks.filter((b) => b.block === 'strength').reduce((n, b) => n + (b.sets ?? 0), 0);
    const load = (x: typeof s) => x.blocks.find((b) => b.block === 'strength')?.loadKg ?? 0;
    expect(sets(s)).toBeLessThan(sets(normal));
    expect(load(s)).toBeLessThanOrEqual(load(normal));
    expect(blockOrderOf(s).slice(0, 3)).toEqual(['warmup', 'wod', 'strength']);
    expect(sessionParts(s)[0].key).toBe('wod1');
    expect(getWodScoreType(s, 1)).toBe('time');
    expect(wodMovementsOfSession(s).find((m) => m.movementId === 'thruster')?.rxKg).toBe(43);
    expect(s.coachReasons?.[0] ?? '').toContain('test de Fran');
  });

  it('el 5 km tiene su propio WOD, que no sale en ningún otro sitio', () => {
    const s = session('2027-01-25');
    expect(s.levelTest).toEqual({ key: 'run5k' });
    expect(s.blocks.find((b) => b.block === 'wod')?.movementId).toBe('benchmark:5k-run');
    expect(benchmarkWorkouts.find((w) => w.id === '5k-run')?.testOnly).toBe(true);
    expect(getWodCatalog().some((w) => w.id === 'bm:5k-run')).toBe(false);
    for (let i = 0; i < 40; i++) {
      const other = new Date(day('2026-11-03'));
      other.setDate(other.getDate() + i);
      const x = generateSessionForDate(athlete({ testPlan: { enabled: false } }), [], other, []);
      expect(x.blocks.map((b) => b.movementId)).not.toContain('benchmark:5k-run');
    }
  });

  it('se aplaza y lo dice: porque quieres, tras un parón, con poca preparación o por una molestia', () => {
    const skipped = session('2026-11-30', withTestSkipped(athlete(), '2026-11-30'));
    expect(skipped.levelTest).toBeUndefined();
    expect(skipped.levelTestPostponed).toEqual({ key: 'fran', reason: 'tu' });
    expect(session('2026-12-07', withTestSkipped(athlete(), '2026-11-30')).levelTest).toEqual({ key: 'fran' });

    const ramp = session('2026-11-30', athlete({ intensityRamp: { startDate: '2026-11-30', strengthWeeks: 2, olyWeeks: 2, wodWeeks: 2 } }));
    expect(ramp.levelTest).toBeUndefined();
    expect(ramp.levelTestPostponed?.reason).toBe('rampa');

    const tired = session('2026-11-30', athlete({ readinessLog: [{ date: '2026-11-30', sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' }] }));
    expect(tired.levelTest).toBeUndefined();
    expect(tired.levelTestPostponed?.reason).toBe('preparacion');

    const hurt = session('2026-11-30', athlete({ painFlags: [{ id: 'p', area: 'hombro', createdDate: '2026-11-29', until: null }] }));
    expect(hurt.levelTest).toBeUndefined();
    expect(hurt.levelTestPostponed?.reason).toBe('molestia');
  });

  it('planificar la semana no deja el test fijado', () => {
    const locks = planWeekLocks(athlete(), [], day('2026-11-30'), []);
    expect(locks['2026-11-30']?.wodBenchmarkId).toBeUndefined();
    expect(session('2026-11-30', athlete({ weeklyLocks: locks })).levelTest).toEqual({ key: 'fran' });
  });

  it('hecho el test, cuenta en Tu nivel', () => {
    const history = [done('2027-01-25', 'run5k', '24:10')];
    const run = computeReferenceLevel({ profile: athlete(), history, today: day('2027-01-26') }).categories.find((c) => c.key === 'largo')!;
    expect(run.marks[0]?.value).toBe('24:10');
  });
});

describe('sincronizar los tests programados', () => {
  it('se unen los lunes aplazados y gana el interruptor de este dispositivo', () => {
    const merged = mergeProfile(athlete({ testPlan: { skipped: ['2026-11-30'] } }), athlete({ testPlan: { enabled: false, skipped: ['2026-12-07'] } }));
    expect(merged.testPlan).toEqual({ enabled: false, skipped: ['2026-11-30', '2026-12-07'] });
  });
});
