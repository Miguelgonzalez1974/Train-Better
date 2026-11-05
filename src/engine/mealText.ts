import type { Food } from '../data/nutrition/foods';
import { fixedPortion, macrosOf } from './mealBuilder';

/**
 * «He comido dos huevos y 200 g de arroz»: convierte una frase en alimentos del catálogo (y los propios del atleta) con su cantidad.
 * No es un modelo de lenguaje: busca nombres y alias, entiende cantidades (números, «un/una/dos…», gramos, ml, piezas, vasos, cucharadas,
 * raciones) y, cuando duda, no inventa: deja una pregunta (`MealIssue`) para que el atleta la resuelva antes de apuntar nada.
 * Puro: sin React y sin almacenamiento.
 */

/** Un alimento ya entendido, con su cantidad en gramos (o ml, o piezas × peso de la pieza), listo para apuntar. */
export interface MealItem {
  foodId: string;
  grams: number;
  /** Aviso corto de cómo se ha calculado («200 g cocinado ≈ 74 g en crudo»). */
  note?: string;
  /** La cantidad no se dijo y se ha puesto la ración habitual. */
  assumed?: boolean;
}

/** Lo que se dijo de la cantidad en un trozo de la frase. */
export interface Quantity {
  /** Número de piezas, vasos, cucharadas… (0,5 = «medio»). */
  count?: number;
  /** Peso o volumen dicho tal cual, ya en g o ml. */
  amount?: number;
  /** Medida casera: «vaso», «cucharada»… */
  measure?: Measure;
  /** Se dijo que estaba cocinado («cocido», «a la plancha»): hay que pasarlo a crudo si la app lo cuenta en crudo. */
  cooked?: boolean;
}

export type Measure = 'vaso' | 'taza' | 'cucharada' | 'cucharadita' | 'racion' | 'vago' | 'pieza' | 'lata' | 'tostada' | 'rebanada' | 'loncha';

export type MealIssue =
  /** No hay nada parecido en el catálogo ni en tus alimentos. */
  | { id: number; kind: 'desconocido'; text: string }
  /** Hay varios alimentos posibles (o uno parecido, no seguro): elige. */
  | { id: number; kind: 'elegir'; text: string; options: { foodId: string; name: string }[]; quantity: Quantity }
  /** Se sabe el alimento pero no la cantidad («un puñado»): dila en gramos. */
  | { id: number; kind: 'cantidad'; text: string; foodId: string; name: string; suggestedGrams: number };

export interface MealParse {
  items: MealItem[];
  issues: MealIssue[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Texto

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => strip(s.toLowerCase());

/** Mismas palabras salvo plural («huevo/huevos», «datil/datiles»). */
function wordEq(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'uno', 'unos', 'unas', 'al', 'a', 'en', 'con', 'para', 'y', 'e', 'o', 'mi', 'mis', 'su', 'sus', 'unos', 'algo']);
const COOKED_WORDS = new Set(['cocido', 'cocida', 'cocidos', 'cocidas', 'cocinado', 'cocinada', 'cocinados', 'cocinadas', 'hervido', 'hervida', 'hervidos', 'hervidas', 'plancha', 'asado', 'asada', 'asados', 'asadas', 'hecho', 'hecha']);
/** Palabras de cocina que no cambian el alimento ni el peso en crudo. */
const NEUTRAL_WORDS = new Set(['frito', 'frita', 'fritos', 'fritas', 'horno', 'natural', 'fresco', 'fresca', 'grande', 'grandes', 'pequeno', 'pequena', 'mediano', 'mediana', 'casero', 'casera']);

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, medio: 0.5, media: 0.5,
};

const MEASURE_WORDS: Record<string, Measure> = {
  vaso: 'vaso', copa: 'vaso', taza: 'taza', cucharada: 'cucharada', cucharadas: 'cucharada', cucharadita: 'cucharadita', cucharaditas: 'cucharadita',
  racion: 'racion', raciones: 'racion', plato: 'racion', platos: 'racion', porcion: 'racion', porciones: 'racion',
  punado: 'vago', punados: 'vago', trozo: 'vago', trozos: 'vago', poco: 'vago', pocos: 'vago', cacho: 'vago', bastante: 'vago', mucho: 'vago', muchos: 'vago',
  pieza: 'pieza', piezas: 'pieza', unidad: 'pieza', unidades: 'pieza', lata: 'lata', latas: 'lata',
  tostada: 'tostada', tostadas: 'tostada', rebanada: 'rebanada', rebanadas: 'rebanada', loncha: 'loncha', lonchas: 'loncha',
};

