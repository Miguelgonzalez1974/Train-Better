import type { PainFlag } from './types';

/**
 * Huella del historial de sesiones registradas: fecha de la ultima + cuantas hay. Una sesion cacheada
 * la lleva estampada (`DailySession.genHistoryStamp`) para saber con que historial se genero — si el
 * historial cambia despues (se registra una sesion, o una retroactiva), la cacheada de un dia aun no
 * entrenado ya no refleja lo que el coach sabe (ACWR, RPE, descarga, calibracion...) y se regenera.
 */
export function lastHistoryDate(history: readonly { date: string }[]): string {
  return history.reduce((max, e) => (e.date > max ? e.date : max), '');
}

export function historyStamp(history: readonly { date: string }[]): string {
  return `${lastHistoryDate(history)}#${history.length}`;
}

/** Dias tras el fin de un aviso durante los que la carga de esa zona vuelve en rampa (ver `PAIN_REINTRO_WEEKS` en el motor). */
const PAIN_REINTRO_STAMP_DAYS = 14;

function isoDaysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / 86_400_000);
}

/**
 * Huella de los avisos de molestia que afectan a `dateIso`: las zonas con un aviso activo ese dia y las que estan
 * en reintroduccion progresiva. Una sesion cacheada la lleva estampada (`DailySession.genPainStamp`): si el atleta
 * marca, quita o deja caducar un aviso despues, la sesion de ese dia (que se genero sin el aviso, o con otro) ya
 * no vale y se regenera — no solo la de hoy, tambien las de los dias siguientes ya cacheados por la vista previa.
 */
export function painStamp(painFlags: readonly PainFlag[] | undefined, dateIso: string): string {
  const active = new Set<string>();
  const reintro = new Set<string>();
  for (const f of painFlags ?? []) {
    const end = f.clearedDate ?? f.until;
    const isActive = !f.clearedDate && (f.until === null || f.until >= dateIso);
    if (isActive) active.add(f.area);
    else if (end && isoDaysBetween(end, dateIso) >= 0 && isoDaysBetween(end, dateIso) < PAIN_REINTRO_STAMP_DAYS) reintro.add(f.area);
  }
  for (const a of active) reintro.delete(a);
  return `${[...active].sort().join(',')}|${[...reintro].sort().join(',')}`;
}
