import { describe, expect, it } from 'vitest';
import { FOODS } from '../data/nutrition/foods';
import type { CustomFood } from '../data/athlete/types';
import { customFoodToCatalogFood } from './customFoods';
import { chooseFood, dropIssue, dropItem, extractQuantity, mealTotals, parseMeal, setIssueGrams, setItemGrams, splitMeal } from './mealText';

const byId = (id: string) => FOODS.find((f) => f.id === id)!;
const names = (p: ReturnType<typeof parseMeal>) => p.items.map((i) => `${i.foodId}:${i.grams}`);

describe('mealText: partir la frase', () => {
  it('quita el «he comido» y separa por comas, «y» y «con»', () => {
    expect(splitMeal('He comido dos huevos y 200 g de arroz')).toEqual(['dos huevos', '200 g de arroz']);
    expect(splitMeal('Hoy he cenado pollo, arroz con tomate')).toEqual(['pollo', 'arroz', 'tomate']);
    expect(splitMeal('comí un plátano para desayunar')).toEqual(['un platano']);
  });

  it('«café con leche» no se parte', () => {
    expect(splitMeal('un café con leche y una tostada')).toEqual(['un cafeconleche', 'una tostada']);
  });
});

describe('mealText: cantidades', () => {
  it('gramos, ml, kg y litros', () => {
    expect(extractQuantity('200 g de arroz').quantity.amount).toBe(200);
    expect(extractQuantity('250ml de leche').quantity.amount).toBe(250);
    expect(extractQuantity('1,5 kg de patata').quantity.amount).toBe(1500);
    expect(extractQuantity('medio litro de leche').quantity.count).toBe(0.5);
    expect(extractQuantity('2 l de agua').quantity.amount).toBe(2000);
  });

  it('números en letra y en cifra, «un par de», medios', () => {
    expect(extractQuantity('dos huevos').quantity.count).toBe(2);
    expect(extractQuantity('3 platanos').quantity.count).toBe(3);
    expect(extractQuantity('un par de huevos').quantity.count).toBe(2);
    expect(extractQuantity('media taza de cafe').quantity).toMatchObject({ count: 0.5, measure: 'taza' });
  });

  it('«cocido» y «a la plancha» se anotan y no ensucian el nombre', () => {
    const q = extractQuantity('200 g de pollo a la plancha');
    expect(q.quantity.cooked).toBe(true);
    expect(q.rest).toEqual(['pollo']);
  });

  it('«un puñado» es una cantidad vaga', () => {
    expect(extractQuantity('un punado de nueces').vague).toBe(true);
  });
});

describe('mealText: entender alimentos', () => {
  it('«dos huevos y 200 g de arroz»', () => {
    const p = parseMeal('He comido dos huevos y 200 g de arroz', FOODS);
    expect(names(p)).toEqual(['huevos:100', 'arroz:200']);
    expect(p.issues).toEqual([]);
  });

  it('el arroz cocinado se pasa a crudo y lo avisa', () => {
    const p = parseMeal('200 g de arroz cocido', FOODS);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].foodId).toBe('arroz');
    expect(p.items[0].grams).toBe(74);
    expect(p.items[0].note).toMatch(/200 g cocinado ≈ 74 g en crudo/);
  });

  it('pollo a la plancha: cocinado → crudo; sin decirlo, tal cual', () => {
    expect(parseMeal('150 g de pollo a la plancha', FOODS).items[0]).toMatchObject({ foodId: 'pollo', grams: 115 });
    expect(parseMeal('150 g de pollo', FOODS).items[0]).toMatchObject({ foodId: 'pollo', grams: 150 });
  });

  it('piezas, latas, tostadas y cacitos', () => {
    expect(names(parseMeal('un plátano', FOODS))).toEqual(['platano:120']);
    expect(names(parseMeal('dos latas de atún', FOODS))).toEqual(['atun:112']);
    expect(names(parseMeal('dos tostadas de pan', FOODS))).toEqual(['pan:60']);
    expect(names(parseMeal('un cacito de proteína', FOODS))).toEqual(['proteina-polvo:30']);
  });

  it('medidas caseras: vasos de leche y cucharadas de aceite', () => {
    expect(names(parseMeal('un vaso de leche', FOODS))).toEqual(['leche:200']);
    expect(names(parseMeal('una cucharada de aceite', FOODS))).toEqual(['aceite:10']);
    expect(names(parseMeal('dos cucharadas de crema de cacahuete', FOODS))).toEqual(['crema-cacahuete:30']);
  });

  it('sin cantidad pone la ración habitual y lo dice', () => {
    const p = parseMeal('ensalada y tortilla de patata', FOODS);
    expect(p.items.map((i) => i.foodId)).toEqual(['ensalada-bolsa', 'tortilla-patata']);
    expect(p.items.every((i) => i.assumed && i.note === 'ración habitual')).toBe(true);
  });

  it('«café con leche» es un alimento, no dos', () => {
    expect(parseMeal('un café con leche', FOODS).items.map((i) => i.foodId)).toEqual(['cafe-leche']);
  });

  it('nombres comunes: gambas, macarrones, batata, banana', () => {
    expect(parseMeal('gambas, macarrones, batata, banana', FOODS).items.map((i) => i.foodId)).toEqual(['langostinos', 'pasta', 'boniato', 'platano']);
  });

  it('las dos cosas pegadas sin separar («pollo arroz») se entienden', () => {
    expect(parseMeal('pollo arroz', FOODS).items.map((i) => i.foodId)).toEqual(['pollo', 'arroz']);
  });
});

