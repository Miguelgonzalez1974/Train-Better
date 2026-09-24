import raw from './pushjerkWods.json';
import { usesExcludedMovement } from '../movements/excluded';

/**
 * Biblioteca de WODs reales (programación de PushJerk, 2014-2026) para el coach. Cada WOD conserva su
 * texto original y trae sus movimientos ya traducidos a ids del catálogo, con la cantidad de cada línea
 * (reps, metros, calorías, segundos, "máx"). Solo entran WODs con todos los movimientos identificados
 * y todas las cantidades leídas — el resto se descarta al generar el archivo, no se adivina.
 * Las cargas del texto original son las de PushJerk (lb); el motor calcula las suyas desde tus PRs.
 */
export interface LibraryWod {
  id: string;
  /** Fecha en que PushJerk publicó el WOD (AAAA-MM-DD). */
  date: string;
  /** Primera línea del WOD sin los dos puntos: "3 rounds for time", "10 min AMRAP", "For time"... */
  header: string;
  scoreType: 'time' | 'rounds+reps' | 'reps';
  /** Objetivo publicado por la fuente ("10-12 min."), cuando lo hay. */
  goal?: string;
  /** Movimientos en el orden real de ejecución: [id de catálogo, cantidad]. */
  lines: [string, string][];
  /** Texto original completo (cabecera, líneas, notas de estructura). */
  original: string;
}

const allLibraryWods = raw as LibraryWod[];

/** WODs programables: sin los que llevan un movimiento excluido por el atleta (pistol — ver `data/movements/excluded.ts`). */
export const libraryWods: LibraryWod[] = allLibraryWods.filter((w) => !usesExcludedMovement(w.lines.map(([id]) => id), w.original));

// La búsqueda por id conserva todos: una sesión ya guardada que citase un WOD descartado sigue resolviéndose.
const byId = new Map(allLibraryWods.map((w) => [w.id, w]));

export function getLibraryWod(id: string): LibraryWod | undefined {
  return byId.get(id);
}
