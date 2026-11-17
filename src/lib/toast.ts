/**
 * Avisos cortos tras una acción («Serie guardada», «Registro deshecho · Volver a registrar»). Una pequeña tienda con suscripción: cualquier
 * parte de la app llama a `toast.show(...)` y `ToastHost` los pinta arriba durante unos segundos. Si el aviso lleva una acción (deshacer),
 * dura más para dar tiempo a tocarla. Con un `id` repetido el aviso se sustituye en vez de apilarse (series guardadas seguidas).
 */

export type ToastTone = 'ok' | 'info' | 'warn';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Milisegundos hasta que desaparece solo. */
  ttlMs: number;
}

export interface ToastOptions {
  /** Para sustituir un aviso anterior del mismo tipo en vez de apilar otro. */
  id?: string;
  tone?: ToastTone;
  action?: ToastAction;
  ttlMs?: number;
}

export const TOAST_TTL_MS = 4000;
export const TOAST_TTL_WITH_ACTION_MS = 8000;
export const TOAST_MAX = 3;

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createToastStore(timers: Timers = realTimers) {
  let toasts: Toast[] = [];
  let seq = 0;
  const handles = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function dismiss(id: string): void {
    const handle = handles.get(id);
    if (handle !== undefined) timers.clear(handle);
    handles.delete(id);
    if (toasts.some((t) => t.id === id)) {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    }
  }

  function show(message: string, options: ToastOptions = {}): string {
    const id = options.id ?? `toast-${++seq}`;
    const ttlMs = options.ttlMs ?? (options.action ? TOAST_TTL_WITH_ACTION_MS : TOAST_TTL_MS);
    const next: Toast = { id, message, tone: options.tone ?? 'ok', ttlMs, ...(options.action ? { action: options.action } : {}) };
    const previous = handles.get(id);
    if (previous !== undefined) timers.clear(previous);
    // Sustituye el del mismo id en su sitio; si es nuevo, entra el último y se quitan los más antiguos que pasen del máximo.
    toasts = toasts.some((t) => t.id === id) ? toasts.map((t) => (t.id === id ? next : t)) : [...toasts, next];
    while (toasts.length > TOAST_MAX) {
      const [oldest] = toasts;
      const h = handles.get(oldest.id);
      if (h !== undefined) timers.clear(h);
      handles.delete(oldest.id);
      toasts = toasts.slice(1);
    }
    handles.set(id, timers.set(() => dismiss(id), ttlMs));
    emit();
    return id;
  }

  return {
    show,
    dismiss,
    list: (): readonly Toast[] => toasts,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear(): void {
      handles.forEach((h) => timers.clear(h));
      handles.clear();
      toasts = [];
      emit();
    },
  };
}

/** La tienda de la app. */
export const toast = createToastStore();
