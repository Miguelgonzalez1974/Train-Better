import { benchmarkWorkouts } from '../data/movements';
import type { DailySession, SessionBlockResult, SessionHistoryEntry, WodResult, WodScoreType } from '../data/athlete/types';

function inferScoreTypeFromFormat(format: string): WodScoreType {
  if (format.startsWith('For Time')) return 'time';
  if (format.startsWith('AMRAP')) return 'rounds+reps';
  if (format.startsWith('EMOM')) return 'reps';
  // "Al máximo · N x 3:00 …" -> se puntúa por repeticiones totales.
  if (format.startsWith('Al máximo')) return 'reps';
  // Test de complex (varios movimientos a la misma carga, ver "temporada" en strengthPrograms.ts)
  // — se puntua por el peso mas pesado completado, no por reps ni tiempo. Se comprueba antes que la
  // regla generica de "Test —" de abajo, que es para el test de maximo de reps.
  if (format.startsWith('Test — Complex')) return 'load';
  // Test de maximo de reps a carga submaxima — se puntua en repeticiones conseguidas, igual que un
  // EMOM, no en tiempo.
  if (format.startsWith('Test —')) return 'reps';
  // Die Set (peso auto-seleccionado por el atleta, ver "dieSet" en strengthPrograms.ts) — tambien se puntua en reps.
  if (format.startsWith('Die Set')) return 'reps';
  return 'time';
}

/** Partes de WOD que tiene la sesion: [1] un WOD normal, [1, 2] un dia de doble WOD, [] sin WOD. */
export function getWodParts(session: DailySession): (1 | 2)[] {
  const wod = session.blocks.filter((b) => b.block === 'wod');
  if (wod.length === 0) return [];
  return wod.some((b) => b.wodPart === 2) ? [1, 2] : [1];
}

/** Un resultado de WOD "0:00" / "0+0" / "0" es un formulario sin rellenar, no una marca. */
export function isMeaningfulWodResult(result: WodResult | undefined): result is WodResult {
  return Boolean(result) && !/^0([:+]0+)?$/.test(result!.value.trim());
}

/** Resultados de WOD anotados en una entrada del historial, por parte y solo los rellenados (0, 1 o 2). */
export function wodResultsOf(entry: SessionHistoryEntry): { part: 1 | 2; result: WodResult }[] {
  const out: { part: 1 | 2; result: WodResult }[] = [];
  if (isMeaningfulWodResult(entry.wodResult)) out.push({ part: 1, result: entry.wodResult });
  if (isMeaningfulWodResult(entry.wodResult2)) out.push({ part: 2, result: entry.wodResult2 });
  return out;
}

/**
 * Determina como debe puntuarse el WOD de la sesion (benchmark o custom) para pedir el input correcto.
 * En un dia de doble WOD cada parte se puntua aparte (`part`); en un dia normal solo existe la parte 1.
 */
export function getWodScoreType(session: DailySession, part: 1 | 2 = 1): WodScoreType | null {
  const all = session.blocks.filter((b) => b.block === 'wod');
  const wodEntries = all.some((b) => b.wodPart !== undefined) ? all.filter((b) => (b.wodPart ?? 1) === part) : part === 1 ? all : [];
  if (wodEntries.length === 0) return null;

  const benchmarkEntry = wodEntries.find((b) => b.movementId.startsWith('benchmark:'));
  if (benchmarkEntry) {
    const benchmarkId = benchmarkEntry.movementId.replace('benchmark:', '');
    const wod = benchmarkWorkouts.find((w) => w.id === benchmarkId);
    if (wod) return wod.scoreType;
  }

  const format = wodEntries[0]?.format;
  return format ? inferScoreTypeFromFormat(format) : null;
}

/** Encuentra el bloque de test 1RM del dia (fuerza u oly, si lo hay), para pedir el peso real levantado. */
export function getTestDayBlock(session: DailySession): SessionBlockResult | null {
  return session.blocks.find((b) => (b.block === 'strength' || b.block === 'oly') && b.format === 'Test 1RM') ?? null;
}
