import { openFoodFactsUrl, parseOpenFoodFacts, type ScannedProduct } from '../engine/barcodeFood';

/**
 * La consulta de un producto a Open Food Facts por su código de barras. Es lo único que sale de la app al escanear: el número del código (ninguna
 * foto, ningún dato tuyo). Sin respuesta a tiempo o sin conexión no es un fallo: se piden los valores a mano.
 */
export type BarcodeLookup = { kind: 'found'; product: ScannedProduct } | { kind: 'notfound' } | { kind: 'error' };

export async function lookupBarcode(code: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<BarcodeLookup> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(openFoodFactsUrl(code), { headers: { Accept: 'application/json' }, signal: controller?.signal });
    // 404 = el producto no existe en la base de datos; cualquier otro código de error = el servicio falla (no es lo mismo que «no está»).
    if (res.status === 404) return { kind: 'notfound' };
    if (!res.ok) return { kind: 'error' };
    const product = parseOpenFoodFacts(code, await res.json());
    return product ? { kind: 'found', product } : { kind: 'notfound' };
  } catch {
    return { kind: 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
