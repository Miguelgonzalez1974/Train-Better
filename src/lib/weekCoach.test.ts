import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { makeProfile } from '../engine/__fixtures';
import { buildFormSeries, energyOf } from '../engine/formCurve';
import { addDaysIso } from '../engine/periodization';
import { shortSessionLabel } from '../features/dashboard/rexMove';
import { MIN_REST_MOVE_GAIN, MIN_SWAP_GAIN, pickWeekMoves, proposeWeekMove, simulateEnergy, weekMonday, type WeekSlot } from './weekCoach';

const iso = (n: number) => addDaysIso('2026-03-09', n); // 0 = lunes 9 de marzo
const slot = (i: number, load: number, extra: Partial<WeekSlot> = {}): WeekSlot => ({ iso: iso(i), load, movable: load > 0, restSlot: load === 0, families: [], light: false, ...extra });
/** Hoy (lunes) ya entrenado: ni se mueve ni es hueco. */
const slotsOf = (loads: number[], extra: (i: number) => Partial<WeekSlot> = () => ({})) =>
  loads.map((l, i) => slot(i, l, i === 0 ? { movable: false, restSlot: false } : extra(i)));
const START = { fitness: 35, fatigue: 30 };
/** Lo normal en cada día de la semana (domingo = 0): el martes ronda 62. */
const TYPICAL = [null, 73, 62, 53, 46, 39, 34];

describe('weekMonday', () => {
  it('es el lunes de la semana de cualquier día', () => {
    expect(weekMonday('2026-03-09')).toBe('2026-03-09');
    expect(weekMonday('2026-03-13')).toBe('2026-03-09');
    expect(weekMonday('2026-03-15')).toBe('2026-03-09');
    expect(weekMonday('2026-03-16')).toBe('2026-03-16');
  });
});

describe('simulateEnergy', () => {
  it('da la misma energía que la curva de forma de la app', () => {
    const history: SessionHistoryEntry[] = [];
    for (let i = 30; i >= 0; i--) {
      const d = addDaysIso('2026-03-09', -i);
      const wd = new Date(`${d}T12:00:00`).getDay();
      if (wd === 0 || wd === 6) continue;
      history.push({ date: d, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });
    }
    const loads = [60, 40, 0, 30];
    const series = buildFormSeries({ history, todayIso: '2026-03-09', future: loads.slice(1) });
    const today = series.points[series.todayIndex];
    // La carga de hoy ya está en el historial, así que la serie de la app y la simulación parten del mismo punto.
    const sim = simulateEnergy(today, [today.load, ...loads.slice(1)]);
    const app = series.points.slice(series.todayIndex).map((p) => energyOf(p.form, p.fitness));
    expect(sim).toEqual(app);
  });
});

