import { describe, it, expect } from 'vitest';
import { hasSustainedHighRpe, resolveTrainingWeek } from './deload';
import { toLocalIsoDate } from './periodization';
import { generateSessionForDate } from './generateSession';
import { makeProfile, consecutiveDates } from './__fixtures';
import type { SessionHistoryEntry } from '../data/athlete/types';

const TODAY = new Date('2026-03-20T12:00:00');

function entry(daysAgo: number, rpe: number, mesocycleWeek = 1): SessionHistoryEntry {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return { date: toLocalIsoDate(d), mesocycleWeek, movementIds: [], rxOrScaled: 'rx', rpe, durationMin: 60 };
}

describe('hasSustainedHighRpe', () => {
  it('3 sesiones a RPE >= 9 en 10 dias, la ultima reciente -> sobrecarga', () => {
    expect(hasSustainedHighRpe([entry(7, 9), entry(4, 9.5), entry(1, 9)], TODAY)).toBe(true);
  });

  it('2 sesiones duras no bastan', () => {
    expect(hasSustainedHighRpe([entry(4, 9), entry(1, 9), entry(2, 7)], TODAY)).toBe(false);
  });

  it('si la ultima sesion dura fue hace mas de 5 dias, la descarga ya termino', () => {
    expect(hasSustainedHighRpe([entry(9, 9), entry(8, 9), entry(7, 9)], TODAY)).toBe(false);
  });

  it('las sesiones hechas ya en descarga (semana 4) no cuentan', () => {
    expect(hasSustainedHighRpe([entry(6, 9), entry(3, 9, 4), entry(1, 9, 4)], TODAY)).toBe(false);
  });

  it('una media alta sostenida (>= 8.5 con >= 4 sesiones) tambien cuenta', () => {
    expect(hasSustainedHighRpe([entry(8, 8.5), entry(6, 8.5), entry(3, 8.5), entry(1, 8.5)], TODAY)).toBe(true);
    expect(hasSustainedHighRpe([entry(8, 8), entry(6, 8), entry(3, 8), entry(1, 8)], TODAY)).toBe(false);
  });

  it('si el RPE del atleta no es fiable, no se usa para descargar', () => {
    const hard = [entry(7, 9), entry(4, 9), entry(1, 9)];
    expect(hasSustainedHighRpe(hard, TODAY, 0.5)).toBe(false);
    expect(hasSustainedHighRpe(hard, TODAY, 0.9)).toBe(true);
  });
});

describe('generateSessionForDate — sobrecarga por RPE', () => {
  it('con 3 sesiones seguidas a RPE 9 la sesion sale en descarga y lo explica; sin ellas, no', () => {
    const profile = makeProfile({ trainingDaysPerWeek: 5 });
    const day = consecutiveDates('2026-01-12', 1)[0]; // semana 2 del macro fixture: no es descarga de calendario
    const past = (offset: number, rpe = 9, durationMin = 60): SessionHistoryEntry => {
      const d = new Date(day);
      d.setDate(d.getDate() - offset);
      return { date: toLocalIsoDate(d), mesocycleWeek: 2, movementIds: [], rxOrScaled: 'rx', rpe, durationMin };
    };
    // Base cronica solida (semanas 2-4 atras a RPE 8) para que el ACWR NO salte antes: aqui se prueba
    // que el RPE por si solo dispara la descarga.
    const base = [28, 26, 24, 22, 20, 18, 16, 14, 12].map((o) => past(o, 8, 90));
    const hard = [...base, past(6), past(3), past(1)];

    const calm = generateSessionForDate(profile, [], day, profile.goals);
    expect(calm.deloadReason).toBeUndefined();
    expect(calm.mesocycleWeek).not.toBe(4);

    const tired = generateSessionForDate(profile, hard, day, profile.goals);
    expect(tired.mesocycleWeek).toBe(4);
    expect(tired.deloadReason).toBe('rpe-alto');
  });
});

describe('resolveTrainingWeek — sobrecarga por RPE', () => {
  const hard = [entry(7, 9), entry(4, 9), entry(1, 9)];

  it('convierte la semana en descarga con motivo rpe-alto', () => {
    expect(resolveTrainingWeek(2, 'optima', [], TODAY, null, hard, 1)).toEqual({ week: 4, reason: 'rpe-alto' });
  });

  it('sin historial duro sigue el calendario', () => {
    expect(resolveTrainingWeek(2, 'optima', [], TODAY, null, [entry(2, 7)], 1)).toEqual({ week: 2 });
  });

  it('el ACWR alto y el taper mandan sobre este motivo', () => {
    expect(resolveTrainingWeek(2, 'alta', [], TODAY, null, hard, 1)).toEqual({ week: 4, reason: 'fatiga' });
  });

  it('en la semana 4 de calendario no se anuncia otro motivo', () => {
    expect(resolveTrainingWeek(4, 'optima', [], TODAY, null, hard, 1)).toEqual({ week: 4 });
  });
});
