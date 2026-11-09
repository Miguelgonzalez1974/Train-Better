import { describe, expect, it } from 'vitest';
import type { AthleteProfile } from '../data/athlete/types';
import { makeProfile } from '../engine/__fixtures';
import { generateSessionForDate } from '../engine/generateSession';
import { addDaysIso } from '../engine/periodization';
import { isRestMarked } from '../engine/restDays';
import { parseAsk } from '../features/dashboard/rexAsk';
import { confirmMoveText, moveProposalAnswer } from '../features/dashboard/rexMove';
import { dayLabel, planMove, type MovePlan } from './sessionMove';

const TODAY = '2026-03-02'; // lunes, dentro del macro de prueba
const profile: AthleteProfile = makeProfile({ trainingDaysPerWeek: 5 });

/** El primer día de descanso y el primero con sesión a partir de hoy, según el propio motor. */
function firstDays() {
  let rest: string | null = null;
  let train: string | null = null;
  for (let i = 0; i < 7; i++) {
    const iso = addDaysIso(TODAY, i);
    const s = generateSessionForDate(profile, [], new Date(`${iso}T00:00:00`), profile.goals);
    if (s.isRestDay && !rest) rest = iso;
    if (!s.isRestDay && !train) train = iso;
  }
  return { rest: rest!, train: train! };
}
const { rest, train } = firstDays();
const plan = (from: string, to: string | null, p = profile, history: Parameters<typeof planMove>[1] = []) => planMove(p, history, { from, to }, TODAY);

describe('mover sesiones de la semana', () => {
  it('un día con sesión pasa a uno de descanso: el origen queda de descanso elegido y la sesión, como editada', () => {
    const p = plan(train, rest) as MovePlan;
    expect(typeof p).toBe('object');
    expect(p.swap).toBe(false);
    const moved = p.writes.find((s) => s.date === rest)!;
    const left = p.writes.find((s) => s.date === train)!;
    expect(moved.isRestDay).toBe(false);
    expect(moved.editedByAthlete).toBe(true);
    expect(moved.blocks.length).toBeGreaterThan(0);
    expect(moved.coachReasons?.[0]).toMatch(/Lo moviste con Rex/);
    expect(left.isRestDay).toBe(true);
    expect(left.blocks).toEqual([]);
    expect(isRestMarked(p.profile.restDates, train)).toBe(true);
  });

  it('dos días con sesión se intercambian', () => {
    const days: string[] = [];
    for (let i = 0; i < 7 && days.length < 2; i++) {
      const iso = addDaysIso(TODAY, i);
      if (!generateSessionForDate(profile, [], new Date(`${iso}T00:00:00`), profile.goals).isRestDay) days.push(iso);
    }
    const p = plan(days[0], days[1]) as MovePlan;
    expect(p.swap).toBe(true);
    const a = p.writes.find((s) => s.date === days[1])!;
    const b = p.writes.find((s) => s.date === days[0])!;
    expect(a.blocks.length).toBeGreaterThan(0);
    expect(b.blocks.length).toBeGreaterThan(0);
    expect(a.editedByAthlete && b.editedByAthlete).toBe(true);
    // Un intercambio no marca descansos.
    expect(p.profile.restDates ?? []).toEqual([]);
  });

  it('sin decir a qué día, elige el primer día de descanso de los siguientes seis', () => {
    const p = plan(train, null) as MovePlan;
    expect(p.to).toBe(rest > train ? rest : p.to);
    expect(generateSessionForDate(profile, [], new Date(`${p.to}T00:00:00`), profile.goals).isRestDay).toBe(true);
  });

  it('rechaza lo que no se puede: el mismo día, un día ya entrenado, un día de descanso, lejos o sin hueco', () => {
    expect(plan(train, train)).toBe('mismo-dia');
    expect(plan(train, rest, profile, [{ date: train, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 }])).toBe('hecho');
    expect(plan(rest, train)).toBe('sin-sesion');
    expect(plan(train, addDaysIso(TODAY, 20))).toBe('fuera-de-rango');
    expect(plan(addDaysIso(TODAY, -1), train)).toBe('fuera-de-rango');
  });

  it('no mueve la sesión de un día elegido de descanso como destino libre', () => {
    const marked = makeProfile({ restDates: [rest] });
    const p = plan(train, null, marked);
    // Con ese descanso elegido a propósito no se usa de hueco automático (puede haber otro día o ninguno).
    if (typeof p === 'object') expect(p.to).not.toBe(rest);
  });

  it('el día se nombra como se habla', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('hoy');
    expect(dayLabel(addDaysIso(TODAY, 1), TODAY)).toBe('mañana');
    expect(dayLabel(addDaysIso(TODAY, 3), TODAY)).toBe('el jueves');
    expect(dayLabel(addDaysIso(TODAY, 9), TODAY)).toBe('el miércoles 11');
  });
});

