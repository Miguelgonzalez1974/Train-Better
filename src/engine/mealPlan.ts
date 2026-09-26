import { FOODS, foodsForRole, getFood, SHOPPING_CATEGORY_LABEL, SHOPPING_CATEGORY_ORDER, type Food, type FoodRole, type ShoppingCategory } from '../data/nutrition/foods';
import { FIST_CARB_G, nutritionForDay, PALM_PROTEIN_G, type DayNutrition, type NutritionDayType } from './nutritionPlan';

/**
 * Menús del día: reparte la proteína y el hidrato del día (`nutritionForDay`, mismas cifras que el resto de la
 * app) en 5 comidas alrededor de la hora de entreno, y elige alimentos corrientes del catálogo con la cantidad
 * exacta para llegar a cada toma. Sin recetas: proteína + hidrato + (fruta o verdura) + aceite.
 *
 * Es ORIENTATIVO, igual que `nutritionPlan.ts`: las cifras por alimento son aproximadas (USDA) y la grasa y las
 * calorías totales no se calculan ni se controlan aquí. La rotación de alimentos es determinista (misma fecha =
 * mismo menú) para que la lista de la compra no cambie de un día para otro.
 */

export type MealKey = 'desayuno' | 'mediaManana' | 'comida' | 'merienda' | 'cena';
export const MEAL_ORDER: MealKey[] = ['desayuno', 'mediaManana', 'comida', 'merienda', 'cena'];
export const MEAL_LABEL: Record<MealKey, string> = {
  desayuno: 'Desayuno',
  mediaManana: 'Media mañana',
  comida: 'Comida',
  merienda: 'Merienda',
  cena: 'Cena',
};

export type SlotKind = 'protein' | 'protein2' | 'carb' | 'carb2' | 'fruit' | 'veg' | 'fat' | 'drink' | 'extra' | 'spread';

export const TRAINING_HOUR_OPTIONS = [10, 16, 17] as const;

/** Hora de entreno por defecto según el día de la semana (lunes = 0): sábado 10:00, el resto 16:00. */
export function defaultTrainingHour(weekdayIndex: number): number {
  return weekdayIndex === 5 ? 10 : 16;
}

// ---------- Horario y reparto ----------

interface MealTiming {
  time: string;
  /** Cuándo cae respecto al entreno ('' = sin relación especial). */
  tag: string;
  /** Toma previa al entreno: fruta de fácil digestión y sin grasa. */
  pre: boolean;
}

