import { useSyncExternalStore } from 'react';

/**
 * El reloj del entreno (`TrainingTimer`) habla con el resto de la app por aquí: cualquier botón «Reloj» (el del bloque WOD, el del modo
 * enfocado…) lo abre con `clockBus.open(modo)`, y el reloj avisa de si está en uso (`clockState`) para que Rex se pliegue y no compita con
 * él. Sin React dentro de la lógica: solo un par de funciones y un suscriptor.
 */

export type ClockMode = 'rest' | 'workout' | 'emom' | 'tabata';

/**
 * Qué reloj responde: el de la sesión de hoy (`main`, el de siempre) o el de la vista previa de otro día (`preview`, que vive junto a la ventana
 * de ese día y cronometra el WOD de ese día sin guardar nada). Un botón «Reloj» abre solo el de su ámbito.
 */
export type ClockScope = 'main' | 'preview';

const openListeners = new Set<{ fn: (mode?: ClockMode) => void; scope: ClockScope }>();

export const clockBus = {
  /** Abre el reloj en ese modo (si no se dice, en el cronómetro del WOD). Devuelve cuántos relojes lo han recibido. */
  open(mode?: ClockMode, scope: ClockScope = 'main'): number {
    let received = 0;
    openListeners.forEach((l) => {
      if (l.scope !== scope) return;
      received++;
      l.fn(mode);
    });
    return received;
  },
  on(fn: (mode?: ClockMode) => void, scope: ClockScope = 'main'): () => void {
    const listener = { fn, scope };
    openListeners.add(listener);
    return () => {
      openListeners.delete(listener);
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
