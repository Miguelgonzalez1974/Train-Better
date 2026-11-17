/**
 * Confirmación propia, en lugar de la ventana del navegador (`window.confirm`): una hoja que sube desde abajo, con el botón de la acción
 * con su verbo exacto («Borrar sesión») y «Cancelar» a un lado. Es una promesa: `if (!(await confirmSheet({...}))) return;`.
 * Solo hay una a la vez; si llega otra mientras hay una abierta, la primera se da por cancelada.
 */

export interface ConfirmRequest {
  title: string;
  body?: string;
  /** El verbo de la acción: «Borrar sesión», «Eliminar macrociclo»… */
  confirmLabel: string;
  cancelLabel?: string;
  /** Acción destructiva: el botón sale en rojo. */
  danger?: boolean;
}

export interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

export function createConfirmStore() {
  let pending: PendingConfirm | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function ask(request: ConfirmRequest): Promise<boolean> {
    pending?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const entry: PendingConfirm = {
        ...request,
        resolve: (ok) => {
          if (pending === entry) {
            pending = null;
            emit();
          }
          resolve(ok);
        },
      };
      pending = entry;
      emit();
    });
  }

  return {
    ask,
    current: (): PendingConfirm | null => pending,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** La tienda de la app. */
export const confirmStore = createConfirmStore();

/** Pregunta con la hoja propia. Devuelve true si se confirma y false si se cancela o se cierra. */
export function confirmSheet(request: ConfirmRequest): Promise<boolean> {
  return confirmStore.ask(request);
}
