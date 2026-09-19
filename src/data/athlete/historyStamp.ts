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
