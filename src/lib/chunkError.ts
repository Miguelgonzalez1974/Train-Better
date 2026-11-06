/**
 * Cuando se publica una versión nueva, un móvil con la app instalada puede quedarse con el `index.html` viejo (la copia que guarda el
 * service worker) pidiendo trozos de JavaScript que ya no existen. El navegador contesta con el HTML de la app en vez del JS, y el
 * `import()` falla: sin red de seguridad, la pantalla se queda en blanco. Estas ayudas reconocen ese fallo y limpian la copia guardada.
 */

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  // Un trozo que no existe se sirve como HTML (la app), y al leerlo como JavaScript falla con esto.
  /Unexpected token '<'/i,
  /is not a valid JavaScript MIME type/i,
];

/** ¿Este error es de un trozo de la app que no se pudo descargar (versión vieja guardada)? */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '';
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

const RELOAD_FLAG = 'tb-chunk-reload';
/** No se recarga solo más de una vez cada tanto, para no entrar en un bucle si el fallo no era la copia guardada. */
const RELOAD_COOLDOWN_MS = 60_000;

/** ¿Toca recargar solo? Sí, a menos que ya se haya intentado hace menos de un minuto. */
export function shouldAutoReload(lastAttempt: string | null, now: number): boolean {
  const last = Number(lastAttempt);
  return !(Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS);
}

/** Borra el service worker y las copias guardadas de la app (no toca tus datos: viven en el almacenamiento local y en tu cuenta). */
export async function resetAppCache(): Promise<void> {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
  } catch {
    /* sin service worker */
  }
  try {
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* sin caché */
  }
}

/**
 * Si el error es de un trozo que no se descarga, limpia la copia guardada y recarga la página (una sola vez por minuto).
 * Devuelve true si ha lanzado la recarga.
 */
export function recoverFromChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;
  try {
    if (!shouldAutoReload(window.sessionStorage.getItem(RELOAD_FLAG), Date.now())) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // Sin sessionStorage no se puede evitar el bucle: mejor no recargar solo.
    return false;
  }
  void resetAppCache().finally(() => window.location.reload());
  return true;
}
