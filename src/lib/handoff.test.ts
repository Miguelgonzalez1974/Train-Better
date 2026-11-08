import { beforeEach, describe, expect, it } from 'vitest';
import { handoff } from './handoff';

describe('lo que RexLab deja dicho a la pantalla de destino', () => {
  beforeEach(() => handoff.clear());

  it('se recoge una sola vez', () => {
    handoff.put('support-start', 'p_zone', 1000);
    expect(handoff.take('support-start', 2000)).toBe('p_zone');
    expect(handoff.take('support-start', 2000)).toBeNull();
  });

  it('caduca a los dos minutos y no mezcla claves', () => {
    handoff.put('plan-act', 'otro-wod', 1000);
    expect(handoff.take('objetivos-asistente', 1500)).toBeNull();
    expect(handoff.take('plan-act', 1000 + 121_000)).toBeNull();
  });
});
