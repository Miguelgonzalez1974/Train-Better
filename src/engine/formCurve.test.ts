import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../data/athlete/types';
import {
  addDays,
  buildFormSeries,
  formMissing,
  formSentence,
  formStateOf,
  formToday,
  planLoads,
  projectionDays,
  steadyLoads,
  steadyWithCompetition,
  type CompetitionWindow,
} from './formCurve';
import { dayStrain } from './strain';

const TODAY = '2026-10-31';
const entry = (date: string, rpe = 7, durationMin = 60): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });

/** Entrena 4 de cada 7 días durante `weeks` semanas hasta ayer, con una carga constante. */
function steadyHistory(weeks: number, rpe = 7): SessionHistoryEntry[] {
  const out: SessionHistoryEntry[] = [];
  for (let back = weeks * 7; back >= 1; back--) {
    if (back % 7 === 3 || back % 7 === 5 || back % 7 === 0 || back % 7 === 1) out.push(entry(addDays(TODAY, -back), rpe));
  }
  return out;
}

describe('buildFormSeries', () => {
  it('sin historial no hay curva', () => {
    const s = buildFormSeries({ history: [], todayIso: TODAY });
    expect(s.points).toHaveLength(0);
    expect(s.ready).toBe(false);
  });

  it('con pocas sesiones o pocos días todavía no se fía', () => {
    const few = buildFormSeries({ history: [entry(addDays(TODAY, -3)), entry(addDays(TODAY, -2))], todayIso: TODAY });
    expect(few.ready).toBe(false);
    expect(formToday(few)).toBeNull();
    expect(formMissing(few).sessions).toBe(4);
  });

  it('enseña los últimos 28 días con hoy marcado y la previsión como futuro', () => {
    const s = buildFormSeries({ history: steadyHistory(8), todayIso: TODAY, future: [0, 50, 0] });
    expect(s.ready).toBe(true);
    expect(s.points.filter((p) => !p.future)).toHaveLength(28);
    expect(s.points.filter((p) => p.future)).toHaveLength(3);
    expect(s.points[s.todayIndex].iso).toBe(TODAY);
    expect(s.points[s.todayIndex].future).toBe(false);
  });

  it('con una carga constante la forma queda cerca de cero (ni cargado ni fresco)', () => {
    const s = buildFormSeries({ history: steadyHistory(12), todayIso: TODAY });
    const today = s.points[s.todayIndex];
    expect(Math.abs(today.form)).toBeLessThan(0.25 * today.fitness);
  });

  it('una subida fuerte de carga deja la forma negativa y bajarla la sube por encima de cero', () => {
    const base = steadyHistory(10, 6);
    const hard = [...base, ...[6, 5, 4, 3, 2, 1].map((b) => entry(addDays(TODAY, -b), 9, 90))];
    const loaded = buildFormSeries({ history: hard, todayIso: TODAY });
    const l = loaded.points[loaded.todayIndex];
    expect(l.form).toBeLessThan(0);
    expect(formStateOf(l.form, l.fitness)).toBe('cargado');

    // Misma base y una semana de descanso casi total tras las semanas duras.
    const rested = [...base.filter((e) => e.date < addDays(TODAY, -8)), ...[16, 15, 14, 13, 12, 11, 10].map((b) => entry(addDays(TODAY, -b), 9, 90))];
    const fresh = buildFormSeries({ history: rested, todayIso: TODAY });
    const f = fresh.points[fresh.todayIndex];
    expect(f.form).toBeGreaterThan(0);
  });

  it('la forma de un día se mide antes de sumar su carga', () => {
    const s = buildFormSeries({ history: [...steadyHistory(8), entry(TODAY, 10, 120)], todayIso: TODAY });
    const base = buildFormSeries({ history: steadyHistory(8), todayIso: TODAY });
    expect(s.points[s.todayIndex].form).toBeCloseTo(base.points[base.todayIndex].form, 5);
    // …pero mañana ya lo nota.
    const next = buildFormSeries({ history: [...steadyHistory(8), entry(TODAY, 10, 120)], todayIso: TODAY, future: [0] });
    expect(next.points[next.todayIndex + 1].form).toBeLessThan(s.points[s.todayIndex].form);
  });

  it('ignora lo que está fechado en el futuro', () => {
    const a = buildFormSeries({ history: steadyHistory(8), todayIso: TODAY });
    const b = buildFormSeries({ history: [...steadyHistory(8), entry(addDays(TODAY, 2), 10, 120)], todayIso: TODAY });
    expect(b.points[b.todayIndex].form).toBeCloseTo(a.points[a.todayIndex].form, 5);
  });
});