/** Gramos de una medida casera cuando el alimento no la trae como pieza propia. */
const MEASURE_GRAMS: Partial<Record<Measure, number>> = { cucharada: 15, cucharadita: 5, tostada: 30, rebanada: 30, loncha: 15 };
const VAGUE_GRAMS = 30;

/** Cuánto pesa cocinado frente a crudo, para alimentos que la app cuenta en crudo. */
export const COOKED_FACTOR: Record<string, number> = {
  arroz: 2.7, pasta: 2.3, cuscus: 2.5, pollo: 1.3, pavo: 1.3, ternera: 1.3, 'lomo-cerdo': 1.3, merluza: 1.15, salmon: 1.2, langostinos: 1.2,
};

/** Otros nombres con los que se llama a cada alimento del catálogo. El resto de nombres salen del nombre del catálogo. */
const ALIASES: Record<string, string[]> = {
  pollo: ['pollo', 'pechuga de pollo', 'pechuga'],
  pavo: ['pavo', 'pechuga de pavo'],
  ternera: ['ternera', 'filete de ternera', 'buey'],
  'lomo-cerdo': ['lomo de cerdo', 'lomo', 'cerdo'],
  merluza: ['merluza', 'bacalao', 'pescado blanco'],
  salmon: ['salmon'],
  atun: ['atun', 'atun al natural', 'atun en lata'],
  langostinos: ['langostinos', 'gambas'],
  sardinas: ['sardinas', 'sardinas en aceite'],
  'pollo-tiras': ['tiras de pollo', 'pollo en tiras'],
  'clara-huevo': ['claras', 'clara de huevo', 'claras de huevo'],
  huevos: ['huevos', 'huevo'],
  skyr: ['skyr', 'yogur proteico', 'yogur skyr'],
  'queso-batido': ['queso batido', 'queso fresco batido'],
  'pavo-fiambre': ['jamon cocido', 'jamon york', 'jamon de york', 'fiambre', 'pavo en lonchas', 'fiambre de pavo'],
  'jamon-serrano': ['jamon serrano', 'serrano'],
  'queso-cabra': ['queso de cabra'],
  cheddar: ['cheddar', 'queso cheddar'],
  anchoas: ['anchoas'],
  bacon: ['bacon', 'beicon', 'panceta'],
  cottage: ['cottage', 'queso cottage'],
  'proteina-polvo': ['proteina', 'proteina en polvo', 'whey', 'batido de proteina'],
  arroz: ['arroz', 'arroz blanco', 'arroz integral', 'arroz basmati'],
  pasta: ['pasta', 'macarrones', 'espaguetis', 'spaghetti', 'fideos', 'tallarines'],
  patata: ['patata', 'patatas'],
  boniato: ['boniato', 'batata'],
  cuscus: ['cuscus'],
  lentejas: ['lentejas'],
  garbanzos: ['garbanzos'],
  noquis: ['noquis'],
  mazorca: ['mazorca', 'maiz', 'mazorca de maiz'],
  avena: ['avena', 'copos de avena', 'porridge'],
  pan: ['pan', 'pan integral'],
  wasa: ['pan wasa', 'wasa'],
  centeno: ['pan de centeno', 'centeno'],
  bimbo: ['pan de molde', 'pan bimbo', 'bimbo'],
  galletas: ['galletas', 'galletas integrales'],
  tortitas: ['tortitas de arroz', 'tortitas'],
  platano: ['platano', 'banana'],
  manzana: ['manzana'],
  naranja: ['naranja', 'mandarina', 'mandarinas', 'clementinas'],
  kiwi: ['kiwi'],
  datiles: ['datiles'],
  'arandanos-secos': ['arandanos secos', 'arandanos deshidratados'],
  pina: ['pina'],
  uvas: ['uvas'],
  tomate: ['tomate'],
  'ensalada-bolsa': ['ensalada', 'ensalada de bolsa'],
  zanahoria: ['zanahoria'],
  pimiento: ['pimiento'],
  pepino: ['pepino'],
  'judias-verdes': ['judias verdes', 'judias'],
  brocoli: ['brocoli'],
  calabacin: ['calabacin'],
  cafe: ['cafe', 'cafe solo'],
  leche: ['leche', 'leche desnatada'],
  kefir: ['kefir'],
  infusion: ['infusion', 'te', 'te verde', 'manzanilla'],
  'cafe-leche': ['cafe con leche', 'cafeconleche'],
  'frutos-secos': ['frutos secos', 'nueces', 'almendras', 'pistachos', 'anacardos', 'avellanas'],
  'crema-cacahuete': ['crema de cacahuete', 'mantequilla de cacahuete'],
  'cacahuete-polvo': ['cacahuete en polvo'],
  'chocolate-negro': ['chocolate negro', 'chocolate'],
  gelatina: ['gelatina'],
  aceite: ['aceite', 'aceite de oliva'],
  'mermelada-light': ['mermelada'],
  'tortilla-patata': ['tortilla de patata', 'tortilla espanola', 'tortilla'],
  'pizza-casera': ['pizza', 'pizza casera'],
};

