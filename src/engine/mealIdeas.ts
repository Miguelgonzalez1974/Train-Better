import type { Food } from '../data/nutrition/foods';

/**
 * «¿Qué ceno?»: ideas de comida para cerrar lo que te falta del día. Reglas sencillas, sin IA externa: elige una fuente de proteína y una de
 * hidratos (primero lo que más apuntas, luego lo corriente), calcula las cantidades para cubrir una parte de lo que falta y las
 * redondea a algo que se pueda servir. Puro: los alimentos y lo que falta entran por parámetros.
 */

export interface MealIdeaItem {
  foodId: string;
  name: string;
  grams: number;
  /** Si se cuenta por piezas (huevo, lata, plátano): cuántas. */
  units?: { count: number; singular: string; plural: string };
}

export interface MealIdea {
  items: MealIdeaItem[];
  protein: number;
  carbs: number;
}

const DEFAULT_PROTEIN = ['pollo', 'atun', 'huevos', 'merluza', 'ternera', 'salmon', 'pavo'];
const DEFAULT_CARB = ['arroz', 'pasta', 'patata', 'avena', 'pan', 'cuscus'];
/** Lo máximo de proteína y de hidratos que una sola idea intenta cubrir: una comida, no el día entero. */
const MAX_PROTEIN = 45;
const MAX_CARBS = 100;
/** Si falta menos que esto, no se propone esa parte. */
const MIN_PROTEIN = 8;
const MIN_CARBS = 15;

function round10(n: number): number {
  return Math.max(10, Math.round(n / 10) * 10);
}

/** Cantidad de un alimento para aportar `grams` del nutriente (`key`), respetando su rango habitual y sus piezas. */
function sizeFor(food: Food, key: 'p' | 'c', need: number): MealIdeaItem {
  const per = food.per100[key];
  let grams = per > 0 ? (need / per) * 100 : 100;
  if (food.range) grams = Math.min(food.range[1], Math.max(food.range[0], grams));
  if (food.unit) {
    const count = Math.max(1, Math.round(grams / food.unit.grams));
    return { foodId: food.id, name: food.name, grams: count * food.unit.grams, units: { count, singular: food.unit.singular, plural: food.unit.plural } };
  }
  return { foodId: food.id, name: food.name, grams: round10(grams) };
}

const gramsOf = (item: MealIdeaItem, food: Food, key: 'p' | 'c') => Math.round((food.per100[key] * item.grams) / 100);

/**
 * Hasta tres ideas distintas para cubrir lo que falta. `recent` = ids de lo que más apuntas (van primero). Devuelve [] si no falta casi nada.
 */
export function mealIdeas(missing: { protein: number; carbs: number }, foods: Food[], recent: string[] = []): MealIdea[] {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const pick = (group: Food['group'], defaults: string[]): Food[] => {
    const preferred = recent.map((id) => byId.get(id)).filter((f): f is Food => Boolean(f) && f!.group === group);
    const fallback = defaults.map((id) => byId.get(id)).filter((f): f is Food => Boolean(f));
    return [...new Set([...preferred, ...fallback])];
  };
  const proteins = pick('Proteína', DEFAULT_PROTEIN);
  const carbs = pick('Hidrato', DEFAULT_CARB);
  const wantP = missing.protein >= MIN_PROTEIN;
  const wantC = missing.carbs >= MIN_CARBS;
  if (!wantP && !wantC) return [];

  const ideas: MealIdea[] = [];
  const count = Math.min(3, Math.max(wantP ? proteins.length : 0, wantC ? carbs.length : 0));
  for (let i = 0; i < count; i++) {
    const items: MealIdeaItem[] = [];
    let protein = 0;
    let carbsG = 0;
    const p = wantP ? proteins[i % Math.max(1, proteins.length)] : undefined;
    const c = wantC ? carbs[i % Math.max(1, carbs.length)] : undefined;
    // Lo que aporta la fuente de hidratos en proteína (el arroz, la pasta o la avena llevan algo) se descuenta de lo que se pide a la proteína.
    if (c) {
      const item = sizeFor(c, 'c', Math.min(missing.carbs, MAX_CARBS));
      items.push(item);
      carbsG += gramsOf(item, c, 'c');
      protein += gramsOf(item, c, 'p');
    }
    if (p) {
      const needP = Math.max(MIN_PROTEIN, Math.min(missing.protein, MAX_PROTEIN) - protein);
      const item = sizeFor(p, 'p', needP);
      items.unshift(item);
      protein += gramsOf(item, p, 'p');
      carbsG += gramsOf(item, p, 'c');
    }
    if (items.length > 0) ideas.push({ items, protein, carbs: carbsG });
  }
  return ideas;
}

/** Una idea en una frase: «150 g de Pechuga de pollo y 110 g de Arroz (≈ 41 g de proteína y 90 g de hidratos)». */
export function describeIdea(idea: MealIdea): string {
  const parts = idea.items.map((i) => {
    if (!i.units) return `${i.grams} g de ${i.name.toLowerCase()}`;
    const unit = i.units.count === 1 ? i.units.singular : i.units.plural;
    // «5 huevos», no «5 huevos (huevos)»: el nombre solo se añade si dice algo más que la pieza.
    return i.name.toLowerCase() === unit.toLowerCase() ? `${i.units.count} ${unit}` : `${i.units.count} ${unit} (${i.name.toLowerCase()})`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
  return `${list} (≈ ${idea.protein} g de proteína y ${idea.carbs} g de hidratos)`;
}
