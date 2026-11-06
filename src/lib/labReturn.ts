import { useSyncExternalStore } from 'react';

/**
 * El camino de vuelta al lab de Rex: si abres algo desde el lab y te vas a otra pestaña (Objetivos, Nutrición, Planificación), la app
 * se acuerda de que venías de allí y ofrece «Volver al lab». Si lo tocas, el Dashboard abre el lab al montarse. Vive solo en memoria:
 * al cerrar la app no hace falta recordarlo.
 */
interface State {
  /** Vengo del lab y estoy en otra pestaña: se enseña el botón de volver. */
  pending: boolean;
  /** Se ha pedido volver: el Dashboard abre el lab al montarse. */
  reopen: boolean;
}

let state: State = { pending: false, reopen: false };
const listeners = new Set<() => void>();

function set(next: State) {
  if (next.pending === state.pending && next.reopen === state.reopen) return;
  state = next;
  listeners.forEach((l) => l());
}

export const labReturn = {
  /** Estoy fuera de una pantalla que se abrió desde el lab. */
  markPending: () => set({ ...state, pending: true }),
  /** Ya no hace falta ofrecer la vuelta (llegué al Dashboard por otro camino, o la cerré). */
  clear: () => set({ pending: false, reopen: false }),
  /** Se pulsó «Volver al lab»: el botón se va y el Dashboard abrirá el lab. */
  requestReopen: () => set({ pending: false, reopen: true }),
  /** El Dashboard recoge el aviso de abrir el lab (una sola vez). */
  takeReopen(): boolean {
    if (!state.reopen) return false;
    set({ ...state, reopen: false });
    return true;
  },
  get: () => state,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ¿Hay que enseñar el botón «Volver al lab»? */
export function useLabReturnPending(): boolean {
  return useSyncExternalStore(subscribe, () => state.pending);
}