describe('leer las frases de mover (hoy es lunes)', () => {
  const MONDAY = 1;
  const read = (t: string) => parseAsk(t, MONDAY);

  it('pasar una sesión a otro día', () => {
    expect(read('pasa la sesión de hoy a mañana')).toEqual({ kind: 'mover', from: 0, to: 1, confirmed: false });
    expect(read('mueve la sesión del miércoles al viernes')).toEqual({ kind: 'mover', from: 2, to: 4, confirmed: false });
    expect(read('pásala a mañana')).toEqual({ kind: 'mover', from: 0, to: 1, confirmed: false });
    expect(read('aplaza la sesión del jueves')).toEqual({ kind: 'mover', from: 3, to: null, confirmed: false });
  });

  it('el mismo día de la semana que hoy como destino es el de la semana que viene', () => {
    expect(read('pasa la sesión de hoy al lunes')).toEqual({ kind: 'mover', from: 0, to: 7, confirmed: false });
  });

  it('intercambiar', () => {
    expect(read('intercambia el miércoles y el jueves')).toEqual({ kind: 'mover', from: 2, to: 3, confirmed: false });
    expect(read('cambia el miércoles por el jueves')).toEqual({ kind: 'mover', from: 2, to: 3, confirmed: false });
  });

  it('«no puedo entrenar» un día que no es hoy: Rex elige el hueco', () => {
    expect(read('mañana no puedo entrenar')).toEqual({ kind: 'mover', from: 1, to: null, confirmed: false });
    expect(read('el jueves no voy a poder entrenar')).toEqual({ kind: 'mover', from: 3, to: null, confirmed: false });
  });

  it('confirmar vuelve a leerse con los mismos días', () => {
    const p = plan(train, rest) as MovePlan;
    const ask = moveProposalAnswer(p, TODAY).actions[0].ask!;
    expect(ask).toBe(confirmMoveText(p, TODAY));
    expect(read(ask)).toMatchObject({ kind: 'mover', confirmed: true });
  });

  it('mover la sesión sin decir a qué día pregunta a qué día', () => {
    expect(read('mover la sesión')).toEqual({ kind: 'mover-ayuda' });
    expect(read('quiero cambiarla de día')).toEqual({ kind: 'mover-ayuda' });
    expect(read('mueve el entreno a otro día')).toEqual({ kind: 'mover-ayuda' });
  });

  it('lo que no es mover sigue siendo lo que era', () => {
    expect(read('hoy no entreno').kind).toBe('no-plan');
    expect(read('no voy a poder entrenar esta semana').kind).toBe('faltar');
    expect(read('voy a faltar el lunes y el martes').kind).toBe('faltar');
    expect(read('que toca el viernes').kind).toBe('dia');
    expect(read('cambia el wod de mañana').kind).toBe('otro-wod');
    expect(read('cambia la sesión de hoy').kind).not.toBe('mover');
  });
});
