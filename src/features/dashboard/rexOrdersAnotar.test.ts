import { describe, expect, it } from 'vitest';
import { parseAsk, parseOrderAsk } from './rexAsk';
import { GLOBAL_TILES, rankTiles, scoreTile } from './rexTiles';
import { TILE_ICONS } from './rexTileIcons';

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

describe('órdenes: anotar lo que hice y otra cosa', () => {
  it('«hice otra cosa» y variantes', () => {
    for (const t of ['hice otra cosa', 'hoy he hecho otra cosa', 'hoy hice otra cosa', 'otra cosa', 'no hice la sesión', 'he entrenado otra cosa hoy']) {
      expect(parseOrderAsk(norm(t)), t).toEqual({ kind: 'otra-cosa' });
      expect(parseAsk(t, 3).kind, t).toBe('otra-cosa');
    }
  });

  it('«anota lo que hice» y variantes', () => {
    for (const t of ['anota lo que hice', 'anotar lo que he hecho', 'apunta mi entreno', 'registra la sesión', 'apúntame el entrenamiento']) {
      expect(parseOrderAsk(norm(t)), t).toEqual({ kind: 'anotar' });
      expect(parseAsk(t, 3).kind, t).toBe('anotar');
    }
  });

  it('no se confunde con comida, peso ni con empezar o cerrar', () => {
    expect(parseAsk('apunta dos huevos y 200 g de arroz', 3).kind).toBe('comida');
    expect(parseAsk('apunta 82,4 kg', 3).kind).toBe('peso');
    expect(parseAsk('empieza la sesión', 3).kind).toBe('empezar');
    expect(parseAsk('cierra la sesión', 3).kind).toBe('cerrar');
    expect(parseAsk('ya he terminado', 3).kind).toBe('cerrar');
  });
});

describe('teselas: anotar lo que hice y otra cosa', () => {
  it('existen, con frase que Rex entiende y icono', () => {
    for (const id of ['anotar-sesion', 'otra-cosa']) {
      const t = GLOBAL_TILES.find((g) => g.id === id);
      expect(t, id).toBeDefined();
      expect(TILE_ICONS[t!.iconKey], id).toBeDefined();
      expect(['anotar', 'otra-cosa']).toContain(parseAsk(t!.ask!, 3).kind);
    }
  });

  it('suben por la tarde con una sesión por hacer y no salen con la sesión hecha', () => {
    const base = { screen: 'planificacion' as const };
    expect(scoreTile('anotar-sesion', { ...base, hour: 19, session: 'pending' })).toBeGreaterThan(scoreTile('anotar-sesion', { ...base, hour: 9, session: 'pending' }));
    expect(scoreTile('anotar-sesion', { ...base, hour: 19, session: 'done' })).toBeLessThan(0);
    expect(scoreTile('otra-cosa', { ...base, hour: 19, session: 'done' })).toBeLessThan(0);
    const ids = GLOBAL_TILES.map((g) => g.id);
    expect(rankTiles(ids, { ...base, hour: 19, session: 'pending' }, { slots: [] as never }).shown).toContain('anotar-sesion');
  });
});
