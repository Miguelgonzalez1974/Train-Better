import type { StrainStatus } from './strain';

/**
 * El balance de un día ya entrenado: con qué esfuerzo previsto se partía y cuál fue el real, frente al objetivo, y cómo
 * cambió la preparación entre la mañana y ahora. Puro: lo pinta `DayRing`. Sin previsto anotado (días anteriores a
 * esta función) o sin sesión hecha no hay balance.
 */

export interface DayBalanceInput {
  /** Esfuerzo previsto anotado antes de entrenar (`StrainTarget.planned`). */
  planned: number | null;
  /** Esfuerzo real del día; null si no se entrenó. */
  real: number | null;
  target: { low: number; high: number };
  status: StrainStatus;
  /** Hoy (habla en presente) o un día pasado (en pasado). */
  isToday: boolean;
  /** Preparación con la que se partió por la mañana y la de ahora. Solo se compara hoy: un día pasado ya se calcula con la de esa mañana. */
  prepMorning: number | null;
  prepNow: number | null;
}

export interface DayBalance {
  /** Primera frase, con el veredicto frente al objetivo. */
  lead: string;
  /** `mid` si te pasaste del objetivo, `info` en el resto. */
  tone: 'info' | 'mid';
  planned: number;
  real: number;
  /** Real menos previsto (negativo = te quedaste por debajo de lo previsto). */
  diff: number;
  /** La preparación cambió desde la mañana (solo hoy). */
  prep: { morning: number; now: number } | null;
}

export function dayBalance(input: DayBalanceInput): DayBalance | null {
  const { planned, real, status, isToday, prepMorning, prepNow } = input;
  if (planned === null || real === null) return null;
  const lead =
    status === 'pasado'
      ? isToday
        ? 'Te has pasado del objetivo.'
        : 'Te pasaste del objetivo.'
      : status === 'por-debajo'
        ? isToday
          ? 'Has cerrado por debajo de tu objetivo.'
          : 'Cerraste por debajo de tu objetivo.'
        : isToday
          ? 'Has cerrado dentro de tu objetivo.'
          : 'Cerraste dentro de tu objetivo.';
  const prep = isToday && prepMorning !== null && prepNow !== null && Math.round(prepMorning) !== Math.round(prepNow) ? { morning: Math.round(prepMorning), now: Math.round(prepNow) } : null;
  return { lead, tone: status === 'pasado' ? 'mid' : 'info', planned, real, diff: real - planned, prep };
}
