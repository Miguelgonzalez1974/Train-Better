import { describe, expect, it } from 'vitest';
import { parseAsk } from './rexAsk';
import { EMPTY_PREFS, GLOBAL_TILES, groupOfSection, loadTilePrefs, MAX_SHOWN, rankTiles, saveTilePrefs, scoreTile, toggleHidden, togglePinned, type TileContext } from './rexTiles';

const ctx = (o: Partial<TileContext> = {}): TileContext => ({ screen: 'planificacion', hour: 18, session: 'pending', ...o });
const ALL = ['acortar', 'otro-wod', 'wod-fantasma', 'mas-dura', 'tipo', 'editar', 'cambiar-dia', 'me-duele', 'no-estoy', 'faltar', 'apuntar-comida', 'apuntar-peso', 'que-falta', 'mis-marcas', 'corregir', 'deshacer-registro', 'complejos'];

describe('la biblioteca de teselas', () => {
  it('cada tesela global tiene una frase que la caja de Rex entiende (no cae en la ayuda), y los ids no se repiten', () => {
    expect(new Set(GLOBAL_TILES.map((t) => t.id)).size).toBe(GLOBAL_TILES.length);
    for (const t of GLOBAL_TILES) {
      if (t.prefill) {
        expect(t.prefill.trim().length, t.id).toBeGreaterThan(0);
        continue;
      }
      expect(t.ask, t.id).toBeTruthy();
      expect(parseAsk(t.ask!, 3).kind, `${t.id}: «${t.ask}»`).not.toBe('ayuda');
    }
  });

  it('los grupos de las secciones de las pantallas', () => {
    expect(groupOfSection('Cambiar la sesión de hoy')).toBe('sesion');
    expect(groupOfSection('Programa de fuerza')).toBe('sesion');
    expect(groupOfSection('Tu semana')).toBe('dia');
    expect(groupOfSection('Si algo ha pasado')).toBe('cuerpo');
    expect(groupOfSection('Comida de hoy')).toBe('nutricion');
    expect(groupOfSection('Más')).toBe('mas');
  });
});

describe('qué teselas suben según el momento', () => {
  it('con la sesión por hacer y cansado sube «Acortar»; sin sesión por hacer, los cambios de sesión bajan', () => {
    expect(scoreTile('acortar', ctx({ tired: true }))).toBeGreaterThan(scoreTile('acortar', ctx()));
    expect(scoreTile('acortar', ctx({ session: 'done' }))).toBeLessThan(scoreTile('acortar', ctx()));
    expect(scoreTile('mas-dura', ctx({ tired: true }))).toBeLessThan(scoreTile('mas-dura', ctx()));
  });

  it('una molestia activa sube «Me duele algo»', () => {
    expect(scoreTile('me-duele', ctx({ pain: true }))).toBeGreaterThan(scoreTile('me-duele', ctx()) + 20);
  });

  it('apuntar la comida sube a la hora de comer y en Nutrición', () => {
    const nutri = (hour: number) => scoreTile('apuntar-comida', ctx({ screen: 'nutricion', hour }));
    expect(nutri(14)).toBeGreaterThan(nutri(17));
    expect(scoreTile('apuntar-comida', ctx({ screen: 'nutricion', hour: 14 }))).toBeGreaterThan(scoreTile('apuntar-comida', ctx({ screen: 'planificacion', hour: 14 })));
  });

  it('con la sesión hecha suben «Corregir datos» y «Qué toca mañana»; con la sesión por hacer, «Corregir» no sale', () => {
    expect(scoreTile('corregir', ctx({ session: 'done' }))).toBeGreaterThan(scoreTile('corregir', ctx()) + 30);
    expect(scoreTile('que-toca-manana', ctx({ session: 'done', screen: 'dashboard' }))).toBeGreaterThan(scoreTile('que-toca-manana', ctx({ screen: 'dashboard', hour: 10 })));
  });
});

