/**
 * El globo fijo de Rex (el de «Sesión hecha»): se queda a la vista hasta que lo cierras con la X, y no vuelve ese día. Se recuerda en este
 * dispositivo con el día y la frase que se cerró; al día siguiente, o con otra frase, vuelve a salir. Sin almacenamiento (ventana privada),
 * simplemente se vuelve a ver.
 */

const KEY = 'tb-sticky-closed';

/** ¿Ya cerraste este globo hoy? */
export function stickyClosed(storage: Pick<Storage, 'getItem'> | null, day: string, id: string): boolean {
  try {
    return storage?.getItem(KEY) === `${day}|${id}`;
  } catch {
    return false;
  }
}

export function markStickyClosed(storage: Pick<Storage, 'setItem'> | null, day: string, id: string): void {
  try {
    storage?.setItem(KEY, `${day}|${id}`);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}
