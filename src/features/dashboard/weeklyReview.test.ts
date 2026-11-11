import { describe, expect, it } from 'vitest';
import type { AthleteProfile, Goal, ProgressionRecord, SessionHistoryEntry } from '../../data/athlete/types';
import { applyMacroReview, withMacroWeekReviewed } from '../../engine/macroReview';
import { makeMacro, makeProfile as fixtureProfile } from '../../engine/__fixtures';
import { applyGoalAdjustment, buildWeeklyReview, previousWeek, withWeekReviewed } from './weeklyReview';

// Lunes 9 nov 2026: la semana a repasar es del 2 al 8 de noviembre.
const MONDAY = new Date('2026-11-09T09:00:00');
const macro = makeMacro({ id: 'otono', label: 'Otoño', startDate: '2026-09-23', endDate: '2026-12-16' });
const makeProfile = (o: Partial<AthleteProfile> = {}) => fixtureProfile({ trainingDaysPerWeek: 5, macrocycles: [macro], painFlags: [], restDates: [], ...o });

const entry = (date: string, rpe = 7.4, durationMin = 60): SessionHistoryEntry => ({ date, mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });
const week = (dates: string[], rpe?: number) => dates.map((d) => entry(d, rpe));
const FULL = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
/** Algo anterior a la semana a repasar, para que no sea un alta reciente. */
const OLDER = [entry('2026-10-20'), entry('2026-10-27')];

