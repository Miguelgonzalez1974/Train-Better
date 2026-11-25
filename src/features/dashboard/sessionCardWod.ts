import type { DailySession, SessionBlockResult } from '../../data/athlete/types';
import { benchmarkWorkouts, resolveMovementDisplayName } from '../../data/movements';
import { wodCapFor } from '../../engine/wodCap';

/** Cuántos movimientos se nombran antes de resumir el resto con «+2»: lo que cabe en dos líneas. */
const MAX_NAMES = 3;

const benchmarkOf = (b: SessionBlockResult) => (b.movementId.startsWith('benchmark:') ? benchmarkWorkouts.find((w) => w.id === b.movementId.slice('benchmark:'.length)) : undefined);

/** El nombre corto de un movimiento: sin aclaraciones entre paréntesis («Row (remo ergometro)» → «Row»). */
function shortName(id: string): string {
  const name = resolveMovementDisplayName(id).replace(/\s*\([^)]*\)/g, '').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Lo que es el WOD, en una línea: el nombre si es un clásico que se reconoce (Fran, Murph…); si no, sus movimientos, porque el nombre de una
 * programación («PushJerk 11/12») no dice qué toca.
 */
export function wodWhat(blocks: SessionBlockResult[]): string {
  const ids: string[] = [];
  for (const b of blocks) {
    const bench = benchmarkOf(b);
    if (bench && bench.category !== 'custom') return bench.name;
    const own = bench ? bench.movements.map((id) => b.benchmarkSwaps?.[id] ?? id) : [b.movementId];
    for (const id of own) if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return '';
  const names = ids.slice(0, MAX_NAMES).map((id) => (id.startsWith('benchmark:') ? (blocks[0].title ?? 'WOD') : shortName(id)));
  return `${names.join(' · ')}${ids.length > MAX_NAMES ? ` +${ids.length - MAX_NAMES}` : ''}`;
}

/** Cómo se hace y cuánto dura el WOD del día: «AMRAP 15 min», «por tiempo, límite 14 min», «intervalos 15 min»… Vacío si no se sabe. */
export function wodHow(session: DailySession): string {
  if (session.doubleWod) return 'doble WOD';
  const wod = session.blocks.find((b) => b.block === 'wod');
  if (!wod) return '';
  const format = (wod.format ?? '').trim();
  const cap = wodCapFor(session, 1);
  const written = format.match(/(\d+)\s*min/i)?.[1];
  const minutes = cap ? Math.round(cap.seconds / 60) : written ? Number(written) : null;
  const span = minutes ? ` ${minutes} min` : '';
  if (/emom/i.test(format)) return `EMOM${span}`;
  if (/^(every|cada|on the minute)/i.test(format)) return `intervalos${span}`;
  if (/^amrap/i.test(format)) return `AMRAP${span}`;
  if (cap?.kind === 'cap') return `por tiempo, límite ${minutes} min`;
  if (cap?.kind === 'amrap') return `${minutes} min`;
  if (/for time|por tiempo/i.test(format) || benchmarkOf(wod)?.scoreType === 'time') return 'por tiempo';
  // Un formato corto que no encaja en lo anterior («3 rondas por calidad») se enseña tal cual.
  return format.length <= 28 ? format : '';
}
