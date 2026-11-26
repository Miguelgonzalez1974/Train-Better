import { describe, expect, it } from 'vitest';
import type { StrainTarget } from '../data/athlete/types';
import { explainDone, explainEffort, explainLoad, explainObjective, explainPlanned, explainReadiness } from './explainNumbers';
import type { AcwrResult } from './loadMetrics';
import type { ReadinessScore } from './readinessScore';
import type { MorningEnergy } from './energy';

const energy = (o: Partial<MorningEnergy> = {}) =>
  ({
    total: 58,
    from: 33,
    sleepHours: 6.4,
    sleepKnown: true,
    sleepGain: 33,
    carry: 6,
    carryFrom: 'entreno',
    checkin: -2,
    hrv: { penalty: 0, detail: '' },
    load: { penalty: 0 },
    pain: { areas: [], penalty: 0 },
    hasCheckIn: true,
    ...o,
  }) as MorningEnergy;
const readiness = (o: Partial<ReadinessScore> = {}): ReadinessScore =>
  ({
    total: 58,
    level: 'normal',
    estimated: false,
    energy: energy(),
    load: { detail: 'ACWR 1,1 · dentro de lo seguro', penalty: 0 },
    loadPenalty: 0,
    hrv: { penalty: 0 } as ReadinessScore['hrv'],
    pain: { count: 0, areas: [], penalty: 0 },
    checkins: {} as ReadinessScore['checkins'],
    ...o,
  }) as ReadinessScore;

const target = (o: Partial<StrainTarget> = {}): StrainTarget => ({ low: 55, high: 75, readiness: 58, yesterday: 52, reasons: ['Preparación normal', 'Carga óptima'], provisional: false, setOn: '2026-11-06', ...o });

describe('explicar la preparación', () => {
  it('lead y color según el nivel, y de dónde sale: anoche, el sueño y lo que resta', () => {
    const e = explainReadiness(readiness());
    expect(e).toMatchObject({ id: 'preparacion', lead: 'Llegas normal.', tone: 'mid' });
    expect(e.text).toBe('Tu preparación es 58 sobre 100. Esto es lo que la ha formado:');
    expect(e.rows).toEqual([
      { kind: 'plain', label: 'Anoche acabaste en', value: '33', detail: undefined },
      { kind: 'delta', label: 'Sueño · 6 h 24', value: 33, detail: undefined },
      { kind: 'delta', label: 'Lo entrenado estos días', value: -6, detail: undefined },
      { kind: 'delta', label: 'Estrés y ánimo', value: -2, detail: undefined },
    ]);
    expect(explainReadiness(readiness({ total: 82, level: 'alta' }))).toMatchObject({ lead: 'Llegas con ganas.', tone: 'good' });
    expect(explainReadiness(readiness({ total: 31, level: 'baja' }))).toMatchObject({ lead: 'Llegas cansado.', tone: 'bad' });
  });

  it('HRV, carga y molestias solo salen cuando restan', () => {
    const e = explainReadiness(readiness({ energy: energy({ carry: 0, checkin: 0, hrv: { penalty: 4, detail: '' } as MorningEnergy['hrv'], load: { penalty: 10 } as MorningEnergy['load'], pain: { areas: ['rodilla'], penalty: 8 } }) }));
    expect(e.rows.filter((r) => r.kind === 'delta').map((r) => [r.label, r.value])).toEqual([
      ['Sueño · 6 h 24', 33],
      ['HRV y pulso', -4],
      ['Carga fuera de lo seguro', -10],
      ['Molestias activas', -8],
    ]);
  });

  it('sin check-in de hoy lo dice', () => {
    const e = explainReadiness(readiness({ estimated: true, energy: energy({ sleepKnown: false, hasCheckIn: false }) }));
    expect(e.text).toContain('falta el check-in');
    expect(e.rows[1]).toMatchObject({ detail: 'Horas supuestas: falta el check-in' });
  });

  it('ofrece recovery salvo con la preparación alta, y sin datos no inventa nada', () => {
    expect(explainReadiness(readiness()).actions.map((a) => a.action)).toEqual(['ver-preparacion', 'recovery']);
    expect(explainReadiness(readiness({ total: 82, level: 'alta' })).actions.map((a) => a.action)).toEqual(['ver-preparacion']);
    const none = explainReadiness(readiness({ total: null, level: null, energy: null }));
    expect(none).toMatchObject({ lead: 'Aún sin datos.', rows: [], tone: 'neutral' });
  });
});

describe('explicar la carga', () => {
  const acwr = (o: Partial<AcwrResult> = {}): AcwrResult => ({ acute: 400, chronic: 360, acwr: 1.12, zone: 'optima', coldStart: false, ...o });

  it('cada zona con su verbo, color y el ratio', () => {
    expect(explainLoad(acwr(), 0)).toMatchObject({ lead: 'Óptima.', tone: 'good' });
    expect(explainLoad(acwr({ zone: 'baja', acwr: 0.6 }), 0)).toMatchObject({ lead: 'Baja.', tone: 'info' });
    expect(explainLoad(acwr({ zone: 'moderada', acwr: 1.4 }), 10)).toMatchObject({ lead: 'Algo alta.', tone: 'mid' });
    expect(explainLoad(acwr({ zone: 'alta', acwr: 1.7 }), 20)).toMatchObject({ lead: 'Muy alta.', tone: 'bad' });
    expect(explainLoad(acwr(), 0).rows).toEqual([{ kind: 'plain', label: 'Esta semana frente a las anteriores', value: '1,12×' }]);
  });

  it('lo que resta a la preparación solo sale si resta, y sin historial no se mide', () => {
    expect((() => { const rows = explainLoad(acwr({ zone: 'alta', acwr: 1.7 }), 20).rows; return rows[rows.length - 1]; })()).toEqual({ kind: 'delta', label: 'Lo que resta a tu preparación', value: -20 });
    expect(explainLoad(acwr(), 0).rows).toHaveLength(1);
    expect(explainLoad(acwr({ coldStart: true }), 0)).toMatchObject({ lead: 'Aún sin medir.', rows: [] });
    expect(explainLoad(acwr({ acwr: null }), 0).lead).toBe('Aún sin medir.');
  });
});

