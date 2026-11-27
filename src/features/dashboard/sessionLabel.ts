import type { DailySession, SessionBlockResult, SessionHistoryEntry, SkippedPart, WorkSetEntry } from '../../data/athlete/types';
import { resolveMovementDisplayName } from '../../data/movements';
import { isRecoveryBlock } from '../../engine/energyBonus';

/**
 * De qué iba el entreno, en pocas palabras, para la línea pequeña de su fila: «Recovery», «DL + WOD», «Snatch + WOD», «Doble WOD»… Sale de lo que
 * hiciste (las series anotadas y las partes que saltaste); la sesión guardada solo completa lo que no se anotó. Puro.
 */

/** Los nombres cortos de box, sobre el nombre del movimiento (así valen también las variantes: «Deficit Deadlift» → «Deficit DL»). */
const SHORT: [RegExp, string][] = [
  [/Romanian Deadlift/i, 'RDL'],
  [/Deadlift/i, 'DL'],
  [/Back Squat/i, 'BS'],
  [/Front Squat/i, 'FS'],
  [/Overhead Squat/i, 'OHS'],
  [/(Strict|Shoulder) Press/i, 'SP'],
  [/Push Press/i, 'PP'],
  [/Push Jerk/i, 'PJ'],
  [/Bench Press/i, 'Bench'],
  [/Dumbbell/i, 'DB'],
];

export function shortLift(name: string): string {
  // Lo que va entre paréntesis («(convencional)», «(pausa)») sobra en una línea tan corta.
  const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  return SHORT.reduce((text, [pattern, short]) => text.replace(pattern, short), clean);
}

/** En halterofilia basta la familia: un complejo o una variante se lee «Snatch», «Clean», «C&J» o «Jerk». */
export function olyName(name: string): string {
  if (/snatch/i.test(name)) return 'Snatch';
  if (/clean/i.test(name)) return /jerk/i.test(name) ? 'C&J' : 'Clean';
  if (/jerk/i.test(name)) return 'Jerk';
  return shortLift(name);
}

export interface SessionLabelInput {
  entry: SessionHistoryEntry;
  /** La sesión guardada de ese día; en un día antiguo puede no estar ya. */
  session: DailySession | null;
  /** Las series anotadas (de cualquier día: se filtran aquí). */
  workLog: WorkSetEntry[];
}

export function sessionLabel(input: SessionLabelInput): string | undefined {
  // Es una línea de adorno: un dato guardado raro nunca debe dejar el Resumen sin pintar.
  try {
    return labelFor(input);
  } catch (error) {
    console.error('No se pudo resumir la sesión:', error);
    return undefined;
  }
}

function labelFor({ entry, session, workLog }: SessionLabelInput): string | undefined {
  // Un entreno distinto del previsto («Hice otra cosa») ya se llama por su nombre.
  if (session?.source === 'custom') return undefined;

  const skippedParts: SkippedPart[] = entry.skipped ?? [];
  const skipped = (block: SkippedPart['block']) => skippedParts.some((p) => p.block === block);
  const planned = (block: SessionBlockResult['block']) => (session?.blocks ?? []).filter((b) => b.block === block);

  // El WOD de un día doble solo cuenta como saltado si no se hizo ninguna de sus dos partes.
  const wodSkips = skippedParts.filter((p) => p.block === 'wod');
  const wodSkipped = session?.doubleWod ? wodSkips.some((p) => p.part === undefined) || new Set(wodSkips.map((p) => p.part)).size > 1 : wodSkips.length > 0;
  const wodBlocks = entry.wodBlocks?.length ? entry.wodBlocks : planned('wod');
  const didWod = !wodSkipped && (wodBlocks.length > 0 || Boolean(entry.wodResult));
  if (didWod && wodBlocks.some(isRecoveryBlock)) return 'Recovery';

  /** El levantamiento principal de un bloque: el de la sesión, salvo que lo anotado diga que hiciste otro. */
  function lift(block: 'strength' | 'oly'): string | undefined {
    if (skipped(block)) return undefined;
    const lifts = planned(block).filter((b) => !b.subgroup);
    // En halterofilia el principal es el último (los primeros son los de técnica).
    const main = block === 'oly' ? lifts[lifts.length - 1] : lifts[0];
    const sets = workLog.filter((s) => s.date === entry.date && s.block === block && Boolean(s.movementId));
    const mainDone = main && (sets.length === 0 || sets.some((s) => s.movementId === main.movementId || (main.complex && s.movementId.includes(main.complex.id))));
    const heaviest = sets.reduce<WorkSetEntry | undefined>((best, s) => (!best || s.kg > best.kg ? s : best), undefined);
    const name = mainDone ? (main.complex?.name ?? resolveMovementDisplayName(main.movementId)) : heaviest ? resolveMovementDisplayName(heaviest.movementId) : undefined;
    if (!name) return undefined;
    return block === 'oly' ? olyName(name) : shortLift(name);
  }
  const main = lift('strength') ?? lift('oly');

  if (didWod) {
    if (session?.doubleWod && wodSkips.length === 0) return 'Doble WOD';
    return main ? `${main} + WOD` : 'WOD';
  }
  const accessory = planned('accessory').length > 0 && !skipped('accessory');
  if (main) {
    // Un día que no traía WOD (el sábado de fuerza) se cuenta por lo que es; uno en el que lo saltaste, solo por el levantamiento.
    return session && planned('wod').length === 0 && accessory ? 'Fuerza + accesorio' : main;
  }
  if (accessory) return 'Accesorio';
  return planned('skill').length > 0 && !skipped('skill') ? 'Técnica' : undefined;
}
