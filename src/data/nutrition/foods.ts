/**
 * Catálogo de alimentos de los menús. Valores por 100 g APROXIMADOS (USDA FoodData Central; varían con la marca
 * y la cocción). Carnes, pescados, arroz, pasta, patata, cuscús y avena van en CRUDO / seco (lo que se pesa al
 * comprar y al cocinar en tanda); legumbres y fiambre, tal como se compran. Son alimentos corrientes, de
 * supermercado y de cocina fácil — el motor (`engine/mealPlan.ts`) decide cuánto de cada uno.
 */

/** Hueco que un alimento puede ocupar en una comida. */
export type FoodRole =
  | 'proteinMain' // proteína de comida/cena
  | 'proteinBreakfast'
  | 'proteinLight' // proteína de media mañana (lácteo)
  | 'proteinSnack' // proteína de merienda (bocadillo)
  | 'carbMain' // hidrato de comida/cena
  | 'carbBreakfast'
  | 'carbSnack' // hidrato de merienda
  | 'fruit'
  | 'fruitPre' // fruta de fácil digestión, para la toma previa al entreno
  | 'veg'
  | 'fat';

export type ShoppingCategory = 'proteinas' | 'lacteos' | 'hidratos' | 'fruta' | 'verdura' | 'despensa';

export const SHOPPING_CATEGORY_LABEL: Record<ShoppingCategory, string> = {
  proteinas: 'Carne, pescado y fiambre',
  lacteos: 'Huevos y lácteos',
  hidratos: 'Arroz, pasta, pan y patata',
  fruta: 'Fruta',
  verdura: 'Verdura',
  despensa: 'Despensa',
};

export const SHOPPING_CATEGORY_ORDER: ShoppingCategory[] = ['proteinas', 'lacteos', 'hidratos', 'fruta', 'verdura', 'despensa'];

/** Etiquetas para excluir de golpe una familia entera (p. ej. "no tomo lácteos"). */
export type FoodTag = 'lacteo' | 'pescado' | 'carne' | 'huevo' | 'gluten';

export const FOOD_TAG_LABEL: Record<FoodTag, string> = {
  lacteo: 'Lácteos',
  pescado: 'Pescado',
  carne: 'Carne',
  huevo: 'Huevos',
  gluten: 'Gluten',
};

export interface Food {
  id: string;
  name: string;
  roles: FoodRole[];
  category: ShoppingCategory;
  /** Gramos de proteína, carbohidrato y grasa por 100 g. */
  per100: { p: number; c: number; f: number };
  /** Si se cuenta por piezas (huevo, plátano, lata...). `grams` = peso medio de una pieza. */
  unit?: { grams: number; singular: string; plural: string };
  /** Ración fija (verdura, fruta, aceite): el motor no la ajusta, solo la pone. En gramos; por defecto, la pieza. */
  serving?: number;
  /** Rango razonable de gramos cuando es el alimento que el motor dimensiona (proteína o hidrato principal de la toma). */
  range?: [number, number];
  tags?: FoodTag[];
  /** Solo se ofrece al cambiar a mano; la rotación automática de los menús no lo elige (p. ej. la proteína en polvo). */
  manualOnly?: boolean;
}

