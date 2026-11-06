/**
 * El globo fijo de Rex (el de «Sesión hecha»): se queda a la vista hasta que lo cierras con la X, y no vuelve ese día. Se recuerda en este
 * dispositivo con el día y la frase que se cerró; al día siguiente, o con otra frase, vuelve a salir. Sin almacenamiento (ventana privada),
 * simplemente se vuelve a ver. Con slot se guardan otras marcas del mismo estilo (p. ej. «ya abrí el lab hoy»).
 */

const KEY = 'tb-sticky-closed';

/** ¿Ya cerraste este globo hoy? */
export function stickyClosed(storage: Pick<Storage, 'getItem'> | null, day: string, id: string, slot: string = KEY): boolean {
  try {
    return storage?.getItem(slot) === `${day}|${id}`;
  } catch {
    return false;
  }
}

export function markStickyClosed(storage: Pick<Storage, 'setItem'> | null, day: string, id: string, slot: string = KEY): void {
  try {
    storage?.setItem(slot, `${day}|${id}`);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}
