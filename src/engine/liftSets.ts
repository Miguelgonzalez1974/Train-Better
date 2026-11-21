import type { SessionBlockResult, SetQuality, WorkSetEntry } from '../data/athlete/types';
import { complexLogId } from '../data/complexes';
import { parseWorkingReps } from './setFeedback';

/**
 * Anotar los pesos de un ejercicio de barra a posteriori, serie a serie, sin tocar cada serie: la sesión prevista como lista de filas ya
 * rellenas y unas pocas operaciones que cubren los casos reales. Subí la serie top (las demás se mueven en proporción), subí o bajé todas,
 * cambié una serie (las siguientes se mueven igual salvo las que toqué a mano), hice menos series, una no salió. Puro: lo pinta `LogAll`.
 */

/** Paso de los botones − y +, en kilos. */
export const KG_STEP = 2.5;

export interface LiftPlanRow {
  n: number;
  reps: number;
  plannedKg: number;
}

/** Un ejercicio de barra de la sesión que se puede anotar serie a serie. */
export interface LiftPlan {
  /** Clave del registro de series: el movimiento, o `complex:<id>` si es un complejo. */
  mid: string;
  blk: 'strength' | 'oly';
  rows: LiftPlanRow[];
  /** Series de cada ola cuando la rampa son varias olas seguidas; ausente si no hay olas. */
  waveSize?: number;
}

/** Las series de un ejercicio de barra, o null si no se anota por series (calentamiento, un técnico sin series…). */
export function liftPlanOf(b: SessionBlockResult): LiftPlan | null {
  if ((b.block !== 'strength' && b.block !== 'oly') || b.subgroup) return null;
  const sets = b.sets ?? 0;
  const singleLog = Boolean(b.logAsSingle) && sets <= 1;
  const plan = b.setPlan && b.setPlan.length >= 2 ? b.setPlan : undefined;
  if (!plan && sets <= 1 && !singleLog) return null;
  const rowCount = plan ? plan.length : singleLog ? 1 : sets;
  const workReps = parseWorkingReps(b.reps ?? '') ?? 0;
  const waveSize = plan && b.waveSize && b.waveSize >= 2 && plan.length > b.waveSize && plan.length % b.waveSize === 0 ? b.waveSize : undefined;
  return {
    mid: b.complex ? complexLogId(b.complex.id) : b.movementId,
    blk: b.block === 'oly' ? 'oly' : 'strength',
    rows: Array.from({ length: rowCount }, (_, i) => ({ n: i + 1, reps: plan ? plan[i].reps : workReps, plannedKg: plan ? plan[i].kg : b.loadKg ?? 0 })),
    ...(waveSize ? { waveSize } : {}),
  };
}

export interface RowState {
  n: number;
  reps: number;
  plannedKg: number;
  kg: number;
  /** Se tocó a mano: los cambios de otras series ya no la mueven. */
  manual: boolean;
  quality?: SetQuality;
}

export interface LiftEdit {
  rows: RowState[];
  /** Series hechas: las primeras `done`; el resto no se hizo. */
  done: number;
}

const round4 = (v: number) => Math.max(0, Math.round(v * 4) / 4);
const roundStep = (v: number) => Math.max(0, Math.round(v / KG_STEP) * KG_STEP);

/** Todo como estaba previsto, salvo lo que ya estuviera anotado hoy (peso y cómo salió), que manda. */
export function initialEdit(plan: LiftPlan, logged: WorkSetEntry[]): LiftEdit {
  const rows = plan.rows.map<RowState>((r) => {
    const entry = logged.find((e) => e.movementId === plan.mid && e.setNumber === r.n);
    const kg = entry ? round4(entry.kg) : r.plannedKg;
    return { n: r.n, reps: r.reps, plannedKg: r.plannedKg, kg, manual: Boolean(entry && (kg !== r.plannedKg || entry.quality)), ...(entry?.quality ? { quality: entry.quality } : {}) };
  });
  return { rows, done: rows.length };
}

/** La serie más pesada (la última si hay empate): la «top». */
export function topIndex(rows: RowState[]): number {
  let best = 0;
  rows.forEach((r, i) => {
    if (r.kg >= rows[best].kg) best = i;
  });
  return best;
}

/** ¿Todas las series previstas llevan el mismo peso? (series rectas: un solo peso para todas). */
export function isStraight(plan: LiftPlan): boolean {
  return plan.rows.every((r) => r.plannedKg === plan.rows[0].plannedKg);
}

