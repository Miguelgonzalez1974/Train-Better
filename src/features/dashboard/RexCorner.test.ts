import { describe, expect, it } from 'vitest';
import { cornerNeedsAttention } from './RexCorner';
import type { RexSuggestion } from './rexDashboard';

const s = (o: Partial<RexSuggestion>): RexSuggestion => ({ id: 'x', priority: 50, text: 'hola', mood: 'idle', actions: [], ...o });

describe('el punto del botón de Rex', () => {
  it('sale con lo urgente (check-in, revisión, cierre) o con un módulo con aviso', () => {
    expect(cornerNeedsAttention(s({ id: 'checkin', priority: 100 }), [])).toBe(true);
    expect(cornerNeedsAttention(s({ id: 'semana', priority: 90 }), [])).toBe(true);
    expect(cornerNeedsAttention(s({ priority: 50 }), ['nutricion'])).toBe(true);
  });

  it('no sale con una frase tranquila ni con sugerencias menores', () => {
    expect(cornerNeedsAttention(s({ id: 'quiet', priority: 0 }), [])).toBe(false);
    expect(cornerNeedsAttention(s({ priority: 65 }), [])).toBe(false);
  });
});
