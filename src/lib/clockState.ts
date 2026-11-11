import { useSyncExternalStore } from 'react';

/**
 * El reloj del entreno (`TrainingTimer`) habla con el resto de la app por aquí: cualquier botón «Reloj» (el del bloque WOD, el del modo
 * enfocado…) lo abre con `clockBus.open(modo)`, y el reloj avisa de si está en uso (`clockState`) para que Rex se pliegue y no compita con
 * él. Sin React dentro de la lógica: solo un par de funciones y un suscriptor.
 */

export type ClockMode = 'rest' | 'workout' | 'emom' | 'tabata';

const openListeners = new Set<(mode?: ClockMode) => void>();

export const clockBus = {
  /** Abre el reloj en ese modo (si no se dice, en el cronómetro del WOD). Devuelve cuántos relojes lo han recibido. */
  open(mode?: ClockMode): number {
    openListeners.forEach((fn) => fn(mode));
    return openListeners.size;
  },
  on(fn: (mode?: ClockMode) => void): () => void {
    openListeners.add(fn);
    return () => {
      openListeners.delete(fn);
    };
  },
};

let active = false;
const stateListeners = new Set<() => void>();

export const clockState = {
  isActive: () => active,
  setActive(next: boolean): void {
    if (next === active) return;
    active = next;
    stateListeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void): () => void {
    stateListeners.add(fn);
    return () => {
      stateListeners.delete(fn);
    };
  },
};

/** ¿Está el reloj abierto o en marcha? Rex lo usa para plegarse. */
export function useClockActive(): boolean {
  return useSyncExternalStore(clockState.subscribe, clockState.isActive, () => false);
}
