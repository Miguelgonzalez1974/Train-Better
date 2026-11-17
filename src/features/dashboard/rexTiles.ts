import type { RexScreen } from './rexAskRouter';

/**
 * Los atajos de Rex como una biblioteca de teselas. El panel de Rex enseña unas pocas, las que más encajan con el momento (la hora, la
 * pantalla, cómo está la sesión de hoy, si estás cansado o con una molestia); el resto está detrás de «Todos» y se puede fijar o esconder
 * desde «Editar». Aquí vive lo puro: qué teselas hay, cómo se puntúan según el contexto, cuáles salen y lo que el atleta fija o esconde. Cómo
 * se dibujan y qué hacen al tocarlas lo decide `RexTiles.tsx` y la pantalla que las pone.
 */

export type TileGroup = 'sesion' | 'dia' | 'cuerpo' | 'datos' | 'nutricion' | 'objetivos' | 'mas';

export const TILE_GROUP_LABEL: Record<TileGroup, string> = {
  sesion: 'La sesión',
  dia: 'El día y la semana',
  cuerpo: 'Tu cuerpo',
  datos: 'Tus datos',
  nutricion: 'Comida y peso',
  objetivos: 'Objetivos',
  mas: 'Más',
};

/** El grupo de una sección de RexLab de una pantalla (las teselas de las pantallas vienen con el título de su sección). */
export function groupOfSection(title: string): TileGroup {
  const t = title.toLowerCase();
  if (t.includes('sesión') || t.includes('programa')) return 'sesion';
  if (t.includes('semana') || t.includes('día')) return 'dia';
  if (t.includes('pasado') || t.includes('cuerpo')) return 'cuerpo';
  if (t.includes('comida') || t.includes('peso') || t.includes('nutri')) return 'nutricion';
  if (t.includes('objetivo') || t.includes('temporada') || t.includes('macro')) return 'objetivos';
  return 'mas';
}

/** Una tesela que sirve desde cualquier pantalla porque es una frase que la caja de Rex ya entiende (o una frase a medias que se rellena). */
export interface GlobalTile {
  id: string;
  label: string;
  hint?: string;
  /** Clave del icono (ver `rexTileIcons.ts`). */
  iconKey: string;
  group: TileGroup;
  /** La frase que se manda a Rex al tocarla. */
  ask?: string;
  /** Una frase a medias que se escribe en la caja para que la termines («he comido…»). */
  prefill?: string;
}

export const GLOBAL_TILES: GlobalTile[] = [
  { id: 'acortar', label: 'Acortar la sesión', hint: 'tengo poco tiempo', iconKey: 'timer', group: 'sesion', ask: 'acortar la sesion' },
  { id: 'otro-wod', label: 'Otro WOD', iconKey: 'shuffle', group: 'sesion', ask: 'otro wod' },
  { id: 'cambiar-dia', label: 'Cambiar día', hint: 'mover o intercambiar', iconKey: 'calendar-clock', group: 'dia', ask: 'cambiar dia' },
  { id: 'que-toca-manana', label: 'Qué toca mañana', iconKey: 'calendar-days', group: 'dia', ask: 'que toca manana' },
  { id: 'me-duele', label: 'Me duele algo', iconKey: 'heart-pulse', group: 'cuerpo', ask: 'me duele algo' },
  { id: 'no-estoy', label: 'Hoy no estoy para el plan', iconKey: 'frown', group: 'cuerpo', ask: 'hoy no estoy para el plan' },
  { id: 'faltar', label: 'Voy a faltar unos días', iconKey: 'plane', group: 'cuerpo', ask: 'voy a faltar unos dias' },
  { id: 'check-in', label: 'Mi check-in', iconKey: 'clipboard-check', group: 'cuerpo', ask: 'check in' },
  { id: 'recovery', label: 'Recovery', hint: 'movilidad', iconKey: 'activity', group: 'cuerpo', ask: 'recovery' },
  { id: 'como-estoy', label: 'Cómo estoy', iconKey: 'gauge', group: 'datos', ask: 'como estoy' },
  { id: 'mis-marcas', label: 'Mis marcas', iconKey: 'trophy', group: 'datos', ask: 'mis marcas' },
  { id: 'mi-racha', label: 'Mi racha', iconKey: 'flame', group: 'datos', ask: 'mi racha' },
  { id: 'por-que-hoy', label: 'Por qué hoy así', iconKey: 'help-circle', group: 'datos', ask: 'por que hoy asi' },
  { id: 'apuntar-comida', label: 'Apuntar comida', iconKey: 'apple', group: 'nutricion', prefill: 'he comido ' },
  { id: 'apuntar-peso', label: 'Apuntar mi peso', iconKey: 'scale', group: 'nutricion', ask: 'apunta mi peso' },
  { id: 'que-falta', label: 'Qué me falta hoy', hint: 'proteína y carbohidrato', iconKey: 'utensils', group: 'nutricion', ask: 'que me falta' },
  { id: 'nuevo-objetivo', label: 'Crear un objetivo', iconKey: 'target', group: 'objetivos', ask: 'quiero crear un objetivo' },
];

