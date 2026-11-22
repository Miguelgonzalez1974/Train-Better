import { HRV_MAX_RMSSD, HRV_MIN_RMSSD, hrvScore, rmssdFromScore } from '../../engine/hrv';

/**
 * En qué se teclea el HRV: el rMSSD en milisegundos (lo estándar y lo que guarda la app) o la nota de HRV4Training (7,5), que es dos veces el
 * logaritmo del rMSSD. Se guarda siempre en milisegundos; la nota solo se convierte al escribirla y al enseñarla. Puro salvo el almacenamiento.
 */

export type HrvUnit = 'ms' | 'nota';

const KEY = 'tb-hrv-unit';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadHrvUnit(store: Store | null | undefined): HrvUnit {
  try {
    return store?.getItem(KEY) === 'nota' ? 'nota' : 'ms';
  } catch {
    return 'ms';
  }
}

export function saveHrvUnit(store: Store | null | undefined, unit: HrvUnit): void {
  try {
    store?.setItem(KEY, unit);
  } catch {
    /* sin almacenamiento: vale hasta recargar */
  }
}

/** El valor en la unidad elegida, como texto con coma decimal («43» o «7,5»). */
export function displayHrv(ms: number, unit: HrvUnit): string {
  return (unit === 'nota' ? hrvScore(ms).toFixed(1) : String(Math.round(ms * 10) / 10)).replace('.', ',');
}

/** Un valor escrito en la unidad elegida, en milisegundos; null si no se entiende o cae fuera de lo posible. */
export function parseHrv(text: string, unit: HrvUnit): number | null {
  const n = Number(text.replace(',', '.').trim());
  if (text.trim() === '' || !Number.isFinite(n) || n <= 0) return null;
  const ms = unit === 'nota' ? rmssdFromScore(n) : Math.round(n * 10) / 10;
  return ms >= HRV_MIN_RMSSD && ms <= HRV_MAX_RMSSD ? ms : null;
}

/** Un paso arriba o abajo con los botones: 1 ms, o 0,1 de nota. Se queda dentro de lo posible. */
export function stepHrv(ms: number, unit: HrvUnit, dir: 1 | -1): number {
  const next = unit === 'nota' ? rmssdFromScore(Math.round((hrvScore(ms) + dir * 0.1) * 10) / 10) : Math.round(ms) + dir;
  return Math.min(HRV_MAX_RMSSD, Math.max(HRV_MIN_RMSSD, next));
}

export const unitLabel = (unit: HrvUnit): string => (unit === 'nota' ? 'nota' : 'ms');
