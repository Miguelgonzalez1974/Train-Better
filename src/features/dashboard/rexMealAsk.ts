import { FOODS, type Food } from '../../data/nutrition/foods';
import type { CustomFood, ExtraFoodEntry } from '../../data/athlete/types';
import { customFoodToCatalogFood } from '../../engine/customFoods';
import { mealTotals, parseMeal, type MealItem } from '../../engine/mealText';
import type { AskAnswer } from './rexAsk';

/**
 * Apuntar una comida hablando con Rex desde cualquier pantalla («apunta dos huevos y 200 g de arroz»): si Rex lo entiende entero, lo enseña con lo que aporta
 * y lo que te quedaría, y solo lo apunta al decir «Apuntar». Si hay algo que no tiene claro (un alimento que no conoce, varios posibles, una cantidad sin
 * decir), lo resuelve la caja de Nutrición, donde se puede elegir y cambiar cada cosa. Puro: ni almacenamiento ni pantallas.
 */

const fmt = (n: number) => String(Math.round(n)).replace('.', ',');

/** Los alimentos que Rex conoce: el catálogo y los tuyos (incluidos los que se crearon escaneando un producto). */
export function knownFoods(customFoods: CustomFood[] | undefined): { foods: Food[]; customIds: Set<string> } {
  const custom = customFoods ?? [];
  return { foods: custom.length === 0 ? FOODS : [...FOODS, ...custom.map(customFoodToCatalogFood)], customIds: new Set(custom.map((f) => f.id)) };
}

export type MealProposal =
  | { kind: 'ok'; items: MealItem[]; names: string[]; totals: { protein: number; carbs: number } }
  /** Hay algo que Rex no tiene claro (o no entiende nada): lo resuelve la caja de Nutrición. */
  | { kind: 'needs-nutrition' };

export function proposeMeal(text: string, customFoods: CustomFood[] | undefined): MealProposal {
  const { foods, customIds } = knownFoods(customFoods);
  const parse = parseMeal(text, foods, customIds);
  if (parse.items.length === 0 || parse.issues.length > 0) return { kind: 'needs-nutrition' };
  const byId = new Map(foods.map((f) => [f.id, f]));
  const names = parse.items.map((it) => `${byId.get(it.foodId)?.name ?? it.foodId} ${Math.round(it.grams)} g`);
  return { kind: 'ok', items: parse.items, names, totals: mealTotals(parse.items, (id) => byId.get(id)) };
}

/** «Esto he entendido»: lo que aporta y lo que te quedaría, con «Apuntar» y «Cambiar». */
export function mealProposalAnswer(text: string, proposal: Extract<MealProposal, { kind: 'ok' }>, missing: { protein: number; carbs: number } | null): AskAnswer {
  const { totals, names } = proposal;
  const left = missing ? ` Te quedarían ${fmt(Math.max(0, missing.protein - totals.protein))} g de proteína y ${fmt(Math.max(0, missing.carbs - totals.carbs))} g de hidratos.` : '';
  return {
    lead: 'Esto he entendido.',
    tone: 'info',
    text: `${names.join(' · ')}: ≈ ${fmt(totals.protein)} g de proteína y ${fmt(totals.carbs)} g de hidratos.${left} ¿Lo apunto?`,
    actions: [
      { label: 'Apuntar', target: 'ir-nutricion', ask: `confirma comida: ${text}` },
      { label: 'Cambiar', target: 'ir-nutricion', ask: `edita comida: ${text}` },
    ],
  };
}

/** Lo apuntado, con lo que queda del día si se sabe. */
export function mealSavedAnswer(totals: { protein: number; carbs: number }, missing: { protein: number; carbs: number } | null): AskAnswer {
  const left = missing ? { protein: Math.max(0, missing.protein - totals.protein), carbs: Math.max(0, missing.carbs - totals.carbs) } : null;
  const text = !left
    ? `+${fmt(totals.protein)} g de proteína y +${fmt(totals.carbs)} g de hidratos en tu diario de hoy.`
    : left.protein === 0 && left.carbs === 0
      ? 'Con esto, el objetivo del día queda cubierto.'
      : `Te quedan ${fmt(left.protein)} g de proteína y ${fmt(left.carbs)} g de hidratos.`;
  return { lead: 'Apuntado.', tone: 'good', text, actions: [{ label: 'Abrir Nutrición', target: 'ir-nutricion' }] };
}

/** La entrada del diario con lo que Rex entendió, a la hora de ahora (o a mediodía si no es hoy). */
export function mealEntry(items: MealItem[], hour: number, id: string = `extra${Date.now()}`): ExtraFoodEntry {
  return { id, hour, items: items.map((it) => ({ foodId: it.foodId, grams: it.grams })) };
}
