import type { AthleteProfile, DailySession, PersonalRecords, SessionHistoryEntry, VariantPersonalRecords } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { computeAdherenceStreak, computeWeekCount } from './adherence';
import { estimateE1RM, parseCleanReps, qualifiesForE1RMEstimate } from './e1rm';
import { roundToNearestPlate } from './oneRepMaxTables';
import { mainLiftBlock, sessionProgressionView, type SessionProgressionView } from './progression';
import { resolveOlyPRKey, resolveStrengthPRKey, resolveVariantPRKey } from './prResolution';
import { PR_KEY_LABEL } from './responseProfile';
import { getTestDayBlock } from './wodScoring';

/**
 * Lo que enseña el resumen de una sesión ya hecha, calculado desde lo guardado (la entrada del historial, el perfil y el registro de series), no
 * desde el estado de la pantalla en la que se cerró: así se puede abrir desde el Dashboard, un rato después y tras recargar. Puro.
 */

export type E1rmTarget = { kind: 'root'; key: keyof PersonalRecords } | { kind: 'variant'; key: keyof VariantPersonalRecords };

/** Un levantamiento de hoy que sugiere un PR nuevo (1RM estimado por encima de tu marca). */
export interface E1rmSuggestion {
  target: E1rmTarget;
  movementName: string;
  estimatedKg: number;
  currentKg: number;
}

/** Un clave estable para recordar qué sugerencia se descartó. */
export const e1rmSuggestionKey = (s: E1rmSuggestion): string => `${s.target.kind}:${s.target.key}`;

/**
 * Series principales de fuerza/oly de la sesión que hoy podrían subir un PR sin haber sido un día de test formal (ver `engine/e1rm.ts`).
 * Solo con una sesión que califica (Rx y RPE alto), nunca en un día de test real (ese tiene su flujo exacto) ni en una parte no hecha. Cuando
 * el PR ya se actualizó, la estimación deja de superarlo y la sugerencia desaparece sola.
 */
export function findE1rmSuggestions(session: DailySession, entry: SessionHistoryEntry, profile: AthleteProfile): E1rmSuggestion[] {
  if (getTestDayBlock(session)) return [];
  if (!qualifiesForE1RMEstimate(entry.rxOrScaled, entry.rpe)) return [];
  const skipped = new Set((entry.skipped ?? []).map((p) => p.block));

  const suggestions: E1rmSuggestion[] = [];
  for (const block of session.blocks) {
    if (block.block !== 'strength' && block.block !== 'oly') continue;
    if (skipped.has(block.block)) continue; // una parte no hecha no puede subir un PR
    if (!block.loadKg || !block.reps) continue;
    const reps = parseCleanReps(block.reps);
    if (reps === null) continue;
    const movement = getMovementById(block.movementId);
    if (!movement) continue;

    // La carga de hoy pudo calcularse sobre un PR de variante (p. ej. sumo deadlift), no sobre el lift raíz: comparar y escribir contra el
    // raíz corrompería un PR que no tiene nada que ver con lo que de verdad se entrenó hoy.
    const variantKey = resolveVariantPRKey(movement);
    const rootKey = (block.block === 'oly' ? resolveOlyPRKey : resolveStrengthPRKey)(movement);
    const target: E1rmTarget | null =
      variantKey && profile.variantPrs?.[variantKey] ? { kind: 'variant', key: variantKey } : rootKey ? { kind: 'root', key: rootKey } : null;
    if (!target) continue;

    const currentKg = target.kind === 'variant' ? (profile.variantPrs?.[target.key] ?? 0) : profile.prs[target.key];
    const estimatedKg = roundToNearestPlate(estimateE1RM(block.loadKg, reps));
    if (estimatedKg > currentKg) suggestions.push({ target, movementName: movement.name, estimatedKg, currentKg });
  }
  return suggestions;
}

/** «Nuevo PR registrado: Back Squat a 130 kg.» si hoy se anotó alguno, o null. Sale del registro de PRs del perfil. */
export function prMessageOfDay(profile: AthleteProfile, dateIso: string): string | null {
  const today = (profile.prLog ?? []).filter((e) => e.date === dateIso);
  if (today.length === 0) return null;
  const last = new Map(today.map((e) => [e.key, e]));
  const parts = [...last.values()].map((e) => `${PR_KEY_LABEL[e.key] ?? e.key} a ${e.kg} kg`);
  // Con muchos a la vez (una puesta al día de marcas) la frase se haría interminable: se cuenta cuántos son.
  if (parts.length > 3) return `Nuevos PRs en ${parts.length} levantamientos.`;
  return `${parts.length === 1 ? 'Nuevo PR registrado' : 'Nuevos PRs registrados'}: ${parts.join(', ')}.`;
}

export interface SessionSummaryData {
  progression: SessionProgressionView[];
  streak: number;
  weekCount: { done: number; planned: number };
  prMessage: string | null;
  e1rmSuggestions: E1rmSuggestion[];
}

/** Todo lo del resumen de la sesión de `session.date`, a partir de lo guardado. */
export function buildSessionSummaryData(args: { session: DailySession; entry: SessionHistoryEntry; profile: AthleteProfile; history: SessionHistoryEntry[]; now: Date }): SessionSummaryData {
  const { session, entry, profile, history, now } = args;
  const progression = (['strength', 'oly'] as const).flatMap((kind) => {
    const main = mainLiftBlock(session.blocks, kind);
    if (!main) return [];
    const view = sessionProgressionView(profile.progressionLog, profile.prLog, profile.progressionSettings, session.date, main.movementId);
    return view ? [view] : [];
  });
  return {
    progression,
    streak: computeAdherenceStreak(profile, history, session.date),
    weekCount: computeWeekCount(profile, history, now),
    prMessage: prMessageOfDay(profile, session.date),
    e1rmSuggestions: findE1rmSuggestions(session, entry, profile),
  };
}

/** Una frase corta de lo más importante del resumen, para el aviso de Rex: un cambio de carga, un PR, o las sugerencias de 1RM por confirmar. */
export function summaryHighlight(data: SessionSummaryData): string | null {
  const kgText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;
  const changes = data.progression.flatMap((v) => {
    const name = getMovementById(v.record.movementId)?.name ?? v.record.movementId;
    if (v.change === 'subio' && v.nextKg) return [`${name} sube a ${kgText(v.nextKg)} el próximo día.`];
    if (v.change === 'bajo' && v.nextKg) return [`${name} baja a ${kgText(v.nextKg)} el próximo día: te están costando las series.`];
    return [];
  });
  const first = changes[0] ?? data.prMessage;
  const pending = data.e1rmSuggestions.length > 0 ? `${data.e1rmSuggestions.length === 1 ? 'Una sugerencia' : `${data.e1rmSuggestions.length} sugerencias`} de 1RM por confirmar.` : null;
  return [first, pending].filter(Boolean).join(' ') || null;
}