/** Cuánto pesa cada tesela de base y en qué pantallas tiene más sentido. Lo que no está aquí pesa 10 y vale para todas. */
const TILE_META: Record<string, { base: number; screens?: RexScreen[] }> = {
  acortar: { base: 14, screens: ['planificacion', 'dashboard'] },
  'otro-wod': { base: 12, screens: ['planificacion'] },
  'wod-fantasma': { base: 11, screens: ['planificacion'] },
  'mas-dura': { base: 10, screens: ['planificacion'] },
  tipo: { base: 8, screens: ['planificacion'] },
  editar: { base: 9, screens: ['planificacion'] },
  'cambiar-dia': { base: 13 },
  'me-duele': { base: 12 },
  'no-estoy': { base: 9 },
  faltar: { base: 8 },
  'apuntar-comida': { base: 12, screens: ['nutricion'] },
  'apuntar-peso': { base: 9, screens: ['nutricion'] },
  'que-falta': { base: 11, screens: ['nutricion'] },
  'nuevo-objetivo': { base: 10, screens: ['objetivos'] },
  'mis-marcas': { base: 9, screens: ['dashboard'] },
  'como-estoy': { base: 9, screens: ['dashboard'] },
  'check-in': { base: 9, screens: ['dashboard'] },
  'mi-racha': { base: 6, screens: ['dashboard'] },
  'que-toca-manana': { base: 8, screens: ['dashboard', 'planificacion'] },
  'por-que-hoy': { base: 8, screens: ['dashboard', 'planificacion'] },
  recovery: { base: 7 },
  corregir: { base: 9, screens: ['planificacion'] },
  'deshacer-registro': { base: 5, screens: ['planificacion'] },
  complejos: { base: 5, screens: ['planificacion'] },
  avisos: { base: 8 },
};

/** Cómo está el momento: lo que decide qué atajos suben. Todo lo opcional que no se sabe se deja sin poner. */
export interface TileContext {
  screen: RexScreen;
  /** Hora local (0-23). */
  hour: number;
  /** Cómo está la sesión de hoy: sin empezar, en marcha, hecha o un día de descanso. */
  session?: 'none' | 'pending' | 'in-progress' | 'done' | 'rest';
  /** Llegas cansado o con el día ámbar o rojo. */
  tired?: boolean;
  /** Hay una molestia activa. */
  pain?: boolean;
}

const inWindow = (hour: number, from: number, to: number) => hour >= from && hour < to;
/** Las horas en que apetece apuntar lo comido: desayuno, comida y cena. */
const isMealTime = (hour: number) => inWindow(hour, 8, 11) || inWindow(hour, 13, 16) || inWindow(hour, 20, 23);

