import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToastStore, TOAST_MAX, TOAST_TTL_MS, TOAST_TTL_WITH_ACTION_MS } from './toast';

describe('avisos cortos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un aviso aparece y desaparece solo a los 4 s; con una acción dura 8 s', () => {
    const store = createToastStore();
    store.show('Guardado');
    store.show('Cambiado', { action: { label: 'Deshacer', run: () => {} } });
    expect(store.list().map((t) => t.message)).toEqual(['Guardado', 'Cambiado']);
    vi.advanceTimersByTime(TOAST_TTL_MS);
    expect(store.list().map((t) => t.message)).toEqual(['Cambiado']);
    vi.advanceTimersByTime(TOAST_TTL_WITH_ACTION_MS - TOAST_TTL_MS);
    expect(store.list()).toEqual([]);
  });

  it('con el mismo id se sustituye en su sitio y el reloj empieza de nuevo', () => {
    const store = createToastStore();
    store.show('Serie 1/4', { id: 'serie' });
    vi.advanceTimersByTime(3000);
    store.show('Serie 2/4', { id: 'serie' });
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].message).toBe('Serie 2/4');
    vi.advanceTimersByTime(3000);
    expect(store.list()).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(store.list()).toEqual([]);
  });

  it('no se apilan más del máximo: salen los más antiguos', () => {
    const store = createToastStore();
    for (let i = 1; i <= TOAST_MAX + 2; i++) store.show(`Aviso ${i}`);
    expect(store.list().map((t) => t.message)).toEqual(['Aviso 3', 'Aviso 4', 'Aviso 5']);
  });

  it('se puede cerrar a mano, avisa a los suscritos y deja de avisar al darse de baja', () => {
    const store = createToastStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    const id = store.show('Hola');
    store.dismiss(id);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.list()).toEqual([]);
    off();
    store.show('Otro');
    expect(listener).toHaveBeenCalledTimes(2);
    // Cerrar uno que ya no existe no hace nada.
    store.dismiss('no-existe');
  });

  it('el tono por defecto es «ok»', () => {
    const store = createToastStore();
    store.show('A');
    store.show('B', { tone: 'warn' });
    expect(store.list().map((t) => t.tone)).toEqual(['ok', 'warn']);
  });
});
