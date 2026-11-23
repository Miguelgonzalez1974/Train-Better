import type { DailySession, PersonalRecords, RxOrScaled, SessionBlockResult, SessionHistoryEntry, SetFeedbackEntry, VariantPersonalRecords, WodResult, WodSplitsRecord } from '../../data/athlete/types';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { getMovementById } from '../../data/movements';
import { estimateE1RMFromRpe } from '../../engine/e1rm';
import { resolveOlyPRKey, resolveStrengthPRKey, resolveVariantPRKey, toHistoryEntry } from '../../engine/generateSession';
import { levelResultsOfEntry } from '../../engine/levelCategories';
import { countsForProgression, evaluateLiftSession, mainLiftBlock, type ProgressionKind } from '../../engine/progression';
import { feelFromRpe, parseWorkingReps } from '../../engine/setFeedback';
import { applySkips, skippedParts, type Skips } from '../../engine/sessionParts';
import { classifyWod } from '../../engine/wodCategory';
import type { buildWodDetail } from '../../engine/wodMovements';

/**
 * Cerrar una sesión (la de hoy o la de un día pasado): lo que se escribe en el historial y en la progresión es EXACTAMENTE lo mismo, venga de donde
 * venga (el mazo de anotar de hoy o el de un día que se quedó sin apuntar). Así un día pasado alimenta a Tu nivel, a la progresión y al coach igual que hoy.
 */

export interface CloseInput {
  session: DailySession;
  prs: PersonalRecords;
  skips: Skips;
  rxOrScaled: RxOrScaled;
  rpe: number;
  durationMin: number;
  /** El resultado de cada parte del WOD (ya sin las partes no hechas). */
  wodResults: Partial<Record<1 | 2, WodResult | undefined>>;
  wodParts: (1 | 2)[];
  /** El kilo del test de 1RM del día, si se hizo y no se saltó la parte. */
  testedLoadKg?: number;
  wodDetail?: ReturnType<typeof buildWodDetail>;
  wodSplits?: WodSplitsRecord[];
}

/** La entrada del historial de una sesión cerrada: solo lo que se hizo (las partes no hechas se quitan y quedan en `skipped`), con la categoría de cada WOD y lo que cuenta para Tu nivel. */
export function buildClosedEntry(i: CloseInput): SessionHistoryEntry {
  const { session, skips } = i;
  const notDone = skippedParts(skips);
  const wodCategories: NonNullable<SessionHistoryEntry['wodCategories']> = {};
  for (const part of i.wodParts) {
    if (skips[part === 1 ? 'wod1' : 'wod2']) continue;
    const verdict = classifyWod(session, part, { prs: i.prs });
    if (verdict.category) wodCategories[part] = verdict.category;
  }
  const built: SessionHistoryEntry = {
    ...toHistoryEntry(applySkips(session, skips), i.rxOrScaled, i.rpe, i.durationMin, i.wodResults[1], i.testedLoadKg && i.testedLoadKg > 0 ? i.testedLoadKg : undefined, i.wodParts.includes(2) ? i.wodResults[2] : undefined, i.wodDetail),
    ...(notDone.length > 0 ? { skipped: notDone } : {}),
    ...(i.wodSplits && i.wodSplits.length > 0 ? { wodSplits: i.wodSplits } : {}),
    ...(Object.keys(wodCategories).length > 0 ? { wodCategories } : {}),
  };
  const levelResults = levelResultsOfEntry(built, i.prs);
  return levelResults.length > 0 ? { ...built, levelResults } : built;
}

/**
 * Anota cómo salió el levantamiento principal de fuerza y el de oly (limpia, hecha, dura, fallo) para la progresión por resultados. No anota nada de una
 * parte que se marcó como no hecha, si no se registraron todas sus series o si el formato no es de reps limpias (rampas, olas, complejos, series únicas).
 */
