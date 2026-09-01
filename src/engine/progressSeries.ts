import type { PrLogEntry } from '../data/athlete/types';

export interface PrPoint {
  date: string;
  kg: number;
}

/**
 * Serie temporal de un levantamiento a partir de `prLog` (ver [[PrLogEntry]]) — puntos ordenados
 * por fecha, un valor por día (si un día tiene varios cambios, gana el último). `prLog` siembra un
 * punto base por levantamiento con peso la primera vez que se guardan PRs, así que una serie de un
 * solo punto significa "aún no se ha movido" y no dibuja tendencia.
 */
export function buildPrSeries(prLog: PrLogEntry[], key: string): PrPoint[] {
  const byDate = new Map<string, number>();
  for (const entry of prLog) {
    if (entry.key !== key || !(entry.kg > 0)) continue;
    byDate.set(entry.date, entry.kg);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, kg]) => ({ date, kg }));
}

export interface PrProgress {
  currentKg: number;
  firstKg: number;
  /** Cambio desde el primer punto de la serie. */
  deltaKg: number;
  deltaPct: number;
  /** Valor vigente en `sinceIso` (último punto con fecha <= sinceIso) y el cambio desde ahí — para "desde que empezó el macro". `null` si no se pasó `sinceIso` o no hay punto anterior a esa fecha. */
  sinceKg: number | null;
  sinceDeltaKg: number | null;
}

export function summarisePrProgress(series: PrPoint[], sinceIso?: string): PrProgress | null {
  if (series.length < 2) return null;
  const currentKg = series[series.length - 1].kg;
  const firstKg = series[0].kg;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  let sinceKg: number | null = null;
  if (sinceIso) {
    const before = [...series].reverse().find((p) => p.date <= sinceIso);
    sinceKg = before ? before.kg : null;
  }

  return {
    currentKg,
    firstKg,
    deltaKg: round1(currentKg - firstKg),
    deltaPct: firstKg > 0 ? round1(((currentKg - firstKg) / firstKg) * 100) : 0,
    sinceKg,
    sinceDeltaKg: sinceKg != null ? round1(currentKg - sinceKg) : null,
  };
}
