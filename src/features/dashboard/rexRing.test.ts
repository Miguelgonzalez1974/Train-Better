import { describe, expect, it } from 'vitest';
import type { ExplainId, Explanation } from '../../engine/explainNumbers';
import { explanationToAnswer, ringQuestion } from './rexRing';

const IDS: ExplainId[] = ['preparacion', 'carga', 'esfuerzo', 'realizado', 'previsto', 'objetivo'];

describe('tocar un aro es preguntar a Rex', () => {
  it('la pregunta lleva la cifra que se ve, y sin cifra pregunta cómo se calcula', () => {
    expect(ringQuestion('preparacion', { readiness: 71.6, real: null, planned: 57 })).toBe('¿Por qué mi preparación es del 72 %?');
    expect(ringQuestion('preparacion', { readiness: null, real: null, planned: null })).toBe('¿Cómo se calcula mi preparación?');
    expect(ringQuestion('realizado', { readiness: 70, real: 64.4, planned: 57 })).toBe('¿Por qué mi esfuerzo de hoy es 64?');
    expect(ringQuestion('previsto', { readiness: 70, real: null, planned: 56.6 })).toBe('¿Qué significa el esfuerzo previsto de 57?');
    expect(ringQuestion('previsto', { readiness: 70, real: null, planned: null })).toBe('¿Qué es el esfuerzo previsto?');
  });

  it('cada número del aro tiene su pregunta, escrita como pregunta', () => {
    for (const id of IDS) {
      const q = ringQuestion(id, { readiness: 60, real: 50, planned: 55 });
      expect(q.startsWith('¿') && q.endsWith('?'), id).toBe(true);
    }
  });

  it('una explicación pasa a respuesta de Rex con su desglose, su nota al pie y sus botones, llevando a donde llevaban', () => {
    const exp: Explanation = {
      id: 'preparacion',
      lead: 'Llegas normal.',
      tone: 'mid',
      text: 'Tu preparación sale del check-in y de las sesiones.',
      rows: [{ kind: 'score', label: 'Lo que cuentas (check-in)', value: 70, weight: '60 %' }, { kind: 'delta', label: 'Molestias activas', value: -5 }],
      foot: 'Se recalcula al hacer el check-in.',
      actions: [
        { label: 'Ver la preparación', action: 'ver-preparacion' },
        { label: 'Hacer recovery', action: 'recovery' },
        { label: 'Ver la sesión', action: 'planificacion' },
      ],
    };
    const answer = explanationToAnswer(exp);
    expect(answer).toMatchObject({ lead: 'Llegas normal.', tone: 'mid', text: exp.text, foot: 'Se recalcula al hacer el check-in.' });
    expect(answer.rows).toEqual(exp.rows);
    expect(answer.actions).toEqual([
      { label: 'Ver la preparación', target: 'preparacion' },
      { label: 'Hacer recovery', target: 'movilidad' },
      { label: 'Ver la sesión', target: 'planificacion' },
    ]);
  });

  it('los tonos propios del aro (plan, esfuerzo, neutro) pasan a los de Rex, y una nota al pie vacía no se lleva', () => {
    const base: Explanation = { id: 'carga', lead: 'x', tone: 'plan', text: '', rows: [], foot: '', actions: [{ label: 'Ver la carga', action: 'ver-carga' }] };
    expect(explanationToAnswer(base).tone).toBe('info');
    expect(explanationToAnswer({ ...base, tone: 'effort' }).tone).toBe('gold');
    expect(explanationToAnswer({ ...base, tone: 'neutral' }).tone).toBe('info');
    expect(explanationToAnswer(base).foot).toBeUndefined();
    expect(explanationToAnswer(base).actions).toEqual([{ label: 'Ver la carga', target: 'carga' }]);
  });
});
