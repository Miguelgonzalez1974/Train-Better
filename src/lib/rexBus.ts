/**
 * Un aviso entre pantallas: RexLab dice «abre esto» y quien tiene esa pieza (la tarjeta del programa, la caja de comida de Nutrición…) lo
 * hace. Evita subir estados de pantallas distintas al mismo sitio solo para que un botón del lab los abra.
 */
export type RexBusEvent =
  /** Abrir la vista «semana a semana» del programa de fuerza (Planificación, Objetivos). */
  | 'companion-weeks'
  /** Abrir la tarjeta de nueva temporada de Objetivos. */
  | 'season-open'
  /** Nutrición: escribir y leer una frase de comida en la caja (el dato es la frase). */
  | 'meal-text'
  /** Nutrición: abrir el peso corporal. */
  | 'nutri-weight';

type Listener = (payload?: string) => void;
const listeners = new Map<RexBusEvent, Set<Listener>>();

export const rexBus = {
  on(event: RexBusEvent, fn: Listener): () => void {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(fn);
    listeners.set(event, set);
    return () => {
      set.delete(fn);
    };
  },
  /** Avisa a quien escuche. Devuelve cuántos lo han recibido. */
  emit(event: RexBusEvent, payload?: string): number {
    const set = listeners.get(event);
    if (!set) return 0;
    set.forEach((fn) => fn(payload));
    return set.size;
  },
};
