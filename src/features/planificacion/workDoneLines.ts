import type { DailySession, WorkSetEntry } from '../../data/athlete/types';
import { complexLogId } from '../../data/complexes';
import { getMovementById } from '../../data/movements';
import { fmtKg, fmtNumber } from '../../lib/format';

/** "4/5 series · 90 kg" (o rango "85–95 kg") a partir del registro serie a serie, o null si no hay. */
export function workSummary(workLog: WorkSetEntry[], movementId: string, prescribedSets: number): string | null {
  const sets = workLog.filter((e) => e.movementId === movementId).sort((a, b) => a.setNumber - b.setNumber);
  if (sets.length === 0) return null;
  const kgs = sets.map((s) => s.kg).filter((k) => k > 0);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const kgLabel = kgs.length === 0 ? '' : min === max ? ` · ${fmtKg(max)}` : ` · ${fmtNumber(min)}–${fmtKg(max)}`;
  const total = prescribedSets > 0 ? `${sets.length}/${prescribedSets}` : String(sets.length);
  return `${total} series${kgLabel}`;
}

export interface WorkDoneLine {
  name: string;
  /** «4/4 series · 67.5 kg». */
  text: string;
}

/**
 * Lo que de verdad se ha hecho en los bloques de fuerza y oly, a partir del registro serie a serie de hoy: una línea por movimiento con
 * series anotadas. Sirve tanto en una sesión en marcha («2/4 series») como en una ya cerrada. Un movimiento sin series anotadas no sale:
 * la tarjeta de arriba ya dice lo previsto.
 */
export function workDoneLines(session: DailySession, workLog: WorkSetEntry[]): Partial<Record<'strength' | 'oly', WorkDoneLine[]>> {
  const out: Partial<Record<'strength' | 'oly', WorkDoneLine[]>> = {};
  if (session.source === 'custom' || workLog.length === 0) return out;
  const seen = new Set<string>();
  for (const b of session.blocks) {
    if ((b.block !== 'strength' && b.block !== 'oly') || b.subgroup) continue;
    const key = b.block === 'oly' && b.complex ? complexLogId(b.complex.id) : b.movementId;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = workSummary(workLog, key, b.sets ?? 0);
    if (!text) continue;
    const name = b.complex?.name ?? getMovementById(b.movementId)?.name ?? b.movementId;
    (out[b.block] ??= []).push({ name, text });
  }
  return out;
}
