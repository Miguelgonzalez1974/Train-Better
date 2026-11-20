import { describe, expect, it } from 'vitest';
import { buildRexSuggestions, nightSuggestion, postTrainingNutritionSuggestion, type RexClosing, type RexContext } from './rexDashboard';

const closing = (status: RexClosing['status'], hasDetail = true): RexClosing => ({ real: 62, low: 45, high: 65, planned: 60, status, notDone: null, hasDetail, hasSummary: true });

const base: RexContext = {
  hour: 19,
  isToday: true,
  hasCheckIn: true,
  trainedToday: true,
  hasSessionToday: true,
  restMarked: false,
  closing: closing('dentro'),
  weeklyReviewRange: null,
  emphasisReviewPending: false,
  nutritionPercent: 40,
  streak: 0,
  goalsBehind: 0,
  painLabels: [],
  daysSinceWeight: 1,
};

describe('Rex toma la iniciativa tras entrenar', () => {
  it('cuenta lo que falta de comida y ofrece la caja y el escáner', () => {
    const s = postTrainingNutritionSuggestion({ protein: 40, carbs: 90 }, 19)!;
    expect(s).toMatchObject({ id: 'post-nutricion', lead: 'Comida.' });
    expect(s.text).toBe('Comida. Te faltan 40 g de proteína y 90 g de hidratos para hoy. ¿Apunto algo?');
    expect(s.actions).toEqual([
      { label: 'Apuntar comida', target: 'nutri-comida' },
      { label: 'Escanear producto', target: 'nutri-escanear' },
    ]);
  });

  it('solo nombra lo que de verdad falta y se calla con el día cubierto, sin datos o muy tarde', () => {
    expect(postTrainingNutritionSuggestion({ protein: 5, carbs: 90 }, 19)!.text).toBe('Comida. Te faltan 90 g de hidratos para hoy. ¿Apunto algo?');
    expect(postTrainingNutritionSuggestion({ protein: 5, carbs: 10 }, 19)).toBeNull();
    expect(postTrainingNutritionSuggestion(null, 19)).toBeNull();
    expect(postTrainingNutritionSuggestion({ protein: 40, carbs: 90 }, 23)).toBeNull();
  });

  it('por la noche, una línea con el esfuerzo y la comida; antes de las 21 h o sin entrenar, nada', () => {
    const s = nightSuggestion(closing('dentro'), 96, 22)!;
    expect(s.id).toBe('noche');
    expect(s.text).toBe('Día cerrado. Entrenaste con esfuerzo dentro de tu objetivo, comida al 96 %. A descansar.');
    expect(nightSuggestion(closing('pasado'), null, 22)!.text).toBe('Día cerrado. Entrenaste con esfuerzo por encima de tu objetivo. Mañana, con cuidado; ahora, a descansar.');
    expect(nightSuggestion(closing('dentro'), 50, 20)).toBeNull();
    expect(nightSuggestion(closing('sin-entrenar'), 50, 22)).toBeNull();
    expect(nightSuggestion(null, 50, 22)).toBeNull();
  });

  it('en la lista, la frase de la sesión va primero y detrás la comida; de noche manda el resumen', () => {
    const tarde = buildRexSuggestions({ ...base, nutritionLeft: { protein: 40, carbs: 90 } });
    expect(tarde.map((x) => x.id).slice(0, 2)).toEqual(['cierre', 'post-nutricion']);
    const noche = buildRexSuggestions({ ...base, hour: 22, nutritionLeft: { protein: 40, carbs: 90 } });
    expect(noche[0].id).toBe('noche');
    // Con el día sin entrenar no hay nada de esto.
    expect(buildRexSuggestions({ ...base, trainedToday: false, closing: null, nutritionLeft: { protein: 40, carbs: 90 } }).map((x) => x.id)).not.toContain('post-nutricion');
  });
});
