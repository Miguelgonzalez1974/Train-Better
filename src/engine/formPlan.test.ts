import { describe, expect, it } from 'vitest';
import type { Macrocycle, SessionHistoryEntry } from '../data/athlete/types';
import { addDays, type CompetitionWindow } from './formCurve';
import { competitionTag, projectPlan, typicalWeeklyLoad } from './formPlan';
import { dayStrain } from './strain';

// Sábado 31 oct 2026. El macro empieza el lunes 5 oct: la semana del 23 al 29 nov es la 8ª, es decir, la descarga (4ª de su ciclo).
const TODAY = '2026-10-31';
const macro: Macrocycle = { id: 'm1', label: 'Otoño', startDate: '2026-10-05', endDate: '2027-01-01' };
const profile = { macrocycles: [macro], trainingDaysPerWeek: 5 as const };
const entry = (date: string, rpe = 7, durationMin = 60): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: [], rxOrScaled: 'rx', rpe, durationMin });

/** Entrena de lunes a viernes las cuatro últimas semanas con RPE 7 durante 60 min. */
function weekdayHistory(): SessionHistoryEntry[] {
  const out: SessionHistoryEntry[] = [];
  for (let back = 40; back >= 1; back--) {
    const iso = addDays(TODAY, -back);
    const dow = new Date(`${iso}T12:00:00`).getDay();
    if (dow >= 1 && dow <= 5) out.push(entry(iso));
  }
  return out;
}
const sessionLoad = dayStrain(entry(TODAY))!;

describe('typicalWeeklyLoad', () => {
  it('es el esfuerzo total de las últimas cuatro semanas entre cuatro', () => {
    expect(typicalWeeklyLoad(weekdayHistory(), TODAY)).toBeCloseTo(5 * sessionLoad, 5);
  });
  it('sin historial no hay nada que medir', () => {
    expect(typicalWeeklyLoad([], TODAY)).toBeNull();
  });
});

describe('competitionTag', () => {
  const comp: CompetitionWindow = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };
  it('marca el taper, la competición y la recuperación de después', () => {
    expect(competitionTag(addDays(TODAY, 1), comp)).toBe('taper');
    expect(competitionTag(addDays(TODAY, 5), comp)).toBe('taper');
    expect(competitionTag(addDays(TODAY, 6), comp)).toBe('competicion');
    expect(competitionTag(addDays(TODAY, 7), comp)).toBe('competicion');
    expect(competitionTag(addDays(TODAY, 9), comp)).toBe('recuperacion');
    expect(competitionTag(addDays(TODAY, 12), comp)).toBeNull();
    expect(competitionTag(TODAY, null)).toBeNull();
  });
});

describe('projectPlan', () => {
  it('sigue tu calendario: entrena de lunes a viernes y descansa el fin de semana', () => {
    const { loads } = projectPlan({ profile, history: weekdayHistory(), todayIso: TODAY, days: 7, comp: null, taperScale: 0.6 });
    // Domingo 1 nov descanso; lunes 2 a viernes 6 entreno; sábado 7 descanso.
    expect(loads[0]).toBe(0);
    for (let i = 1; i <= 5; i++) expect(loads[i]).toBeGreaterThan(0);
    expect(loads[6]).toBe(0);
  });

  it('la semana de descarga del macro baja la carga y queda etiquetada', () => {
    const { loads, tags } = projectPlan({ profile, history: weekdayHistory(), todayIso: TODAY, days: 35, comp: null, taperScale: 0.6 });
    const at = (iso: string) => loads[Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${TODAY}T12:00:00`).getTime()) / 86_400_000) - 1];
    const tagAt = (iso: string) => tags[Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${TODAY}T12:00:00`).getTime()) / 86_400_000) - 1];
    expect(at('2026-11-24')).toBeLessThan(at('2026-11-17'));
    expect(tagAt('2026-11-24')).toBe('descarga');
    expect(tagAt('2026-11-17')).toBeNull();
  });

  it('con competición aplica el taper, la competición y la recuperación', () => {
    const comp: CompetitionWindow = { eventStart: addDays(TODAY, 6), eventEnd: addDays(TODAY, 7) };
    const { loads, tags } = projectPlan({ profile, history: weekdayHistory(), todayIso: TODAY, days: 12, comp, taperScale: 0.6 });
    expect(loads[5]).toBe(80);
    expect(loads[6]).toBe(80);
    expect(tags[5]).toBe('competicion');
    expect(tags[0]).toBe('taper');
    expect(tags[8]).toBe('recuperacion');
    // El taper recorta frente a una semana normal.
    const normal = projectPlan({ profile, history: weekdayHistory(), todayIso: TODAY, days: 12, comp: null, taperScale: 0.6 }).loads;
    expect(loads[1]).toBeLessThan(normal[1]);
  });

  it('mantiene tu volumen semanal aunque el plan tenga menos días de entreno que tú', () => {
    // Entrenas 5 días a la semana; con un plan de 4 días cada sesión pesa más para no recortar el volumen.
    const five = projectPlan({ profile, history: weekdayHistory(), todayIso: TODAY, days: 14, comp: null, taperScale: 0.6 }).loads;
    const four = projectPlan({ profile: { ...profile, trainingDaysPerWeek: 4 }, history: weekdayHistory(), todayIso: TODAY, days: 14, comp: null, taperScale: 0.6 }).loads;
    const week = (l: number[]) => l.slice(0, 7).reduce((s, v) => s + v, 0);
    expect(week(four)).toBeGreaterThan(0.85 * week(five));
    expect(Math.max(...four)).toBeGreaterThan(Math.max(...five));
  });

  it('sin macrociclo repite tu semana de siempre', () => {
    const history = weekdayHistory();
    const { loads, tags } = projectPlan({ profile: { macrocycles: [], trainingDaysPerWeek: 5 }, history, todayIso: TODAY, days: 7, comp: null, taperScale: 0.6 });
    expect(loads).toHaveLength(7);
    expect(Math.max(...loads)).toBe(sessionLoad);
    expect(tags.every((t) => t === null)).toBe(true);
  });
});