/** La puntuación de una tesela en este momento: más es antes. Determinista (sin azar) para que el panel no cambie solo al reabrirlo. */
export function scoreTile(id: string, ctx: TileContext): number {
  const meta = TILE_META[id];
  let s = meta?.base ?? 10;
  if (meta?.screens) s += meta.screens.includes(ctx.screen) ? 20 : -12;
  const training = ctx.session === 'pending' || ctx.session === 'in-progress';

  if (id === 'acortar' || id === 'mas-dura' || id === 'otro-wod') {
    if (!training) s -= 25; // cambiar la sesión solo tiene sentido con una por hacer
    else if (id === 'acortar' && ctx.tired) s += 22;
    else if (id === 'mas-dura' && ctx.tired) s -= 15;
    else if (id === 'mas-dura') s += 4;
  }
  if (id === 'me-duele' && ctx.pain) s += 24;
  if (id === 'no-estoy' && ctx.tired && training) s += 14;
  if ((id === 'apuntar-comida' || id === 'que-falta') && isMealTime(ctx.hour)) s += 10;
  if (id === 'apuntar-peso' && inWindow(ctx.hour, 5, 11)) s += 5;
  if ((id === 'corregir' || id === 'deshacer-registro') && ctx.session !== 'done') s -= 30;
  if (id === 'corregir' && ctx.session === 'done') s += 12;
  if (id === 'check-in' && inWindow(ctx.hour, 5, 12)) s += 4;
  if (id === 'que-toca-manana' && (ctx.session === 'done' || ctx.hour >= 19)) s += 12;
  if (id === 'recovery' && (ctx.session === 'done' || ctx.session === 'rest')) s += 10;
  if (id === 'cambiar-dia' && ctx.session === 'rest') s -= 6;
  return s;
}

/** Lo que el atleta ha elegido: las que fija (salen siempre y primero, en ese orden) y las que esconde (no salen entre las principales). */
export interface TilePrefs {
  pinned: string[];
  hidden: string[];
}

export const EMPTY_PREFS: TilePrefs = { pinned: [], hidden: [] };
/** Cuántas teselas salen a la vista. */
export const MAX_SHOWN = 6;

const PREFS_KEY = 'tb-rex-tiles';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export function loadTilePrefs(storage: Storage | null | undefined): TilePrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return EMPTY_PREFS;
    const parsed = JSON.parse(raw) as Partial<TilePrefs>;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { pinned: [...new Set(strings(parsed.pinned))].slice(0, MAX_SHOWN), hidden: [...new Set(strings(parsed.hidden))] };
  } catch {
    return EMPTY_PREFS;
  }
}

export function saveTilePrefs(storage: Storage | null | undefined, prefs: TilePrefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* sin almacenamiento: las elecciones valen hasta recargar */
  }
}

/** Fija una tesela (al final de las fijadas) o la suelta si ya lo estaba. Con el máximo ya fijado no se añade otra. Una fijada deja de estar escondida. */
export function togglePinned(prefs: TilePrefs, id: string): TilePrefs {
  if (prefs.pinned.includes(id)) return { ...prefs, pinned: prefs.pinned.filter((x) => x !== id) };
  if (prefs.pinned.length >= MAX_SHOWN) return prefs;
  return { pinned: [...prefs.pinned, id], hidden: prefs.hidden.filter((x) => x !== id) };
}

/** Esconde una tesela de las principales (sigue en «Todos»), o la vuelve a enseñar. Esconder una fijada la suelta. */
export function toggleHidden(prefs: TilePrefs, id: string): TilePrefs {
  if (prefs.hidden.includes(id)) return { ...prefs, hidden: prefs.hidden.filter((x) => x !== id) };
  return { pinned: prefs.pinned.filter((x) => x !== id), hidden: [...prefs.hidden, id] };
}

/** Quita lo fijado y lo escondido: vuelve a decidir Rex. */
export const resetPrefs = (): TilePrefs => EMPTY_PREFS;

export interface RankedTiles {
  /** Las que salen a la vista: primero las fijadas, luego las que más puntúan, hasta `max`. */
  shown: string[];
  /** El resto, de más a menos puntuación (las escondidas al final). */
  rest: string[];
}

/** De entre las teselas disponibles (`ids`), cuáles salen a la vista según el momento y lo que el atleta ha fijado o escondido. */
export function rankTiles(ids: string[], ctx: TileContext, prefs: TilePrefs, max = MAX_SHOWN): RankedTiles {
  const available = new Set(ids);
  const pinned = prefs.pinned.filter((id) => available.has(id));
  const hidden = new Set(prefs.hidden);
  const scored = ids
    .filter((id) => !pinned.includes(id))
    .map((id) => ({ id, score: scoreTile(id, ctx) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const visible = scored.filter((t) => !hidden.has(t.id)).map((t) => t.id);
  const hiddenIds = scored.filter((t) => hidden.has(t.id)).map((t) => t.id);
  const shown = [...pinned, ...visible].slice(0, max);
  const rest = [...visible.slice(Math.max(0, max - pinned.length)), ...hiddenIds];
  return { shown, rest };
}
