import { beforeEach, describe, expect, it } from 'vitest';
import { labReturn } from './labReturn';

describe('la vuelta al lab de Rex', () => {
  beforeEach(() => labReturn.clear());

  it('marcar pendiente enseña el botón; limpiar lo quita', () => {
    expect(labReturn.get().pending).toBe(false);
    labReturn.markPending();
    expect(labReturn.get().pending).toBe(true);
    labReturn.clear();
    expect(labReturn.get()).toEqual({ pending: false, reopen: false });
  });

  it('pedir volver quita el botón y deja un aviso que el Dashboard recoge una sola vez', () => {
    labReturn.markPending();
    labReturn.requestReopen();
    expect(labReturn.get()).toEqual({ pending: false, reopen: true });
    expect(labReturn.takeReopen()).toBe(true);
    expect(labReturn.takeReopen()).toBe(false);
  });

  it('sin aviso no hay nada que recoger', () => {
    expect(labReturn.takeReopen()).toBe(false);
  });
});
