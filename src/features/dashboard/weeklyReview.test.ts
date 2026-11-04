import { describe, expect, it } from 'vitest';
import type { AthleteProfile, Goal, ProgressionRecord, SessionHistoryEntry } from '../../data/athlete/types';
import { applyMacroReview, withMacroWeekReviewed } from '../../engine/macroReview';
import { makeMacro, makeProfile as fixtureProfile } from '../../engine/__fixtures';
import { buildWeeklyReview, previousWeek, withWeekReviewed } from './weeklyReview';

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
