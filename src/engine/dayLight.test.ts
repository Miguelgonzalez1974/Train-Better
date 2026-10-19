import { describe, it, expect } from 'vitest';
import { computeDayLight, LIGHT_GREEN_FROM, LIGHT_GREEN_FROM_PEAK, LIGHT_RED_UNTIL, LIGHT_RED_UNTIL_PEAK } from './dayLight';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { DailySession, ReadinessCheck } from '../data/athlete/types';

const base = { hrvLow: false, loadHigh: false, soreStrong: false, nearCompetition: false };

describe('semáforo del día: el color', () => {
  it('sin nota de preparación no hay semáforo', () => {
    expect(computeDayLight({ ...base, readiness: null })).toBeNull();
  });

  it('el color sale de la preparación: verde desde 65, rojo hasta 40 y ámbar entre medias', () => {
    expect(computeDayLight({ ...base, readiness: LIGHT_GREEN_FROM })!.color).toBe('verde');
    expect(computeDayLight({ ...base, readiness: LIGHT_GREEN_FROM - 1 })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: LIGHT_RED_UNTIL + 1 })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: LIGHT_RED_UNTIL })!.color).toBe('rojo');
    expect(computeDayLight({ ...base, readiness: 72 })!.reasons).toEqual(['Preparación 72 %']);
  });

  it('una HRV por debajo baja un escalón: de verde a ámbar, y de ámbar a rojo solo si la preparación ya va floja', () => {
    expect(computeDayLight({ ...base, readiness: 80, hrvLow: true })).toMatchObject({ color: 'ambar', reasons: ['Preparación 80 %', 'HRV por debajo de tu rango'] });
    expect(computeDayLight({ ...base, readiness: 58, hrvLow: true })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: 48, hrvLow: true })!.color).toBe('rojo');
  });

  it('la carga muy alta y las agujetas fuertes ponen tope en ámbar pero nunca hunden un ámbar', () => {
    expect(computeDayLight({ ...base, readiness: 80, loadHigh: true })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: 80, soreStrong: true })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: 55, loadHigh: true, soreStrong: true })!.color).toBe('ambar');
  });

  it('cerca de una competición los umbrales son más exigentes', () => {
    expect(computeDayLight({ ...base, readiness: 67 })!.color).toBe('verde');
    expect(computeDayLight({ ...base, readiness: 67, nearCompetition: true })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: LIGHT_GREEN_FROM_PEAK, nearCompetition: true })!.color).toBe('verde');
    expect(computeDayLight({ ...base, readiness: 43 })!.color).toBe('ambar');
    expect(computeDayLight({ ...base, readiness: LIGHT_RED_UNTIL_PEAK, nearCompetition: true })!.color).toBe('rojo');
  });
});

describe('semáforo del día: lo que hace a la sesión', () => {
  const profile = makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'light' })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
  const dates = consecutiveDates('2026-02-02', 28);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const MIX = {
    verde: { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' },
    ambar: { sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal' },
    rojo: { sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' },
  } as const;
  /** Cuatro check-ins seguidos hasta `d` (hacen falta 2 en la semana para que haya nota). */
  const withLight = (kind: keyof typeof MIX, d: Date): DailySession => {
    const log: ReadinessCheck[] = [3, 2, 1, 0].map((back) => {
      const day = new Date(d);
      day.setDate(day.getDate() - back);
      return { date: iso(day), ...MIX[kind] };
    });
    return generateSessionForDate({ ...profile, readinessLog: log }, [], d, profile.goals);
  };
  const plain = (d: Date) => generateSessionForDate(profile, [], d, profile.goals);
  const kinds = (s: DailySession) => new Set(s.blocks.map((b) => b.block));
  const strengthSets = (s: DailySession) => s.blocks.find((b) => b.block === 'strength' && !b.subgroup)?.sets;

  const trainingDays = dates.filter((d) => {
    const s = plain(d);
    return !s.isRestDay && kinds(s).has('strength') && kinds(s).has('wod');
  });

  it('hay días de entreno completos para probar', () => {
    expect(trainingDays.length).toBeGreaterThan(8);
  });

  it('un día rojo sustituye la sesión por recuperación activa: sin fuerza ni halterofilia, y lo dice', () => {
    for (const d of trainingDays) {
      const s = withLight('rojo', d);
      expect(s.dayLight?.color, iso(d)).toBe('rojo');
      expect(kinds(s).has('strength'), iso(d)).toBe(false);
      expect(kinds(s).has('oly'), iso(d)).toBe(false);
      expect(s.blocks.length, iso(d)).toBeGreaterThan(2);
      expect(s.coachReasons?.[0]).toContain('Día rojo');
    }
  });

  it('un día ámbar mantiene la sesión pero con menos: nunca más series de fuerza y a veces menos, y un solo bloque de superseries', () => {
    let fewer = 0;
    for (const d of trainingDays) {
      const base = plain(d);
      const s = withLight('ambar', d);
      expect(s.dayLight?.color, iso(d)).toBe('ambar');
      expect(kinds(s).has('strength'), iso(d)).toBe(true);
      expect(strengthSets(s)!, iso(d)).toBeLessThanOrEqual(strengthSets(base)!);
      if (strengthSets(s)! < strengthSets(base)!) fewer += 1;
      const supersets = new Set(s.blocks.filter((b) => b.block === 'accessory' && b.accessoryRole).map((b) => b.format));
      expect(supersets.size, iso(d)).toBeLessThanOrEqual(1);
      expect(s.coachReasons?.[0]).toContain('Día ámbar');
    }
    expect(fewer).toBeGreaterThan(3);
  });

  it('un día verde lleva la sesión completa: mismos movimientos de fuerza que sin semáforo', () => {
    for (const d of trainingDays.slice(0, 12)) {
      const s = withLight('verde', d);
      expect(s.dayLight?.color, iso(d)).toBe('verde');
      expect(s.blocks.filter((b) => b.block === 'strength').map((b) => b.movementId), iso(d)).toEqual(plain(d).blocks.filter((b) => b.block === 'strength').map((b) => b.movementId));
      expect(strengthSets(s), iso(d)).toBe(strengthSets(plain(d)));
    }
  });

  it('sin check-in de hoy no hay semáforo y la sesión no cambia', () => {
    for (const d of trainingDays.slice(0, 8)) {
      expect(plain(d).dayLight).toBeUndefined();
      const log: ReadinessCheck[] = [{ date: iso(new Date(d.getTime() - 86400000)), ...MIX.rojo }];
      expect(generateSessionForDate({ ...profile, readinessLog: log }, [], d, profile.goals).dayLight).toBeUndefined();
    }
  });
});
