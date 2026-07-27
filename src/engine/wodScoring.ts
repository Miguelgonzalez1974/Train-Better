import { benchmarkWorkouts } from '../data/movements';
import type { DailySession, WodScoreType } from '../data/athlete/types';

function inferScoreTypeFromFormat(format: string): WodScoreType {
  if (format.startsWith('For Time')) return 'time';
  if (format.startsWith('AMRAP')) return 'rounds+reps';
  if (format.startsWith('EMOM')) return 'reps';
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
