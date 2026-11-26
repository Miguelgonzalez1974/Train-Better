import type { DailySession } from './types';
import type { AthleteRepository, DaySnapshot } from './localRepository';

/**
 * Corregir una sesión quita su registro mientras se corrige (así se puede volver a guardar). Aquí queda una copia en el dispositivo hasta que se
 * guarda o se cancela: si la app se cierra, se actualiza o se sale a medias, el día se devuelve tal como estaba.
 */

const KEY = 'train-better:pending-correction';

export interface PendingCorrection {
  snapshot: DaySnapshot;
  /** La sesión del día antes de empezar a corregir. */
  session: DailySession;
}

export function keepPendingCorrection(pending: PendingCorrection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch (error) {
    console.error('No se pudo guardar la copia de la corrección:', error);
  }
}

/** La corrección ha terminado (guardada o cancelada): la copia sobra. */
export function dropPendingCorrection(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (error) {
    console.error('No se pudo borrar la copia de la corrección:', error);
  }
}

function readPending(): PendingCorrection | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PendingCorrection | null;
    return parsed?.snapshot?.date && parsed.session?.date ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Devuelve el registro de una corrección que quedó a medias. Solo se llama cuando no hay ninguna en marcha (al arrancar la app o al salir de
 * Planificación). Si ese día ya tiene otro registro, manda el nuevo. true si ha devuelto algo.
 */
export function recoverPendingCorrection(repo: Pick<AthleteRepository, 'restoreDay' | 'saveCachedSession'>): boolean {
  const pending = readPending();
  if (!pending) {
    dropPendingCorrection();
    return false;
  }
  try {
    const restored = repo.restoreDay(pending.snapshot);
    if (restored) repo.saveCachedSession(pending.session);
    dropPendingCorrection();
    return restored;
  } catch (error) {
    // La copia se conserva: se vuelve a intentar la próxima vez.
    console.error('No se pudo devolver la corrección a medias:', error);
    return false;
  }
}
