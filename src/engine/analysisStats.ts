import type { Goal, PrLogEntry } from '../data/athlete/types';
import { computeCompetitionDay, type CompetitionPhase } from './competition';
import { buildPrSeries, summarisePrProgress } from './progressSeries';
import { isoDiffDays, toLocalIsoDate } from './periodization';

/**
 * Las cifras de la fila de arriba del Análisis que necesitan algo más que leer un dato: el levantamiento que más ha subido, si
 * esta semana ha sido más dura que el mes y en qué punto de la cuenta atrás de la competición estás. Solo leen lo que ya se guarda.
 */

/** El levantamiento con mayor mejora relativa de PR desde su primer test registrado (solo si ha subido de verdad). */
export function topRiser(prLog: PrLogEntry[], keys: string[]): { key: string; deltaPct: number } | null {
  let best: { key: string; deltaPct: number } | null = null;
  for (const key of keys) {
    const prog = summarisePrProgress(buildPrSeries(prLog, key));
    if (prog && prog.deltaKg > 0 && (!best || prog.deltaPct > best.deltaPct)) best = { key, deltaPct: prog.deltaPct };
  }
  return best;
}

export type RpeTrend = 'duro' | 'suave' | 'igual';

/** Más duro o más suave que el mes: una diferencia de menos de 0,3 puntos de RPE es ruido. */
export function rpeTrend(week: number | null, month: number | null): RpeTrend | null {
  if (week === null || month === null) return null;
  const diff = week - month;
  return diff >= 0.3 ? 'duro' : diff <= -0.3 ? 'suave' : 'igual';
}

export interface CompetitionTile {
  /** "15 d", "Hoy" o "Post". */
  value: string;
  /** En qué fase estás: "taper", "simulacro hoy"… */
  word: string;
  /** Si es el día de la competición o estás en el taper o más cerca: la cifra se destaca. */
  close: boolean;
}

const PHASE_WORD: Record<CompetitionPhase, string> = {
  construccion: 'construcción',
  'pico-1': 'pico',
  pico: 'pico',
  taper: 'taper',
  activacion: 'activación',
  vispera: 'víspera',
  evento: 'compites',
  post: 'recupera',
};

/** La cuenta atrás de la competición, o null si no hay ninguna por delante ni acabada de pasar. */
export function competitionTile(goals: Goal[] | undefined, today: Date, trainingDaysPerWeek: 3 | 4 | 5 | 6): CompetitionTile | null {
  const day = computeCompetitionDay(goals, today, trainingDaysPerWeek);
  if (day) {
    if (day.phase === 'evento') return { value: 'Hoy', word: PHASE_WORD.evento, close: true };
    if (day.phase === 'post') return { value: 'Post', word: PHASE_WORD.post, close: false };
    const word = day.simulacro ? 'simulacro hoy' : PHASE_WORD[day.phase];
    return { value: `${day.daysToEvent} d`, word, close: day.daysToEvent <= 7 };
  }
  // Todavía lejos (la cuenta atrás por fases empieza 28 días antes): solo los días que faltan.
  const todayIso = toLocalIsoDate(today);
  const next = (goals ?? [])
    .filter((g) => g.type === 'preparar-competicion' && g.targetDate > todayIso)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
  return next ? { value: `${isoDiffDays(todayIso, next.targetDate)} d`, word: 'por delante', close: false } : null;
}
