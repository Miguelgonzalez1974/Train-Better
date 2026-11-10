import { describe, expect, it } from 'vitest';
import type { DailySession, SessionHistoryEntry } from '../data/athlete/types';
import { makeProfile } from '../engine/__fixtures';
import { generateSessionForDate } from '../engine/generateSession';
import { addDaysIso } from '../engine/periodization';
import { isRestMarked } from '../engine/restDays';
import { planWeekChange, type WeekPlan } from './weekShift';

const TODAY = '2026-03-02'; // lunes, dentro del macro de prueba
const profile = makeProfile({ trainingDaysPerWeek: 5 });
// Una firma de la sesión (sus movimientos), distinta en cada día, para comprobar qué sesión acaba en qué día.
const sig = (s: DailySession) => (s.isRestDay ? 'descanso' : s.blocks.map((b) => b.movementId).join(','));
const gen = (iso: string) => generateSessionForDate(profile, [], new Date(`${iso}T00:00:00`), profile.goals);
const week = (from: string, n = 8) => Array.from({ length: n }, (_, i) => addDaysIso(from, i));
const hist = (date: string): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });
const plan = (req: Parameters<typeof planWeekChange>[2], history: SessionHistoryEntry[] = []) => planWeekChange(profile, history, req, TODAY, sig);

const restDays = week(TODAY).filter((d) => gen(d).isRestDay);
const trainDays = week(TODAY).filter((d) => !gen(d).isRestDay);

describe('desplazar la semana', () => {
  it('cada sesión pasa al día siguiente hasta que un descanso lo absorbe; el primer día queda de descanso elegido', () => {
    const from = addDaysIso(TODAY, 1); // martes
    const p = plan({ kind: 'desplazar', from }) as WeekPlan;
    expect(typeof p).toBe('object');
    const rows = p.rows;
    expect(rows[0]).toMatchObject({ date: from, after: 'descanso' });
    expect(isRestMarked(p.profile.restDates, from)).toBe(true);
    // Lo que había un día pasa a ser lo del siguiente: la fila i dice después lo que la fila anterior decía antes.
    for (let i = 1; i < rows.length; i++) expect(rows[i].after).toBe(rows[i - 1].before);
    // El día que absorbe era de descanso; ninguna sesión se pierde ni se duplica.
    expect(rows[rows.length - 1].before).toBe('descanso');
    const trained = (xs: string[]) => xs.filter((x) => x !== 'descanso').sort();
    expect(trained(rows.map((r) => r.after))).toEqual(trained(rows.map((r) => r.before)));
    expect(p.changes.every((c) => c.date === from || c.after.editedByAthlete)).toBe(true);
    expect(p.changes[0].after.isRestDay).toBe(true);
    // Los días son consecutivos desde el elegido.
    expect(rows.map((r) => r.date)).toEqual(rows.map((_, i) => addDaysIso(from, i)));
  });

  it('desde un día de descanso empieza en el primer día con sesión', () => {
    const p = plan({ kind: 'desplazar', from: restDays[0] }) as WeekPlan;
    expect(typeof p).toBe('object');
    expect(p.rows[0].date > restDays[0]).toBe(true);
    expect(p.rows[0].before).not.toBe('descanso');
    expect(p.rows[0].after).toBe('descanso');
  });

  it('rechaza lo que no se puede: lo ya entrenado en la cadena, lo lejano y lo pasado', () => {
    const from = addDaysIso(TODAY, 1);
    expect(plan({ kind: 'desplazar', from }, [hist(addDaysIso(from, 1))])).toBe('hecho');
    expect(plan({ kind: 'desplazar', from: addDaysIso(TODAY, 40) })).toBe('fuera-de-rango');
    expect(plan({ kind: 'desplazar', from: addDaysIso(TODAY, -1) })).toBe('fuera-de-rango');
  });
});

describe('insertar una sesión en otro día', () => {
  it('la sesión pasa al destino y las de entre medias suben un día, sin perder ninguna', () => {
    const [a, , , d] = trainDays;
    const p = plan({ kind: 'insertar', from: a, to: d }) as WeekPlan;
    expect(typeof p).toBe('object');
    const row = (date: string) => p.rows.find((r) => r.date === date)!;
    // La sesión de `a` acaba en `d`.
    expect(row(d).after).toBe(row(a).before);
    // Cada día pasa a tener lo del siguiente día con sesión (los de entre medias suben).
    const slots = trainDays.filter((x) => x >= a && x <= d);
    for (let i = 0; i < slots.length - 1; i++) expect(row(slots[i]).after).toBe(row(slots[i + 1]).before);
    // Nada se pierde ni se duplica.
    expect(p.rows.map((r) => r.after).sort()).toEqual(p.rows.map((r) => r.before).sort());
    expect(p.changes.every((x) => x.after.editedByAthlete)).toBe(true);
  });

  it('hacia atrás también: la sesión sube y las de entre medias bajan un día', () => {
    const [a, , c] = trainDays;
    const p = plan({ kind: 'insertar', from: c, to: a }) as WeekPlan;
    const row = (date: string) => p.rows.find((r) => r.date === date)!;
    expect(row(a).after).toBe(row(c).before);
    const slots = trainDays.filter((x) => x >= a && x <= c);
    for (let i = 1; i < slots.length; i++) expect(row(slots[i]).after).toBe(row(slots[i - 1]).before);
  });

  it('los descansos se quedan donde están', () => {
    const first = trainDays[0];
    const last = trainDays.find((d) => d > restDays[0]) ?? trainDays[trainDays.length - 1];
    const p = plan({ kind: 'insertar', from: first, to: last }) as WeekPlan;
    expect(typeof p).toBe('object');
    for (const r of restDays.filter((d) => d >= first && d <= last)) expect(p.changes.some((c) => c.date === r)).toBe(false);
  });

  it('rechaza el mismo día, un día de descanso como origen o destino y lo entrenado', () => {
    const [a, b] = trainDays;
    expect(plan({ kind: 'insertar', from: a, to: a })).toBe('mismo-dia');
    expect(plan({ kind: 'insertar', from: a, to: restDays[0] })).toBe('sin-sesion');
    expect(plan({ kind: 'insertar', from: a, to: b }, [hist(b)])).toBe('hecho');
  });
});