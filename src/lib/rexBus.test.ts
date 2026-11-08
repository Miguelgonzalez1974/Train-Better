import { describe, expect, it } from 'vitest';
import { appNav } from './appNav';
import { rexBus } from './rexBus';

describe('el aviso entre pantallas de RexLab', () => {
  it('lo recibe quien escucha, con su dato, y deja de recibirlo al darse de baja', () => {
    const got: (string | undefined)[] = [];
    const off = rexBus.on('meal-text', (p) => got.push(p));
    expect(rexBus.emit('meal-text', 'dos huevos')).toBe(1);
    off();
    expect(rexBus.emit('meal-text', 'otra cosa')).toBe(0);
    expect(got).toEqual(['dos huevos']);
  });

  it('sin nadie escuchando no pasa nada', () => {
    expect(rexBus.emit('companion-weeks')).toBe(0);
  });
});

describe('el cambio de pestaña desde cualquier pantalla', () => {
  it('va a donde dice la pestaña registrada, y sin registro devuelve false', () => {
    expect(appNav.goTo('nutricion')).toBe(false);
    const seen: string[] = [];
    const off = appNav.register((t) => seen.push(t));
    expect(appNav.goTo('nutricion')).toBe(true);
    off();
    expect(appNav.goTo('dashboard')).toBe(false);
    expect(seen).toEqual(['nutricion']);
  });
});
