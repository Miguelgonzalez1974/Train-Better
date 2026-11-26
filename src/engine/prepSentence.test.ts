import { describe, expect, it } from 'vitest';
import type { MorningEnergy } from './energy';
import { prepSentence } from './prepSentence';
import type { ReadinessScore } from './readinessScore';

const energy = (over: Partial<MorningEnergy> = {}) => ({ total: 62, sleepHours: 7.5, sleepKnown: true, carry: 0, carryFrom: null, checkin: 0, ...over }) as MorningEnergy;

function score(over: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    total: 62,
    level: 'normal',
    estimated: false,
    energy: energy(),
    load: { penalty: 0, detail: '' },
    loadPenalty: 0,
    hrv: { penalty: 0 } as ReadinessScore['hrv'],
    pain: { count: 0, areas: [], penalty: 0 },
    checkins: {} as ReadinessScore['checkins'],
    ...over,
  };
}

describe('prepSentence', () => {
  it('sin cifra pide el check-in', () => {
    expect(prepSentence(score({ total: null, level: null, energy: null }))).toMatch(/check-in/);
  });

  it('un día normal sin nada que restar sigue el plan', () => {
    expect(prepSentence(score())).toBe('Sigue el plan del día.');
  });

  it('prioriza lo que resta: molestia y carga', () => {
    const s = prepSentence(score({ level: 'baja', pain: { count: 1, areas: ['hombro'], penalty: 8 }, loadPenalty: 10 }));
    expect(s).toBe('Tienes una molestia activa (hombro) y tu carga acumulada va alta. Hoy mejor intensidad moderada que volumen.');
  });

  it('dice la noche corta, lo que arrastras y el ánimo', () => {
    expect(prepSentence(score({ level: 'baja', energy: energy({ sleepHours: 5 }) }))).toMatch(/^Has dormido poco\./);
    expect(prepSentence(score({ energy: energy({ carry: 12, carryFrom: 'entreno' }) }))).toMatch(/^Arrastras lo entrenado estos días\./);
    expect(prepSentence(score({ energy: energy({ carry: 10, carryFrom: 'agujetas' }) }))).toMatch(/^Las agujetas pesan\./);
    expect(prepSentence(score({ energy: energy({ checkin: -12 }) }))).toMatch(/^El estrés y el ánimo van flojos\./);
  });

  it('unas horas supuestas no se dan por noche corta', () => {
    expect(prepSentence(score({ energy: energy({ sleepHours: 5, sleepKnown: false }) }))).toBe('Sigue el plan del día.');
  });
});