export function recordProgressionFor(session: DailySession, skips: Skips): void {
  if (!countsForProgression(session)) return;
  const log = athleteRepository.getWorkLog();
  const feedbackLog = athleteRepository.getSetFeedbackLog();
  const records = (['strength', 'oly'] as const).flatMap((kind: ProgressionKind) => {
    if (skips[kind]) return [];
    const block = mainLiftBlock(session.blocks, kind);
    const movement = block ? getMovementById(block.movementId) : undefined;
    if (!block || !movement) return [];
    const rootKey = (kind === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey)(movement);
    const record = evaluateLiftSession({
      date: session.date,
      kind,
      block,
      key: rootKey ?? resolveVariantPRKey(movement),
      sets: log.filter((e) => e.date === session.date && e.movementId === block.movementId && e.block === kind),
      feedback: feedbackLog.find((e) => e.date === session.date && e.movementId === block.movementId),
    });
    return record ? [record] : [];
  });
  if (records.length > 0) athleteRepository.appendProgressionRecords(records);
}

/**
 * Clave de PR y % del 1RM del levantamiento valorado. La clave se resuelve igual que en el motor (`resolveStrengthPRKey/resolveOlyPRKey ?? resolveVariantPRKey`)
 * para que `computeResponseProfile` agregue la sensación bajo la misma clave con la que el motor prescribe ese lift.
 */
function setFeedbackTarget(block: SessionBlockResult, prescribedKg: number, prs: PersonalRecords, variantPrs: VariantPersonalRecords | undefined): { prKey?: string; pctOf1rm?: number } {
  const movement = getMovementById(block.movementId);
  if (!movement) return {};
  const rootKey = (block.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey)(movement);
  const variantKey = resolveVariantPRKey(movement);
  const prKey = rootKey ?? variantKey ?? undefined;
  if (!prKey) return {};
  const pr = rootKey ? prs[rootKey] : variantPrs?.[variantKey!];
  const pctOf1rm = pr && pr > 0 ? Math.round((prescribedKg / pr) * 100) / 100 : undefined;
  return { prKey, pctOf1rm };
}

/**
 * El esfuerzo de la serie más pesada de un levantamiento, como lo guarda el coach para calibrar (y estimar el 1RM). Null si no se puede valorar (sin peso
 * prescrito, o con menos de 2 series sin ser una serie única). `existing` es la valoración que ya hubiera ese día para ese movimiento.
 */
export function liftRpeEntry(date: string, block: SessionBlockResult, topSet: { kg: number; reps: number }, rpe: number, existing: SetFeedbackEntry | undefined, prs: PersonalRecords, variantPrs: VariantPersonalRecords | undefined): SetFeedbackEntry | null {
  const prescribedKg = existing?.prescribedKg ?? block.loadKg ?? 0;
  const prescribedSets = existing?.prescribedSets ?? block.sets ?? (block.logAsSingle ? 1 : 0);
  const prescribedReps = existing?.prescribedReps ?? parseWorkingReps(block.reps ?? '') ?? 0;
  if (prescribedKg <= 0 || (prescribedSets < 2 && !block.logAsSingle)) return null;
  const { prKey, pctOf1rm } = setFeedbackTarget(block, prescribedKg, prs, variantPrs);
  const estimated1rm = estimateE1RMFromRpe(topSet.kg, topSet.reps, rpe) ?? undefined;
  return {
    date,
    movementId: block.movementId,
    block: block.block as 'strength' | 'oly',
    prescribedKg,
    prescribedReps,
    prescribedSets,
    feel: feelFromRpe(rpe),
    prKey,
    pctOf1rm,
    actualKg: topSet.kg,
    actualReps: topSet.reps,
    actualRpe: rpe,
    estimated1rm,
  };
}

/**
 * La sesión con un bloque cambiado a mano (otro ejercicio, otro peso…). Si se tocan series, reps o carga, el plan serie a serie de la rampa ya no vale y se quita
 * (vuelve el esquema simple); si se cambia el movimiento sin un complejo nuevo, el bloque deja de ser un complejo. La misma regla en hoy y en un día pasado.
 */
export function patchBlock(session: DailySession, index: number, patch: Partial<SessionBlockResult>): DailySession {
  return {
    ...session,
    blocks: session.blocks.map((b, i) =>
      i === index
        ? { ...b, ...patch, ...(!('setPlan' in patch) && ('sets' in patch || 'reps' in patch || 'loadKg' in patch) ? { setPlan: undefined, waveSize: undefined } : {}), ...('movementId' in patch && !('complex' in patch) ? { complex: undefined } : {}) }
        : b,
    ),
    editedByAthlete: true,
  };
}
