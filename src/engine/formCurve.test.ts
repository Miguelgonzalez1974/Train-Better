import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../data/athlete/types';
import {
  addDays,
  buildFormSeries,
  formMissing,
  formAdvice,
  formDecision,
  formStateOf,
  formToday,
  formWindows,
  MAX_WINDOW_DAYS,
  planLoads,
  steadyLoads,
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
  });

  it('sin competición el plan es tu ritmo de siempre', () => {
    expect(planLoads([10, 20], TODAY, null)).toEqual([10, 20]);
  });

  it('tapering llega a la competición mejor que no bajar el ritmo', () => {
    const history = steadyHistory(8, 8);
    const steady = steadyLoads(history, TODAY, 9).map((l, i) => (i === 5 || i === 6 ? 80 : l));
    const plan = planLoads(steadyLoads(history, TODAY, 9), TODAY, comp, 0.6);
    const withPlan = buildFormSeries({ history, todayIso: TODAY, future: plan });
    const noTaper = buildFormSeries({ history, todayIso: TODAY, future: steady });
    const at = (s: typeof withPlan) => s.points.find((p) => p.iso === comp.eventStart)!.form;
    expect(at(withPlan)).toBeGreaterThan(at(noTaper));
  });
});

describe('formWindows', () => {
  /** Una forma que sube a base de bajar la carga: semanas duras y luego una semana casi sin entrenar. */
  function freshHistory(): SessionHistoryEntry[] {
    const base = steadyHistory(10, 8);
    return base.filter((e) => e.date < addDays(TODAY, -6));
  }

  it('una ventana necesita al menos dos días seguidos', () => {
    const s = buildFormSeries({ history: freshHistory(), todayIso: TODAY, future: [0, 0, 0, 0, 0, 0, 0] });
    const wins = formWindows(s);
    expect(wins.length).toBeGreaterThan(0);
    for (const w of wins) expect(w.days).toBeGreaterThanOrEqual(2);
  });

  it('un descanso suelto en medio de semanas duras no abre ventana', () => {
    const s = buildFormSeries({ history: steadyHistory(10, 8), todayIso: TODAY, future: [60, 0, 60, 60, 0, 60, 60] });
    expect(formWindows(s, TODAY)).toHaveLength(0);
  });

  it('afterIso deja solo las ventanas que acaban después de esa fecha', () => {
    const s = buildFormSeries({ history: freshHistory(), todayIso: TODAY, future: [0, 0, 0, 0, 0, 0, 0] });
    const all = formWindows(s);
    expect(formWindows(s, addDays(TODAY, 100))).toHaveLength(0);
    expect(formWindows(s, addDays(TODAY, -100))).toHaveLength(all.length);
  });

  it('una ventana dura como mucho una semana, aunque la carga siga baja', () => {
    const long = buildFormSeries({ history: freshHistory(), todayIso: TODAY, future: Array.from({ length: 30 }, () => 0) });
    for (const w of formWindows(long)) expect(w.days).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
  });

  it('keepIso conserva la ventana de ese día aunque sea de un solo día', () => {
    const forms = [-5, -2, 12, -3, -6];
    const points = forms.map((form, i) => ({ iso: addDays(TODAY, i), load: 0, fitness: 50, fatigue: 50 - form, form, future: i > 0 }));
    const s = { points, todayIndex: 0, ready: true, sessions: 20, spanDays: 40 };
    const day = addDays(TODAY, 2);
    expect(formWindows(s)).toHaveLength(0);
    const kept = formWindows(s, undefined, day);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ start: day, end: day, days: 1, peak: 12 });
  });

  it('el pico es el día de mejor forma de la ventana', () => {
    const s = buildFormSeries({ history: freshHistory(), todayIso: TODAY, future: [0, 0, 0, 0, 0, 0, 0] });
    for (const w of formWindows(s)) {
      const inside = s.points.filter((p) => p.iso >= w.start && p.iso <= w.end);
      expect(w.peak).toBe(Math.round(Math.max(...inside.map((p) => p.form))));
    }
  });
});

describe('formDecision y formAdvice', () => {
  const comp: CompetitionWindow = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };
  const history = steadyHistory(8, 8);
  const base = steadyLoads(history, TODAY, 9);
  const plan = buildFormSeries({ history, todayIso: TODAY, future: planLoads(base, TODAY, comp, 0.6) });

  it('con competición dice cómo llegas el primer día y qué hacer', () => {
    const text = formDecision(plan, comp, TODAY);
    expect(text).toContain('el 6 de noviembre');
    expect(text).toMatch(/[+−]\d/);
    expect(text).toMatch(/^(Sigue el plan|Con tu plan)/);
    expect(text).not.toMatch(/si no bajas/);
  });

  it('sin competición anuncia la próxima ventana o dice que no hay ninguna', () => {
    const future = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const rested = buildFormSeries({ history: steadyHistory(10, 8).filter((e) => e.date < addDays(TODAY, -6)), todayIso: TODAY, future });
    expect(formDecision(rested, null, TODAY)).toMatch(/ventana/);
    const hard = buildFormSeries({ history: steadyHistory(10, 8), todayIso: TODAY, future: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60] });
    expect(formDecision(hard, null, TODAY)).toMatch(/no se abre ninguna ventana/);
  });

  it('el consejo de hoy cambia con el estado y con la cuenta atrás', () => {
    expect(formAdvice('ventana', null, TODAY)).toMatch(/apretarla/);
    expect(formAdvice('cargado', null, TODAY)).toMatch(/sin carga extra/);
    expect(formAdvice('equilibrio', null, TODAY)).toMatch(/sigue el plan/);
    expect(formAdvice('cargado', comp, TODAY)).toMatch(/taper/);
    expect(formAdvice('ventana', comp, addDays(TODAY, 6))).toMatch(/Hoy compites/);
  });
});