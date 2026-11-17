/**
 * Capa de formato de cifras — para que kg, tiempos, porcentajes y conteos se vean IGUAL en toda la
 * app. Antes cada tarjeta lo hacía a su manera ("92" vs "22.5 kg", "13:20" a mano, "85%").
 */

/** Redondea a `decimals` y quita el ".0" sobrante ("92", "22.5"). */
export function fmtNumber(n: number, decimals = 1): string {
  const f = Number(n.toFixed(decimals));
  return Number.isInteger(f) ? String(f) : f.toFixed(decimals);
}

/** Carga con unidad — "92 kg", "22.5 kg". */
export function fmtKg(kg: number): string {
  return `${fmtNumber(kg, 1)} kg`;
}

/** Solo el número de la carga (la unidad va aparte, p.ej. bajo la cifra grande). */
export function fmtKgValue(kg: number): string {
  return fmtNumber(kg, 1);
}

/** Segundos → "m:ss" (o "h:mm:ss" si pasa de la hora). */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

const DAY_FORMATTER = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

/** Fecha ISO (yyyy-mm-dd) → "3 sep". */
export function fmtDay(iso: string): string {
  return DAY_FORMATTER.format(new Date(`${iso}T00:00:00`));
}
