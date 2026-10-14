import type { DailySession } from '../../data/athlete/types';

type CompetitionInfo = NonNullable<DailySession['competition']>;

/** "Faltan 7 días" / "Mañana compites" / "Hoy compites" / "Hace 2 días": la cuenta atrás en una frase corta. */
export function competitionCountdown(c: CompetitionInfo): string {
  if (c.eventDay) return 'Hoy compites';
  const d = c.daysToEvent;
  if (d === 1) return 'Mañana compites';
  if (d > 1) return `Faltan ${d} días`;
  return `Hace ${-d} día${d === -1 ? '' : 's'}`;
}

/** Titular de una línea para la tarjeta del día: "Taper · faltan 7 días". */
export function competitionHeadline(c: CompetitionInfo): string {
  return c.eventDay ? c.label : `${c.label} · ${competitionCountdown(c).toLowerCase()}`;
}
