/**
 * La pista de Rex bajo los anillos («Toca un aro o un número para ver de dónde sale»): sale hasta que tocas un aro o un número por primera
 * vez y no vuelve. Se recuerda en este dispositivo; si no hay almacenamiento (ventana privada), simplemente se vuelve a ver.
 */

// v2: la pista pasó de una tarjeta bajo los aros al globo de Rex en la esquina; quien ya había tocado un aro con la versión anterior la vuelve a ver una vez.
const KEY = 'tb-ring-hint-seen-v2';

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