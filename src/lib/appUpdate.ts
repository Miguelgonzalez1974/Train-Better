/**
 * Aviso de «hay una versión nueva». El service worker descarga la versión nueva en segundo plano y la deja esperando; aquí se avisa para que
 * el atleta la aplique con un toque (en vez de cerrar y abrir la app dos veces y comprobar la versión a mano). Si no la aplica, se activa sola
 * la próxima vez que abra la app. La tienda es pura y se prueba sola; el registro del service worker se carga solo en el navegador.
 */

type Listener = () => void;

let available = false;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const appUpdate = {
  /** ¿Hay una versión nueva lista para aplicar? */
  available: (): boolean => available,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Marca (o desmarca) que hay una versión nueva. Lo llama el registro del service worker; también sirve para probar el aviso. */
  setAvailable(value: boolean): void {
    if (available === value) return;
    available = value;
    emit();
  },
  /** Aplica la versión nueva y recarga. Sin service worker, solo recarga. */
  apply(): void {
    if (applyUpdate) void applyUpdate(true);
    else window.location.reload();
  },
};

/** Cada cuánto se pregunta al servidor si hay versión nueva con la app abierta. Además se pregunta cada vez que se vuelve a ella. */
export const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** Registra el service worker y se queda atento a las versiones nuevas. Sin service worker (o en desarrollo) no hace nada. */
export async function initAppUpdate(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    applyUpdate = registerSW({
      onNeedRefresh: () => appUpdate.setAvailable(true),
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        const check = () => void registration.update().catch(() => undefined);
        window.setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      },
    });
  } catch {
    /* sin service worker: nada que avisar */
  }
}
