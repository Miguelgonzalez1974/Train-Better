import { describe, expect, it } from 'vitest';
import { parseAsk } from './rexAsk';
import { EMPTY_PREFS, GLOBAL_TILES, groupOfSection, loadTilePrefs, MAX_SHOWN, rankTiles, saveTilePrefs, scoreTile, setSlot, type TileContext } from './rexTiles';

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

  it('una tesela fijada sale en su hueco y los demás huecos los rellena Rex por orden', () => {
    let prefs = setSlot(EMPTY_PREFS, 2, 'complejos');
    prefs = setSlot(prefs, 4, 'faltar');
    const auto = rankTiles(ALL, ctx({ tired: true }), EMPTY_PREFS).shown;
    const { shown, fixed, rest } = rankTiles(ALL, ctx({ tired: true }), prefs);
    expect(shown).toHaveLength(MAX_SHOWN);
    expect(shown[2]).toBe('complejos');
    expect(shown[4]).toBe('faltar');
    expect(fixed.sort()).toEqual(['complejos', 'faltar']);
    // Los otros cuatro huecos, las que más puntúan que no están fijadas, en su orden.
    const free = auto.filter((id) => id !== 'complejos' && id !== 'faltar').slice(0, 4);
    expect([shown[0], shown[1], shown[3], shown[5]]).toEqual(free);
    expect([...shown, ...rest].sort()).toEqual([...ALL].sort());
  });

  it('una fijada que no está disponible en esta pantalla se ignora (su hueco pasa a automático), sin romper nada', () => {
    const prefs = setSlot(EMPTY_PREFS, 0, 'no-existe');
    const { shown } = rankTiles(ALL, ctx(), prefs);
    expect(shown).not.toContain('no-existe');
    expect(shown).toEqual(rankTiles(ALL, ctx(), EMPTY_PREFS).shown);
  });
});

describe('lo que el atleta pone en cada hueco', () => {
  it('poner una tesela en un hueco no mueve los demás; poner otra en el mismo la sustituye', () => {
    let prefs = setSlot(EMPTY_PREFS, 1, 'acortar');
    prefs = setSlot(prefs, 3, 'faltar');
    expect(prefs.slots).toEqual([null, 'acortar', null, 'faltar', null, null]);
    prefs = setSlot(prefs, 1, 'mis-marcas');
    expect(prefs.slots).toEqual([null, 'mis-marcas', null, 'faltar', null, null]);
    prefs = setSlot(prefs, 3, null);
    expect(prefs.slots).toEqual([null, 'mis-marcas', null, null, null, null]);
  });

  it('si la tesela ya estaba en otro hueco, los dos se intercambian (nunca sale repetida)', () => {
    let prefs = setSlot(EMPTY_PREFS, 0, 'a');
    prefs = setSlot(prefs, 1, 'b');
    prefs = setSlot(prefs, 1, 'a');
    expect(prefs.slots).toEqual(['b', 'a', null, null, null, null]);
    prefs = setSlot(prefs, 5, 'a');
    expect(prefs.slots).toEqual(['b', null, null, null, null, 'a']);
    // Un hueco que no existe no cambia nada.
    expect(setSlot(prefs, 6, 'z')).toBe(prefs);
    expect(setSlot(prefs, -1, 'z')).toBe(prefs);
  });

  it('se guarda y se recupera; un almacenamiento roto o vacío da las elecciones vacías', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveTilePrefs(storage, { slots: ['faltar', null, 'acortar', null, null, null] });
    expect(loadTilePrefs(storage)).toEqual({ slots: ['faltar', null, 'acortar', null, null, null] });
    expect(loadTilePrefs(null)).toEqual(EMPTY_PREFS);
    store.set('tb-rex-tiles', '{no es json');
    expect(loadTilePrefs(storage)).toEqual(EMPTY_PREFS);
    store.set('tb-rex-tiles', JSON.stringify({ slots: [1, 'ok', 'ok', null] }));
    expect(loadTilePrefs(storage)).toEqual({ slots: [null, 'ok', null, null, null, null] });
  });

  it('lo guardado con el formato anterior (fijadas y escondidas) pasa a los primeros huecos y lo escondido se olvida', () => {
    const store = new Map<string, string>([['tb-rex-tiles', JSON.stringify({ pinned: ['faltar', 'faltar', 'acortar'], hidden: ['mi-racha'] })]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined };
    expect(loadTilePrefs(storage)).toEqual({ slots: ['faltar', 'acortar', null, null, null, null] });
  });
});

