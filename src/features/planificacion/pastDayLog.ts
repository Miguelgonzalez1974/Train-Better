import type { DailySession, SessionHistoryEntry, WorkSetEntry } from '../../data/athlete/types';
import { complexLogId } from '../../data/complexes';
import { getMovementById } from '../../data/movements';
import { parseWorkingReps } from '../../engine/setFeedback';

/**
 * Registrar a posteriori un día que se pasó sin apuntar (ver `LogPastDay`): la sesión "otra cosa" y el orden del historial.
 * Una sesión sin detalle de bloques es lo que se guarda cuando el atleta hizo algo distinto de lo previsto (entreno de equipo, otro
 * deporte…): solo RPE y duración, para que la carga, la racha y el esfuerzo vean el día sin fingir que se hizo lo prescrito.
 */

export function customDaySession(dateIso: string, mesocycleWeek: DailySession['mesocycleWeek']): DailySession {
  return {
    date: dateIso,
    mesocycleWeek,
    isRestDay: false,
    blocks: [],
    source: 'custom',
    customTitle: 'Entreno de equipo',
    customNote: 'Registrado solo con RPE, sin detalle de bloques.',
    swapLabel: 'Otra cosa',
    editedByAthlete: true,
  };
}

/** El historial por fecha (estable: dos entradas del mismo día conservan su orden). El motor da por hecho que el último es el más reciente. */
export function sortHistoryByDate(history: SessionHistoryEntry[]): SessionHistoryEntry[] {
  return [...history].sort((a, b) => a.date.localeCompare(b.date));
}

/** ¿El historial ya está por fecha? (para no reescribirlo sin necesidad). */
export function isHistorySorted(history: SessionHistoryEntry[]): boolean {
  return history.every((entry, i) => i === 0 || history[i - 1].date <= entry.date);
}

// ---------------------------------------------------------------------------------------------
// Series y pesos de un día pasado
// ---------------------------------------------------------------------------------------------

export interface PlannedLiftRow {
  /** Número de serie (1-indexado), como en el modo enfocado. */
  set: number;
  kg: number;
  reps: number;
}

export interface PlannedLift {
  /** Clave del registro de series: el movimiento, o `complex:<id>` si es un complejo (no cuenta para el 1RM de ningún levantamiento). */
  logId: string;
  name: string;
  block: 'strength' | 'oly';
  rows: PlannedLiftRow[];
}

/**
 * Las series de fuerza y halterofilia que el coach tenía previstas para ese día, con su peso y repeticiones: las mismas filas que
 * enseña el modo enfocado (una por serie; en una rampa u ola, cada serie con su peso y reps; en un single u EMOM de oly, una sola fila).
 * No incluye el calentamiento de barra ni los bloques sin series que contar.
 */
export function plannedLifts(session: DailySession): PlannedLift[] {
  const out: PlannedLift[] = [];
  for (const b of session.blocks) {
    if ((b.block !== 'strength' && b.block !== 'oly') || b.subgroup) continue;
    const plan = b.setPlan && b.setPlan.length >= 2 ? b.setPlan : undefined;
    const sets = b.sets ?? 0;
    const singleLog = Boolean(b.logAsSingle) && sets <= 1;
    if (!(plan || sets > 1 || singleLog)) continue;
    const rowCount = plan ? plan.length : singleLog ? 1 : sets;
    const workReps = parseWorkingReps(b.reps ?? '') ?? 0;
    const prescribed = b.loadKg ?? 0;
    // Un trabajo sin peso (banda, activación) no aporta al progreso ni al 1RM: no se pregunta.
    if (!plan && prescribed <= 0) continue;
    if (plan && plan.every((s) => s.kg <= 0)) continue;
    out.push({
      logId: b.complex ? complexLogId(b.complex.id) : b.movementId,
      name: b.complex?.name ?? getMovementById(b.movementId)?.name ?? b.movementId,
      block: b.block,
      rows: Array.from({ length: rowCount }, (_, i) => ({ set: i + 1, kg: plan ? plan[i].kg : prescribed, reps: plan ? plan[i].reps : workReps })),
    });
  }
  return out;
}

/** Lo que el atleta confirma de cada serie: si la hizo y con qué peso. Clave `${logId}:${set}`. */
export type LiftState = Record<string, { done: boolean; kg: number }>;

export const liftKey = (logId: string, set: number) => `${logId}:${set}`;

/** Todo como estaba previsto: cada serie hecha y con su peso. */
export function plannedLiftState(lifts: PlannedLift[]): LiftState {
  const state: LiftState = {};
  for (const l of lifts) for (const r of l.rows) state[liftKey(l.logId, r.set)] = { done: true, kg: r.kg };
  return state;
}

/** Las series que se guardan en el registro: las hechas y con peso (una serie sin peso no aporta al progreso ni al 1RM). */
export function workSetsFrom(dateIso: string, lifts: PlannedLift[], state: LiftState): WorkSetEntry[] {
  const out: WorkSetEntry[] = [];
  for (const l of lifts) {
    for (const r of l.rows) {
      const s = state[liftKey(l.logId, r.set)];
      if (s?.done && s.kg > 0) out.push({ date: dateIso, movementId: l.logId, block: l.block, setNumber: r.set, kg: s.kg, reps: r.reps });
    }
  }
  return out;
}