interface Alias {
  words: string[];
  foodId: string;
  /** Alimento propio del atleta: gana los empates. */
  custom: boolean;
}

/** Las palabras que cuentan para reconocer un alimento: sin artículos, cocciones, cantidades ni medidas (se quitan igual de lo que dice el atleta). */
function cleanWords(words: string[]): string[] {
  return words.filter((w) => !STOP.has(w) && !COOKED_WORDS.has(w) && !NEUTRAL_WORDS.has(w) && !(w in MEASURE_WORDS) && !(w in NUMBER_WORDS) && w !== 'par');
}

function wordsOf(s: string): string[] {
  return cleanWords(
    norm(s)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Todos los nombres con los que se puede pedir cada alimento: alias curados, su nombre del catálogo (y cada parte «X o Y») y el nombre propio. */
export function buildAliases(foods: Food[], customIds: Set<string> = new Set()): Alias[] {
  const out: Alias[] = [];
  const seen = new Set<string>();
  const add = (foodId: string, phrase: string, custom: boolean) => {
    const words = wordsOf(phrase);
    if (words.length === 0) return;
    const key = `${foodId}|${words.join(' ')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ words, foodId, custom });
  };
  for (const f of foods) {
    const custom = customIds.has(f.id);
    if (!custom) for (const a of ALIASES[f.id] ?? []) add(f.id, a, false);
    // El nombre del catálogo, y cada parte de «Skyr o yogur proteico» / «Merluza o bacalao (fresco…)».
    const plain = f.name.replace(/\([^)]*\)/g, ' ');
    add(f.id, plain, custom);
    if (/ o /i.test(plain)) for (const part of plain.split(/ o /i)) add(f.id, part, custom);
  }
  return out;
}

/** ¿Aparecen las palabras del alias seguidas dentro de `words`? Devuelve dónde empieza, o -1. */
function indexOfPhrase(words: string[], phrase: string[]): number {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((w, k) => wordEq(words[i + k], w))) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cantidades

const MASS_RE = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|grs|gramos?|ml|l|litros?|cl)\b/;

function toNumber(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Saca la cantidad de un trozo de frase; devuelve lo que queda (las palabras del alimento) y la cantidad dicha. */
export function extractQuantity(chunk: string): { rest: string[]; quantity: Quantity; vague: boolean } {
  const quantity: Quantity = {};
  let vague = false;
  let text = ` ${norm(chunk)} `.replace(/[¿?¡!.]/g, ' ');

  const mass = MASS_RE.exec(text);
  if (mass) {
    const n = toNumber(mass[1]);
    const u = mass[2];
    quantity.amount = Math.round(u.startsWith('k') ? n * 1000 : u === 'l' || u.startsWith('litro') ? n * 1000 : u === 'cl' ? n * 10 : n);
    text = text.replace(mass[0], ' ');
  }

  const words = text.split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (COOKED_WORDS.has(w)) {
      quantity.cooked = true;
      continue;
    }
    if (NEUTRAL_WORDS.has(w)) continue;
    // «un par de» = 2
    if (w === 'par') {
      quantity.count = 2;
      continue;
    }
    if (/^\d+(?:[.,]\d+)?$/.test(w) && quantity.count === undefined && quantity.amount === undefined) {
      quantity.count = toNumber(w);
      continue;
    }
    if (w in NUMBER_WORDS && quantity.count === undefined) {
      // «un»/«una» solo cuenta como cantidad si hay algo detrás que contar.
      quantity.count = NUMBER_WORDS[w];
      continue;
    }
    if (w === 'unos' || w === 'unas') {
      vague = true;
      continue;
    }
    if (w in MEASURE_WORDS && quantity.measure === undefined) {
      quantity.measure = MEASURE_WORDS[w];
      if (quantity.measure === 'vago') vague = true;
      continue;
    }
    if (STOP.has(w)) continue;
    rest.push(w);
  }
  return { rest, quantity, vague };
}

/** Gramos (o ml) de `quantity` para `food`, con una nota si se calculó algo. `null` = no se puede saber (pedir la cantidad). */
export function gramsFor(food: Food, quantity: Quantity): { grams: number; note?: string; assumed?: boolean } | null {
  const { count, amount, measure, cooked } = quantity;
  const count1 = count ?? 1;

  if (amount !== undefined) {
    const factor = cooked ? COOKED_FACTOR[food.id] : undefined;
    if (factor && factor > 1) {
      const raw = Math.max(1, Math.round(amount / factor));
      return { grams: raw, note: `${amount} g cocinado ≈ ${raw} g en crudo (la app cuenta ${food.name.toLowerCase()} en crudo)` };
    }
    return { grams: amount };
  }

  if (measure === 'vago') return null;

  if (measure === 'racion') return { grams: Math.round(fixedPortion(food).grams * count1), note: 'ración habitual', assumed: true };

  if (measure === 'vaso' || measure === 'taza') {
    if (food.unit && food.unit.singular === measure) return { grams: Math.round(food.unit.grams * count1) };
    if (!food.liquid) return null;
    return { grams: Math.round((measure === 'vaso' ? 200 : 250) * count1) };
  }

  if (measure === 'cucharada' || measure === 'cucharadita') {
    const per = food.id === 'aceite' && measure === 'cucharada' ? 10 : (MEASURE_GRAMS[measure] ?? 15);
    return { grams: Math.round(per * count1) };
  }

  if (food.unit) {
    // Piezas propias del alimento (huevo, lata, plátano…) o una medida genérica (tostada, rebanada, pieza) tomada como pieza.
    return { grams: Math.round(food.unit.grams * count1) };
  }

  if (measure === 'tostada' || measure === 'rebanada' || measure === 'loncha') {
    return { grams: Math.round((MEASURE_GRAMS[measure] ?? 30) * count1), note: `${measure} ≈ ${MEASURE_GRAMS[measure]} g` };
  }

  if (count !== undefined || measure === 'pieza') {
    return { grams: Math.round(fixedPortion(food).grams * count1), note: count1 === 1 ? 'ración habitual' : 'raciones habituales', assumed: true };
  }

  // Sin cantidad: la ración habitual.
  const portion = fixedPortion(food);
  return { grams: portion.grams, note: 'ración habitual', assumed: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// La frase

const INTRO = [
  /^\s*(hoy\s+)?(he|hemos)\s+(comido|cenado|desayunado|almorzado|merendado|tomado|picado|bebido|zampado)\b/,
  /^\s*me\s+(he\s+)?(comido|tomado|bebido|zampado|echado)\b/,
  /^\s*(comi|cene|desayune|almorce|merende|tome|bebi|pique)\b/,
  /^\s*(para|de)\s+(comer|cenar|desayunar|almorzar|merendar|desayuno|comida|cena|almuerzo|merienda)\b/,
];
const TRAILING = /\s+(de|para)\s+(desayuno|comida|cena|almuerzo|merienda|desayunar|comer|cenar|almorzar|merendar)\s*$/;

/** Parte la frase en trozos, uno por alimento. */
export function splitMeal(text: string): string[] {
  let t = ` ${norm(text)} `.replace(/cafe con leche/g, ' cafeconleche ');
  for (const re of INTRO) t = ` ${t.trim().replace(re, ' ')} `;
  t = t.replace(TRAILING, ' ');
  return t
    .split(/[,;+\n]|\s(?:y|e|mas|con|luego|despues|tambien|ademas)\s/)
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .filter((c) => c.length > 0 && !/^[.\s]*$/.test(c));
}

let issueSeq = 0;
const nextId = () => ++issueSeq;

function bestAlias(rest: string[], aliases: Alias[]): Alias | null {
  let best: Alias | null = null;
  for (const a of aliases) {
    if (indexOfPhrase(rest, a.words) < 0) continue;
    if (!best || a.words.length > best.words.length || (a.words.length === best.words.length && a.custom && !best.custom)) best = a;
  }
  return best;
}

/** Alimentos con alguna palabra en común con lo dicho: se ofrecen para elegir. */
function candidatesFor(rest: string[], aliases: Alias[], foods: Food[]): Food[] {
  const key = rest.filter((w) => w.length >= 4);
  if (key.length === 0) return [];
  const ids = new Set<string>();
  for (const a of aliases) if (a.words.some((aw) => aw.length >= 4 && key.some((k) => wordEq(aw, k)))) ids.add(a.foodId);
  return foods.filter((f) => ids.has(f.id)).slice(0, 4);
}

/** Alimentos que se cuentan en esa medida («lata» → atún, sardinas). */
function foodsWithUnit(measure: Measure, foods: Food[]): Food[] {
  return foods.filter((f) => f.unit && wordEq(norm(f.unit.singular), measure));
}

export function parseMeal(text: string, foods: Food[], customIds: Set<string> = new Set()): MealParse {
  const aliases = buildAliases(foods, customIds);
  const byId = new Map(foods.map((f) => [f.id, f]));
  const out: MealParse = { items: [], issues: [] };

  const handle = (chunk: string, allowSplit: boolean): void => {
    const { rest, quantity, vague } = extractQuantity(chunk);
    handleWords(rest, quantity, vague, chunk, allowSplit);
  };

  const handleWords = (rest: string[], quantity: Quantity, vague: boolean, chunk: string, allowSplit: boolean): void => {

    // Solo había una cantidad: «dos tostadas», «una lata».
    if (rest.length === 0) {
      if (quantity.measure && !['vago', 'racion', 'vaso', 'taza', 'cucharada', 'cucharadita', 'pieza'].includes(quantity.measure)) {
        const withUnit = foodsWithUnit(quantity.measure, foods);
        if (withUnit.length === 1) return void addResolved(withUnit[0], quantity, `Lo he tomado como ${withUnit[0].name.toLowerCase()}`);
        if (withUnit.length > 1) return void out.issues.push({ id: nextId(), kind: 'elegir', text: chunk, options: withUnit.map((f) => ({ foodId: f.id, name: f.name })), quantity });
      }
      return;
    }

    const alias = bestAlias(rest, aliases);
    if (alias) {
      const food = byId.get(alias.foodId);
      if (!food) return;
      if (vague || quantity.measure === 'vago') {
        // «un puñado de nueces»: se sabe qué es, no cuánto.
        if (quantity.amount === undefined) {
          out.issues.push({ id: nextId(), kind: 'cantidad', text: chunk, foodId: food.id, name: food.name, suggestedGrams: VAGUE_GRAMS });
          return;
        }
      }
      addResolved(food, quantity);
      // Quedaba otra cosa dicha sin separar («pollo arroz»): si es un alimento conocido, también se apunta; si no, se ignora.
      const at = indexOfPhrase(rest, alias.words);
      const remaining = [...rest.slice(0, at), ...rest.slice(at + alias.words.length)];
      if (remaining.length > 0 && bestAlias(remaining, aliases)) handleWords(remaining, {}, false, remaining.join(' '), false);
      return;
    }

    if (allowSplit && rest.length >= 2) {
      // Tal vez eran dos cosas sin separar («pan jamón»): se prueba cada palabra suelta.
      const single = rest.map((w) => bestAlias([w], aliases));
      if (single.every(Boolean) && new Set(single.map((s) => s!.foodId)).size === rest.length) {
        rest.forEach((_, i) => {
          const food = byId.get(single[i]!.foodId);
          if (food) addResolved(food, i === 0 ? quantity : {});
        });
        return;
      }
    }

    const cands = candidatesFor(rest, aliases, foods);
    if (cands.length > 0) {
      out.issues.push({ id: nextId(), kind: 'elegir', text: chunk, options: cands.map((f) => ({ foodId: f.id, name: f.name })), quantity });
      return;
    }
    out.issues.push({ id: nextId(), kind: 'desconocido', text: rest.join(' ') });
  };

  const addResolved = (food: Food, quantity: Quantity, extraNote?: string): void => {
    const g = gramsFor(food, quantity);
    if (!g) {
      out.issues.push({ id: nextId(), kind: 'cantidad', text: food.name, foodId: food.id, name: food.name, suggestedGrams: VAGUE_GRAMS });
      return;
    }
    out.items.push({ foodId: food.id, grams: g.grams, note: [extraNote, g.note].filter(Boolean).join(' · ') || undefined, assumed: g.assumed });
  };

  for (const chunk of splitMeal(text)) handle(chunk, true);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Resolver las dudas

/** El atleta elige uno de los alimentos posibles: se calcula la cantidad con lo que dijo. */
export function chooseFood(parse: MealParse, issueId: number, foodId: string, foods: Food[]): MealParse {
  const issue = parse.issues.find((i) => i.id === issueId);
  const food = foods.find((f) => f.id === foodId);
  if (!issue || issue.kind !== 'elegir' || !food) return parse;
  const issues = parse.issues.filter((i) => i.id !== issueId);
  const g = gramsFor(food, issue.quantity);
  if (!g) {
    return { items: parse.items, issues: [...issues, { id: issueId, kind: 'cantidad', text: food.name, foodId: food.id, name: food.name, suggestedGrams: VAGUE_GRAMS }] };
  }
  return { items: [...parse.items, { foodId, grams: g.grams, note: g.note, assumed: g.assumed }], issues };
}

/** El atleta dice cuántos gramos (o ml) eran. */
export function setIssueGrams(parse: MealParse, issueId: number, grams: number): MealParse {
  const issue = parse.issues.find((i) => i.id === issueId);
  if (!issue || issue.kind !== 'cantidad' || !Number.isFinite(grams) || grams <= 0) return parse;
  return { items: [...parse.items, { foodId: issue.foodId, grams: Math.round(grams) }], issues: parse.issues.filter((i) => i.id !== issueId) };
}

/** Quitar una duda sin apuntar nada de ella. */
export function dropIssue(parse: MealParse, issueId: number): MealParse {
  return { items: parse.items, issues: parse.issues.filter((i) => i.id !== issueId) };
}

/** Quitar un alimento ya entendido. */
export function dropItem(parse: MealParse, index: number): MealParse {
  return { items: parse.items.filter((_, i) => i !== index), issues: parse.issues };
}

/** Cambiar la cantidad de un alimento ya entendido. */
export function setItemGrams(parse: MealParse, index: number, grams: number): MealParse {
  return { items: parse.items.map((it, i) => (i === index ? { ...it, grams, assumed: false } : it)), issues: parse.issues };
}

/** Proteína e hidratos de los alimentos entendidos. */
export function mealTotals(items: MealItem[], resolve: (id: string) => Food | undefined): { protein: number; carbs: number } {
  let p = 0;
  let c = 0;
  for (const it of items) {
    const f = resolve(it.foodId);
    if (!f) continue;
    const m = macrosOf(f, it.grams);
    p += m.p;
    c += m.c;
  }
  return { protein: Math.round(p), carbs: Math.round(c) };
}
