import type { RexNote } from '../data/athlete/types';

/**
 * La memoria de Rex: lo que el atleta le ha pedido que recuerde. Puro, sin almacenamiento: quien lo usa guarda el resultado en el perfil.
 * Hay un recuerdo de tiempo por día de la semana (el último que se dice sustituye al anterior) y notas libres.
 */

export const REX_NOTES_LIMIT = 30;
/** Largo máximo de una nota libre. */
export const REX_NOTE_MAX_CHARS = 140;

const WEEKDAY_PLURAL = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados'];

/** «los jueves» */
export const weekdayPlural = (weekday: number): string => WEEKDAY_PLURAL[weekday] ?? 'ese día';

export type NewRexNote = { kind: 'tiempo'; weekday: number; minutes: number } | { kind: 'nota'; text: string };

/** Lo que se dice de un recuerdo, en una frase corta («Los jueves: 45 min», «Tengo la muñeca delicada»). */
export function describeNote(note: RexNote): string {
  if (note.kind === 'tiempo') {
    const day = weekdayPlural(note.weekday);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}: ${note.minutes} min`;
  }
  return note.text;
}

let counter = 0;
const newId = (now: number): string => `n${now.toString(36)}${(counter++ % 1296).toString(36)}`;

/**
 * Apunta un recuerdo. Uno de tiempo del mismo día sustituye al anterior; una nota idéntica a otra no se repite. Si se pasa el tope se van las más viejas.
 * Devuelve la lista nueva y el recuerdo apuntado (o el que ya había, si era igual).
 */
export function addNote(notes: RexNote[] | undefined, input: NewRexNote, now: number = Date.now()): { notes: RexNote[]; note: RexNote } {
  const createdAt = new Date(now).toISOString().slice(0, 10);
  const list = notes ?? [];
  if (input.kind === 'tiempo') {
    const minutes = Math.max(10, Math.min(240, Math.round(input.minutes)));
    const note: RexNote = { id: newId(now), kind: 'tiempo', weekday: input.weekday, minutes, createdAt };
    const kept = list.filter((n) => !(n.kind === 'tiempo' && n.weekday === input.weekday));
    return { notes: [...kept, note].slice(-REX_NOTES_LIMIT), note };
  }
  const text = input.text.trim().replace(/\s+/g, ' ').slice(0, REX_NOTE_MAX_CHARS);
  const same = list.find((n) => n.kind === 'nota' && n.text.toLowerCase() === text.toLowerCase());
  if (same) return { notes: list, note: same };
  const note: RexNote = { id: newId(now), kind: 'nota', text, createdAt };
  return { notes: [...list, note].slice(-REX_NOTES_LIMIT), note };
}

export type NoteSelector = 'todo' | { weekday: number } | { id: string } | { text: string };

/** Los recuerdos que encajan con lo que se pide olvidar. */
export function matchingNotes(notes: RexNote[] | undefined, by: NoteSelector): RexNote[] {
  const list = notes ?? [];
  if (by === 'todo') return list;
  if ('weekday' in by) return list.filter((n) => n.kind === 'tiempo' && n.weekday === by.weekday);
  if ('id' in by) return list.filter((n) => n.id === by.id);
  const needle = by.text.trim().toLowerCase();
  if (needle.length < 3) return [];
  return list.filter((n) => n.kind === 'nota' && (n.text.toLowerCase().includes(needle) || needle.includes(n.text.toLowerCase())));
}

/** Quita lo que encaja. Devuelve la lista que queda y lo quitado. */
export function removeNotes(notes: RexNote[] | undefined, by: NoteSelector): { notes: RexNote[]; removed: RexNote[] } {
  const removed = matchingNotes(notes, by);
  const ids = new Set(removed.map((n) => n.id));
  return { notes: (notes ?? []).filter((n) => !ids.has(n.id)), removed };
}

/** Los minutos de los que dispone el atleta en un día de la semana según lo que ha dicho, o null si no ha dicho nada. */
export function timeLimitFor(notes: RexNote[] | undefined, weekday: number): number | null {
  const hit = (notes ?? []).find((n): n is Extract<RexNote, { kind: 'tiempo' }> => n.kind === 'tiempo' && n.weekday === weekday);
  return hit ? hit.minutes : null;
}
