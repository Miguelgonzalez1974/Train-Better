import { describe, expect, it } from 'vitest';
import { mealEntry, mealProposalAnswer, mealSavedAnswer, proposeMeal } from './rexMealAsk';
import { parseAsk, parseOrderAsk } from './rexAsk';

describe('apuntar una comida hablando con Rex', () => {
  it('lo que entiende entero se enseña con lo que aporta, antes de apuntar', () => {
    const p = proposeMeal('he comido dos huevos y 200 g de arroz', undefined);
    expect(p.kind).toBe('ok');
    if (p.kind !== 'ok') return;
    expect(p.items.length).toBeGreaterThanOrEqual(2);
    expect(p.totals.protein).toBeGreaterThan(5);
    const a = mealProposalAnswer('he comido dos huevos y 200 g de arroz', p, { protein: 100, carbs: 200 });
    expect(a.lead).toBe('Esto he entendido.');
    expect(a.text).toContain('¿Lo apunto?');
    expect(a.text).toContain('Te quedarían');
    expect(a.actions.map((x) => x.label)).toEqual(['Apuntar', 'Cambiar']);
    expect(a.actions[0].ask).toBe('confirma comida: he comido dos huevos y 200 g de arroz');
    expect(a.actions[1].ask).toBe('edita comida: he comido dos huevos y 200 g de arroz');
  });

  it('lo que no entiende o no tiene claro lo resuelve Nutrición', () => {
    expect(proposeMeal('he comido sushi de dragón con wasabi', undefined).kind).toBe('needs-nutrition');
    expect(proposeMeal('he comido', undefined).kind).toBe('needs-nutrition');
  });

  it('un alimento propio (por ejemplo uno escaneado) se entiende', () => {
    const custom = [{ id: 'c1', name: 'Tortitas de arroz', proteinPer100: 8, carbsPer100: 81, group: 'Hidrato' as const, barcode: '0000000000017' }];
    const p = proposeMeal('he comido 30 g de tortitas de arroz', custom);
    expect(p.kind).toBe('ok');
    if (p.kind === 'ok') expect(p.totals.carbs).toBeCloseTo(24, 0);
  });

  it('lo apuntado dice lo que queda, o que el día queda cubierto', () => {
    expect(mealSavedAnswer({ protein: 17, carbs: 57 }, { protein: 100, carbs: 200 }).text).toBe('Te quedan 83 g de proteína y 143 g de hidratos.');
    expect(mealSavedAnswer({ protein: 17, carbs: 57 }, { protein: 10, carbs: 20 }).text).toBe('Con esto, el objetivo del día queda cubierto.');
    expect(mealSavedAnswer({ protein: 17, carbs: 57 }, null).text).toContain('+17 g de proteína');
  });

  it('la entrada del diario lleva los alimentos y la hora', () => {
    expect(mealEntry([{ foodId: 'huevo', grams: 120 }], 13.5, 'x1')).toEqual({ id: 'x1', hour: 13.5, items: [{ foodId: 'huevo', grams: 120 }] });
  });
});

describe('órdenes que valen desde cualquier pantalla', () => {
  it('empezar, seguir y cerrar la sesión', () => {
    for (const t of ['empieza la sesión', 'empezar el entreno', 'vamos a entrenar', 'continúa la sesión', 'arranca el entrenamiento', 'a entrenar']) {
      expect(parseOrderAsk(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), t).toEqual({ kind: 'empezar' });
    }
    for (const t of ['cierra la sesión', 'cerrar sesión', 'termina el entreno', 'he terminado', 'ya terminé', 'acabé de entrenar', 'sesión terminada']) {
      expect(parseOrderAsk(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), t).toEqual({ kind: 'cerrar' });
    }
  });

  it('escanear un producto', () => {
    for (const t of ['escanea un producto', 'escanear', 'quiero leer un código de barras', 'abre el escáner']) {
      expect(parseOrderAsk(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), t).toEqual({ kind: 'escanear' });
    }
  });

  it('no se confunde con el programa, la competición ni con una comida', () => {
    expect(parseAsk('empieza el programa', 1).kind).toBe('programa');
    expect(parseAsk('ya terminé la competición', 1).kind).not.toBe('cerrar');
    expect(parseAsk('he comido arroz y he terminado', 1).kind).toBe('comida');
    expect(parseAsk('qué toca mañana', 1).kind).toBe('dia');
  });

  it('«apunta…» con alimentos que Rex conoce es una comida; con el peso, una marca u otra cosa, no', () => {
    expect(parseAsk('apunta dos huevos y 200 g de arroz', 1)).toEqual({ kind: 'comida', text: 'dos huevos y 200 g de arroz' });
    expect(parseAsk('anota 150 g de pollo', 1).kind).toBe('comida');
    expect(parseAsk('apunta 82,4 kg', 1).kind).toBe('peso');
    expect(parseAsk('apunta mi peso', 1).kind).not.toBe('comida');
    expect(parseAsk('apunta que me duele el hombro', 1).kind).toBe('dolor');
    expect(parseAsk('apunta mi back squat 140 kg', 1).kind).not.toBe('comida');
  });

  it('las frases de los botones de una comida vuelven con su modo', () => {
    expect(parseAsk('confirma comida: he comido dos huevos', 1)).toEqual({ kind: 'comida', text: 'he comido dos huevos', mode: 'confirmar' });
    expect(parseAsk('edita comida: he comido dos huevos', 1)).toEqual({ kind: 'comida', text: 'he comido dos huevos', mode: 'editar' });
  });
});