describe('pickWeekMoves', () => {
  // Hoy 85 (muy duro), mañana el día fuerte (75), pasado una sesión suave de 20: el martes llegas cargado.
  const loads = [85, 75, 20, 60, 60, 0];

  it('propone intercambiar el día fuerte con una sesión suave cercana cuando te pilla peor de lo normal', () => {
    const picks = pickWeekMoves({ start: START, slots: slotsOf(loads), typical: TYPICAL });
    expect(picks.length).toBeGreaterThan(0);
    const best = picks[0];
    expect(best.heavy).toBe(1);
    expect(best.other).toBe(2);
    expect(best.restMove).toBe(false);
    expect(best.keyGain).toBeGreaterThanOrEqual(MIN_SWAP_GAIN);
    expect(best.after[best.other]).toBeGreaterThan(best.before[best.heavy]);
  });

  it('no dice nada si ese día no es peor de lo normal para ti', () => {
    // El martes habitual es 40: llegar con 38 no es «peor de lo normal».
    expect(pickWeekMoves({ start: START, slots: slotsOf(loads), typical: [null, 73, 40, 53, 46, 39, 34] })).toEqual([]);
  });

  it('sin referencia de lo normal solo habla si llegas cansado de verdad', () => {
    expect(pickWeekMoves({ start: START, slots: slotsOf(loads), typical: Array(7).fill(null) })).toEqual([]);
  });

  it('no mueve una sesión ligera que pasa por ahí: solo los días fuertes', () => {
    expect(pickWeekMoves({ start: START, slots: slotsOf([85, 30, 15, 30, 30, 0]), typical: TYPICAL })).toEqual([]);
  });

  it('una sesión que no se puede mover (entrenada, marcada de descanso, competición) no entra', () => {
    const fixed = slotsOf(loads, (i) => (i === 1 ? { movable: false } : {}));
    expect(pickWeekMoves({ start: START, slots: fixed, typical: TYPICAL }).every((p) => p.heavy !== 1 && p.other !== 1)).toBe(true);
    const noRest = slotsOf([85, 75, 0, 60, 60, 0], (i) => (i === 2 ? { restSlot: false } : {}));
    expect(pickWeekMoves({ start: START, slots: noRest, typical: TYPICAL }).every((p) => p.other !== 2 && p.heavy !== 2)).toBe(true);
  });

  it('pasar el día fuerte a un día de descanso pide más ganancia que intercambiarlo', () => {
    const picks = pickWeekMoves({ start: START, slots: slotsOf([85, 75, 0, 60, 60, 0]), typical: TYPICAL });
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) if (p.restMove) expect(p.keyGain).toBeGreaterThanOrEqual(MIN_REST_MOVE_GAIN);
  });

  it('no cambia días de semanas distintas ni a más de dos días', () => {
    const long = [85, 75, 20, 60, 60, 0, 0, 70, 30];
    for (const p of pickWeekMoves({ start: START, slots: slotsOf(long), typical: TYPICAL })) {
      expect(weekMonday(iso(p.heavy))).toBe(weekMonday(iso(p.other)));
      expect(Math.abs(p.heavy - p.other)).toBeLessThanOrEqual(2);
    }
  });

  it('no junta dos días del mismo trabajo pesado que no estaban juntos', () => {
    // martes piernas (día fuerte), miércoles empuje (suave), jueves piernas: pasar el martes al miércoles dejaría piernas con piernas.
    const fam = slotsOf(loads, (i) => ({ families: i === 1 ? ['piernas'] : i === 2 ? ['empuje'] : i === 3 ? ['piernas'] : [] }));
    const picks = pickWeekMoves({ start: START, slots: fam, typical: TYPICAL });
    expect(picks.some((p) => p.heavy === 1 && p.other === 2)).toBe(false);
  });

  it('el resto de la semana no sale perdiendo', () => {
    for (const p of pickWeekMoves({ start: START, slots: slotsOf(loads), typical: TYPICAL })) {
      p.afterLoads.forEach((l, i) => {
        if (i >= 1 && l > 0 && i !== p.other) expect(p.after[i]).toBeGreaterThanOrEqual(p.before[i] - 5);
      });
    }
  });

  it('una semana normal (sin nada raro) no da ninguna propuesta', () => {
    const calm = { fitness: 50, fatigue: 50 };
    expect(pickWeekMoves({ start: calm, slots: slotsOf([50, 50, 50, 50, 50, 0]), typical: [null, 50, 50, 50, 50, 50, 50] })).toEqual([]);
  });
});

describe('proposeWeekMove', () => {
  const profile = makeProfile({ trainingDaysPerWeek: 5 });
  const steady = (until: string): SessionHistoryEntry[] => {
    const out: SessionHistoryEntry[] = [];
    for (let i = 35; i >= 1; i--) {
      const d = addDaysIso(until, -i);
      const wd = new Date(`${d}T12:00:00`).getDay();
      if (wd === 0 || wd === 6) continue;
      out.push({ date: d, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });
    }
    return out;
  };

  it('sin historial suficiente no propone nada', () => {
    expect(proposeWeekMove(profile, [], '2026-03-09', shortSessionLabel)).toBeNull();
    expect(proposeWeekMove(profile, steady('2026-03-09').slice(0, 3), '2026-03-09', shortSessionLabel)).toBeNull();
  });

  it('con una semana normal tampoco, y lo que propone (si algo) es siempre un cambio que se puede hacer', () => {
    for (let d = 0; d < 7; d++) {
      const today = iso(d);
      const history = steady(today).filter((h) => h.date < today);
      const p = proposeWeekMove(profile, history, today, shortSessionLabel);
      if (!p) continue;
      expect(p.from > today && p.to > today).toBe(true);
      expect(weekMonday(p.from)).toBe(weekMonday(p.to));
      expect(p.weekPlan.changes.length).toBeGreaterThan(0);
      expect(p.energyTo).toBeGreaterThan(p.energyFrom);
      expect(p.days.every((x) => weekMonday(x.iso) === p.weekKey)).toBe(true);
      expect(p.days.filter((x) => x.changed)).toHaveLength(2);
    }
  });
});
