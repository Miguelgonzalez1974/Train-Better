import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../data/athlete/types';
import { makeProfile } from '../engine/__fixtures';
import type { EnergyInput } from '../engine/energy';
import { addDaysIso } from '../engine/periodization';
import { shortSessionLabel } from '../features/dashboard/rexMove';
import { forecastEnergy, MIN_REST_MOVE_GAIN, MIN_SWAP_GAIN, pickWeekMoves, proposeWeekMove, weekMonday, type WeekSlot } from './weekCoach';

const iso = (n: number) => addDaysIso('2026-03-09', n); // 0 = lunes 9 de marzo
const slot = (i: number, load: number, extra: Partial<WeekSlot> = {}): WeekSlot => ({ iso: iso(i), load, movable: load > 0, restSlot: load === 0, families: [], light: false, ...extra });
/** Hoy (lunes) ya entrenado: ni se mueve ni es hueco. */
const slotsOf = (loads: number[], extra: (i: number) => Partial<WeekSlot> = () => ({})) =>
  loads.map((l, i) => slot(i, l, i === 0 ? { movable: false, restSlot: false } : extra(i)));
/** Lo ya entrenado antes de hoy: nada, y sin check-ins. */
const EMPTY: EnergyInput = { history: [], readinessLog: [], painFlags: [] };
const energy = (loads: number[]) => forecastEnergy(EMPTY, loads.map((_, i) => iso(i)), loads);
/** Lo normal en cada día de la semana (domingo = 0): el martes ronda 85. */
const TYPICAL = [null, 85, 85, 70, 70, 65, 70];

describe('weekMonday', () => {
  it('es el lunes de la semana de cualquier día', () => {
    expect(weekMonday('2026-03-09')).toBe('2026-03-09');
    expect(weekMonday('2026-03-13')).toBe('2026-03-09');
    expect(weekMonday('2026-03-15')).toBe('2026-03-09');
    expect(weekMonday('2026-03-16')).toBe('2026-03-16');
  });
});

describe('forecastEnergy', () => {
  it('amaneces con menos tras un día duro, y un día ya registrado manda sobre lo previsto', () => {
    const rest = energy([0, 0, 0]);
    const hard = energy([30, 0, 0]);
    expect(hard[0]).toBe(rest[0]);
    expect(hard[1]).toBeLessThan(rest[1]);
    const done: EnergyInput = { ...EMPTY, history: [{ date: iso(0), mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 8, durationMin: 90 }] };
    const isos = [iso(0), iso(1)];
    expect(forecastEnergy(done, isos, [5, 0])).toEqual(forecastEnergy(done, isos, [36, 0]));
  });
});

describe('pickWeekMoves', () => {
  // Hoy muy duro (45 puntos), mañana el día fuerte (30), pasado una sesión suave: el martes llegas cargado.
  const loads = [45, 30, 8, 22, 22, 0];

  it('propone intercambiar el día fuerte con una sesión suave cercana cuando te pilla peor de lo normal', () => {
    const picks = pickWeekMoves({ energy, slots: slotsOf(loads), typical: TYPICAL });
    expect(picks.length).toBeGreaterThan(0);
    const best = picks[0];
    expect(best.heavy).toBe(1);
    // El día de destino es el que mejor te pilla de los que hay a uno o dos días.
    expect([2, 3]).toContain(best.other);
    expect(best.restMove).toBe(false);
    expect(best.keyGain).toBeGreaterThanOrEqual(MIN_SWAP_GAIN);
    expect(best.after[best.other]).toBeGreaterThan(best.before[best.heavy]);
  });

  it('no dice nada si ese día no es peor de lo normal para ti', () => {
    const normal = energy(loads)[1] + 3;
    expect(pickWeekMoves({ energy, slots: slotsOf(loads), typical: TYPICAL.map((v, i) => (i === 2 ? normal : v)) }).filter((p) => p.heavy === 1)).toEqual([]);
  });

  it('sin referencia de lo normal solo habla si llegas con poca energía de verdad', () => {
    expect(pickWeekMoves({ energy, slots: slotsOf(loads), typical: Array(7).fill(null) })).toEqual([]);
  });

  it('no mueve una sesión ligera que pasa por ahí: solo los días fuertes', () => {
    expect(pickWeekMoves({ energy, slots: slotsOf([45, 12, 6, 12, 12, 0]), typical: TYPICAL })).toEqual([]);
  });

  it('una sesión que no se puede mover (entrenada, marcada de descanso, competición) no entra', () => {
    const fixed = slotsOf(loads, (i) => (i === 1 ? { movable: false } : {}));
    expect(pickWeekMoves({ energy, slots: fixed, typical: TYPICAL }).every((p) => p.heavy !== 1 && p.other !== 1)).toBe(true);
    const noRest = slotsOf([45, 30, 0, 22, 22, 0], (i) => (i === 2 ? { restSlot: false } : {}));
    expect(pickWeekMoves({ energy, slots: noRest, typical: TYPICAL }).every((p) => p.other !== 2 && p.heavy !== 2)).toBe(true);
  });

  it('pasar el día fuerte a un día de descanso pide más ganancia que intercambiarlo', () => {
    for (const p of pickWeekMoves({ energy, slots: slotsOf([45, 30, 0, 22, 22, 0]), typical: TYPICAL })) if (p.restMove) expect(p.keyGain).toBeGreaterThanOrEqual(MIN_REST_MOVE_GAIN);
  });

  it('no cambia días de semanas distintas ni a más de dos días', () => {
    const long = [45, 30, 8, 22, 22, 0, 0, 30, 10];
    for (const p of pickWeekMoves({ energy, slots: slotsOf(long), typical: TYPICAL })) {
      expect(weekMonday(iso(p.heavy))).toBe(weekMonday(iso(p.other)));
      expect(Math.abs(p.heavy - p.other)).toBeLessThanOrEqual(2);
    }
  });

  it('no junta dos días del mismo trabajo pesado que no estaban juntos', () => {
    // martes piernas (día fuerte), miércoles empuje (suave), jueves piernas: pasar el martes al miércoles dejaría piernas con piernas.
    const fam = slotsOf(loads, (i) => ({ families: i === 1 ? ['piernas'] : i === 2 ? ['empuje'] : i === 3 ? ['piernas'] : [] }));
    expect(pickWeekMoves({ energy, slots: fam, typical: TYPICAL }).some((p) => p.heavy === 1 && p.other === 2)).toBe(false);
  });

  it('el resto de la semana no sale perdiendo', () => {
    for (const p of pickWeekMoves({ energy, slots: slotsOf(loads), typical: TYPICAL })) {
      p.afterLoads.forEach((l, i) => {
        if (i >= 1 && l > 0 && i !== p.other) expect(p.after[i]).toBeGreaterThanOrEqual(p.before[i] - 5);
      });
    }
  });

  it('una semana normal (sin nada raro) no da ninguna propuesta', () => {
    const calm = [20, 20, 20, 20, 20, 0];
    const typical = [null, ...energy(calm).slice(0, 6)];
    expect(pickWeekMoves({ energy, slots: slotsOf(calm), typical: [null, typical[1], typical[2], typical[3], typical[4], typical[5], typical[6]] })).toEqual([]);
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