describe('mealText: dudas', () => {
  it('un puñado de nueces: se sabe el alimento, no los gramos', () => {
    const p = parseMeal('un puñado de nueces', FOODS);
    expect(p.items).toEqual([]);
    expect(p.issues).toHaveLength(1);
    expect(p.issues[0]).toMatchObject({ kind: 'cantidad', foodId: 'frutos-secos', suggestedGrams: 30 });
    const id = p.issues[0].id;
    const done = setIssueGrams(p, id, 25);
    expect(done.issues).toEqual([]);
    expect(done.items).toEqual([{ foodId: 'frutos-secos', grams: 25 }]);
    // Una cantidad inválida no cambia nada.
    expect(setIssueGrams(p, id, 0)).toBe(p);
  });

  it('«un yogur»: algo parecido, hay que elegir', () => {
    const p = parseMeal('un yogur natural', FOODS);
    expect(p.items).toEqual([]);
    const issue = p.issues[0];
    expect(issue.kind).toBe('elegir');
    if (issue.kind !== 'elegir') return;
    expect(issue.options.map((o) => o.foodId)).toContain('skyr');
    const chosen = chooseFood(p, issue.id, 'skyr', FOODS);
    expect(chosen.issues).toEqual([]);
    expect(chosen.items[0]).toMatchObject({ foodId: 'skyr', grams: byId('skyr').serving ?? 100 });
  });

  it('«2 tostadas» sin decir de qué: la tostada es de Wasa (la única que se cuenta así)', () => {
    const p = parseMeal('2 tostadas', FOODS);
    expect(names(p)).toEqual(['wasa:20']);
    expect(p.items[0].note).toMatch(/Lo he tomado como/);
  });

  it('«una lata» sin decir de qué: hay dos latas posibles', () => {
    const p = parseMeal('una lata', FOODS);
    expect(p.issues[0].kind).toBe('elegir');
    if (p.issues[0].kind !== 'elegir') return;
    expect(p.issues[0].options.map((o) => o.foodId).sort()).toEqual(['atun', 'sardinas']);
    expect(chooseFood(p, p.issues[0].id, 'atun', FOODS).items[0]).toMatchObject({ foodId: 'atun', grams: 56 });
  });

  it('lo que no está en ningún sitio se queda como desconocido', () => {
    const p = parseMeal('una hamburguesa de cangrejo y huevos', FOODS);
    expect(p.items.map((i) => i.foodId)).toEqual(['huevos']);
    expect(p.issues).toMatchObject([{ kind: 'desconocido', text: 'hamburguesa cangrejo' }]);
    expect(dropIssue(p, p.issues[0].id).issues).toEqual([]);
  });

  it('un alimento propio se reconoce por su nombre y gana a uno parecido del catálogo', () => {
    const mine: CustomFood = { id: 'custom1', name: 'Batido casero', proteinPer100: 6, carbsPer100: 9, group: 'Bebida' };
    const foods = [...FOODS, customFoodToCatalogFood(mine)];
    const p = parseMeal('250 ml de batido casero', foods, new Set(['custom1']));
    expect(names(p)).toEqual(['custom1:250']);
  });
});

describe('mealText: editar lo entendido', () => {
  const base = () => parseMeal('dos huevos y 200 g de arroz', FOODS);

  it('quitar y cambiar cantidades, sin mutar', () => {
    const p = base();
    expect(dropItem(p, 0).items.map((i) => i.foodId)).toEqual(['arroz']);
    expect(setItemGrams(p, 1, 150).items[1]).toMatchObject({ foodId: 'arroz', grams: 150, assumed: false });
    expect(p.items).toHaveLength(2);
  });

  it('los totales suman proteína e hidratos', () => {
    // 100 g de huevos: 12,6 g P, 0,7 g C · 200 g de arroz crudo: 14 g P, 160 g C
    expect(mealTotals(base().items, (id) => byId(id))).toEqual({ protein: 27, carbs: 161 });
  });
});
