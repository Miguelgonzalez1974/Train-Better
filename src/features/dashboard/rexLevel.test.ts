import { describe, expect, it } from 'vitest';
import type { LevelResult } from '../../data/athlete/types';
import { makeProfile } from '../../engine/__fixtures';
import { levelAnswer } from './rexData';
import { parseAsk } from './rexAsk';
import { buildRexSuggestions, type RexContext } from './rexDashboard';

const TODAY = '2026-11-19';
const iso = (daysAgo: number) => new Date(new Date(`${TODAY}T12:00:00`).getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const res = (daysAgo: number, category: LevelResult['category'], key: string, value: number): LevelResult => ({ date: iso(daysAgo), part: 1, category, key, scoreType: 'time', value });

describe('Rex contesta sobre tu nivel', () => {
  it('lo entiende de varias formas, sin confundirlo con «qué me falta» de la comida', () => {
    for (const t of ['¿cómo va mi nivel?', 'mi nivel', 'qué categorías me faltan', 'qué me falta para completar mi nivel', 'nivel de fitness']) {
      expect(parseAsk(t, 3), t).toEqual({ kind: 'dato', question: { what: 'nivel' } });
    }
    expect(parseAsk('qué me falta de proteína', 3).kind).toBe('falta');
  });

  it('sin datos, explica cómo se rellena', () => {
    const a = levelAnswer({ profile: makeProfile({ onboardedAt: undefined }), history: [], todayIso: TODAY });
    expect(a.lead).toBe('Tu nivel aún está vacío.');
    expect(a.actions[0]).toMatchObject({ label: 'Ver mi nivel', target: 'perfil' });
  });

  it('con datos, cuenta cuántas categorías hay, cuáles son provisionales o no tienen nada y qué hará el coach', () => {
    const profile = makeProfile({
      levelLog: [res(20, 'pesado', 'benchmark:diane', 400), res(60, 'pesado', 'benchmark:diane', 410), res(25, 'velocidad', 'benchmark:fran', 250)],
    });
    const a = levelAnswer({ profile, history: [], todayIso: TODAY });
    expect(a.text).toContain('categorías con datos');
    expect(a.text).toContain('Provisionales (falta un segundo resultado): velocidad.');
    expect(a.text).toContain('Sin datos:');
    expect(a.text).toContain('resistencia');
    expect(a.text).toContain('El coach intentará ponerte un WOD de velocidad');
  });
});

describe('Rex en el Dashboard cuenta lo que falta de tu nivel', () => {
  const ctx = (over: Partial<RexContext> = {}): RexContext => ({
    hour: 10,
    isToday: true,
    hasCheckIn: true,
    trainedToday: false,
    hasSessionToday: true,
    restMarked: false,
    weeklyReviewRange: null,
    emphasisReviewPending: false,
    nutritionPercent: null,
    streak: 0,
    goalsBehind: 0,
    painLabels: [],
    daysSinceWeight: 1,
    ...over,
  });

  it('sale como sugerencia con un botón a tu nivel, y no si ya entrenaste hoy', () => {
    const need = { category: 'largo', reason: 'Aún no tienes ningún WOD de largo en tu nivel: hoy toca uno.' };
    const s = buildRexSuggestions(ctx({ levelNeed: need })).find((x) => x.id === 'nivel');
    expect(s?.text).toContain('Para completar tu nivel');
    expect(s?.text).toContain('largo');
    expect(s?.actions[0]).toMatchObject({ label: 'Ver mi nivel', target: 'perfil' });
    expect(buildRexSuggestions(ctx({ levelNeed: need, trainedToday: true })).some((x) => x.id === 'nivel')).toBe(false);
    expect(buildRexSuggestions(ctx()).some((x) => x.id === 'nivel')).toBe(false);
  });
});