describe('revisión semanal: cuándo sale', () => {
  it('repasa la semana anterior de lunes a domingo', () => {
    expect(previousWeek(MONDAY)).toMatchObject({ from: '2026-11-02', to: '2026-11-08' });
    expect(previousWeek(new Date('2026-11-11T20:00:00'))).toMatchObject({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('sale de lunes a miércoles y desaparece el jueves', () => {
    const history = [...OLDER, ...week(FULL)];
    expect(buildWeeklyReview(makeProfile(), history, new Date('2026-11-09T09:00:00'))).not.toBeNull();
    expect(buildWeeklyReview(makeProfile(), history, new Date('2026-11-11T09:00:00'))).not.toBeNull();
    expect(buildWeeklyReview(makeProfile(), history, new Date('2026-11-12T09:00:00'))).toBeNull();
    expect(buildWeeklyReview(makeProfile(), history, new Date('2026-11-08T09:00:00'))).toBeNull();
  });

  it('una vez dada por vista no vuelve, y la marca no se duplica', () => {
    const history = [...OLDER, ...week(FULL)];
    const review = buildWeeklyReview(makeProfile(), history, MONDAY)!;
    expect(review.weekKey).toBe('semana:2026-11-02');
    const done = withWeekReviewed(makeProfile(), review.weekKey);
    expect(buildWeeklyReview(done, history, MONDAY)).toBeNull();
    expect(withWeekReviewed(done, review.weekKey)).toBe(done);
    expect(done.reviewedMacroWeeks).toEqual(['semana:2026-11-02']);
  });

  it('«anytime» (Tu semana, en Más) repasa la última semana completa fuera de lunes a miércoles y aunque ya esté vista', () => {
    const history = [...OLDER, ...week(FULL)];
    const thursday = new Date('2026-11-12T09:00:00');
    expect(buildWeeklyReview(makeProfile(), history, thursday)).toBeNull();
    const review = buildWeeklyReview(makeProfile(), history, thursday, { anytime: true })!;
    expect(review).toMatchObject({ weekKey: 'semana:2026-11-02', from: '2026-11-02', to: '2026-11-08', sessions: { done: 5, planned: 5 } });
    const seen = withWeekReviewed(makeProfile(), review.weekKey);
    expect(buildWeeklyReview(seen, history, MONDAY)).toBeNull();
    expect(buildWeeklyReview(seen, history, MONDAY, { anytime: true })).not.toBeNull();
    // Sin nada anterior a esa semana sigue sin haber qué repasar.
    expect(buildWeeklyReview(makeProfile(), [], thursday, { anytime: true })).toBeNull();
  });

  it('un atleta sin nada anterior a esa semana no tiene qué repasar', () => {
    expect(buildWeeklyReview(makeProfile(), [], MONDAY)).toBeNull();
    expect(buildWeeklyReview(makeProfile(), week(['2026-11-09']), MONDAY)).toBeNull();
  });
});

describe('revisión semanal: las cifras', () => {
  const review = buildWeeklyReview(makeProfile(), [...OLDER, ...week(FULL, 7.4)], MONDAY)!;

  it('sesiones hechas de las programadas, esfuerzo medio y tiempo', () => {
    const by = Object.fromEntries(review.metrics.map((m) => [m.label, m]));
    expect(by['Sesiones']).toMatchObject({ value: '5 de 5', tone: 'good' });
    expect(by['RPE medio'].value).toBe('7,4');
    expect(by['Tiempo entrenando'].value).toBe('5 h 0 min');
    expect(review.sessions).toEqual({ done: 5, planned: 5 });
  });

  it('dice dónde estaba el plan esa semana', () => {
    expect(review.planLine).toMatch(/^semana 7 de 12 · /);
  });

  it('lo mejor: cumplir todas las sesiones', () => {
    expect(review.best.join(' ')).toMatch(/Cumpliste las 5 sesiones programadas/);
    expect(review.short).toBe(false);
  });

  it('un día de descanso elegido no cuenta como fallo', () => {
    const rested = buildWeeklyReview(makeProfile({ restDates: ['2026-11-06'] }), [...OLDER, ...week(FULL.slice(0, 4))], MONDAY)!;
    expect(rested.sessions).toEqual({ done: 4, planned: 4 });
    expect(rested.watch.join(' ')).not.toMatch(/faltó|faltaron/);
  });
});

describe('revisión semanal: lo mejor y lo que vigilar', () => {
  it('una subida de carga por resultados limpios', () => {
    const rec = (date: string): ProgressionRecord => ({ date, movementId: 'back-squat', key: 'backSquat', block: 'strength', verdict: 'limpia', prescribedKg: 100, topKg: 100, prescribedSets: 5, prescribedReps: 3 });
    const profile = makeProfile({ progressionLog: [rec('2026-11-03'), rec('2026-11-05')] });
    const review = buildWeeklyReview(profile, [...OLDER, ...week(FULL)], MONDAY)!;
    expect(review.best.join(' ')).toMatch(/sube a 102,5 kg: 2 sesiones limpias seguidas/);
  });

  it('un PR nuevo cuenta; la primera marca del registro (la siembra) no', () => {
    const profile = makeProfile({
      prLog: [
        { date: '2026-10-01', key: 'benchPress', kg: 80 },
        { date: '2026-11-04', key: 'benchPress', kg: 85 },
        { date: '2026-11-04', key: 'snatch', kg: 60 },
      ],
    });
    const best = buildWeeklyReview(profile, [...OLDER, ...week(FULL)], MONDAY)!.best.join(' ');
    expect(best).toMatch(/Nuevo PR en Bench Press: 85 kg/);
    expect(best).not.toMatch(/Snatch/);
  });

  it('faltar sesiones, esfuerzo alto, molestias activas y objetivos atrasados se vigilan', () => {
    const goal: Goal = { id: 'g', type: 'subir-pr', movementId: 'back-squat', targetDate: '2026-12-01', emphasis: 'moderado', createdAt: '2026-08-01' };
    const profile = makeProfile({ goals: [goal], painFlags: [{ id: 'p', area: 'rodilla', createdDate: '2026-11-03', until: '2026-11-20' }] });
    const review = buildWeeklyReview(profile, [...OLDER, ...week(FULL.slice(0, 3), 9)], MONDAY)!;
    const watch = review.watch.join(' | ');
    expect(watch).toMatch(/faltaron 2 sesiones/);
    expect(watch).toMatch(/esfuerzo medio fue alto \(RPE 9\)/);
    expect(watch).toMatch(/Rodilla: aviso de molestia activo/);
    expect(watch).toMatch(/Subir PR · .* falta un test/);
  });

  it('con un objetivo atrasado, la propuesta es la de siempre: subir el énfasis a intensivo', () => {
    const goal: Goal = { id: 'g', type: 'subir-pr', movementId: 'back-squat', targetDate: '2026-12-01', emphasis: 'moderado', createdAt: '2026-08-01' };
    const profile = makeProfile({ goals: [goal] });
    const review = buildWeeklyReview(profile, [...OLDER, ...week(FULL)], MONDAY)!;
    expect(review.suggestion?.kind).toBe('goal-behind');
    const applied = applyMacroReview(profile, review.suggestion!, '2026-11-09');
    expect(applied.goals[0].emphasis).toBe('intensivo');
    expect(applied.reviewedMacroWeeks).toContain(review.suggestion!.reviewKey);
  });

  it('sin objetivo atrasado ni carga alta, no hay propuesta', () => {
    expect(buildWeeklyReview(makeProfile(), [...OLDER, ...week(FULL)], MONDAY)!.suggestion).toBeNull();
  });
});

describe('revisión semanal: la semana corta', () => {
  const review = buildWeeklyReview(makeProfile(), [...OLDER, ...week(['2026-11-03', '2026-11-05'])], MONDAY)!;

  it('con muy pocas sesiones no juzga: ni lo mejor, ni lo que vigilar, ni propuesta', () => {
    expect(review.short).toBe(true);
    expect(review.best).toEqual([]);
    expect(review.watch).toEqual([]);
    expect(review.suggestion).toBeNull();
  });

  it('pero enseña las cifras', () => {
    expect(review.metrics.find((m) => m.label === 'Sesiones')).toMatchObject({ value: '2 de 5', tone: 'warn' });
  });

  it('una semana sin ninguna sesión también se puede repasar', () => {
    const none = buildWeeklyReview(makeProfile(), OLDER, MONDAY)!;
    expect(none.short).toBe(true);
    expect(none.metrics.find((m) => m.label === 'RPE medio')!.value).toBe('—');
  });
});

describe('revisión semanal: cómo sigue el plan y la revisión de 4 semanas', () => {
  it('sigue el macrociclo; con un programa de fuerza activo, el programa; sin nada, mantenimiento', () => {
    const history = [...OLDER, ...week(FULL)];
    expect(buildWeeklyReview(makeProfile(), history, MONDAY)!.nextLine).toMatch(/^Esta semana sigue en .* \(semana 7 de 12\) con 5 sesiones\.$/);
    const withProgram = makeProfile({ strengthPrograms: [{ id: 'p', startDate: '2026-11-04', endDate: '2026-12-29', method: '531', lifts: [] }] });
    expect(buildWeeklyReview(withProgram, history, MONDAY)!.nextLine).toMatch(/programa de fuerza \(semana 1 de 8\)/);
    expect(buildWeeklyReview(makeProfile({ macrocycles: [] }), history, MONDAY)!.nextLine).toMatch(/mantenimiento/);
  });

  it('avisa si hay una revisión de 4 semanas del énfasis sin ver', () => {
    const base = makeProfile();
    const withReview = makeProfile({
      emphasisPlan: {
        enabled: true,
        items: [],
        removed: [],
        review: { date: '2026-11-08', seen: false, entries: [{ key: 'motor:base-aerobica', area: 'motor', label: 'Motor', before: 0.8, now: 0.9, newSamples: 4, decision: 'seguir', reason: '' }] },
      },
    });
    const history = [...OLDER, ...week(FULL)];
    expect(buildWeeklyReview(base, history, MONDAY)!.emphasisReviewPending).toBe(false);
    expect(buildWeeklyReview(withReview, history, MONDAY)!.emphasisReviewPending).toBe(true);
  });
});

describe('revisión semanal: aplicar y descartar', () => {
  it('alargar una fase suma una semana a la fase actual del macrociclo activo', () => {
    const phased = makeMacro({ id: 'f', label: 'F', startDate: '2026-09-23', endDate: '2026-12-16', phaseWeeks: [4, 4, 2, 2] });
    const profile = makeProfile({ macrocycles: [phased] });
    const next = applyMacroReview(profile, { kind: 'extend-phase', reviewKey: 'f:7', phaseIndex: 2, headline: '', detail: '' }, '2026-11-09');
    expect(next.macrocycles[0].phaseWeeks).toEqual([4, 5, 2, 2]);
    expect(next.reviewedMacroWeeks).toEqual(['f:7']);
    expect(profile.macrocycles[0].phaseWeeks).toEqual([4, 4, 2, 2]);
  });

  it('descartar solo marca la semana como revisada', () => {
    const profile = makeProfile();
    const next = withMacroWeekReviewed(profile, 'otono:7');
    expect(next.macrocycles).toBe(profile.macrocycles);
    expect(next.reviewedMacroWeeks).toEqual(['otono:7']);
    expect(withMacroWeekReviewed(next, 'otono:7')).toBe(next);
  });
});

describe('revision semanal: cuenta el programa de fuerza (Texas)', () => {
  const texas = (extra: Partial<NonNullable<AthleteProfile['strengthPrograms']>[number]> = {}) =>
    ({ id: 'tx', startDate: '2026-09-01', endDate: '2027-01-30', method: 'texas', lifts: [], companion: { weekdays: [0, 2, 4], weeks: 20, cursor: 6, deferrals: 0 }, ...extra }) as NonNullable<AthleteProfile['strengthPrograms']>[number];
  const log = (date: string, outcome: 'hecha' | 'saltada', o: Record<string, unknown> = {}) => ({ id: `tx|${date}`, programId: 'tx', index: 0, date, outcome, ...o }) as NonNullable<AthleteProfile['companionLog']>[number];
  const history = [...OLDER, ...week(FULL)];

  it('sin programa no hay metrica del programa', () => {
    const r = buildWeeklyReview(makeProfile(), history, MONDAY)!;
    expect(r.metrics.map((m) => m.label)).not.toContain('Programa de fuerza');
  });

  it('con programa enseña cuantas sesiones hiciste de las que tocaban', () => {
    const profile = makeProfile({ strengthPrograms: [texas()], companionLog: [log('2026-11-02', 'hecha', { rpe: 7, durationMin: 40 }), log('2026-11-04', 'hecha', { rpe: 7, durationMin: 40 })] });
    const m = buildWeeklyReview(profile, history, MONDAY)!.metrics.find((x) => x.label === 'Programa de fuerza')!;
    // lunes, miercoles y viernes: 3 previstas, 2 hechas
    expect(m.value).toBe('2 de 3');
    expect(m.tone).toBe('muted');
  });

  it('todas hechas: bien; una saltada se avisa', () => {
    const all = makeProfile({ strengthPrograms: [texas()], companionLog: ['2026-11-02', '2026-11-04', '2026-11-06'].map((d) => log(d, 'hecha')) });
    const r = buildWeeklyReview(all, history, MONDAY)!;
    expect(r.metrics.find((x) => x.label === 'Programa de fuerza')).toMatchObject({ value: '3 de 3', tone: 'good' });
    expect(r.best.join(' ')).toContain('Hiciste las 3 sesiones del programa de fuerza');
    const skipped = makeProfile({ strengthPrograms: [texas()], companionLog: [log('2026-11-02', 'saltada')] });
    expect(buildWeeklyReview(skipped, history, MONDAY)!.watch.join(' ')).toContain('Saltaste 1 sesi');
  });

  it('la marca de 5 del viernes sale entre lo mejor si salio, y entre lo que vigilar si no', () => {
    const lift = (achieved?: number) => ({ movementId: 'back-squat', sets: 1, reps: 5, loadKg: 100, attempt: true, ...(achieved !== undefined ? { achieved } : {}) });
    const ok = makeProfile({ strengthPrograms: [texas()], companionLog: [log('2026-11-06', 'hecha', { lifts: [lift(102.5)] })] });
    expect(buildWeeklyReview(ok, history, MONDAY)!.best.join(' ')).toContain('marca de 5');
    const ko = makeProfile({ strengthPrograms: [texas()], companionLog: [log('2026-11-06', 'hecha', { lifts: [lift()] })] });
    expect(buildWeeklyReview(ko, history, MONDAY)!.watch.join(' ')).toContain('no sali');
  });

  it('el tiempo entrenando suma los minutos del programa', () => {
    const without = buildWeeklyReview(makeProfile(), history, MONDAY)!.metrics.find((x) => x.label === 'Tiempo entrenando')!.value;
    const profile = makeProfile({ strengthPrograms: [texas()], companionLog: [log('2026-11-02', 'hecha', { rpe: 7, durationMin: 40 })] });
    const withTexas = buildWeeklyReview(profile, history, MONDAY)!.metrics.find((x) => x.label === 'Tiempo entrenando')!.value;
    expect(withTexas).not.toBe(without);
  });
});
describe('revision semanal: propuesta para una meta en kilos que no llega', () => {
  const kgGoal = (extra = {}) => ({ id: 'gk', type: 'subir-pr' as const, movementId: 'back-squat', targetDate: '2027-03-15', emphasis: 'moderado' as const, createdAt: '2026-10-01', targetKg: 195, startKg: 170, ...extra });
  const history = [...OLDER, ...week(FULL)];
  const prs = { backSquat: 172, frontSquat: 140, benchPress: 110, deadlift: 200, strictPress: 65, clean: 115, snatch: 90, cleanAndJerk: 118 };
  const slowLog = [{ date: '2026-09-20', key: 'backSquat', kg: 168 }, { date: '2026-11-08', key: 'backSquat', kg: 172 }];

  it('un objetivo que no llega a la fecha trae la propuesta con bajar la meta o mover la fecha', () => {
    const r = buildWeeklyReview(makeProfile({ goals: [kgGoal()], prs, prLog: slowLog }), history, MONDAY)!;
    expect(r.goalAdjust).not.toBeNull();
    expect(r.goalAdjust!.goalId).toBe('gk');
    expect(r.goalAdjust!.message).toMatch(/no llega a 195 kg/);
    expect(r.goalAdjust!.lowerKg).not.toBeNull();
  });

  it('si va al dia, o no hay meta, no hay propuesta', () => {
    const fast = [{ date: '2026-09-20', key: 'backSquat', kg: 150 }, { date: '2026-11-08', key: 'backSquat', kg: 172 }];
    expect(buildWeeklyReview(makeProfile({ goals: [kgGoal({ targetKg: 180 })], prs, prLog: fast }), history, MONDAY)!.goalAdjust).toBeNull();
    expect(buildWeeklyReview(makeProfile({ goals: [kgGoal({ targetKg: undefined, startKg: undefined })], prs }), history, MONDAY)!.goalAdjust).toBeNull();
  });

  it('con pocas sesiones no se propone nada', () => {
    expect(buildWeeklyReview(makeProfile({ goals: [kgGoal()], prs, prLog: slowLog }), [...OLDER, entry('2026-11-03')], MONDAY)!.goalAdjust).toBeNull();
  });

  it('aplicar la propuesta cambia solo la meta o la fecha de ese objetivo', () => {
    const profile = makeProfile({ goals: [kgGoal(), kgGoal({ id: 'otro', targetKg: 150 })] });
    const lower = applyGoalAdjustment(profile, 'gk', { targetKg: 185 });
    expect(lower.goals.find((g) => g.id === 'gk')).toMatchObject({ targetKg: 185, targetDate: '2027-03-15', startKg: 170 });
    expect(lower.goals.find((g) => g.id === 'otro')!.targetKg).toBe(150);
    expect(applyGoalAdjustment(profile, 'gk', { targetDate: '2027-04-05' }).goals[0]).toMatchObject({ targetKg: 195, targetDate: '2027-04-05' });
  });
});