describe('cuáles salen a la vista', () => {
  it('salen como mucho 6, las que más puntúan, y el resto queda en «Todos»', () => {
    const { shown, rest } = rankTiles(ALL, ctx({ tired: true }), EMPTY_PREFS);
    expect(shown).toHaveLength(MAX_SHOWN);
    expect(shown[0]).toBe('acortar');
    expect([...shown, ...rest].sort()).toEqual([...ALL].sort());
    // Lo que no encaja con el momento (deshacer un registro que no hay) queda fuera de la vista.
    expect(shown).not.toContain('deshacer-registro');
    expect(shown).not.toContain('corregir');
  });

  it('con la sesión hecha salen «Corregir datos» y no los cambios de sesión', () => {
    const { shown } = rankTiles(ALL, ctx({ session: 'done' }), EMPTY_PREFS);
    expect(shown).toContain('corregir');
    expect(shown).not.toContain('mas-dura');
  });

  it('es determinista: el mismo momento da siempre lo mismo', () => {
    expect(rankTiles(ALL, ctx(), EMPTY_PREFS)).toEqual(rankTiles([...ALL].reverse(), ctx(), EMPTY_PREFS));
  });

  it('las fijadas salen siempre y primero, en el orden en que se fijaron; las escondidas no salen pero siguen en «Todos»', () => {
    let prefs = togglePinned(EMPTY_PREFS, 'complejos');
    prefs = togglePinned(prefs, 'faltar');
    prefs = toggleHidden(prefs, 'acortar');
    const { shown, rest } = rankTiles(ALL, ctx({ tired: true }), prefs);
    expect(shown.slice(0, 2)).toEqual(['complejos', 'faltar']);
    expect(shown).toHaveLength(MAX_SHOWN);
    expect(shown).not.toContain('acortar');
    expect(rest).toContain('acortar');
    expect(rest[rest.length - 1]).toBe('acortar'); // las escondidas, al final
  });

  it('una fijada que no está disponible en esta pantalla se ignora, sin romper nada', () => {
    const prefs = togglePinned(EMPTY_PREFS, 'no-existe');
    const { shown } = rankTiles(ALL, ctx(), prefs);
    expect(shown).not.toContain('no-existe');
    expect(shown).toHaveLength(MAX_SHOWN);
  });
});

describe('lo que el atleta fija y esconde', () => {
  it('no se fijan más de 6; fijar una escondida la enseña y esconder una fijada la suelta', () => {
    let prefs = EMPTY_PREFS;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) prefs = togglePinned(prefs, id);
    expect(prefs.pinned).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    prefs = toggleHidden(prefs, 'a');
    expect(prefs.pinned).not.toContain('a');
    expect(prefs.hidden).toEqual(['a']);
    prefs = togglePinned(prefs, 'a');
    expect(prefs.hidden).toEqual([]);
    expect(prefs.pinned).toContain('a');
    // Soltar y volver a enseñar.
    expect(togglePinned(prefs, 'a').pinned).not.toContain('a');
    expect(toggleHidden(toggleHidden(EMPTY_PREFS, 'x'), 'x').hidden).toEqual([]);
  });

  it('se guarda y se recupera; un almacenamiento roto o vacío da las elecciones vacías', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveTilePrefs(storage, { pinned: ['faltar', 'faltar', 'acortar'], hidden: ['mi-racha'] });
    expect(loadTilePrefs(storage)).toEqual({ pinned: ['faltar', 'acortar'], hidden: ['mi-racha'] });
    expect(loadTilePrefs(null)).toEqual(EMPTY_PREFS);
    store.set('tb-rex-tiles', '{no es json');
    expect(loadTilePrefs(storage)).toEqual(EMPTY_PREFS);
    store.set('tb-rex-tiles', JSON.stringify({ pinned: [1, 'ok'], hidden: 'mal' }));
    expect(loadTilePrefs(storage)).toEqual({ pinned: ['ok'], hidden: [] });
  });
});
