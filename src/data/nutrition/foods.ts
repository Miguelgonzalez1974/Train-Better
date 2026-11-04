/**
 * Catálogo de alimentos para apuntar lo que comes. Valores por 100 g APROXIMADOS (USDA FoodData Central; varían con la
 * marca y la cocción). Carnes, pescados, arroz, pasta, patata, cuscús y avena van en CRUDO / seco; legumbres y fiambre,
 * tal como se compran. Son alimentos corrientes de supermercado — las cantidades las apunta el atleta
 * (`engine/mealBuilder.ts`).
 */

/** Grupo del selector donde aparece el alimento. */
export type FoodGroup = 'Proteína' | 'Hidrato' | 'Fruta' | 'Verdura' | 'Bebida' | 'Extra' | 'Plato';

export interface Food {
  id: string;
  name: string;
  group: FoodGroup;
  /** Gramos de proteína, carbohidrato y grasa por 100 g. */
  per100: { p: number; c: number; f: number };
  /** Si se cuenta por piezas (huevo, plátano, lata...). `grams` = peso medio de una pieza. */
  unit?: { grams: number; singular: string; plural: string };
  /** Ración con la que entra al apuntarlo de un toque (verdura, fruta, aceite), en gramos; por defecto, la pieza. */
  serving?: number;
  /** Si el alimento se cuenta por piezas y la ración de un toque es más de una (dátiles: 2). */
  servingUnits?: number;
  /** Rango habitual de gramos; marca el salto de los botones +/− (alimentos grandes saltan de 10 en 10). */
  range?: [number, number];
  /** Líquido: se cuenta en ml (grams = ml). */
  liquid?: boolean;
}
export const FOODS: Food[] = [
  // ---- proteína (crudo) ----
  { id: 'pollo', name: 'Pechuga de pollo', group: 'Proteína', per100: { p: 23, c: 0, f: 2 }, range: [80, 260] },
  { id: 'pavo', name: 'Pechuga de pavo', group: 'Proteína', per100: { p: 24, c: 0, f: 1.5 }, range: [80, 260] },
  { id: 'ternera', name: 'Ternera magra', group: 'Proteína', per100: { p: 21, c: 0, f: 4 }, range: [80, 260] },
  { id: 'lomo-cerdo', name: 'Lomo de cerdo', group: 'Proteína', per100: { p: 21, c: 0, f: 4 }, range: [80, 260] },
  { id: 'merluza', name: 'Merluza o bacalao (fresco o congelado)', group: 'Proteína', per100: { p: 17, c: 0, f: 1.5 }, range: [100, 320] },
  { id: 'salmon', name: 'Salmón', group: 'Proteína', per100: { p: 20, c: 0, f: 13 }, range: [90, 260] },
  {
    id: 'atun',
    name: 'Atún al natural',
    group: 'Proteína',
    per100: { p: 25, c: 0, f: 1 },
    unit: { grams: 56, singular: 'lata', plural: 'latas' },
    range: [56, 170],
  },
  { id: 'langostinos', name: 'Langostinos', group: 'Proteína', per100: { p: 20, c: 0.5, f: 0.6 }, range: [100, 300] },
  {
    id: 'sardinas',
    name: 'Sardinas en aceite (lata)',
    group: 'Proteína',
    per100: { p: 24, c: 0, f: 11 },
    unit: { grams: 85, singular: 'lata', plural: 'latas' },
    range: [85, 170],
  },
  {
    id: 'pollo-tiras',
    name: 'Tiras de pechuga de pollo (ya cocinadas)',
    group: 'Proteína',
    per100: { p: 24, c: 1, f: 1.5 },
    range: [80, 220],
  },
  {
    id: 'clara-huevo',
    name: 'Clara de huevo',
    group: 'Proteína',
    per100: { p: 10.9, c: 0.7, f: 0.2 },
    range: [100, 300],
    liquid: true,
  },
  {
    id: 'huevos',
    name: 'Huevos',
    group: 'Proteína',
    per100: { p: 12.6, c: 0.7, f: 9.5 },
    unit: { grams: 50, singular: 'huevo', plural: 'huevos' },
    range: [50, 250],
  },

  // ---- proteína: lácteos, fiambre y queso ----
  { id: 'skyr', name: 'Skyr o yogur proteico', group: 'Proteína', per100: { p: 11, c: 4, f: 0.2 }, range: [100, 300] },
  { id: 'queso-batido', name: 'Queso fresco batido 0 %', group: 'Proteína', per100: { p: 8, c: 4, f: 0.2 }, range: [100, 300] },
  { id: 'pavo-fiambre', name: 'Pavo o jamón cocido en lonchas', group: 'Proteína', per100: { p: 17, c: 1, f: 2 }, range: [30, 100] },
  { id: 'jamon-serrano', name: 'Jamón serrano', group: 'Proteína', per100: { p: 30, c: 0, f: 12 }, range: [30, 80] },
  { id: 'queso-cabra', name: 'Queso de cabra', group: 'Proteína', per100: { p: 18, c: 1, f: 21 }, range: [30, 80] },
  { id: 'cheddar', name: 'Queso cheddar', group: 'Proteína', per100: { p: 25, c: 1.3, f: 33 }, range: [20, 60] },
  { id: 'anchoas', name: 'Anchoas en aceite', group: 'Proteína', per100: { p: 25, c: 0, f: 10 }, range: [30, 60] },
  { id: 'bacon', name: 'Bacon en lonchas', group: 'Proteína', per100: { p: 15, c: 1, f: 30 }, range: [20, 60] },
  { id: 'cottage', name: 'Queso cottage', group: 'Proteína', per100: { p: 11, c: 3.5, f: 4 }, range: [100, 250] },
  {
    id: 'proteina-polvo',
    name: 'Proteína en polvo',
    group: 'Proteína',
    per100: { p: 73, c: 8, f: 5 },
    unit: { grams: 30, singular: 'cacito', plural: 'cacitos' },
    range: [30, 60],
  },

  // ---- hidrato: guarniciones (crudo / seco) ----
  { id: 'arroz', name: 'Arroz', group: 'Hidrato', per100: { p: 7, c: 80, f: 0.6 }, range: [40, 180] },
  { id: 'pasta', name: 'Pasta', group: 'Hidrato', per100: { p: 13, c: 75, f: 1.5 }, range: [40, 180] },
  { id: 'patata', name: 'Patata', group: 'Hidrato', per100: { p: 2, c: 17, f: 0.1 }, range: [200, 700] },
  { id: 'boniato', name: 'Boniato', group: 'Hidrato', per100: { p: 1.6, c: 20, f: 0.1 }, range: [200, 600] },
  { id: 'cuscus', name: 'Cuscús', group: 'Hidrato', per100: { p: 13, c: 77, f: 0.6 }, range: [40, 180] },
  { id: 'lentejas', name: 'Lentejas cocidas (bote)', group: 'Hidrato', per100: { p: 9, c: 20, f: 0.4 }, range: [150, 300] },
  { id: 'garbanzos', name: 'Garbanzos cocidos (bote)', group: 'Hidrato', per100: { p: 9, c: 27, f: 2.6 }, range: [120, 250] },
  { id: 'noquis', name: 'Ñoquis de patata', group: 'Hidrato', per100: { p: 3.5, c: 33, f: 0.5 }, range: [150, 400] },
  {
    id: 'mazorca',
    name: 'Mazorca de maíz (cocida)',
    group: 'Hidrato',
    per100: { p: 3.2, c: 19, f: 1.5 },
    unit: { grams: 150, singular: 'mazorca', plural: 'mazorcas' },
    range: [150, 450],
  },

  // ---- hidrato: avena, panes y galletas ----
  { id: 'avena', name: 'Copos de avena', group: 'Hidrato', per100: { p: 13, c: 66, f: 7 }, range: [30, 120] },
  { id: 'pan', name: 'Pan integral', group: 'Hidrato', per100: { p: 12, c: 42, f: 3 }, range: [30, 120] },
  {
    id: 'wasa',
    name: 'Pan Wasa',
    group: 'Hidrato',
    per100: { p: 10, c: 64, f: 2 },
    unit: { grams: 10, singular: 'tostada', plural: 'tostadas' },
    range: [20, 50],
  },
  {
    id: 'centeno',
    name: 'Pan de centeno',
    group: 'Hidrato',
    per100: { p: 8.5, c: 48, f: 1.7 },
    range: [30, 120],
  },
  {
    id: 'bimbo',
    name: 'Pan de molde integral (Bimbo)',
    group: 'Hidrato',
    per100: { p: 9, c: 42, f: 4 },
    unit: { grams: 25, singular: 'rebanada', plural: 'rebanadas' },
    range: [25, 100],
  },
  {
    id: 'galletas',
    name: 'Galletas integrales',
    group: 'Hidrato',
    per100: { p: 7, c: 68, f: 12 },
    unit: { grams: 7, singular: 'galleta', plural: 'galletas' },
    range: [14, 42],
  },
  {
    id: 'tortitas',
    name: 'Tortitas de arroz',
    group: 'Hidrato',
    per100: { p: 8, c: 80, f: 3 },
    unit: { grams: 9, singular: 'tortita', plural: 'tortitas' },
    range: [18, 45],
  },

  // ---- fruta (una pieza) ----
  { id: 'platano', name: 'Plátano', group: 'Fruta', per100: { p: 1.1, c: 23, f: 0.3 }, unit: { grams: 120, singular: 'plátano', plural: 'plátanos' } },
  { id: 'manzana', name: 'Manzana', group: 'Fruta', per100: { p: 0.3, c: 14, f: 0.2 }, unit: { grams: 180, singular: 'manzana', plural: 'manzanas' } },
  { id: 'naranja', name: 'Naranja o mandarinas', group: 'Fruta', per100: { p: 0.9, c: 12, f: 0.1 }, unit: { grams: 200, singular: 'naranja', plural: 'naranjas' } },
  { id: 'kiwi', name: 'Kiwi', group: 'Fruta', per100: { p: 1.1, c: 15, f: 0.5 }, unit: { grams: 75, singular: 'kiwi', plural: 'kiwis' } },
  {
    id: 'datiles',
    name: 'Dátiles',
    group: 'Fruta',
    per100: { p: 1.8, c: 75, f: 0.2 },
    unit: { grams: 24, singular: 'dátil', plural: 'dátiles' },
    servingUnits: 2,
  },
  { id: 'arandanos-secos', name: 'Arándanos deshidratados (Dia)', group: 'Fruta', per100: { p: 0.2, c: 80, f: 1 }, serving: 30 },
  { id: 'pina', name: 'Piña', group: 'Fruta', per100: { p: 0.5, c: 13, f: 0.1 }, serving: 150 },
  { id: 'uvas', name: 'Uvas', group: 'Fruta', per100: { p: 0.7, c: 17, f: 0.2 }, serving: 150 },

  // ---- verdura (un bol pequeño) ----
  { id: 'tomate', name: 'Tomate', group: 'Verdura', per100: { p: 0.9, c: 3.9, f: 0.2 }, serving: 150 },
  { id: 'ensalada-bolsa', name: 'Ensalada de bolsa', group: 'Verdura', per100: { p: 1.4, c: 3, f: 0.2 }, serving: 100 },
  { id: 'zanahoria', name: 'Zanahoria', group: 'Verdura', per100: { p: 0.9, c: 9.6, f: 0.2 }, serving: 100 },
  { id: 'pimiento', name: 'Pimiento', group: 'Verdura', per100: { p: 1, c: 6, f: 0.3 }, serving: 120 },
  { id: 'pepino', name: 'Pepino', group: 'Verdura', per100: { p: 0.7, c: 3.6, f: 0.1 }, serving: 150 },
  { id: 'judias-verdes', name: 'Judías verdes', group: 'Verdura', per100: { p: 1.8, c: 7, f: 0.2 }, serving: 150 },
  { id: 'brocoli', name: 'Brócoli', group: 'Verdura', per100: { p: 2.8, c: 7, f: 0.4 }, serving: 150 },
  { id: 'calabacin', name: 'Calabacín', group: 'Verdura', per100: { p: 1.2, c: 3, f: 0.3 }, serving: 150 },

  // ---- bebidas (líquidos: `grams` = ml) ----
  { id: 'cafe', name: 'Café solo', group: 'Bebida', per100: { p: 0, c: 0, f: 0 }, unit: { grams: 7, singular: 'taza', plural: 'tazas' } },
  { id: 'leche', name: 'Leche desnatada', group: 'Bebida', per100: { p: 3.4, c: 5, f: 0.1 }, serving: 250, liquid: true },
  { id: 'kefir', name: 'Kéfir', group: 'Bebida', per100: { p: 3.4, c: 4.5, f: 1 }, serving: 250, liquid: true },
  { id: 'infusion', name: 'Infusión (sin azúcar)', group: 'Bebida', per100: { p: 0, c: 0, f: 0 }, unit: { grams: 2, singular: 'infusión', plural: 'infusiones' } },
  { id: 'cafe-leche', name: 'Café con leche desnatada', group: 'Bebida', per100: { p: 3.4, c: 5, f: 0.1 }, serving: 200, liquid: true },

  // ---- extras (ración pequeña) ----
  { id: 'frutos-secos', name: 'Frutos secos al natural', group: 'Extra', per100: { p: 20, c: 12, f: 52 }, serving: 20 },
  { id: 'crema-cacahuete', name: 'Crema de cacahuete', group: 'Extra', per100: { p: 25, c: 20, f: 50 }, serving: 15 },
  { id: 'cacahuete-polvo', name: 'Cacahuete en polvo', group: 'Extra', per100: { p: 50, c: 25, f: 12 }, serving: 20 },
  { id: 'chocolate-negro', name: 'Chocolate negro (70 % o más)', group: 'Extra', per100: { p: 8, c: 46, f: 43 }, serving: 15 },
  { id: 'gelatina', name: 'Gelatina sin azúcar', group: 'Extra', per100: { p: 1.5, c: 0.5, f: 0 }, serving: 125 },
  { id: 'aceite', name: 'Aceite de oliva', group: 'Extra', per100: { p: 0, c: 0, f: 100 }, serving: 10 },

  { id: 'mermelada-light', name: 'Mermelada baja en azúcar', group: 'Extra', per100: { p: 0.3, c: 30, f: 0 }, serving: 20 },

  // ---- platos hechos (ración fija) ----
  {
    id: 'tortilla-patata',
    name: 'Tortilla de patata',
    group: 'Plato',
    per100: { p: 6, c: 11, f: 8 },
    serving: 200,
    range: [120, 200],
  },
  {
    id: 'pizza-casera',
    name: 'Pizza casera',
    group: 'Plato',
    per100: { p: 10, c: 30, f: 8 },
    serving: 300,
    range: [150, 300],
  },
];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string): Food | undefined {
  return BY_ID.get(id);
}