describe('«Revisar mi semana»', () => {
  it('es una tesela de la biblioteca y la caja de Rex la lleva al módulo de la semana', () => {
    const t = GLOBAL_TILES.find((g) => g.id === 'mi-semana');
    expect(t).toBeDefined();
    expect(parseAsk(t!.ask!, 3)).toEqual({ kind: 'modulo', target: 'semana' });
  });

  it('sube a la vista solo con una revisión pendiente y, si no, queda en la biblioteca', () => {
    const base = { screen: 'dashboard' as const, hour: 9, session: 'pending' as const };
    expect(scoreTile('mi-semana', { ...base, weekReview: true })).toBeGreaterThan(scoreTile('mi-semana', base) + 30);
    const ids = GLOBAL_TILES.map((g) => g.id);
    expect(rankTiles(ids, { ...base, weekReview: true }, EMPTY_PREFS).shown).toContain('mi-semana');
    expect(rankTiles(ids, base, EMPTY_PREFS).shown).not.toContain('mi-semana');
  });
});

describe('«Historial»', () => {
  it('es una tesela de la biblioteca y la caja de Rex la lleva a la ventana Historial', () => {
    const t = GLOBAL_TILES.find((g) => g.id === 'historial');
    expect(t).toBeDefined();
    expect(parseAsk(t!.ask!, 3)).toEqual({ kind: 'modulo', target: 'historial' });
    for (const frase of ['historial', 'mi historial', 'ver el diario completo', 'diario de entrenamiento']) {
      expect(parseAsk(frase, 3), frase).toEqual({ kind: 'modulo', target: 'historial' });
    }
  });

  it('no se confunde con el diario de comida ni con la constancia o el volumen', () => {
    expect(parseAsk('que cenar segun mi diario', 3)).not.toEqual({ kind: 'modulo', target: 'historial' });
    expect(parseAsk('constancia', 3)).toEqual({ kind: 'modulo', target: 'constancia' });
    expect(parseAsk('volumen', 3)).toEqual({ kind: 'modulo', target: 'volumen' });
  });
});

describe('Recovery sale siempre en el Dashboard', () => {
  const ids = GLOBAL_TILES.map((g) => g.id);
  const dash = { screen: 'dashboard' as const, hour: 9, session: 'pending' as const };

  it('ocupa el último hueco automático aunque el momento no la suba', () => {
    const { shown, fixed } = rankTiles(ids, dash, EMPTY_PREFS);
    expect(shown).toHaveLength(MAX_SHOWN);
    expect(shown[MAX_SHOWN - 1]).toBe('recovery');
    expect(fixed).toContain('recovery');
  });

  it('si la pones en otro hueco, se queda ahí y no se repite', () => {
    const { shown } = rankTiles(ids, dash, setSlot(EMPTY_PREFS, 0, 'recovery'));
    expect(shown[0]).toBe('recovery');
    expect(shown.filter((s) => s === 'recovery')).toHaveLength(1);
  });

  it('con los seis huecos elegidos a mano sustituye al último, y el resto no se pierde', () => {
    const slots = ['acortar', 'faltar', 'me-duele', 'no-estoy', 'historial', 'mi-racha'];
    const { shown, rest } = rankTiles(ids, dash, { slots });
    expect(shown).toEqual([...slots.slice(0, 5), 'recovery']);
    expect(rest).toContain('mi-racha');
  });

  it('en las demás pantallas no se fuerza', () => {
    expect(rankTiles(ids, { ...dash, screen: 'nutricion' }, EMPTY_PREFS).fixed).toEqual([]);
  });
});