/** Cambia una serie `delta` kilos: las siguientes que no se tocaron a mano se mueven lo mismo. */
export function adjustRow(edit: LiftEdit, index: number, delta: number): LiftEdit {
  const rows = edit.rows.map((r, i) => {
    if (i === index) return { ...r, kg: round4(r.kg + delta), manual: true };
    if (i > index && !r.manual) return { ...r, kg: round4(r.kg + delta) };
    return r;
  });
  return { ...edit, rows };
}

/** Sube o baja todas las series `delta` kilos: la forma de la rampa se mantiene. */
export function adjustAll(edit: LiftEdit, delta: number): LiftEdit {
  return { ...edit, rows: edit.rows.map((r) => ({ ...r, kg: round4(r.kg + delta) })) };
}

/**
 * Pone la serie top en `kg` y mueve las demás en proporción (redondeadas a 2,5 kg). En series rectas es «el peso de todas». Las que se tocaron a mano no se
 * mueven. Con una serie top sin peso (peso corporal) no hace nada.
 */
export function setTop(edit: LiftEdit, kg: number): LiftEdit {
  const top = topIndex(edit.rows);
  const current = edit.rows[top].kg;
  const next = round4(kg);
  if (current <= 0 || next === current) return edit;
  const ratio = next / current;
  return {
    ...edit,
    rows: edit.rows.map((r, i) => {
      if (i === top) return { ...r, kg: next };
      if (r.manual || r.kg <= 0) return r;
      return { ...r, kg: roundStep(r.kg * ratio) };
    }),
  };
}

/** Las series de una ola (índices de fila), para ajustarla por separado. */
export function waveRange(plan: LiftPlan, wave: number): number[] {
  if (!plan.waveSize) return plan.rows.map((_, i) => i);
  return plan.rows.map((_, i) => i).filter((i) => Math.floor(i / plan.waveSize!) === wave);
}

/** Sube o baja un conjunto de series (una ola) `delta` kilos. */
export function adjustRange(edit: LiftEdit, indices: number[], delta: number): LiftEdit {
  const set = new Set(indices);
  return { ...edit, rows: edit.rows.map((r, i) => (set.has(i) ? { ...r, kg: round4(r.kg + delta) } : r)) };
}

/** Cuántas series se hicieron (de 0 a las previstas). */
export function setDone(edit: LiftEdit, done: number): LiftEdit {
  return { ...edit, done: Math.max(0, Math.min(edit.rows.length, Math.round(done))) };
}

/** Cómo salió una serie: bien → justa → no salió → bien. */
export function cycleQuality(edit: LiftEdit, index: number): LiftEdit {
  const order: (SetQuality | undefined)[] = [undefined, 'justa', 'fallada'];
  return {
    ...edit,
    rows: edit.rows.map((r, i) => {
      if (i !== index) return r;
      const next = order[(order.indexOf(r.quality) + 1) % order.length];
      const { quality: _old, ...rest } = r;
      return next ? { ...rest, quality: next, manual: true } : rest;
    }),
  };
}

/** Vuelve a lo previsto: pesos, series hechas y cómo salió. */
export function resetEdit(plan: LiftPlan): LiftEdit {
  return { rows: plan.rows.map((r) => ({ n: r.n, reps: r.reps, plannedKg: r.plannedKg, kg: r.plannedKg, manual: false })), done: plan.rows.length };
}

/** ¿Algo es distinto de lo previsto? (pesos, series hechas o cómo salió). */
export function isChanged(edit: LiftEdit): boolean {
  return edit.done !== edit.rows.length || edit.rows.some((r) => r.kg !== r.plannedKg || r.quality);
}

export interface SetWrite {
  n: number;
  kg: number;
  reps: number;
  quality?: SetQuality;
  /** Sin tocar: se da por buena como estaba prevista (no cuenta como evidencia para el coach). */
  asPlanned: boolean;
}

/** Lo que hay que guardar (las series hechas) y lo que hay que borrar (las que no se hicieron). */
export function commitOf(edit: LiftEdit): { write: SetWrite[]; clear: number[] } {
  const write = edit.rows
    .filter((_, i) => i < edit.done)
    .map<SetWrite>((r) => ({ n: r.n, kg: r.kg, reps: r.reps, ...(r.quality ? { quality: r.quality } : {}), asPlanned: r.kg === r.plannedKg && !r.quality && !r.manual }));
  const clear = edit.rows.filter((_, i) => i >= edit.done).map((r) => r.n);
  return { write, clear };
}
