/**
 * Un solo reloj de animación para toda la app: los muñecos de los movimientos se suscriben aquí en vez de pedir cada uno su propio
 * `requestAnimationFrame`. Corre solo mientras haya alguien suscrito y la pestaña esté visible, así que una pantalla sin muñecos (o con
 * todos fuera de la vista) no gasta nada.
 */

type Listener = (dtSeconds: number) => void;

const listeners = new Set<Listener>();
let raf: number | null = null;
let last: number | null = null;

function frame(now: number) {
  const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const fn of [...listeners]) fn(dt);
  raf = listeners.size > 0 ? requestAnimationFrame(frame) : null;
  if (raf === null) last = null;
}

function start() {
  if (raf === null && listeners.size > 0 && typeof requestAnimationFrame === 'function') {
    last = null;
    raf = requestAnimationFrame(frame);
  }
}

/** Avisa en cada fotograma con los segundos desde el anterior. Devuelve la función para darse de baja. */
export function subscribeAnimation(fn: Listener): () => void {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && raf !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(raf);
      raf = null;
      last = null;
    }
  };
}

/** Cuántos suscritos hay ahora (para los tests). */
export function animationSubscribers(): number {
  return listeners.size;
}
