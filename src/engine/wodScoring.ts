import { benchmarkWorkouts } from '../data/movements';
import type { DailySession, SessionBlockResult, WodScoreType } from '../data/athlete/types';

function inferScoreTypeFromFormat(format: string): WodScoreType {
  if (format.startsWith('For Time')) return 'time';
  if (format.startsWith('AMRAP')) return 'rounds+reps';
  if (format.startsWith('EMOM')) return 'reps';
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

/** Determina como debe puntuarse el WOD de la sesion (benchmark o custom) para pedir el input correcto. */
export function getWodScoreType(session: DailySession): WodScoreType | null {
  const wodEntries = session.blocks.filter((b) => b.block === 'wod');
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
