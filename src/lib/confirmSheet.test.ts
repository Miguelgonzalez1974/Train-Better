import { describe, expect, it, vi } from 'vitest';
import { createConfirmStore } from './confirmSheet';

describe('confirmación propia', () => {
  it('queda pendiente hasta que se contesta, y la promesa devuelve lo elegido', async () => {
    const store = createConfirmStore();
    const answer = store.ask({ title: '¿Borrar la sesión de hoy?', confirmLabel: 'Borrar sesión', danger: true });
    expect(store.current()).toMatchObject({ title: '¿Borrar la sesión de hoy?', confirmLabel: 'Borrar sesión', danger: true });
    store.current()!.resolve(true);
    await expect(answer).resolves.toBe(true);
    expect(store.current()).toBeNull();
  });

  it('cancelar devuelve false y la hoja se cierra', async () => {
    const store = createConfirmStore();
    const answer = store.ask({ title: '¿Seguro?', confirmLabel: 'Sí' });
    store.current()!.resolve(false);
    await expect(answer).resolves.toBe(false);
    expect(store.current()).toBeNull();
  });

  it('si llega otra pregunta con una abierta, la primera se da por cancelada', async () => {
    const store = createConfirmStore();
    const first = store.ask({ title: 'Primera', confirmLabel: 'Sí' });
    const second = store.ask({ title: 'Segunda', confirmLabel: 'Sí' });
    await expect(first).resolves.toBe(false);
    expect(store.current()?.title).toBe('Segunda');
    store.current()!.resolve(true);
    await expect(second).resolves.toBe(true);
  });

  it('avisa a los suscritos al abrir y al cerrar', () => {
    const store = createConfirmStore();
    const listener = vi.fn();
    store.subscribe(listener);
    void store.ask({ title: 'A', confirmLabel: 'Sí' });
    store.current()!.resolve(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
