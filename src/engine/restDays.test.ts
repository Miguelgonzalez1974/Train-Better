import { describe, expect, it } from 'vitest';
import { isRestMarked, withRestMarked, withRestUnmarked, REST_DATES_LIMIT } from './restDays';
import { computeAdherenceStreak, computeWeekCount } from './adherence';
import { computeYearConsistency } from './yearConsistency';
import { getDayPlan, getWeekdayIndex, toLocalIsoDate } from './periodization';
import type { AthleteProfile, SessionHistoryEntry } from '../data/athlete/types';

const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({ trainingDaysPerWeek: 5, ...over }) as AthleteProfile;
const entry = (date: string) => ({ date }) as SessionHistoryEntry;

describe('descanso elegido: marcar y quitar', () => {
  it('marca un día una sola vez y lo deja ordenado', () => {
    const p = withRestMarked(withRestMarked(profile(), '2026-03-05'), '2026-03-02');
    expect(p.restDates).toEqual(['2026-03-02', '2026-03-05']);
    expect(withRestMarked(p, '2026-03-02')).toBe(p);
    expect(isRestMarked(p.restDates, '2026-03-05')).toBe(true);
    expect(isRestMarked(p.restDates, '2026-03-06')).toBe(false);
  });

  it('quita la marca y no toca el resto', () => {
    const p = withRestUnmarked(profile({ restDates: ['2026-03-02', '2026-03-05'] }), '2026-03-02');
    expect(p.restDates).toEqual(['2026-03-05']);
    const none = profile();
    expect(withRestUnmarked(none, '2026-03-02')).toBe(none);
  });

  it('guarda como mucho las fechas más recientes', () => {
    let p = profile();
    for (let i = 0; i < REST_DATES_LIMIT + 5; i++) p = withRestMarked(p, `2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
    expect(p.restDates).toHaveLength(REST_DATES_LIMIT);
  });
});

/** El primer día de entreno de la semana del `today` dado (según la plantilla) y su iso. */
function trainingDayIsoOfWeek(today: Date, nth: number, days: AthleteProfile['trainingDaysPerWeek']): string {
  const monday = new Date(today);
  monday.setDate(monday.getDate() - getWeekdayIndex(today));
  const found: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    if (getDayPlan(i, days).isTrainingDay) found.push(toLocalIsoDate(d));
  }
  return found[nth];
}

describe('descanso elegido: no resta en el cumplimiento', () => {
  // Domingo de una semana cualquiera: ya han pasado todos los días de la semana.
  const sunday = new Date('2026-03-08T12:00:00');

  it('la semana: un día de entreno descansado a propósito sale de lo previsto', () => {
    const first = trainingDayIsoOfWeek(sunday, 0, 5);
    const base = computeWeekCount(profile(), [], sunday);
    expect(base.planned).toBe(5);
    expect(computeWeekCount(profile({ restDates: [first] }), [], sunday).planned).toBe(4);
    // si ese día al final se entrenó, la marca no cuenta
    expect(computeWeekCount(profile({ restDates: [first] }), [entry(first)], sunday).planned).toBe(5);
    // un día de descanso de la plantilla marcado tampoco cambia lo previsto
    const restTemplate = toLocalIsoDate(new Date('2026-03-08T12:00:00'));
    expect(getDayPlan(6, 5).isTrainingDay).toBe(false);
    expect(computeWeekCount(profile({ restDates: [restTemplate] }), [], sunday).planned).toBe(5);
  });

  it('la racha: un descanso elegido ni la corta ni suma, uno olvidado sí la corta', () => {
    const days = [0, 1, 2, 3, 4].map((n) => trainingDayIsoOfWeek(sunday, n, 5));
    const done = [days[0], days[1], days[3], days[4]].map(entry); // falta el miércoles
    expect(computeAdherenceStreak(profile(), done, '2026-03-08')).toBe(2); // viernes y jueves; el miércoles la corta
    expect(computeAdherenceStreak(profile({ restDates: [days[2]] }), done, '2026-03-08')).toBe(4);
  });

  it('el año: el día descansado a propósito no cuenta como previsto', () => {
    const today = new Date('2026-03-08T12:00:00');
    const onboarded = { onboardedAt: '2026-03-02T09:00:00.000Z' };
    const tuesday = trainingDayIsoOfWeek(today, 1, 5);
    const a = computeYearConsistency(profile(onboarded), [], today);
    const b = computeYearConsistency(profile({ ...onboarded, restDates: [tuesday] }), [], today);
    expect(b.planned).toBe(a.planned - 1);
  });
});