function fmtTime(minutes: number): string {
  const m = ((Math.round(minutes / 15) * 15) % 1440 + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Horario de las 5 comidas: por la tarde (desde las 13:00) o por la mañana, y sin entreno. */
export function mealTimings(dayType: NutritionDayType, trainingHour: number): Record<MealKey, MealTiming> {
  if (dayType === 'descanso') {
    return {
      desayuno: { time: '08:00', tag: '', pre: false },
      mediaManana: { time: '11:00', tag: '', pre: false },
      comida: { time: '14:00', tag: '', pre: false },
      merienda: { time: '17:00', tag: '', pre: false },
      cena: { time: '21:00', tag: '', pre: false },
    };
  }
  if (trainingHour < 13) {
    return {
      desayuno: { time: fmtTime((trainingHour - 2.5) * 60), tag: '2-3 h antes', pre: true },
      mediaManana: { time: fmtTime((trainingHour - 1) * 60), tag: '1 h antes', pre: true },
      comida: { time: fmtTime((trainingHour + 3) * 60), tag: 'post-entreno', pre: false },
      merienda: { time: '17:00', tag: '', pre: false },
      cena: { time: '21:00', tag: '', pre: false },
    };
  }
  return {
    desayuno: { time: '08:00', tag: '', pre: false },
    mediaManana: { time: '11:00', tag: '', pre: false },
    comida: { time: '13:30', tag: 'comida previa', pre: false },
    merienda: { time: fmtTime((trainingHour - 1) * 60), tag: '1 h antes', pre: true },
    cena: { time: '21:30', tag: 'post-entreno', pre: false },
  };
}

/** Reparto de la proteína y el hidrato del día entre las 5 comidas (cada fila suma 1). */
const SHAPES: Record<'descanso' | 'tarde' | 'manana', { p: number[]; c: number[] }> = {
  descanso: { p: [0.22, 0.13, 0.27, 0.13, 0.25], c: [0.22, 0.12, 0.28, 0.13, 0.25] },
  tarde: { p: [0.22, 0.13, 0.27, 0.1, 0.28], c: [0.2, 0.1, 0.28, 0.17, 0.25] },
  manana: { p: [0.15, 0.08, 0.32, 0.15, 0.3], c: [0.17, 0.1, 0.33, 0.15, 0.25] },
};

function shapeFor(dayType: NutritionDayType, trainingHour: number) {
  if (dayType === 'descanso') return SHAPES.descanso;
  return trainingHour < 13 ? SHAPES.manana : SHAPES.tarde;
}

// ---------- Huecos de cada comida ----------

interface SlotDef {
  kind: SlotKind;
  role: FoodRole;
}

function slotsFor(meal: MealKey, pre: boolean): SlotDef[] {
  const fruit: SlotDef = { kind: 'fruit', role: pre ? 'fruitPre' : 'fruit' };
  switch (meal) {
    case 'desayuno':
      return [
        { kind: 'protein', role: 'proteinBreakfast' },
        { kind: 'carb', role: 'carbBreakfast' },
        fruit,
        { kind: 'drink', role: 'drink' },
      ];
    case 'mediaManana':
      // Frutos secos o chocolate solo si la toma no es previa al entreno: la grasa digiere despacio.
      return [{ kind: 'protein', role: 'proteinLight' }, fruit, ...(pre ? [] : [{ kind: 'extra', role: 'extra' } as SlotDef])];
    case 'merienda':
      return [{ kind: 'protein', role: 'proteinSnack' }, { kind: 'carb', role: 'carbSnack' }, fruit];
    case 'comida':
    case 'cena':
      return [
        { kind: 'protein', role: 'proteinMain' },
        { kind: 'carb', role: 'carbMain' },
        { kind: 'veg', role: 'veg' },
        { kind: 'fat', role: 'fat' },
      ];
  }
}

/** Comida con un plato hecho (tortilla, pizza): el plato lleva la ración fija y la toma se completa con proteína, hidrato y verdura si hace falta. */
const DISH_SLOTS: SlotDef[] = [
  { kind: 'protein', role: 'proteinMain' },
  { kind: 'protein2', role: 'proteinSnack' },
  { kind: 'carb', role: 'carbSnack' },
  { kind: 'veg', role: 'veg' },
];

/** Cada cuántos días cambia el alimento de una comida: comida y cena rotan cada 2 días (se cocina en tanda para el táper). */
const ROTATION_STEP: Record<MealKey, number> = { desayuno: 1, mediaManana: 1, comida: 2, merienda: 1, cena: 2 };

export function swapKey(date: string, meal: MealKey, kind: SlotKind): string {
  return `${date}|${meal}|${kind}`;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function seedOf(text: string): number {
  return [...text].reduce((s, ch) => s + ch.charCodeAt(0), 0);
}

// ---------- Plan del día ----------

export interface MealPrefs {
  excludedFoodIds?: string[];
  swaps?: Record<string, string>;
}

export interface MealPlanInput {
  date: string;
  dayType: NutritionDayType;
  weightKg: number;
  trainingHour: number;
  prefs?: MealPrefs;
}

export interface PlannedItem {
  kind: SlotKind;
  role: FoodRole;
  foodId: string;
  name: string;
  grams: number;
  /** Piezas, si el alimento se cuenta así (huevos, plátano, latas...). */
  units?: number;
  /** Cantidad lista para leer: "2 huevos", "120 g", "1 cucharada (10 ml)". */
  quantity: string;
  swapKey: string;
  /** Plato hecho (tortilla, pizza) en lugar de una proteína suelta. */
  dish?: boolean;
}

export interface PlannedMeal {
  key: MealKey;
  label: string;
  time: string;
  tag: string;
  pre: boolean;
  items: PlannedItem[];
  protein: number;
  carbs: number;
  /** Palmas de proteína y puños de hidrato que equivale la toma (mano del atleta, aproximado). */
  palms: number;
  fists: number;
}

export interface DayMealPlan {
  date: string;
  dayType: NutritionDayType;
  trainingHour: number;
  weightKg: number;
  target: DayNutrition;
  meals: PlannedMeal[];
  totals: { protein: number; carbs: number };
}

function excludedSet(prefs?: MealPrefs): Set<string> {
  return new Set(prefs?.excludedFoodIds ?? []);
}

/**
 * Alimentos disponibles para un hueco (sin los excluidos), en el orden del catálogo. La rotación automática no
 * usa los `manualOnly` (proteína en polvo...); la lista de cambios sí (`includeManual`).
 */
export function poolForRole(role: FoodRole, excluded: Set<string> | string[] = [], includeManual = false): Food[] {
  const ex = excluded instanceof Set ? excluded : new Set(excluded);
  return foodsForRole(role).filter((f) => !ex.has(f.id) && (includeManual || !f.manualOnly));
}

function macrosOf(food: Food, grams: number): { p: number; c: number } {
  return { p: (food.per100.p * grams) / 100, c: (food.per100.c * grams) / 100 };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Cantidad ya redondeada a algo que se pueda pesar (5 g, o piezas enteras). */
function toPortion(food: Food, grams: number): { grams: number; units?: number } {
  const [lo, hi] = food.range ?? [0, Infinity];
  const g = clamp(grams, lo, hi);
  if (food.unit) {
    const units = Math.max(1, Math.round(g / food.unit.grams));
    return { grams: units * food.unit.grams, units };
  }
  return { grams: Math.max(5, Math.round(g / 5) * 5) };
}

function quantityText(food: Food, grams: number, units?: number): string {
  if (food.id === 'aceite') return '1 cucharada (10 ml)';
  if (food.unit && units != null) return `${units} ${units === 1 ? food.unit.singular : food.unit.plural}`;
  if (food.liquid) return `${grams} ml`;
  return `${grams} g`;
}

function halfSteps(x: number): number {
  return Math.max(0.5, Math.round(x * 2) / 2);
}

/** Alimento fijo (fruta, verdura, aceite): una pieza o la ración del catálogo. */
function fixedPortion(food: Food): { grams: number; units?: number } {
  if (food.unit) {
    const units = food.servingUnits ?? 1;
    return { grams: food.unit.grams * units, units };
  }
  return { grams: food.serving ?? 100 };
}

export function planDayMeals(input: MealPlanInput): DayMealPlan {
  const { date, dayType, weightKg, trainingHour } = input;
  const excluded = excludedSet(input.prefs);
  const swaps = input.prefs?.swaps ?? {};
  const target = nutritionForDay(dayType, weightKg);
  const proteinMid = (target.proteinG.min + target.proteinG.max) / 2;
  const carbsMid = (target.carbsG.min + target.carbsG.max) / 2;
  const shape = shapeFor(dayType, trainingHour);
  const timings = mealTimings(dayType, trainingHour);
  const dayNum = dayNumber(date);

  // Alimentos ya elegidos hoy por tipo de hueco: la rotación no repite proteína, hidrato ni fruta entre comidas del mismo día.
  const usedToday: Record<string, Set<string>> = { protein: new Set(), carb: new Set(), fruit: new Set() };

  // Plato hecho (tortilla, pizza): sale por rotación (la cena una vez por semana, la comida cada dos) o si el atleta lo elige a mano.
  let dishUsed = false;
  function pickDish(meal: MealKey): Food | undefined {
    if (meal !== 'comida' && meal !== 'cena') return undefined;
    const chosenByAthlete = swaps[swapKey(date, meal, 'protein')];
    if (chosenByAthlete) {
      const f = getFood(chosenByAthlete);
      return f?.dish && !excluded.has(f.id) ? f : undefined;
    }
    if (dishUsed) return undefined;
    const dishes = poolForRole('proteinMain', excluded).filter((f) => f.dish);
    if (dishes.length === 0) return undefined;
    const period = meal === 'cena' ? 7 : 14;
    if ((dayNum + seedOf(`${meal}dish`)) % period !== 0) return undefined;
    return dishes[Math.floor(dayNum / period) % dishes.length];
  }

  const meals: PlannedMeal[] = MEAL_ORDER.map((meal, mi) => {
    const timing = timings[meal];
    /** Segundo alimento de un hueco (el elegido a mano, o el siguiente de la rotación que no se haya usado hoy). */
    const secondFood = (role: FoodRole, used: Set<string>, primaryId: string, kind: SlotKind): Food | undefined => {
      const requested = getFood(swaps[swapKey(date, meal, kind)] ?? '');
      if (requested && requested.roles.includes(role) && !excluded.has(requested.id) && requested.id !== primaryId) return requested;
      const pool = poolForRole(role, excluded).filter((f) => f.id !== primaryId && !used.has(f.id) && !f.dish);
      if (pool.length === 0) return undefined;
      return pool[(Math.floor(dayNum / ROTATION_STEP[meal]) + seedOf(`${meal}${kind}`)) % pool.length];
    };
    const dishFood = pickDish(meal);
    const slots = dishFood ? DISH_SLOTS : slotsFor(meal, timing.pre);

    // 1) Elegir el alimento de cada hueco: el cambio manual si lo hay, o la rotación del día.
    const foods = new Map<SlotKind, Food>();
    for (const slot of slots) {
      if (dishFood && slot.kind === 'protein') {
        foods.set('protein', dishFood);
        usedToday.protein.add(dishFood.id);
        dishUsed = true;
        continue;
      }
      // Los platos hechos no entran en la rotación normal de proteína: solo por `pickDish`.
      const pool = poolForRole(slot.role, excluded).filter((f) => !(slot.kind === 'protein' && f.dish));
      if (pool.length === 0) continue;
      const swapped = getFood(swaps[swapKey(date, meal, slot.kind)] ?? '');
      let food: Food | undefined = swapped && swapped.roles.includes(slot.role) && !excluded.has(swapped.id) ? swapped : undefined;
      if (!food) {
        const seed = seedOf(`${meal}${slot.kind}`);
        const used = usedToday[slot.kind === 'protein2' ? 'protein' : slot.kind];
        const start = (Math.floor(dayNum / ROTATION_STEP[meal]) + seed) % pool.length;
        food = pool[start];
        for (let step = 0; used && step < pool.length; step++) {
          const candidate = pool[(start + step) % pool.length];
          if (!used.has(candidate.id)) {
            food = candidate;
            break;
          }
        }
      }
      foods.set(slot.kind, food);
      usedToday[slot.kind === 'protein2' ? 'protein' : slot.kind]?.add(food.id);
    }

    // Pan, tostadas o tortitas en el desayuno o la merienda: algo para untar (mermelada, crema de cacahuete).
    const breadCarb = foods.get('carb');
    if (breadCarb?.spreadable && (meal === 'desayuno' || meal === 'merienda')) {
      const requested = getFood(swaps[swapKey(date, meal, 'spread')] ?? '');
      const spreads = poolForRole('spread', excluded);
      const spread =
        requested && requested.roles.includes('spread') && !excluded.has(requested.id)
          ? requested
          : spreads.length > 0
            ? spreads[(Math.floor(dayNum / ROTATION_STEP[meal]) + seedOf(`${meal}spread`)) % spreads.length]
            : undefined;
      if (spread) foods.set('spread', spread);
    }

    // 2) Cantidades: primero lo fijo (fruta, verdura, aceite), luego el hidrato hasta el objetivo de la toma, y la proteína al final.
    const pTarget = proteinMid * shape.p[mi];
    const cTarget = carbsMid * shape.c[mi];
    const portions = new Map<SlotKind, { grams: number; units?: number }>();
    let p = 0;
    let c = 0;
    for (const kind of ['fruit', 'veg', 'fat', 'drink', 'extra', 'spread'] as SlotKind[]) {
      const food = foods.get(kind);
      if (!food) continue;
      const portion = fixedPortion(food);
      portions.set(kind, portion);
      const m = macrosOf(food, portion.grams);
      p += m.p;
      c += m.c;
    }
    if (dishFood) {
      // El plato lleva su ración (serving) como máximo y se reduce si la toma ya se cubre con menos (pizza en un día ligero).
      const portion = toPortion(dishFood, ((cTarget - c) / Math.max(1, dishFood.per100.c)) * 100);
      portions.set('protein', portion);
      const m = macrosOf(dishFood, portion.grams);
      p += m.p;
      c += m.c;
    }
    let carb = foods.get('carb');
    // Con plato hecho, el hidrato de acompañamiento (pan) solo va si el plato deja la toma corta.
    if (carb && dishFood && cTarget - c < 15) {
      foods.delete('carb');
      carb = undefined;
    }
    if (carb) {
      let portion = toPortion(carb, ((cTarget - c) / carb.per100.c) * 100);
      // Un hidrato "flojo" (legumbre en bote) puede quedarse corto aun en su ración máxima: si el atleta no lo
      // eligió a mano, se prueba con otro del mismo hueco para no dejar la toma sin llegar.
      const carbSlot = slots.find((s) => s.kind === 'carb');
      const manual = Boolean(swaps[swapKey(date, meal, 'carb')]);
      if (!manual && carbSlot && macrosOf(carb, portion.grams).c < (cTarget - c) * 0.85) {
        const better = poolForRole(carbSlot.role, excluded)
          .filter((f) => f.id !== carb!.id && !usedToday.carb.has(f.id))
          .map((f) => ({ f, portion: toPortion(f, ((cTarget - c) / f.per100.c) * 100) }))
          .find((x) => macrosOf(x.f, x.portion.grams).c >= (cTarget - c) * 0.85);
        if (better) {
          usedToday.carb.delete(carb.id);
          usedToday.carb.add(better.f.id);
          carb = better.f;
          foods.set('carb', carb);
          portion = better.portion;
        }
      }
      portions.set('carb', portion);
      const m = macrosOf(carb, portion.grams);
      p += m.p;
      c += m.c;
      // Si el hidrato llegó a su ración máxima y la toma sigue corta, se suma un segundo (p. ej. pan tras las tortitas)
      // en vez de inflar el primero: 8 tortitas o 9 tostadas no son una ración.
      if (carbSlot && cTarget - c >= 20) {
        const second = secondFood(carbSlot.role, usedToday.carb, carb.id, 'carb2');
        if (second) {
          const extraPortion = toPortion(second, ((cTarget - c) / second.per100.c) * 100);
          foods.set('carb2', second);
          portions.set('carb2', extraPortion);
          usedToday.carb.add(second.id);
          const m2 = macrosOf(second, extraPortion.grams);
          p += m2.p;
          c += m2.c;
        }
      }
    }
    // Con plato hecho, la proteína "de complemento" (lata de atún, lonchas...) solo va si la toma queda corta.
    const proteinKind: SlotKind = dishFood ? 'protein2' : 'protein';
    if (dishFood && pTarget - p < 8) foods.delete('protein2');
    const protein = foods.get(proteinKind);
    if (protein) {
      const portion = toPortion(protein, ((pTarget - p) / protein.per100.p) * 100);
      portions.set(proteinKind, portion);
      const m = macrosOf(protein, portion.grams);
      p += m.p;
      c += m.c;
      // Igual con la proteína: si la principal llegó a su ración máxima y falta bastante, se suma una segunda.
      const proteinSlot = slots.find((s) => s.kind === 'protein');
      if (!dishFood && proteinSlot && pTarget - p >= 10) {
        const second = secondFood(proteinSlot.role, usedToday.protein, protein.id, 'protein2');
        if (second) {
          const extraPortion = toPortion(second, ((pTarget - p) / second.per100.p) * 100);
          foods.set('protein2', second);
          portions.set('protein2', extraPortion);
          usedToday.protein.add(second.id);
          const m2 = macrosOf(second, extraPortion.grams);
          p += m2.p;
          c += m2.c;
        }
      }
    }

    // Los segundos alimentos (hidrato o proteína) se muestran justo detrás del principal.
    const outSlots: SlotDef[] = slots.flatMap((s) => {
      const list: SlotDef[] = [s];
      if (s.kind === 'carb' && foods.has('carb2')) list.push({ kind: 'carb2', role: s.role });
      if (s.kind === 'carb' && foods.has('spread')) list.push({ kind: 'spread', role: 'spread' });
      if (s.kind === 'protein' && !dishFood && foods.has('protein2')) list.push({ kind: 'protein2', role: s.role });
      return list;
    });

    const items: PlannedItem[] = outSlots.flatMap((slot) => {
      const food = foods.get(slot.kind);
      const portion = portions.get(slot.kind);
      if (!food || !portion) return [];
      return [
        {
          kind: slot.kind,
          role: slot.role,
          foodId: food.id,
          name: food.name,
          grams: portion.grams,
          units: portion.units,
          quantity: quantityText(food, portion.grams, portion.units),
          swapKey: swapKey(date, meal, slot.kind),
          dish: food.dish || undefined,
        },
      ];
    });

    return {
      key: meal,
      label: MEAL_LABEL[meal],
      time: timing.time,
      tag: timing.tag,
      pre: timing.pre,
      items,
      protein: Math.round(p),
      carbs: Math.round(c),
      palms: halfSteps(p / PALM_PROTEIN_G),
      fists: halfSteps(c / FIST_CARB_G),
    };
  });

  return {
    date,
    dayType,
    trainingHour,
    weightKg,
    target,
    meals,
    totals: { protein: meals.reduce((s, m) => s + m.protein, 0), carbs: meals.reduce((s, m) => s + m.carbs, 0) },
  };
}

/**
 * Cómo quedaría una toma si se cambiase un alimento: cantidad recalculada con el resto de la toma igual.
 * Devuelve `null` si el hueco no existe en ese día.
 */
export function previewSwap(input: MealPlanInput, meal: MealKey, kind: SlotKind, foodId: string): PlannedItem | null {
  const swaps = { ...(input.prefs?.swaps ?? {}), [swapKey(input.date, meal, kind)]: foodId };
  const plan = planDayMeals({ ...input, prefs: { ...input.prefs, swaps } });
  return plan.meals.find((m) => m.key === meal)?.items.find((i) => i.kind === kind) ?? null;
}

// ---------- Lista de la compra ----------

export interface ShoppingLine {
  foodId: string;
  name: string;
  grams: number;
  /** Cantidad a comprar, ya redondeada hacia arriba: "1,2 kg", "12 huevos (1 docena)". */
  text: string;
}

export interface ShoppingGroup {
  category: ShoppingCategory;
  label: string;
  lines: ShoppingLine[];
}

function formatPurchase(food: Food, grams: number): string {
  if (food.id === 'huevos') {
    const n = Math.round(grams / (food.unit?.grams ?? 50));
    const dozens = Math.ceil(n / 12);
    return `${n} huevos (${dozens} ${dozens === 1 ? 'docena' : 'docenas'})`;
  }
  if (food.unit) {
    const n = Math.round(grams / food.unit.grams);
    return `${n} ${n === 1 ? food.unit.singular : food.unit.plural}`;
  }
  if (food.id === 'aceite') return `${Math.round(grams)} ml`;
  if (food.liquid) return grams >= 1000 ? `${(Math.ceil(grams / 100) / 10).toFixed(1).replace('.', ',')} L` : `${Math.ceil(grams / 50) * 50} ml`;
  if (grams >= 1000) return `${(Math.ceil(grams / 100) / 10).toFixed(1).replace('.', ',')} kg`;
  return `${Math.ceil(grams / 50) * 50} g`;
}

/** Suma los alimentos de varios días y los agrupa por sección del supermercado. */
export function buildShoppingList(plans: DayMealPlan[]): ShoppingGroup[] {
  const totals = new Map<string, number>();
  for (const plan of plans) {
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        const recipe = getFood(item.foodId)?.recipe;
        // Un plato hecho se compra por ingredientes (tortilla = huevos + patata + cebolla + aceite).
        const parts = recipe ? recipe.map((r) => ({ id: r.foodId, grams: (item.grams * r.per100) / 100 })) : [{ id: item.foodId, grams: item.grams }];
        for (const part of parts) totals.set(part.id, (totals.get(part.id) ?? 0) + part.grams);
      }
    }
  }
  const groups: ShoppingGroup[] = [];
  for (const category of SHOPPING_CATEGORY_ORDER) {
    const lines: ShoppingLine[] = FOODS.filter((f) => f.category === category && totals.has(f.id)).map((f) => {
      const grams = totals.get(f.id) as number;
      return { foodId: f.id, name: f.name, grams, text: formatPurchase(f, grams) };
    });
    if (lines.length > 0) groups.push({ category, label: SHOPPING_CATEGORY_LABEL[category], lines });
  }
  return groups;
}

/** Lista de la compra en texto plano, para copiar o compartir. */
export function shoppingListText(groups: ShoppingGroup[], title: string): string {
  const body = groups.map((g) => `${g.label}\n${g.lines.map((l) => `- ${l.name}: ${l.text}`).join('\n')}`).join('\n\n');
  return `${title}\n\n${body}`;
}