describe('formStateOf', () => {
  it('es relativo a la forma física', () => {
    expect(formStateOf(8, 40)).toBe('ventana');
    expect(formStateOf(8, 200)).toBe('equilibrio');
    expect(formStateOf(-12, 40)).toBe('cargado');
    expect(formStateOf(-3, 40)).toBe('equilibrio');
  });
});

describe('previsión', () => {
  const comp: CompetitionWindow = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };

  it('"sin bajar el ritmo" repite la media de ese día de la semana', () => {
    const h = steadyHistory(6);
    const loads = steadyLoads(h, TODAY, 7);
    expect(loads).toHaveLength(7);
    const expected = dayStrain(entry(TODAY, 7, 60))!;
    expect(Math.max(...loads)).toBe(expected);
    expect(Math.min(...loads)).toBe(0);
  });

  it('el plan recorta el taper y deja la competición dura', () => {
    const steady = [60, 60, 60, 60, 60, 60, 60, 60];
    const plan = planLoads(steady, TODAY, comp, 0.6);
    expect(plan[0]).toBe(36); // quedan 5 días: taper
    expect(plan[3]).toBe(24); // activación (2 antes)
    expect(plan[4]).toBe(9); // víspera (el día antes de empezar)
    expect(plan[5]).toBe(80); // primer día
    expect(plan[6]).toBe(80); // segundo día
    expect(plan[7]).toBe(24); // después: recuperación
    expect(steadyWithCompetition(steady, TODAY, comp)[5]).toBe(80);
    expect(steadyWithCompetition(steady, TODAY, comp)[0]).toBe(60);
  });

  it('sin competición el plan es tu ritmo de siempre', () => {
    expect(planLoads([10, 20], TODAY, null)).toEqual([10, 20]);
  });

  it('con la competición cerca la previsión llega hasta dos días después', () => {
    expect(projectionDays(TODAY, comp)).toBe(9);
    expect(projectionDays(TODAY, null)).toBe(10);
    expect(projectionDays(TODAY, { eventStart: addDays(TODAY, 40), eventEnd: addDays(TODAY, 41) })).toBe(10);
  });

  it('tapering llega a la competición mejor que no bajar el ritmo', () => {
    const history = steadyHistory(8, 8);
    const steady = steadyWithCompetition(steadyLoads(history, TODAY, 9), TODAY, comp);
    const plan = planLoads(steadyLoads(history, TODAY, 9), TODAY, comp, 0.6);
    const withPlan = buildFormSeries({ history, todayIso: TODAY, future: plan });
    const noTaper = buildFormSeries({ history, todayIso: TODAY, future: steady });
    const at = (s: typeof withPlan) => s.points.find((p) => p.iso === comp.eventStart)!.form;
    expect(at(withPlan)).toBeGreaterThan(at(noTaper));
  });
});

describe('formSentence', () => {
  it('con competición cuenta cómo se llega el primer día', () => {
    const comp: CompetitionWindow = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };
    const history = steadyHistory(8, 8);
    const future = planLoads(steadyLoads(history, TODAY, 9), TODAY, comp, 0.6);
    const s = buildFormSeries({ history, todayIso: TODAY, future });
    const text = formSentence(s, 'plan', comp);
    expect(text).toMatch(/^Con tu plan llegarías el 6 de noviembre/);
    expect(formSentence(s, 'steady', comp)).toMatch(/^Si no bajas el ritmo llegarías/);
  });

  it('sin competición señala el mejor momento o dice que sigues cargado', () => {
    const history = [...steadyHistory(8, 6), ...[5, 4, 3, 2, 1].map((b) => entry(addDays(TODAY, -b), 10, 100))];
    const s = buildFormSeries({ history, todayIso: TODAY, future: [0, 0, 0, 0, 0, 0, 0] });
    expect(formSentence(s, 'plan', null)).toMatch(/Con tu plan/);
  });

  it('sin previsión devuelve la frase de hoy', () => {
    const s = buildFormSeries({ history: steadyHistory(8), todayIso: TODAY });
    expect(formSentence(s, 'plan', null)).toBe(formToday(s)!.sentence);
  });
});