describe('explicar lo previsto, lo realizado y el objetivo', () => {
  const planned = { strain: 65, rpe: 7.5, minutes: 61, bias: 0 };

  it('lo previsto: duración, RPE y cómo encaja', () => {
    const ok = explainPlanned(planned, { low: 55, high: 75 }, { fit: 'dentro', diff: 0 });
    expect(ok).toMatchObject({ lead: 'La sesión de hoy cuesta ~65.', tone: 'plan', foot: 'Cae dentro de tu objetivo (55–75): encaja.' });
    expect(ok.text).toBe('Unos 61 min a un RPE de 7,5, como te suelen salir estas semanas.');
    const over = explainPlanned(planned, { low: 40, high: 55 }, { fit: 'se-pasa', diff: 10 });
    expect(over.foot).toContain('Se pasa 10');
    expect(over.actions[0].label).toBe('Ajustar la sesión');
    expect(explainPlanned(null, { low: 55, high: 75 }, null).lead).toBe('Sin sesión prevista.');
  });

  it('lo realizado: antes de entrenar explica qué será; después, cómo quedó', () => {
    expect(explainDone({ real: null, planned: 65, target: { low: 55, high: 75 }, status: 'sin-entrenar' })).toMatchObject({ lead: 'Aún sin entrenar.', tone: 'effort' });
    const done = explainDone({ real: 52, planned: 65, target: { low: 55, high: 75 }, status: 'por-debajo', rpe: 7, minutes: 52 });
    expect(done).toMatchObject({ lead: 'Por debajo del objetivo.', tone: 'info' });
    expect(done.text).toBe('Has hecho 52 de esfuerzo; tu objetivo de hoy era 55–75. Sale de un RPE de 7 durante 52 min.');
    expect(done.rows.map((r) => r.label)).toEqual(['Realizado', 'Previsto', 'Objetivo']);
    expect(explainDone({ real: 80, planned: null, target: { low: 55, high: 75 }, status: 'pasado' })).toMatchObject({ lead: 'Te has pasado del objetivo.', tone: 'bad' });
    expect(explainDone({ real: 70, planned: null, target: { low: 55, high: 75 }, status: 'dentro' }).rows.map((r) => r.label)).toEqual(['Realizado', 'Objetivo']);
  });

  it('el objetivo: el rango y las razones con las que se calculó', () => {
    const e = explainObjective(target());
    expect(e.lead).toBe('Cuánto te conviene hoy: 55–75.');
    expect(e.rows).toEqual([
      { kind: 'plain', label: 'Preparación normal', value: '' },
      { kind: 'plain', label: 'Carga óptima', value: '' },
    ]);
    expect(e.text).toContain('preparación de 58');
    expect(explainObjective(target({ provisional: true })).text).toContain('Aún sin tu check-in');
    expect(explainObjective(target({ readiness: null })).text).toBe('Es la zona de esfuerzo que te conviene hoy, según cómo estás.');
  });
});

describe('explicar el aro del esfuerzo entero', () => {
  const base = { target: { low: 55, high: 75 } };

  it('antes de entrenar junta lo hecho (vacío), lo previsto y el objetivo, y dice si la sesión encaja', () => {
    const e = explainEffort({ ...base, real: null, planned: 65, status: 'sin-entrenar' });
    expect(e).toMatchObject({ id: 'esfuerzo', lead: 'Tu esfuerzo de hoy.', tone: 'effort', foot: 'La sesión cae dentro de tu objetivo: encaja.' });
    expect(e.text).toBe('Aún no has entrenado: lo previsto es ~65 y tu objetivo 55–75.');
    expect(e.rows).toEqual([
      { kind: 'plain', label: 'Realizado', value: '—' },
      { kind: 'plain', label: 'Previsto (la sesión de hoy)', value: '~65' },
      { kind: 'plain', label: 'Objetivo (lo que te conviene)', value: '55–75' },
    ]);
    expect(e.actions.map((a) => a.action)).toEqual(['ver-esfuerzo', 'planificacion']);
    expect(explainEffort({ ...base, real: null, planned: 90, status: 'sin-entrenar' }).foot).toContain('se pasa 15');
    expect(explainEffort({ ...base, real: null, planned: 30, status: 'sin-entrenar' }).foot).toContain('deja margen');
    expect(explainEffort({ ...base, real: null, planned: null, status: 'sin-entrenar' }).text).toBe('Aún no has entrenado y tu objetivo es 55–75.');
  });

  it('ya entrenado cuenta lo hecho frente a lo previsto y cómo quedó frente al objetivo', () => {
    const e = explainEffort({ ...base, real: 52, planned: 65, status: 'por-debajo' });
    expect(e.text).toBe('Has hecho 52 frente a ~65 previstos, con un objetivo de 55–75.');
    expect(e.foot).toBe('Has quedado por debajo del objetivo.');
    expect(e.rows[0]).toEqual({ kind: 'plain', label: 'Realizado', value: '52' });
    expect(explainEffort({ ...base, real: 80, planned: 65, status: 'pasado' })).toMatchObject({ tone: 'bad', foot: 'Te has pasado del objetivo.' });
    expect(explainEffort({ ...base, real: 70, planned: null, status: 'dentro' }).text).toBe('Has hecho 70, con un objetivo de 55–75.');
  });
});