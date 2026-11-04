import type { DailySession, SessionBlockResult } from '../data/athlete/types';
import { benchmarkWorkouts } from '../data/movements';
import { getCatalogWod } from './wodCatalog';

/**
 * El límite de tiempo de un WOD, para el reloj de entreno. Hay dos clases:
 * - `cap`: el time cap de un WOD por tiempo. Al llegar a él sin haber terminado, el WOD queda como "no terminado".
 * - `amrap`: la duración de un AMRAP. Llegar a ella no es un fallo, es el final normal del WOD.
 * Solo salen los límites que el propio WOD declara (el cap de un benchmark o de una programación real, o los minutos de un
 * AMRAP); un WOD por tiempo sin cap conocido no lleva ninguno y el atleta lo puede poner a mano en el reloj.
 */
export interface WodCap {
  seconds: number;
  kind: 'cap' | 'amrap';
}

/** Formatos que se terminan por trabajo hecho (no por tiempo): su límite es un cap. */
const CAPPED_FORMATS = new Set(['forTime', 'chipper', 'ladder']);

/** Los bloques de WOD de una parte: en un día normal todos; en un doble WOD, los de esa parte. */
function partEntries(session: DailySession, part: 1 | 2): SessionBlockResult[] {
  const all = session.blocks.filter((b) => b.block === 'wod');
  return all.some((b) => b.wodPart !== undefined) ? all.filter((b) => (b.wodPart ?? 1) === part) : part === 1 ? all : [];
}

/** Minutos de un AMRAP escritos en el formato ("AMRAP 12 min", "AMRAP 10:00"), o null. */
function amrapMinutes(format: string | undefined): number | null {
  const m = format?.match(/^AMRAP\s*(\d+)\s*(?:min|:00)?/i);
  return m ? Number(m[1]) : null;
}

export function wodCapFor(session: DailySession, part: 1 | 2 = 1): WodCap | null {
  const entries = partEntries(session, part);
  if (entries.length === 0) return null;

  const benchmarkEntry = entries.find((b) => b.movementId.startsWith('benchmark:'));
  const benchmark = benchmarkEntry ? benchmarkWorkouts.find((w) => w.id === benchmarkEntry.movementId.replace('benchmark:', '')) : undefined;
  // El límite de un WOD por tiempo es un cap (se puede quedar sin terminar); el de uno que se puntúa por rondas o repeticiones (un
  // AMRAP, p. ej. Cindy con sus 20 min) es solo el final del WOD.
  if (benchmark?.timeCapMinutes) return { seconds: benchmark.timeCapMinutes * 60, kind: benchmark.scoreType === 'time' ? 'cap' : 'amrap' };

  const catalogId =
    entries.find((b) => b.wodCatalogId)?.wodCatalogId ??
    (benchmark ? `bm:${benchmark.id}` : undefined) ??
    (entries.find((b) => b.wodLibraryId) ? `lib:${entries.find((b) => b.wodLibraryId)!.wodLibraryId}` : undefined);
  const cat = catalogId ? getCatalogWod(catalogId) : undefined;
  if (cat?.durationMin) {
    if (cat.durationBasis === 'cap') return { seconds: cat.durationMin * 60, kind: CAPPED_FORMATS.has(cat.format) ? 'cap' : 'amrap' };
    if (cat.format === 'amrap' && (cat.durationBasis === 'format' || cat.durationBasis === 'header')) return { seconds: cat.durationMin * 60, kind: 'amrap' };
  }

  // WOD que genera el coach: solo un AMRAP declara su duración en el formato.
  const minutes = amrapMinutes(entries[0]?.format);
  return minutes ? { seconds: minutes * 60, kind: 'amrap' } : null;
}
