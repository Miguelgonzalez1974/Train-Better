import { describe, expect, it } from 'vitest';
import { groupForProduct, hasValidCheckDigit, macrosForGrams, normalizeBarcode, openFoodFactsUrl, parseOpenFoodFacts, parseQuantityGrams, quickQuantities } from './barcodeFood';

describe('código de barras: leer y comprobar el número', () => {
  it('se queda con los dígitos y solo acepta longitudes de producto', () => {
    expect(normalizeBarcode('8 410076 472106')).toBe('8410076472106');
    expect(normalizeBarcode('96385074')).toBe('96385074');
    expect(normalizeBarcode('123')).toBeNull();
    expect(normalizeBarcode('abc')).toBeNull();
    expect(normalizeBarcode('1234567890')).toBeNull();
  });

  it('el dígito de control detecta un número mal leído o tecleado', () => {
    expect(hasValidCheckDigit('4006381333931')).toBe(true); // EAN-13 de ejemplo
    expect(hasValidCheckDigit('4006381333932')).toBe(false);
    expect(hasValidCheckDigit('96385074')).toBe(true); // EAN-8 de ejemplo
    expect(hasValidCheckDigit('96385075')).toBe(false);
    expect(hasValidCheckDigit('')).toBe(false);
  });

  it('la consulta solo lleva el código', () => {
    const url = openFoodFactsUrl('4006381333931');
    expect(url.startsWith('https://world.openfoodfacts.org/api/v2/product/4006381333931.json?fields=')).toBe(true);
    expect(url).not.toMatch(/user|email|name=/i);
  });
});

describe('cantidades del envase', () => {
  it('entiende gramos, litros, mililitros y packs', () => {
    expect(parseQuantityGrams('125 g')).toBe(125);
    expect(parseQuantityGrams('1 L')).toBe(1000);
    expect(parseQuantityGrams('500ml')).toBe(500);
    expect(parseQuantityGrams('6 x 125 g')).toBe(750);
    expect(parseQuantityGrams('1,5 kg')).toBe(1500);
    expect(parseQuantityGrams(250)).toBe(250);
    expect(parseQuantityGrams('sin dato')).toBeUndefined();
    expect(parseQuantityGrams(undefined)).toBeUndefined();
    expect(parseQuantityGrams(0)).toBeUndefined();
  });
});

describe('Open Food Facts → producto', () => {
  const yogur = {
    status: 1,
    product: {
      product_name: 'Greek yogurt',
      product_name_es: 'Yogur griego natural 0 %',
      brands: 'Marca ejemplo, Otra',
      nutriments: { proteins_100g: 10, carbohydrates_100g: '4,2' },
      product_quantity: '125',
      serving_quantity: 125,
      categories_tags: ['en:dairies', 'en:fermented-milk-products'],
    },
  };

  it('saca nombre en español con marca, proteína e hidratos por 100 g, envase y ración', () => {
    const p = parseOpenFoodFacts('8412345678901', yogur)!;
    expect(p).toMatchObject({ barcode: '8412345678901', name: 'Yogur griego natural 0 % · Marca ejemplo', proteinPer100: 10, carbsPer100: 4.2, packageGrams: 125, servingGrams: 125 });
    expect(p.incomplete).toBeUndefined();
  });

  it('un producto que no existe o sin proteína ni hidratos devuelve null (se piden a mano)', () => {
    expect(parseOpenFoodFacts('1', { status: 0 })).toBeNull();
    expect(parseOpenFoodFacts('1', null)).toBeNull();
    expect(parseOpenFoodFacts('1', { status: 1, product: { product_name: 'X', nutriments: {} } })).toBeNull();
  });

  it('con solo uno de los dos valores se avisa de que está incompleto', () => {
    const p = parseOpenFoodFacts('1', { status: 1, product: { product_name: 'Arroz', nutriments: { carbohydrates_100g: 78 } } })!;
    expect(p).toMatchObject({ proteinPer100: 0, carbsPer100: 78, incomplete: true });
  });

  it('no repite la marca si ya está en el nombre y pone un nombre si falta', () => {
    expect(parseOpenFoodFacts('1', { status: 1, product: { product_name: 'Hacendado avena', brands: 'Hacendado', nutriments: { proteins_100g: 13, carbohydrates_100g: 60 } } })!.name).toBe('Hacendado avena');
    expect(parseOpenFoodFacts('1', { status: 1, product: { nutriments: { proteins_100g: 1, carbohydrates_100g: 1 } } })!.name).toBe('Producto sin nombre');
  });

  it('el grupo sale de la categoría y, si no, de lo que más aporta', () => {
    expect(groupForProduct(3, 5, ['en:beverages'])).toBe('Bebida');
    expect(groupForProduct(1, 14, ['en:fruits-and-vegetables-based-foods', 'en:fruits'])).toBe('Fruta');
    expect(groupForProduct(24, 3)).toBe('Proteína');
    expect(groupForProduct(8, 70)).toBe('Hidrato');
    expect(groupForProduct(2, 10)).toBe('Extra');
  });
});

describe('cuánto aporta lo que comes', () => {
  it('proteína e hidratos de una cantidad, con un decimal', () => {
    expect(macrosForGrams({ proteinPer100: 10, carbsPer100: 4.2 }, 125)).toEqual({ protein: 12.5, carbs: 5.3 });
    expect(macrosForGrams({ proteinPer100: 10, carbsPer100: 4 }, 0)).toEqual({ protein: 0, carbs: 0 });
  });

  it('ofrece envase, medio envase, ración y 100 g sin repetir', () => {
    expect(quickQuantities({ packageGrams: 125, servingGrams: 125 }).map((q) => q.label)).toEqual(['Un envase', '½ envase', '100 g']);
    expect(quickQuantities({ packageGrams: 500, servingGrams: 30 })).toEqual([
      { label: 'Un envase', grams: 500 },
      { label: '½ envase', grams: 250 },
      { label: 'Una ración', grams: 30 },
      { label: '100 g', grams: 100 },
    ]);
    expect(quickQuantities({}).map((q) => q.grams)).toEqual([30, 50, 100, 200]);
  });
});
