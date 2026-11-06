import { describe, expect, it } from 'vitest';
import { isChunkLoadError, shouldAutoReload } from './chunkError';

describe('trozos de la app que no se descargan (versión vieja guardada en el móvil)', () => {
  it('reconoce los mensajes de los navegadores', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/Dashboard-abc123.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 12 failed.',
      "Unexpected token '<'",
      "'text/html' is not a valid JavaScript MIME type.",
      'Unable to preload CSS for /assets/index-1.css',
    ]) {
      expect(isChunkLoadError(new Error(message)), message).toBe(true);
    }
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it('no confunde un fallo normal con uno de trozos', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });

  it('solo se recarga sola una vez por minuto, para no entrar en bucle', () => {
    const now = 1_000_000;
    expect(shouldAutoReload(null, now)).toBe(true);
    expect(shouldAutoReload('', now)).toBe(true);
    expect(shouldAutoReload('basura', now)).toBe(true);
    expect(shouldAutoReload(String(now - 5_000), now)).toBe(false);
    expect(shouldAutoReload(String(now - 61_000), now)).toBe(true);
  });
});