export const FOODS: Food[] = [
  // ---- proteína de comida y cena (crudo) ----
  { id: 'pollo', name: 'Pechuga de pollo', roles: ['proteinMain'], category: 'proteinas', per100: { p: 23, c: 0, f: 2 }, range: [80, 260], tags: ['carne'] },
  { id: 'pavo', name: 'Pechuga de pavo', roles: ['proteinMain'], category: 'proteinas', per100: { p: 24, c: 0, f: 1.5 }, range: [80, 260], tags: ['carne'] },
  { id: 'ternera', name: 'Ternera magra', roles: ['proteinMain'], category: 'proteinas', per100: { p: 21, c: 0, f: 4 }, range: [80, 260], tags: ['carne'] },
  { id: 'lomo-cerdo', name: 'Lomo de cerdo', roles: ['proteinMain'], category: 'proteinas', per100: { p: 21, c: 0, f: 4 }, range: [80, 260], tags: ['carne'] },
  { id: 'merluza', name: 'Merluza o bacalao', roles: ['proteinMain'], category: 'proteinas', per100: { p: 17, c: 0, f: 1.5 }, range: [100, 320], tags: ['pescado'] },
  { id: 'salmon', name: 'Salmón', roles: ['proteinMain'], category: 'proteinas', per100: { p: 20, c: 0, f: 13 }, range: [90, 260], tags: ['pescado'] },
  {
    id: 'atun',
    name: 'Atún al natural',
    roles: ['proteinSnack'],
    category: 'proteinas',
    per100: { p: 25, c: 0, f: 1 },
    unit: { grams: 56, singular: 'lata', plural: 'latas' },
    range: [56, 170],
    tags: ['pescado'],
  },
  {
    id: 'huevos',
    name: 'Huevos',
    roles: ['proteinMain', 'proteinBreakfast'],
    category: 'lacteos',
    per100: { p: 12.6, c: 0.7, f: 9.5 },
    unit: { grams: 50, singular: 'huevo', plural: 'huevos' },
    range: [50, 250],
    tags: ['huevo'],
  },

  // ---- proteína de desayuno, media mañana y merienda ----
  { id: 'skyr', name: 'Skyr o yogur proteico', roles: ['proteinBreakfast', 'proteinLight', 'proteinSnack'], category: 'lacteos', per100: { p: 11, c: 4, f: 0.2 }, range: [100, 450], tags: ['lacteo'] },
  { id: 'queso-batido', name: 'Queso fresco batido 0 %', roles: ['proteinBreakfast', 'proteinLight', 'proteinSnack'], category: 'lacteos', per100: { p: 8, c: 4, f: 0.2 }, range: [100, 450], tags: ['lacteo'] },
  { id: 'pavo-fiambre', name: 'Pavo o jamón cocido en lonchas', roles: ['proteinBreakfast', 'proteinSnack'], category: 'proteinas', per100: { p: 17, c: 1, f: 2 }, range: [30, 150], tags: ['carne'] },
  {
    id: 'proteina-polvo',
    name: 'Proteína en polvo',
    roles: ['proteinBreakfast', 'proteinLight', 'proteinSnack'],
    category: 'despensa',
    per100: { p: 73, c: 8, f: 5 },
    unit: { grams: 30, singular: 'cacito', plural: 'cacitos' },
    range: [30, 60],
    tags: ['lacteo'],
    manualOnly: true,
  },

  // ---- hidrato de comida y cena (crudo / seco) ----
  { id: 'arroz', name: 'Arroz', roles: ['carbMain'], category: 'hidratos', per100: { p: 7, c: 80, f: 0.6 }, range: [40, 180] },
  { id: 'pasta', name: 'Pasta', roles: ['carbMain'], category: 'hidratos', per100: { p: 13, c: 75, f: 1.5 }, range: [40, 180], tags: ['gluten'] },
  { id: 'patata', name: 'Patata', roles: ['carbMain'], category: 'hidratos', per100: { p: 2, c: 17, f: 0.1 }, range: [200, 700] },
  { id: 'boniato', name: 'Boniato', roles: ['carbMain'], category: 'hidratos', per100: { p: 1.6, c: 20, f: 0.1 }, range: [200, 600] },
  { id: 'cuscus', name: 'Cuscús', roles: ['carbMain'], category: 'hidratos', per100: { p: 13, c: 77, f: 0.6 }, range: [40, 180], tags: ['gluten'] },
  { id: 'lentejas', name: 'Lentejas cocidas (bote)', roles: ['carbMain'], category: 'hidratos', per100: { p: 9, c: 20, f: 0.4 }, range: [150, 300] },
  { id: 'garbanzos', name: 'Garbanzos cocidos (bote)', roles: ['carbMain'], category: 'hidratos', per100: { p: 9, c: 27, f: 2.6 }, range: [120, 250] },

  // ---- hidrato de desayuno y merienda ----
  { id: 'avena', name: 'Copos de avena', roles: ['carbBreakfast'], category: 'hidratos', per100: { p: 13, c: 66, f: 7 }, range: [30, 170] },
  { id: 'pan', name: 'Pan integral', roles: ['carbBreakfast', 'carbSnack'], category: 'hidratos', per100: { p: 12, c: 42, f: 3 }, range: [30, 200], tags: ['gluten'] },
  {
    id: 'tortitas',
    name: 'Tortitas de arroz',
    roles: ['carbBreakfast', 'carbSnack'],
    category: 'hidratos',
    per100: { p: 8, c: 80, f: 3 },
    unit: { grams: 9, singular: 'tortita', plural: 'tortitas' },
    range: [18, 117],
  },

  // ---- fruta (una pieza) ----
  { id: 'platano', name: 'Plátano', roles: ['fruit', 'fruitPre'], category: 'fruta', per100: { p: 1.1, c: 23, f: 0.3 }, unit: { grams: 120, singular: 'plátano', plural: 'plátanos' } },
  { id: 'manzana', name: 'Manzana', roles: ['fruit'], category: 'fruta', per100: { p: 0.3, c: 14, f: 0.2 }, unit: { grams: 180, singular: 'manzana', plural: 'manzanas' } },
  { id: 'naranja', name: 'Naranja o mandarinas', roles: ['fruit'], category: 'fruta', per100: { p: 0.9, c: 12, f: 0.1 }, unit: { grams: 200, singular: 'naranja', plural: 'naranjas' } },
  { id: 'kiwi', name: 'Kiwi', roles: ['fruit'], category: 'fruta', per100: { p: 1.1, c: 15, f: 0.5 }, unit: { grams: 75, singular: 'kiwi', plural: 'kiwis' } },
  { id: 'uvas', name: 'Uvas', roles: ['fruit', 'fruitPre'], category: 'fruta', per100: { p: 0.7, c: 17, f: 0.2 }, serving: 150 },

  // ---- verdura (un bol pequeño; lo más fácil de preparar) ----
  { id: 'tomate', name: 'Tomate', roles: ['veg'], category: 'verdura', per100: { p: 0.9, c: 3.9, f: 0.2 }, serving: 150 },
  { id: 'ensalada-bolsa', name: 'Ensalada de bolsa', roles: ['veg'], category: 'verdura', per100: { p: 1.4, c: 3, f: 0.2 }, serving: 100 },
  { id: 'zanahoria', name: 'Zanahoria', roles: ['veg'], category: 'verdura', per100: { p: 0.9, c: 9.6, f: 0.2 }, serving: 100 },
  { id: 'pimiento', name: 'Pimiento', roles: ['veg'], category: 'verdura', per100: { p: 1, c: 6, f: 0.3 }, serving: 120 },
  { id: 'pepino', name: 'Pepino', roles: ['veg'], category: 'verdura', per100: { p: 0.7, c: 3.6, f: 0.1 }, serving: 150 },
  { id: 'judias-verdes', name: 'Judías verdes', roles: ['veg'], category: 'verdura', per100: { p: 1.8, c: 7, f: 0.2 }, serving: 150 },
  { id: 'brocoli', name: 'Brócoli', roles: ['veg'], category: 'verdura', per100: { p: 2.8, c: 7, f: 0.4 }, serving: 150 },
  { id: 'calabacin', name: 'Calabacín', roles: ['veg'], category: 'verdura', per100: { p: 1.2, c: 3, f: 0.3 }, serving: 150 },

  // ---- grasa ----
  { id: 'aceite', name: 'Aceite de oliva', roles: ['fat'], category: 'despensa', per100: { p: 0, c: 0, f: 100 }, serving: 10 },
];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string): Food | undefined {
  return BY_ID.get(id);
}

/** Alimentos que pueden ocupar un hueco, en el orden del catálogo. */
export function foodsForRole(role: FoodRole): Food[] {
  return FOODS.filter((f) => f.roles.includes(role));
}




