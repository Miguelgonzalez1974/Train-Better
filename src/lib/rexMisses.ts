/**
 * Las frases que Rex no ha entendido (las que acaban en «No te he entendido»), guardadas en este dispositivo. Sirven para ver con datos reales dónde
 * falla la caja y qué conviene enseñarle a continuación. Solo se guarda el texto que escribes, la pantalla y cuándo; nunca sale del móvil salvo que lo
 * copies tú desde «Cuenta y datos». Un máximo de 60 frases distintas; si se repite una, sube su contador. Sin almacenamiento, no hace nada.
 */
const KEY = 'tb-rex-misses';
const MAX = 60;
const MAX_LEN = 160;

export interface RexMiss {
  text: string;
  screen: string;
  /** Fecha y hora ISO de la última vez. */
  at: string;
  count: number;
}

const clean = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, MAX_LEN);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function read(): RexMiss[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RexMiss[]).filter((m) => typeof m?.text === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: RexMiss[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sin almacenamiento: no se recuerda y ya */
  }
}

export function recordMiss(text: string, screen: string, now: Date = new Date()): void {
  const t = clean(text);
  if (t === '') return;
  const list = read();
  const found = list.find((m) => same(m.text, t));
  if (found) {
    found.count += 1;
    found.at = now.toISOString();
    found.screen = screen;
  } else {
    list.push({ text: t, screen, at: now.toISOString(), count: 1 });
  }
  list.sort((a, b) => b.at.localeCompare(a.at));
  write(list.slice(0, MAX));
}

/** Las más recientes primero. */
export function listMisses(): RexMiss[] {
  return read().sort((a, b) => b.at.localeCompare(a.at));
}

export function clearMisses(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nada que borrar */
  }
}
