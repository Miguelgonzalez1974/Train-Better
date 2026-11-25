import { describe, expect, it } from 'vitest';
import type { SessionHistoryEntry } from '../../data/athlete/types';
import { makeMacro, makeProfile } from '../../engine/__fixtures';
import { buildCurrentWeek } from './currentWeek';

// Miércoles 25 de noviembre de 2026: la semana va del lunes 23 al domingo 29.
const TODAY = '2026-11-25';
const entry = (date: string, rpe = 7): SessionHistoryEntry => ({ date, mesocycleWeek: 1, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe, durationMin: 60 });
const base = { ...makeProfile({ macrocycles: [] }), trainingDaysPerWeek: 5 as const, trainingDatesLog: [], readinessLog: [], prLog: [], painFlags: [] };
const week = (profile = base, history = [entry('2026-11-23'), entry('2026-11-24', 8)], todayIso = TODAY) => buildCurrentWeek({ profile, history, todayIso, todaySession: null });

describe('«Esta semana»', () => {
  it('los siete días, con lo hecho marcado, y las cifras hasta hoy', () => {
    const w = week();
    expect(w.days.map((d) => d.iso)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(w.days.slice(0, 2).map((d) => d.status)).toEqual(['hecho', 'hecho']);
    expect(w.days[2].isToday).toBe(true);
    expect(w.sessions).toEqual({ done: 2, planned: 5 });
    expect(w.rpe).toBe('7,5');
    expect(w.fresh).toBe(false);
  });

  it('un día de entreno pasado sin registro no se cuenta como fallo: «sin apuntar»', () => {
    expect(week(base, [entry('2026-11-24')]).days[0].status).toBe('sin-apuntar');
  });

  it('lo mejor son los récords de esta semana y se vigila la molestia y el poco sueño', () => {
    const profile = {
      ...base,
      prLog: [
        { date: '2026-10-01', key: 'backSquat', kg: 115 },
        { date: '2026-11-24', key: 'backSquat', kg: 125 },
      ],
      painFlags: [{ id: 'p', area: 'hombro' as const, createdDate: '2026-11-24', until: null }],
      readinessLog: ['2026-11-23', '2026-11-24'].map((date) => ({ date, sleep: 'regular', soreness: 'ninguno', stress: 'bajo', motivation: 'alta', sleepHours: 6 })),
    } as unknown as typeof base;
    const w = week(profile);
    expect(w.best.join(' ')).toMatch(/Nuevo PR en .*125 kg/);
    expect(w.watch.some((l) => l.startsWith('Duermes poco'))).toBe(true);
    expect(w.watch.some((l) => l.includes('molestia'))).toBe(true);
  });

  it('un lunes sin entrenar la semana acaba de empezar', () => {
    expect(week(base, [entry('2026-11-20')], '2026-11-23').fresh).toBe(true);
  });

  it('un descanso elegido no es un día pendiente', () => {
    const w = week({ ...base, restDates: ['2026-11-27'] } as typeof base);
    expect(w.days[4].status).toBe('descanso');
  });

  it('con macrociclo, lo que queda trae las sesiones previstas con su título', () => {
    const profile = { ...makeProfile({ macrocycles: [makeMacro({ startDate: '2026-11-09', endDate: '2027-03-01' })] }), trainingDaysPerWeek: 5 as const };
    const w = buildCurrentWeek({ profile, history: [], todayIso: TODAY, todaySession: null });
    expect(w.upcoming.map((u) => u.label)).toContain('Jue');
    expect(w.upcoming.every((u) => u.title.length > 0)).toBe(true);
    expect(w.planLine).toMatch(/semana \d+ de \d+/);
  });
});
