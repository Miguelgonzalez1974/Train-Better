import { describe, expect, it } from 'vitest';
import { lookupBarcode } from './openFoodFacts';

const reply = (status: number, body: unknown): typeof fetch => (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;

describe('lookupBarcode', () => {
  it('un producto con datos se encuentra', async () => {
    const r = await lookupBarcode('8412345678901', reply(200, { status: 1, product: { product_name: 'Avena', nutriments: { proteins_100g: 13, carbohydrates_100g: 60 } } }));
    expect(r.kind).toBe('found');
    if (r.kind === 'found') expect(r.product).toMatchObject({ barcode: '8412345678901', proteinPer100: 13, carbsPer100: 60 });
  });

  it('no está en la base de datos, o está sin proteína ni hidratos: no encontrado', async () => {
    expect((await lookupBarcode('1', reply(404, {}))).kind).toBe('notfound');
    expect((await lookupBarcode('1', reply(200, { status: 0 }))).kind).toBe('notfound');
    expect((await lookupBarcode('1', reply(200, { status: 1, product: { product_name: 'X', nutriments: {} } }))).kind).toBe('notfound');
  });

  it('el servicio que falla o la red caída es un error, no «no encontrado»', async () => {
    expect((await lookupBarcode('1', reply(500, {}))).kind).toBe('error');
    expect((await lookupBarcode('1', (async () => { throw new Error('sin red'); }) as unknown as typeof fetch)).kind).toBe('error');
  });

  it('manda solo el número del código a Open Food Facts', async () => {
    let asked = '';
    await lookupBarcode('8412345678901', (async (url: string) => { asked = url; return { ok: true, status: 200, json: async () => ({ status: 0 }) }; }) as unknown as typeof fetch);
    expect(asked).toContain('/product/8412345678901.json');
    expect(asked.startsWith('https://world.openfoodfacts.org/')).toBe(true);
  });
});
