import { describe, it, expect } from 'vitest';
import { generateSessionForDate } from './generateSession';
import { getWeekdayIndex, isStrengthOnlyDay } from './periodization';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { DailySession } from '../data/athlete/types';

/**
 * Sabado de solo fuerza (calendario de 6 dias, `trainingDayIndex` 5): fuerza + accesorio + skill, sin WOD ni oly.
 * El sabado el atleta suele hacer algo por equipos aparte, y el viernes ya lleva el doble WOD y el oly.
 */

// 140 dias: el macro de los fixtures acaba el 1 de junio; mas alla ya es modo mantenimiento, que no entra aqui.
function sessionsFor(trainingDaysPerWeek: 3 | 4 | 5 | 6): DailySession[] {
  const out: DailySession[] = [];
  for (const id of ['a', 'b', 'c']) {
    const profile = makeProfile({ trainingDaysPerWeek, macrocycles: [makeMacro({ id })], bodyweightLog: [{ date: '2026-01-01', kg: 82 }] });
    for (const d of consecutiveDates('2026-01-05', 140)) {
      out.push(generateSessionForDate(profile, [], d, profile.goals));
    }
  }
  return out;
}

const isSaturday = (s: DailySession) => getWeekdayIndex(new Date(`${s.date}T12:00:00`)) === 5;
const has = (s: DailySession, block: string) => s.blocks.some((b) => b.block === block);

describe('sabado de solo fuerza (6 dias)', () => {
  const six = sessionsFor(6);
  const saturdays = six.filter(isSaturday);

  it('solo es de solo fuerza el trainingDayIndex 5 del calendario de 6 dias', () => {
    expect(isStrengthOnlyDay(6, 5)).toBe(true);
    for (const n of [3, 4, 5] as const) for (let i = 0; i < 6; i++) expect(isStrengthOnlyDay(n, i)).toBe(false);
    for (let i = 0; i < 5; i++) expect(isStrengthOnlyDay(6, i)).toBe(false);
  });

  it('todos los sabados llevan fuerza, accesorio y skill, y nunca WOD ni oly', () => {
    expect(saturdays.length).toBeGreaterThan(40);
    const bad: string[] = [];
    for (const s of saturdays) {
      if (!has(s, 'strength')) bad.push(`${s.date}: sin fuerza`);
      if (!has(s, 'accessory')) bad.push(`${s.date}: sin accesorio`);
      if (!has(s, 'skill')) bad.push(`${s.date}: sin skill`);
      if (has(s, 'wod')) bad.push(`${s.date}: lleva WOD`);
      if (has(s, 'oly')) bad.push(`${s.date}: lleva oly`);
      if (s.doubleWod) bad.push(`${s.date}: marcado como doble`);
    }
    expect(bad).toEqual([]);
  });

  it('el sabado no anuncia un sistema energetico (no hay WOD) y se presenta como dia de fuerza', () => {
    for (const s of saturdays) {
      expect(s.energySystem, s.date).toBeUndefined();
      expect(s.dayEmphasis === 'fuerza' || s.dayEmphasis === undefined, s.date).toBe(true);
    }
    // Y lo explica: al menos una vez sale el motivo de "sabado de solo fuerza".
    const explained = saturdays.filter((s) => s.coachReasons?.some((r) => r.includes('Sábado de solo fuerza')));
    expect(explained.length).toBeGreaterThan(0);
  });

  it('el resto de dias de entreno (salvo el de recuperacion) siguen llevando WOD', () => {
    const others = six.filter((s) => !s.isRestDay && !isSaturday(s) && getWeekdayIndex(new Date(`${s.date}T12:00:00`)) !== 3);
    expect(others.length).toBeGreaterThan(200);
    const without = others.filter((s) => !has(s, 'wod')).map((s) => s.date);
    expect(without).toEqual([]);
  });

  it('el skill sigue saliendo ~2 dias por semana (martes y sabado), no uno solo', () => {
    // Un sabado por semana y macro: los dias de skill, repartidos entre las semanas, tienen que rondar 2 por sabado.
    // El jueves (recuperacion activa) lleva su propio skill suave aparte, y no cuenta aqui.
    const skillDays = six.filter((s) => has(s, 'skill') && getWeekdayIndex(new Date(`${s.date}T12:00:00`)) !== 3).length;
    expect(skillDays / saturdays.length).toBeGreaterThan(1.8);
    expect(skillDays / saturdays.length).toBeLessThan(2.4);
  });
  it('en calendarios de 3, 4 y 5 dias nada cambia: todo dia de entreno sigue llevando WOD', () => {
    for (const n of [4, 5] as const) {
      const days = sessionsFor(n).filter((s) => !s.isRestDay);
      expect(days.length).toBeGreaterThan(100);
      expect(days.filter((s) => !has(s, 'wod')).map((s) => s.date)).toEqual([]);
    }
  });
});
