import { describe, expect, it } from 'vitest';
import type { ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import {
  addDays,
  buildFormSeries,
  formMissing,
  SLEEP_MAX_BONUS,
  SLEEP_MAX_PENALTY,
  sleepAdjust,
  sleepSummary,
  energyOf,
  formAdvice,
  pointEnergy,
  pointState,
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

describe('energyOf', () => {
  it('pasa la forma a 0-100: sin ventaja ni lastre es la mitad', () => {
    expect(energyOf(0, 40)).toBe(50);
    expect(energyOf(8, 40)).toBeGreaterThan(75);
    expect(energyOf(-8, 40)).toBeLessThan(25);
  });
  it('se queda siempre entre 0 y 100', () => {
    expect(energyOf(500, 40)).toBe(100);
    expect(energyOf(-500, 40)).toBe(0);
  });
  it('el 100 % es raro: pide una forma un 30 % por encima de tu forma física', () => {
    expect(energyOf(20, 100)).toBeLessThan(100); // +20 %
    expect(energyOf(30, 100)).toBe(100);
  });
  it('a tope desde 75 y cansado hasta 25, como se cuenta al atleta', () => {
    // La forma relativa que da justo 75 y justo 25.
    expect(formStateOf(((75 - 50) / (500 / 3)) * 100, 100)).toBe('ventana');
    expect(formStateOf(((74 - 50) / (500 / 3)) * 100, 100)).toBe('equilibrio');
    expect(formStateOf(((25 - 50) / (500 / 3)) * 100, 100)).toBe('cargado');
    expect(formStateOf(((26 - 50) / (500 / 3)) * 100, 100)).toBe('equilibrio');
  });
  it('entrenando siempre igual nunca se está a tope ni cansado ni cerca del 100 %', () => {
    const s = buildFormSeries({ history: steadyHistory(12, 7), todayIso: TODAY });
    const energies = s.points.filter((p) => !p.future).map((p) => energyOf(p.form, p.fitness));
    expect(Math.max(...energies)).toBeLessThan(75);
    expect(Math.min(...energies)).toBeGreaterThan(25);
  });
});

describe('sueño', () => {
  const check = (date: string, over: Partial<ReadinessCheck> = {}): ReadinessCheck => ({ date, sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal', ...over });
  const byDate = (...cs: ReadinessCheck[]) => new Map(cs.map((c) => [c.date, c]));

  it('sin check-in de ese día no hay lectura', () => {
    expect(sleepAdjust(byDate(check(addDays(TODAY, -1), { sleepHours: 8 })), TODAY)).toBeNull();
  });

  it('7 h 30 ni suman ni restan; dormir más suma y dormir menos resta, con tope', () => {
    const at = (h: number) => sleepAdjust(byDate(check(TODAY, { sleepHours: h })), TODAY)!.points;
    expect(at(7.5)).toBe(0);
    expect(at(8)).toBe(4);
    expect(at(7)).toBe(-4);
    expect(at(6)).toBe(-12);
    expect(at(5)).toBe(-SLEEP_MAX_PENALTY);
    expect(at(11)).toBe(SLEEP_MAX_BONUS);
  });

  it('las dos noches anteriores pesan: la deuda de sueño se acumula', () => {
    const fresh = sleepAdjust(byDate(check(TODAY, { sleepHours: 8 })), TODAY)!;
    const debt = sleepAdjust(byDate(check(TODAY, { sleepHours: 8 }), check(addDays(TODAY, -1), { sleepHours: 5 }), check(addDays(TODAY, -2), { sleepHours: 5 })), TODAY)!;
    expect(debt.nights).toBe(3);
    expect(debt.avgHours).toBeCloseTo(6.5, 5); // 8·0,5 + 5·0,3 + 5·0,2
    expect(debt.points).toBeLessThan(fresh.points);
    expect(debt.points).toBe(-8);
  });

  it('si el check-in no lleva las horas, usa lo que respondiste sobre el sueño', () => {
    expect(sleepAdjust(byDate(check(TODAY, { sleep: 'bien' })), TODAY)!.avgHours).toBe(8);
    expect(sleepAdjust(byDate(check(TODAY, { sleep: 'mal' })), TODAY)!.points).toBe(-SLEEP_MAX_PENALTY);
  });

  it('solo cuenta el sueño: agujetas, estrés, ánimo y HRV no mueven la energía', () => {
    const calm = sleepAdjust(byDate(check(TODAY, { sleepHours: 7.5 })), TODAY)!.points;
    const rough = sleepAdjust(byDate(check(TODAY, { sleepHours: 7.5, soreness: 'alto', stress: 'alto', motivation: 'baja', hrvVs: 'bajo' })), TODAY)!.points;
    expect(rough).toBe(calm);
  });

  it('cada día de la serie con check-in lleva su sueño; los futuros y los demás, 0', () => {
    const history = steadyHistory(8);
    const s = buildFormSeries({ history, todayIso: TODAY, future: [0, 0], checks: [check(addDays(TODAY, -1), { sleepHours: 6 }), check(TODAY, { sleepHours: 8 })] });
    const byIso = new Map(s.points.map((p) => [p.iso, p]));
    expect(byIso.get(TODAY)!.sleep).toBeLessThan(4); // 8 h hoy pero 6 h ayer: la media pesa
    expect(byIso.get(TODAY)!.sleepNights).toBe(2);
    expect(byIso.get(addDays(TODAY, -2))!.sleep).toBe(0);
    expect(byIso.get(addDays(TODAY, 1))!.sleep).toBe(0);
  });

  it('la energía del día es la de su carga más el sueño, entre 0 y 100', () => {
    const history = steadyHistory(8);
    const without = buildFormSeries({ history, todayIso: TODAY });
    const withSleep = buildFormSeries({ history, todayIso: TODAY, checks: [check(TODAY, { sleepHours: 9 })] });
    const a = without.points[without.todayIndex];
    const b = withSleep.points[withSleep.todayIndex];
    expect(a.form).toBeCloseTo(b.form, 9); // la carga no cambia
    expect(pointEnergy(b)).toBe(Math.min(100, energyOf(a.form, a.fitness) + SLEEP_MAX_BONUS));
    expect(pointEnergy({ form: 500, fitness: 40, sleep: 8 })).toBe(100);
    expect(pointEnergy({ form: -500, fitness: 40, sleep: -15 })).toBe(0);
  });

  it('el sueño puede subir un día de normal a a tope y bajarlo a cansado', () => {
    const up = ((70 - 50) / (500 / 3)) * 100; // energía 70 por carga: +8 la deja en 78
    expect(pointState({ form: up, fitness: 100 })).toBe('equilibrio');
    expect(pointState({ form: up, fitness: 100, sleep: 8 })).toBe('ventana');
    const down = ((35 - 50) / (500 / 3)) * 100;
    expect(pointState({ form: down, fitness: 100 })).toBe('equilibrio');
    expect(pointState({ form: down, fitness: 100, sleep: -15 })).toBe('cargado');
  });

  it('resume el sueño en pocas palabras', () => {
    expect(sleepSummary({ points: 4, avgHours: 8, nights: 3 })).toBe('8 h de media en 3 noches');
    expect(sleepSummary({ points: -4, avgHours: 7, nights: 1 })).toBe('7 h esta noche');
  });
});

describe('coste real de las sesiones en la serie', () => {
  const heavy = (date: string): SessionHistoryEntry => ({ ...entry(date, 7, 60), wodCatalogId: 'bm:mayhem-453', strengthPattern: 'squat' });
  const plain = (date: string): SessionHistoryEntry => entry(date, 7, 60);
  const swap = (make: (d: string) => SessionHistoryEntry) => steadyHistory(8).map((e) => make(e.date));

  it('las mismas sesiones con más coste real dejan menos energía que sin él', () => {
    const light = buildFormSeries({ history: swap(plain), todayIso: TODAY });
    const costly = buildFormSeries({ history: swap(heavy), todayIso: TODAY });
    const a = light.points[light.todayIndex];
    const b = costly.points[costly.todayIndex];
    expect(b.load).toBeGreaterThanOrEqual(a.load);
    // La energía "sin coste" es la misma carga pura en las dos series.
    expect(b.energyNoCost).toBe(a.energyNoCost);
  });

  it('una sesión reciente más cara que su RPE resta energía respecto a la carga pura', () => {
    const history = [...swap(plain).filter((e) => e.date < addDays(TODAY, -1)), heavy(addDays(TODAY, -1))];
    const s = buildFormSeries({ history, todayIso: TODAY });
    const p = s.points[s.todayIndex];
    expect(energyOf(p.form, p.fitness)).toBeLessThan(p.energyNoCost!);
  });

  it('sin información de las sesiones el coste real no cambia nada', () => {
    const s = buildFormSeries({ history: steadyHistory(8), todayIso: TODAY });
    for (const p of s.points) expect(energyOf(p.form, p.fitness)).toBe(p.energyNoCost);
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

  it('tras la competición solo recortan los tres días de recuperación y luego se vuelve al ritmo normal', () => {
    const steady = Array.from({ length: 16 }, () => 60);
    const plan = planLoads(steady, TODAY, comp, 0.6);
    // La competición acaba en el día 7 (índice 6): índices 7, 8 y 9 son la recuperación.
    expect([plan[7], plan[8], plan[9]]).toEqual([24, 24, 24]);
    expect(plan.slice(10)).toEqual(Array.from({ length: 6 }, () => 60));
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
    expect(kept[0]).toMatchObject({ start: day, end: day, days: 1, peak: energyOf(12, 50) });
  });

  it('el pico es el día de mejor forma de la ventana', () => {
    const s = buildFormSeries({ history: freshHistory(), todayIso: TODAY, future: [0, 0, 0, 0, 0, 0, 0] });
    for (const w of formWindows(s)) {
      const inside = s.points.filter((p) => p.iso >= w.start && p.iso <= w.end);
      const best = inside.reduce((b, p) => (p.form > b.form ? p : b), inside[0]);
      expect(w.peak).toBe(energyOf(best.form, best.fitness));
    }
  });
});

describe('formAdvice', () => {
  const comp: CompetitionWindow = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };

  it('el consejo de hoy cambia con el estado y con la cuenta atrás', () => {
    expect(formAdvice('ventana', null, TODAY)).toMatch(/apretarla/);
    expect(formAdvice('cargado', null, TODAY)).toMatch(/sin carga extra/);
    expect(formAdvice('equilibrio', null, TODAY)).toMatch(/sigue el plan/);
    expect(formAdvice('cargado', comp, TODAY)).toMatch(/taper/);
    expect(formAdvice('ventana', comp, addDays(TODAY, 6))).toMatch(/Hoy compites/);
  });
});