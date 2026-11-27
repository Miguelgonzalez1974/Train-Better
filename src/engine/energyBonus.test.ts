import { describe, expect, it } from 'vitest';
import type { MobilityLogEntry, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';
import { mergeProfile, snapshotSyncBase } from '../data/athlete/mergeProfile';
import { buildDayEnergy, tomorrowEstimate } from '../features/dashboard/dayEnergy';
import { makeProfile } from './__fixtures';
import { eveningEnergy, nightAdjust } from './energy';
import { dayBonuses, mobilityPoints } from './energyBonus';
import { mobilitySeed, restRoutine } from './mobility';
import { readinessAt } from './readinessAt';

const DAY = '2026-11-27';
const mobility = (over: Partial<MobilityLogEntry> = {}): MobilityLogEntry => ({ id: 'm1', date: DAY, purpose: 'movilidad', zones: ['caderas'], minutes: 15, exercises: 6, ...over });
const wod = { block: 'wod' as const, movementId: 'row', format: 'RPE 2 · 45 min total', title: 'Recuperación activa' };
const entry = (over: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({ date: DAY, mesocycleWeek: 2, movementIds: ['row'], rxOrScaled: 'rx', rpe: 2, durationMin: 70, wodBlocks: [wod], ...over });
const day = (profile = makeProfile(), history: SessionHistoryEntry[] = [], morning: number | null = 52) => buildDayEnergy({ profile, history, dateIso: DAY, morning, session: null });

describe('lo que suma un día', () => {
  it('un descanso decidido sin entrenar suma 10; si entrenas, no', () => {
    const profile = { ...makeProfile(), restDates: [DAY] };
    expect(dayBonuses(profile, []).get(DAY)).toMatchObject({ rest: 10, total: 10 });
    expect(dayBonuses(profile, [entry({ rpe: 7, wodBlocks: [] })]).get(DAY)).toBeUndefined();
    const run = { ...profile, workouts: [{ id: 'w', date: DAY, time: '10:00', kind: 'running' as const, minutes: 45, rpe: 5 }] };
    expect(dayBonuses(run, []).get(DAY)).toBeUndefined();
    // Sin marcarlo, un día sin entrenar no suma nada aparte de lo que recupere el sueño.
    expect(dayBonuses(makeProfile(), []).size).toBe(0);
  });

  it('la movilidad suma un punto cada 5 minutos hasta 6, y el día no pasa de 15', () => {
    expect([2, 5, 12, 13, 15, 30, 90].map(mobilityPoints)).toEqual([0, 1, 2, 3, 3, 6, 6]);
    const profile = { ...makeProfile(), mobilityLog: [mobility({ minutes: 20 }), mobility({ id: 'm2', minutes: 25 })] };
    expect(dayBonuses(profile, []).get(DAY)).toMatchObject({ mobility: 6, total: 6 });
    expect(dayBonuses({ ...profile, restDates: [DAY] }, []).get(DAY)).toMatchObject({ rest: 10, mobility: 5, total: 15 });
  });

  it('una recuperación suave suma en vez de restar; con RPE 3 o más, resta', () => {
    expect(dayBonuses(makeProfile(), [entry()]).get(DAY)).toMatchObject({ recovery: 5, total: 5, recoverySrpe: 140 });
    expect(dayBonuses(makeProfile(), [entry({ rpe: 3 })]).get(DAY)).toBeUndefined();
    expect(dayBonuses(makeProfile(), [entry({ skipped: [{ block: 'wod' }] })]).get(DAY)).toBeUndefined();
    expect(dayBonuses(makeProfile(), [entry({ wodBlocks: [{ block: 'wod', movementId: 'row', format: 'AMRAP 12 min' }] })]).get(DAY)).toBeUndefined();
  });

  it('la recuperación se reconoce aunque ese día haya además otro entreno sumado', () => {
    const profile = { ...makeProfile(), workouts: [{ id: 'w', date: DAY, time: '19:00', kind: 'running' as const, minutes: 45, rpe: 5 }] };
    const energy = day(profile, [entry()]);
    expect(energy.items.map((i) => [i.name, i.cost, i.gain])).toEqual([
      ['Running', 11, undefined],
      ['CrossFit', 0, 5],
    ]);
    expect(energy).toMatchObject({ spent: 11, gained: 5, computed: 52 - 11 + 5 });
  });
});

describe('la movilidad que se propone', () => {
  it('llena el tiempo pedido añadiendo zonas si las que lo piden no bastan, y suma lo que promete', () => {
    for (const suggested of [['caderas' as const], [], ['hombros' as const, 'cuello' as const]]) {
      for (const minutes of [15, 30]) {
        const routine = restRoutine({ suggested, minutes, painAreas: [], seed: mobilitySeed(DAY) });
        expect(routine.zones.slice(0, suggested.length)).toEqual(suggested);
        expect(routine.zones.length).toBeGreaterThanOrEqual(3);
        expect(routine.minutes).toBeGreaterThanOrEqual(minutes - 1);
        expect(mobilityPoints(routine.minutes)).toBe(minutes / 5);
      }
    }
  });
});

describe('el día de descanso en la pantalla', () => {
  it('sale la fila de descanso y la de movilidad, nada previsto, y la energía sube', () => {
    const profile = { ...makeProfile(), restDates: [DAY], mobilityLog: [mobility()] };
    const energy = buildDayEnergy({ profile, history: [], dateIso: DAY, morning: 52, session: { date: DAY, mesocycleWeek: 2, isRestDay: false, blocks: [] }, plannedSession: { rpe: 7, minutes: 80 } });
    expect(energy.items.map((i) => [i.name, i.gain, i.done])).toEqual([
      ['Descanso', 10, true],
      ['Movilidad', 3, true],
    ]);
    expect(energy.items[1].detail).toBe('15 min · Caderas');
    expect(energy).toMatchObject({ spent: 0, gained: 13, computed: 65, energy: 65, pending: 0, effort: 0 });
  });

  it('con «Bien» por la noche sube otros 8', () => {
    const profile = { ...makeProfile(), restDates: [DAY], mobilityLog: [mobility()], nightLog: [{ date: DAY, feel: 'bien' as const }] };
    expect(day(profile)).toMatchObject({ computed: 65, energy: 73 });
  });
});

describe('la respuesta de la noche', () => {
  it('«Bien» y «Normal» nunca bajan la cifra', () => {
    expect(nightAdjust(80, 'bien')).toBe(88);
    expect(nightAdjust(97, 'bien')).toBe(100);
    expect(nightAdjust(20, 'bien')).toBe(45);
    expect(nightAdjust(80, 'normal')).toBe(80);
    expect(nightAdjust(20, 'normal')).toBe(35);
    // «Cansado» y «Reventado» siguen como estaban: acercan la cifra a la suya.
    expect(nightAdjust(80, 'cansado')).toBe(55);
    expect(nightAdjust(10, 'cansado')).toBe(20);
    expect(eveningEnergy(52, 0, 'bien', 13)).toEqual({ computed: 65, value: 73 });
  });
});

describe('lo que pasa a la mañana siguiente', () => {
  const NEXT = '2026-11-28';
  const checks: ReadinessCheck[] = ['2026-11-25', '2026-11-26', DAY].map((date) => ({ date, sleep: 'bien', soreness: 'ninguno', stress: 'medio', motivation: 'normal' }));
  const at = (profile: ReturnType<typeof makeProfile>, history: SessionHistoryEntry[] = []) => readinessAt(profile, history, new Date(`${NEXT}T12:00:00`)).total!;

  it('descansar y hacer movilidad hace amanecer más alto', () => {
    const base = { ...makeProfile(), readinessLog: checks };
    expect(at({ ...base, restDates: [DAY], mobilityLog: [mobility({ minutes: 30 })] })).toBeGreaterThan(at(base));
  });

  it('una recuperación suave no se arrastra como un entreno', () => {
    const base = { ...makeProfile(), readinessLog: checks };
    expect(at(base, [entry()])).toBeGreaterThan(at(base, [entry({ wodBlocks: [] })]));
    expect(tomorrowEstimate(base, [entry()], DAY, 57, 8)).toBeGreaterThan(tomorrowEstimate(base, [entry({ wodBlocks: [] })], DAY, 57, 8));
  });
});

describe('borrar una movilidad', () => {
  it('lo borrado no vuelve al sincronizar', () => {
    const both = { ...makeProfile(), mobilityLog: [mobility(), mobility({ id: 'm2' })] };
    const base = snapshotSyncBase(both, []);
    const merged = mergeProfile(both, { ...both, mobilityLog: [mobility({ id: 'm2' })] }, [], [], base);
    expect(merged.mobilityLog?.map((m) => m.id)).toEqual(['m2']);
  });
});
