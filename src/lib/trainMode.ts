/**
 * Cómo entrena cada atleta: «Entrenar» (una lista simple con el cronómetro siempre a mano; se apunta al acabar) o «Ir apuntando» (las
 * tarjetas serie a serie). Se pregunta una vez, se recuerda en este dispositivo y se cambia desde RexLab. Aquí también vive la hora de
 * inicio de la lista, para que el cierre ofrezca los minutos reales. Puro salvo por el almacenamiento, que se pasa de fuera.
 */

export type TrainMode = 'list' | 'cards';

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MODE_KEY = 'train-better.trainMode';
const START_KEY = 'train-better.trainListStart';

/** Una lista abierta hace más de esto ya no es «esta sesión»: se empieza otra. */
export const LIST_START_MAX_MS = 4 * 60 * 60 * 1000;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function readTrainMode(store: KeyValueStore | null): TrainMode | null {
  if (!store) return null;
  const v = safe(() => store.getItem(MODE_KEY), null);
  return v === 'list' || v === 'cards' ? v : null;
}

export function writeTrainMode(store: KeyValueStore | null, mode: TrainMode): void {
  if (!store) return;
  safe(() => store.setItem(MODE_KEY, mode), undefined);
}

/** La hora a la que se abrió la lista hoy; si no hay (o es demasiado vieja), se guarda `now` y se devuelve. */
export function listStartedAt(store: KeyValueStore | null, dateIso: string, now: number): number {
  if (!store) return now;
  const raw = safe(() => store.getItem(START_KEY), null);
  if (raw) {
    const [date, ms] = raw.split('|');
    const t = Number(ms);
    if (date === dateIso && Number.isFinite(t) && t <= now && now - t <= LIST_START_MAX_MS) return t;
  }
  safe(() => store.setItem(START_KEY, `${dateIso}|${now}`), undefined);
  return now;
}

/** Olvida la hora de inicio (al cerrar la sesión): la próxima lista empieza de cero. */
export function clearListStart(store: KeyValueStore | null): void {
  if (!store) return;
  safe(() => store.setItem(START_KEY, ''), undefined);
}

/** Minutos de la lista para prellenar el cierre: redondeados, y nunca por debajo de 10 ni por encima de 240 (un olvido no inventa una sesión de 5 horas). */
export function elapsedMinutes(startedAt: number, now: number): number {
  const min = Math.round((now - startedAt) / 60000);
  return Math.max(10, Math.min(240, min));
}

/** «32:18» o «1:05:09». */
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
