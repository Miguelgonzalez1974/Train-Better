import type { CustomFoodGroup } from '../data/athlete/types';

/**
 * Productos por código de barras: lo que hace falta para convertir lo que devuelve Open Food Facts (una base de datos abierta de alimentos)
 * en un alimento propio con su proteína e hidratos por 100 g. Puro: ni red ni cámara (eso vive en `lib/openFoodFacts.ts` y en la pantalla del
 * escáner), así que se puede probar con datos de ejemplo.
 */

/** Un producto leído de la base de datos, listo para elegir cuánto se ha comido. */
export interface ScannedProduct {
  barcode: string;
  /** Nombre para mostrar y guardar («Yogur griego natural · Marca»). */
  name: string;
  proteinPer100: number;
  carbsPer100: number;
  /** Lo que pesa un envase entero (g o ml), si la base de datos lo dice. */
  packageGrams?: number;
  /** Lo que pesa una ración, si la base de datos lo dice. */
  servingGrams?: number;
  group: CustomFoodGroup;
  /** Solo traía uno de los dos valores: el otro se ha dado por 0 y conviene avisarlo. */
  incomplete?: boolean;
}

/** Longitudes de los códigos que se leen en un envase: EAN-8, UPC-A, EAN-13 y GTIN-14. */
const VALID_LENGTHS = new Set([8, 12, 13, 14]);

/** Solo los dígitos de lo leído o tecleado, si tiene la longitud de un código de producto; si no, null. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return VALID_LENGTHS.has(digits.length) ? digits : null;
}

/** El dígito de control de un código (GS1, módulo 10): detecta un número mal tecleado o mal leído. */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  const body = code.slice(0, -1);
  const check = Number(code.slice(-1));
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** La dirección de la consulta: solo se manda el número del código (y se piden solo los campos que hacen falta). */
export function openFoodFactsUrl(code: string): string {
  const fields = 'product_name,product_name_es,brands,nutriments,product_quantity,serving_quantity,categories_tags';
  return `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`;
}

/** Los gramos (o ml) de un texto como «125 g», «1 L», «500ml» o «6 x 125 g»; undefined si no se entiende. */
export function parseQuantityGrams(text: unknown): number | undefined {
  if (typeof text === 'number') return text > 0 && text < 20000 ? text : undefined;
  if (typeof text !== 'string') return undefined;
  const t = text.toLowerCase().replace(',', '.').trim();
  // Un número solo («125»): es lo que la base de datos guarda en `product_quantity`, ya en gramos o ml.
  if (/^\d+(\.\d+)?$/.test(t)) return parseQuantityGrams(Number(t));
  const pack = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/);
  const single = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/);
  const factor = (unit: string) => (unit === 'kg' || unit === 'l' ? 1000 : unit === 'cl' ? 10 : 1);
  const grams = pack ? Number(pack[1]) * Number(pack[2]) * factor(pack[3]) : single ? Number(single[1]) * factor(single[2]) : undefined;
  if (grams === undefined || !(grams > 0) || grams >= 20000) return undefined;
  return Math.round(grams);
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A qué grupo de «Mis alimentos» pertenece un producto: por su categoría si la trae y, si no, por lo que más aporta. */
export function groupForProduct(proteinPer100: number, carbsPer100: number, categories: string[] = []): CustomFoodGroup {
  const has = (re: RegExp) => categories.some((c) => re.test(c));
  if (has(/beverages|drinks|juices|milks|waters/)) return 'Bebida';
  if (has(/^en:fruits/)) return 'Fruta';
  if (has(/vegetables/)) return 'Verdura';
  if (proteinPer100 >= 15) return 'Proteína';
  if (carbsPer100 >= 40) return 'Hidrato';
  return 'Extra';
}

/**
 * Lo que devuelve la base de datos → un producto. null si no existe o no trae ni proteína ni hidratos (entonces se piden a mano). Tolerante: la base
 * la rellena la gente, así que los números pueden venir como texto, con coma o ausentes.
 */
export function parseOpenFoodFacts(barcode: string, json: unknown): ScannedProduct | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as { status?: unknown; product?: Record<string, unknown> };
  const p = root.product;
  if (!p || typeof p !== 'object' || root.status === 0) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  if (protein === undefined && carbs === undefined) return null;
  const rawName = [p.product_name_es, p.product_name].find((x): x is string => typeof x === 'string' && x.trim() !== '');
  const brand = typeof p.brands === 'string' ? p.brands.split(',')[0].trim() : '';
  const baseName = (rawName ?? 'Producto sin nombre').trim();
  const name = brand && !baseName.toLowerCase().includes(brand.toLowerCase()) ? `${baseName} · ${brand}` : baseName;
  const categories = Array.isArray(p.categories_tags) ? p.categories_tags.filter((c): c is string => typeof c === 'string') : [];
  const proteinPer100 = round1(protein ?? 0);
  const carbsPer100 = round1(carbs ?? 0);
  const packageGrams = parseQuantityGrams(p.product_quantity);
  const servingGrams = parseQuantityGrams(p.serving_quantity);
  return {
    barcode,
    name,
    proteinPer100,
    carbsPer100,
    ...(packageGrams ? { packageGrams } : {}),
    ...(servingGrams ? { servingGrams } : {}),
    group: groupForProduct(proteinPer100, carbsPer100, categories),
    ...(protein === undefined || carbs === undefined ? { incomplete: true } : {}),
  };
}

/** Lo que aporta una cantidad de un producto, con un decimal. */
export function macrosForGrams(product: Pick<ScannedProduct, 'proteinPer100' | 'carbsPer100'>, grams: number): { protein: number; carbs: number } {
  return { protein: round1((product.proteinPer100 * grams) / 100), carbs: round1((product.carbsPer100 * grams) / 100) };
}

/** Las cantidades rápidas que se ofrecen: un envase, medio, una ración y 100 g (sin repetir). */
export function quickQuantities(product: Pick<ScannedProduct, 'packageGrams' | 'servingGrams'>): { label: string; grams: number }[] {
  const out: { label: string; grams: number }[] = [];
  const add = (label: string, grams: number | undefined) => {
    if (grams && grams > 0 && !out.some((q) => q.grams === grams)) out.push({ label, grams });
  };
  add('Un envase', product.packageGrams);
  add('½ envase', product.packageGrams ? Math.round(product.packageGrams / 2) : undefined);
  add('Una ración', product.servingGrams);
  // Sin envase ni ración conocidos, unas cantidades típicas; con ellos, solo «100 g» como referencia.
  if (out.length === 0) for (const g of [30, 50, 100, 200]) add(`${g} g`, g);
  else add('100 g', 100);
  return out;
}
