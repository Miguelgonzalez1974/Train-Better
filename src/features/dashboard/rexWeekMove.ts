/**
 * Lo que dice Rex cuando el coach propone mover un día de la semana (cálculo en `lib/weekCoach.ts`): la frase de la burbuja, el titular de la
 * ficha y el estado de energía de cada número. Puras, para poder probarlas.
 */
import { ENERGY_LOW, ENERGY_TOP } from '../../engine/formCurve';
import { dayLabel } from '../../lib/sessionMove';
import type { WeekMoveProposal } from '../../lib/weekCoach';
import type { RexSuggestion } from './rexDashboard';

/** «el viernes», «mañana». */
const when = (iso: string, todayIso: string) => dayLabel(iso, todayIso);

/** El estado de una energía en palabras del atleta. */
export function energyWord(energy: number): 'a tope' | 'normal' | 'cansado' {
  return energy >= ENERGY_TOP ? 'a tope' : energy <= ENERGY_LOW ? 'cansado' : 'normal';
}

/** «Mejor el sábado.» */
export function weekMoveLead(p: WeekMoveProposal, todayIso: string): string {
  return `Mejor ${when(p.to, todayIso)}.`;
}

/** La frase de Rex: qué sesión, qué día y con cuánta energía llegas en cada caso. */
export function weekMoveSentence(p: WeekMoveProposal, todayIso: string): string {
  const from = when(p.from, todayIso);
  const to = when(p.to, todayIso);
  return `Tu ${p.sessionLabel} ${ofDay(from)} te pilla con la energía en ${p.energyFrom}; ${to} llegas con ${p.energyTo}. Misma sesión, mejor día.`;
}

/** «a mañana», «al jueves». */
const toDay = (label: string) => (label.startsWith('el ') ? `al ${label.slice(3)}` : `a ${label}`);
/** «de mañana», «del jueves». */
const ofDay = (label: string) => (label.startsWith('el ') ? `del ${label.slice(3)}` : `de ${label}`);

/** El aviso en la burbuja de Rex (Dashboard). */
export function weekMoveSuggestion(p: WeekMoveProposal, todayIso: string): RexSuggestion {
  const lead = weekMoveLead(p, todayIso);
  return {
    id: 'semana-mover',
    // Por encima del consejo del día (95) y de la revisión de la semana (90): es accionable, rara (una a la semana como mucho) y se puede apartar.
    // Solo el check-in (100) va antes; la competición terminada (96) va delante a igualdad porque se añade antes.
    priority: 96,
    lead,
    tone: 'info',
    text: `${lead} ${weekMoveSentence(p, todayIso)}`,
    mood: 'think',
    actions: [{ label: 'Ver el cambio', target: 'semana-mover' }],
  };
}

/** El titular de la ficha: «Deadlift al sábado» o «Deadlift y Floor Press cambian de día». */
export function weekMoveTitle(p: WeekMoveProposal): string {
  if (p.swap) {
    const other = p.days.find((d) => d.iso === p.from)?.labelAfter;
    return other ? `${p.sessionLabel} y ${other} cambian de día` : `${p.sessionLabel} cambia de día`;
  }
  return `${p.sessionLabel} a otro día`;
}

/** El texto del botón principal: «Pasarla al sábado» o «Cambiarlas». */
export function weekMoveApplyLabel(p: WeekMoveProposal, todayIso: string): string {
  return p.swap ? 'Cambiarlas de día' : `Pasarla ${toDay(when(p.to, todayIso))}`;
}
