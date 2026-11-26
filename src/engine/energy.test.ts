import { describe, expect, it } from 'vitest';
import type { PainFlag, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { CARRY_SHARE, costOfSrpe, eveningEnergy, hoursText, morningEnergy, morningRows, nightAdjust, shiftIso, sleepFraction, sleepGain, type EnergyInput } from './energy';

const TODAY = '2026-11-20';
const day = (back: number) => shiftIso(TODAY, -back);
const NORMAL = { sleep: 'regular', soreness: 'ninguno', stress: 'medio', motivation: 'normal' } as const;
const check = (back: number, over: Partial<ReadinessCheck> = {}): ReadinessCheck => ({ date: day(back), ...NORMAL, sleepHours: 8, ...over });
const session = (back: number, rpe: number, minutes: number): SessionHistoryEntry => ({ date: day(back), mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe, durationMin: minutes });
const input = (over: Partial<EnergyInput> = {}): EnergyInput => ({ history: [], readinessLog: [check(0)], painFlags: undefined, ...over });
/** Diez días iguales y tranquilos antes de hoy, para que la cadena parta de una situación estable. */
const quietDays = (): ReadinessCheck[] => Array.from({ length: 11 }, (_, i) => check(i));

describe('las piezas de la energía', () => {
  it('el sueño devuelve una parte de lo que falta, más cuantas más horas', () => {
    expect([4, 5, 6, 7, 8, 9, 11].map(sleepFraction)).toEqual([0.1, 0.25, 0.4, 0.55, 0.65, 0.7, 0.7]);
    expect(sleepFraction(6.5)).toBeCloseTo(0.475, 3);
    expect(sleepFraction(0)).toBe(0);
    expect(sleepGain(16, 8)).toBe(55);
    expect(sleepGain(100, 9)).toBe(0);
  });

  it('entrenar gasta un punto por cada 20 de RPE por minutos', () => {
    expect(costOfSrpe(7 * 60)).toBe(21);
    expect(costOfSrpe(2 * 70)).toBe(7);
    expect(costOfSrpe(0)).toBe(0);
  });

  it('la respuesta de la noche corrige a medias, hacia arriba o hacia abajo', () => {
    expect(nightAdjust(16, 'normal')).toBe(33);
    expect(nightAdjust(16, 'reventado')).toBe(13);
    expect(nightAdjust(60, 'reventado')).toBe(35);
    expect(nightAdjust(40, undefined)).toBe(40);
    expect(eveningEnergy(56, 40, 'bien')).toEqual({ computed: 16, value: 43 });
    expect(eveningEnergy(20, 50)).toEqual({ computed: 0, value: 0 });
  });

  it('escribe las horas como se leen', () => {
    expect(hoursText(8)).toBe('8 h');
    expect(hoursText(6.4)).toBe('6 h 24');
  });
});

describe('la energía de la mañana', () => {
  it('lo que se entrena hoy no la cambia', () => {
    const before = morningEnergy(input({ readinessLog: quietDays() }), TODAY).total;
    expect(morningEnergy(input({ readinessLog: quietDays(), history: [session(0, 9, 90)] }), TODAY).total).toBe(before);
  });

  it('tras un día duro se amanece más bajo que tras descansar, y descansar sube de forma notable', () => {
    const log = quietDays();
    const rested = morningEnergy(input({ readinessLog: log }), TODAY).total;
    const afterHard = morningEnergy(input({ readinessLog: log, history: [session(1, 9, 100)] }), TODAY).total;
    expect(afterHard).toBeLessThan(rested - 15);
    // El día siguiente al duro, descansando, vuelve a subir mucho.
    const nextDay = morningEnergy(input({ readinessLog: [...log, check(-1)], history: [session(1, 9, 100)] }), shiftIso(TODAY, 1)).total;
    expect(nextDay).toBeGreaterThan(afterHard + 8);
  });

  it('un entreno suave cuesta poco: casi como descansar', () => {
    const log = quietDays();
    const rested = morningEnergy(input({ readinessLog: log }), TODAY).total;
    const easy = morningEnergy(input({ readinessLog: log, history: [session(1, 3, 40)] }), TODAY).total;
    expect(rested - easy).toBeLessThanOrEqual(5);
  });

  it('arrastra una parte de los dos últimos días; las agujetas no se suman encima, cuenta lo mayor', () => {
    const history = [session(1, 8, 100), session(2, 6, 100)];
    const trained = Math.round(CARRY_SHARE[0] * costOfSrpe(800) + CARRY_SHARE[1] * costOfSrpe(600));
    const e = morningEnergy(input({ history }), TODAY);
    expect(e).toMatchObject({ carry: trained, carryFrom: 'entreno' });
    const sore = morningEnergy(input({ history, readinessLog: [check(0, { soreness: 'leve' })] }), TODAY);
    expect(sore.carry).toBe(Math.max(trained, 4));
    const strong = morningEnergy(input({ history: [session(1, 3, 30)], readinessLog: [check(0, { soreness: 'alto' })] }), TODAY);
    expect(strong).toMatchObject({ carry: 10, carryFrom: 'agujetas' });
  });

  it('dormir más horas devuelve más, y sin check-in se suponen 7', () => {
    const log = (hours: number) => [...quietDays().slice(1), check(0, { sleepHours: hours })];
    expect(morningEnergy(input({ readinessLog: log(8), history: [session(1, 8, 90)] }), TODAY).total).toBeGreaterThan(
      morningEnergy(input({ readinessLog: log(4), history: [session(1, 8, 90)] }), TODAY).total + 10,
    );
    const none = morningEnergy(input({ readinessLog: quietDays().slice(1) }), TODAY);
    expect(none).toMatchObject({ hasCheckIn: false, sleepKnown: false, sleepHours: 7, checkin: 0 });
  });

  it('una mala mañana se nota aunque vengas descansado', () => {
    const rested = quietDays().slice(1);
    const bad = morningEnergy(input({ readinessLog: [...rested, check(0, { sleep: 'mal', sleepHours: 5.5, soreness: 'alto', stress: 'alto', motivation: 'baja' })] }), TODAY);
    expect(bad.total).toBeLessThanOrEqual(66);
  });

  it('estrés y ánimo suman o restan; las molestias restan', () => {
    const good = morningEnergy(input({ readinessLog: [check(0, { stress: 'bajo', motivation: 'alta' })] }), TODAY);
    const bad = morningEnergy(input({ readinessLog: [check(0, { stress: 'alto', motivation: 'baja' })] }), TODAY);
    expect(good.checkin).toBe(4);
    expect(bad.checkin).toBe(-20);
    const pain: PainFlag[] = [{ id: 'p', area: 'rodilla', createdDate: day(2), until: null }];
    expect(morningEnergy(input({ painFlags: pain }), TODAY).pain).toMatchObject({ penalty: 8, areas: ['rodilla'] });
  });

  it('la respuesta de anoche cambia con cuánto se amanece', () => {
    const base = input({ readinessLog: quietDays(), history: [session(1, 9, 100)] });
    const computed = morningEnergy(base, TODAY).total;
    const better = morningEnergy({ ...base, nightLog: [{ date: day(1), feel: 'bien' }] }, TODAY);
    expect(better.nightFeel).toBe('bien');
    expect(better.total).toBeGreaterThan(computed);
    expect(morningEnergy({ ...base, nightLog: [{ date: day(1), feel: 'reventado' }] }, TODAY).total).toBeLessThanOrEqual(computed);
  });

  it('la carga solo resta cuando se sale de lo seguro', () => {
    const steady = Array.from({ length: 27 }, (_, i) => session(i + 1, 5, 40));
    expect(morningEnergy(input({ history: steady }), TODAY).load.penalty).toBe(0);
    const spike = [...Array.from({ length: 20 }, (_, i) => session(i + 8, 3, 30)), ...Array.from({ length: 7 }, (_, i) => session(i + 1, 9, 100))];
    expect(morningEnergy(input({ history: spike }), TODAY).load.penalty).toBe(20);
  });

  it('nunca se sale de 0 a 100, y las filas explican la cifra', () => {
    const heavy = Array.from({ length: 14 }, (_, i) => session(i + 1, 10, 180));
    const low = morningEnergy(input({ history: heavy, readinessLog: [check(0, { sleepHours: 3, stress: 'alto', motivation: 'baja', soreness: 'alto' })] }), TODAY);
    expect(low.total).toBeGreaterThanOrEqual(0);
    const e = morningEnergy(input({ readinessLog: quietDays(), history: [session(1, 7, 80)] }), TODAY);
    const rows = morningRows(e);
    expect(rows[0]).toMatchObject({ key: 'anoche', base: true, value: e.from });
    expect(rows.reduce((s, r) => s + r.value, 0)).toBe(e.total);
  });
});
