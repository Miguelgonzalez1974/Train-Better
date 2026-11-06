/**
 * La pista de Rex bajo los anillos («Toca un aro o un número para ver de dónde sale»): sale hasta que tocas un aro o un número por primera
 * vez y no vuelve. Se recuerda en este dispositivo; si no hay almacenamiento (ventana privada), simplemente se vuelve a ver.
 */

const KEY = 'tb-ring-hint-seen';

/** ¿Ya sabe el atleta que los aros y los números se tocan? */
export function ringHintSeen(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markRingHintSeen(storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}