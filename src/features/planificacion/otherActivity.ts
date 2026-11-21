import type { DailySession } from '../../data/athlete/types';
import { customDaySession } from './pastDayLog';

/**
 * «Hice otra cosa»: un día en que no se hizo la sesión prevista (una clase de CrossFit, salir a correr, el entreno de equipo…). Se
 * guarda como un día de verdad —esfuerzo y minutos, para que la carga, la racha y el cumplimiento lo vean— pero sin fingir que se
 * hizo lo prescrito: no hay series anotadas, así que nada de la sesión prevista sube cargas ni cuenta como cumplido. Puro.
 */

export type OtherKind = 'clase' | 'running' | 'bici' | 'fuerza' | 'equipo' | 'otro';

export interface OtherKindInfo {
  id: OtherKind;
  label: string;
  /** Cómo se llama el día en el historial. */
  title: string;
  /** Minutos que se proponen (se cambian con el selector). */
  minutes: number;
}

export const OTHER_KINDS: OtherKindInfo[] = [
  { id: 'clase', label: 'Clase CrossFit', title: 'Clase de CrossFit', minutes: 60 },
  { id: 'running', label: 'Running', title: 'Running', minutes: 45 },
  { id: 'bici', label: 'Bici', title: 'Bici', minutes: 60 },
  { id: 'fuerza', label: 'Fuerza libre', title: 'Fuerza libre', minutes: 60 },
  { id: 'equipo', label: 'Equipo', title: 'Entreno de equipo', minutes: 90 },
  { id: 'otro', label: 'Otro', title: 'Otra actividad', minutes: 60 },
];

export function otherKindInfo(kind: OtherKind): OtherKindInfo {
  return OTHER_KINDS.find((k) => k.id === kind) ?? OTHER_KINDS[OTHER_KINDS.length - 1];
}

export interface OtherActivity {
  kind: OtherKind;
  /** Cómo la llama el atleta («Spinning»); sustituye al nombre del tipo. Opcional. */
  name?: string;
  /** Resultado o peso clave en texto libre («12 rondas», «sentadilla 100 kg»). Opcional. */
  result?: string;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function otherTitle(a: OtherActivity): string {
  return clean(a.name) || otherKindInfo(a.kind).title;
}

export function otherNote(a: OtherActivity): string {
  const result = clean(a.result);
  return result ? `Registrado sin detalle de bloques. Resultado: ${result}.` : 'Registrado solo con esfuerzo y minutos, sin detalle de bloques.';
}

/** La sesión del día que se guarda en lugar de la prevista. */
export function otherDaySession(dateIso: string, mesocycleWeek: DailySession['mesocycleWeek'], a: OtherActivity): DailySession {
  return { ...customDaySession(dateIso, mesocycleWeek), customTitle: otherTitle(a), customNote: otherNote(a) };
}
