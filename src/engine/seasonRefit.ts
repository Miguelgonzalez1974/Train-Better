import type { AthleteProfile, Goal, Macrocycle } from '../data/athlete/types';
import { addDaysIso, isoDiffDays } from './periodization';
import { buildBlocksToCompetition, nextMondayIso } from './seasonSetup';

/**
 * Reajuste de una temporada cuando cambia la fecha de su competición. Los bloques que la llevan hasta ella (`forGoalId`) se rehacen
 * desde el lunes siguiente (o desde donde empezaban, si aún no han empezado) hasta una semana después de la nueva fecha; los bloques ya
 * terminados no se tocan y el que está en curso se recorta el día antes. Puro: la fecha de hoy y los ids entran por parámetro.
 */

export interface SeasonRefit {
  macrocycles: Macrocycle[];
  /** Cuántas semanas se mueve el final de la temporada (positivo = más tarde). */
  shiftWeeks: number;
  /** Frase para confirmar: «El pico se mueve 2 semanas más tarde: 3 bloques desde el 16 nov». */
  summary: string;
}

const eventEnd = (g: Goal) => (g.eventEndDate && g.eventEndDate >= g.targetDate ? g.eventEndDate : g.targetDate);

/** Los bloques reajustados a la fecha actual de la competición, o null si no hay bloques suyos o ya cuadran. */
export function refitSeason(profile: AthleteProfile, goalId: string, todayIso: string, newId: () => string = () => crypto.randomUUID()): SeasonRefit | null {
  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal || goal.type !== 'preparar-competicion') return null;
  const blocks = profile.macrocycles.filter((m) => m.forGoalId === goalId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (blocks.length === 0) return null;

  const newEnd = addDaysIso(eventEnd(goal), 7);
  const oldEnd = blocks[blocks.length - 1].endDate;
  if (newEnd === oldEnd) return null;
  const shiftWeeks = Math.round(isoDiffDays(oldEnd, newEnd) / 7);

  const others = profile.macrocycles.filter((m) => m.forGoalId !== goalId);
  const finished = blocks.filter((m) => m.endDate < todayIso);
  const pending = blocks.filter((m) => m.endDate >= todayIso);
  const current = pending[0];
  // Si el primer bloque pendiente ya empezó, el reajuste arranca el lunes siguiente; si no, donde estaba previsto.
  const start = current && current.startDate > todayIso ? current.startDate : nextMondayIso(addDaysIso(todayIso, 1));

  const fresh = buildBlocksToCompetition(start, eventEnd(goal), newId, goalId);
  let kept: Macrocycle[];
  if (fresh.length > 0) {
    // El bloque en curso se recorta el día antes de que empiecen los nuevos.
    const trimmed = current && current.startDate < start ? [{ ...current, endDate: addDaysIso(start, -1) }] : [];
    kept = [...finished, ...trimmed, ...fresh];
  } else {
    // Sin tiempo para bloques nuevos: el último que ha empezado se estira o se acorta hasta la nueva fecha.
    const started = [...finished, ...pending.filter((m) => m.startDate <= todayIso)];
    const last = started[started.length - 1];
    kept = last ? [...started.slice(0, -1), ...(newEnd > last.startDate ? [{ ...last, endDate: newEnd }] : [])] : [];
  }

  const ordered = [...others, ...kept].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const abs = Math.abs(shiftWeeks);
  const move = shiftWeeks === 0 ? 'La competición cambia de día dentro de la misma semana' : `El pico se mueve ${abs} ${abs === 1 ? 'semana' : 'semanas'} ${shiftWeeks > 0 ? 'más tarde' : 'antes'}`;
  const count = fresh.length > 0 ? `: ${fresh.length === 1 ? 'un bloque nuevo' : `${fresh.length} bloques nuevos`} desde el ${new Date(`${start}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')}` : '';
  return { macrocycles: ordered, shiftWeeks, summary: `${move}${count}.` };
}
