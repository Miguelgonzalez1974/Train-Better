import { describe, it, expect } from 'vitest';
import { readinessLastDays, sustainedLowReadiness } from './readinessTrend';
import { resolveTrainingWeek, DELOAD_REASON_NOTE } from './deload';
import { generateSessionForDate } from './generateSession';
import { consecutiveDates, makeMacro, makeProfile } from './__fixtures';
import type { DailySession, ReadinessCheck, SessionHistoryEntry } from '../data/athlete/types';

const TODAY = '2026-02-11';
const iso = (offset: number) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const Q = {
  good: { sleep: 'bien', soreness: 'ninguno', stress: 'bajo', motivation: 'alta' },
  mid: { sleep: 'regular', soreness: 'leve', stress: 'medio', motivation: 'normal' },
  bad: { sleep: 'mal', soreness: 'alto', stress: 'alto', motivation: 'baja' },
} as const;
/** Check-ins de hoy y de los `back` días anteriores. */
const log = (kind: keyof typeof Q, back = 3, todayExtra: Partial<ReadinessCheck> = {}): ReadinessCheck[] =>
  Array.from({ length: back + 1 }, (_, i) => ({ date: iso(-i), ...Q[kind], ...(i === 0 ? todayExtra : {}) })).reverse();
const profile = (readinessLog: ReadinessCheck[]) => makeProfile({ trainingDaysPerWeek: 5, macrocycles: [makeMacro({ id: 'trend' })], readinessLog, bodyweightLog: [{ date: '2026-01-01', kg: 80 }] });
const session = (offset: number, week: number): SessionHistoryEntry => ({ date: iso(offset), mesocycleWeek: week, movementIds: ['back-squat'], rxOrScaled: 'rx', rpe: 7, durationMin: 60 });

describe('descarga por tendencia de la preparación', () => {
  it('varios días seguidos con la preparación baja disparan la descarga', () => {
    expect(sustainedLowReadiness(profile(log('bad')), [], TODAY)).toBe('preparacion');
    expect(readinessLastDays(profile(log('bad')), [], TODAY, 3).every((v) => v !== null && v <= 45)).toBe(true);
  });

  it('con buena o normal preparación no se dispara, ni con un solo día malo', () => {
    expect(sustainedLowReadiness(profile(log('good')), [], TODAY)).toBeNull();
    expect(sustainedLowReadiness(profile(log('mid')), [], TODAY)).toBeNull();
    const oneBad = [...log('good', 3).slice(0, 3), { date: TODAY, ...Q.bad }];
    expect(sustainedLowReadiness(profile(oneBad), [], TODAY)).toBeNull();
  });

  it('sin el check-in de hoy no hay disparador', () => {
    expect(sustainedLowReadiness(profile(log('bad').filter((c) => c.date !== TODAY)), [], TODAY)).toBeNull();
  });

  it('una HRV por debajo de tu rango con la preparación floja dos días también lo dispara', () => {
    expect(sustainedLowReadiness(profile(log('mid', 3, { hrvVs: 'bajo' })), [], TODAY)).toBe('hrv');
    // sin HRV baja, con la misma preparación, no
    expect(sustainedLowReadiness(profile(log('mid', 3, { hrvVs: 'normal' })), [], TODAY)).toBeNull();
    // con buena preparación una HRV baja suelta no basta
    expect(sustainedLowReadiness(profile(log('good', 3, { hrvVs: 'bajo' })), [], TODAY)).toBeNull();
  });

  it('si ya llevas una descarga encima (sesiones de semana 4 en los últimos días) no se vuelve a disparar', () => {
    expect(sustainedLowReadiness(profile(log('bad')), [session(-2, 4)], TODAY)).toBeNull();
    // una descarga de hace más de 4 días no cuenta
    expect(sustainedLowReadiness(profile(log('bad')), [session(-6, 4)], TODAY)).toBe('preparacion');
  });
});

describe('descarga por tendencia: la semana resuelta', () => {
  it('convierte la semana en descarga con su motivo, salvo que ya sea la semana 4', () => {
    expect(resolveTrainingWeek(2, 'optima', [], new Date(`${TODAY}T12:00:00`), null, [], 1, true)).toEqual({ week: 4, reason: 'preparacion' });
    expect(resolveTrainingWeek(4, 'optima', [], new Date(`${TODAY}T12:00:00`), null, [], 1, true)).toEqual({ week: 4 });
    expect(resolveTrainingWeek(2, 'optima', [], new Date(`${TODAY}T12:00:00`), null, [], 1, false)).toEqual({ week: 2 });
    expect(DELOAD_REASON_NOTE.preparacion).toContain('preparación');
  });

  it('la seguridad por carga sigue mandando sobre este motivo', () => {
    expect(resolveTrainingWeek(2, 'alta', [], new Date(`${TODAY}T12:00:00`), null, [], 1, true).reason).toBe('fatiga');
  });
});

describe('descarga por tendencia: en la sesión', () => {
  const dates = consecutiveDates('2026-02-03', 21);
  const gen = (readinessLog: ReadinessCheck[], d: Date): DailySession => generateSessionForDate(profile(readinessLog), [], d, []);
  const logFor = (d: Date, todayExtra: Partial<ReadinessCheck>) =>
    Array.from({ length: 4 }, (_, back) => {
      const day = new Date(d);
      day.setDate(day.getDate() - back);
      return { date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, ...Q.mid, ...(back === 0 ? todayExtra : {}) };
    }).reverse();
  const trainingDays = dates.filter((d) => {
    const s = generateSessionForDate(profile([]), [], d, []);
    return !s.isRestDay && s.blocks.some((b) => b.block === 'strength') && s.mesocycleWeek !== 4;
  });

  it('con la tendencia mala la sesión sale como descarga y lo explica', () => {
    expect(trainingDays.length).toBeGreaterThan(5);
    for (const d of trainingDays.slice(0, 8)) {
      const s = gen(logFor(d, { hrvVs: 'bajo' }), d);
      expect(s.deloadReason, d.toDateString()).toBe('preparacion');
      expect(s.mesocycleWeek).toBe(4);
      expect(s.coachReasons?.join(' ')).toContain('Descarga activada por tu preparación');
    }
  });

  it('con una tendencia normal no hay descarga por este motivo', () => {
    for (const d of trainingDays.slice(0, 8)) {
      expect(gen(logFor(d, { hrvVs: 'normal' }), d).deloadReason, d.toDateString()).toBeUndefined();
    }
  });
});
