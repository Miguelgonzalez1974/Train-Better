/**
 * Las frases de Rex al mover sesiones de la semana: lo que ha entendido (con el botón para hacerlo), lo hecho y por qué no se puede. Puras: el cálculo está en
 * `lib/sessionMove.ts` y aplicarlo lo hace el reparto de Rex (`rexAskRouter.ts`).
 */
import { dayLabel, type MovePlan, type MoveRefusal } from '../../lib/sessionMove';
import { buildPreviewLine } from './DayRows';
import type { AskAnswer } from './rexAsk';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «a mañana», «al jueves». */
const toDay = (label: string) => (label.startsWith('el ') ? `al ${label.slice(3)}` : `a ${label}`);

/** El texto del botón «Sí»: los días como desplazamiento respecto a hoy, que `parseAsk` vuelve a leer como confirmado. */
export function confirmMoveText(plan: MovePlan, todayIso: string): string {
  const offset = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86_400_000);
  return `confirmo ${plan.swap ? 'intercambiar' : 'mover'} ${offset(plan.from)} ${offset(plan.to)}`;
}

export function moveProposalAnswer(plan: MovePlan, todayIso: string): AskAnswer {
  const from = dayLabel(plan.from, todayIso);
  const to = dayLabel(plan.to, todayIso);
  const fromLine = buildPreviewLine(plan.fromSession);
  const yes = { label: plan.swap ? 'Sí, intercambiarlas' : 'Sí, pasarla', target: 'planificacion' as const, ask: confirmMoveText(plan, todayIso) };
  if (plan.swap && plan.toSession) {
    return {
      lead: 'Intercambio:',
      tone: 'info',
      text: `${cap(from)} sería ${buildPreviewLine(plan.toSession)} y ${to}, ${fromLine}. Las dos sesiones se mantienen tal cual, solo cambian de día. ¿Lo hago?`,
      actions: [yes],
    };
  }
  return {
    lead: 'Paso la sesión:',
    tone: 'info',
    text: `la de ${from} (${fromLine}) pasa ${toDay(to)}, que era de descanso. ${cap(from)} queda de descanso y no cuenta como un día fallado. ¿Lo hago?`,
    actions: [yes],
  };
}

export function moveDoneAnswer(plan: MovePlan, todayIso: string): AskAnswer {
  const from = dayLabel(plan.from, todayIso);
  const to = dayLabel(plan.to, todayIso);
  return {
    lead: 'Hecho.',
    tone: 'good',
    text: plan.swap ? `${cap(from)} y ${to} han intercambiado su sesión.` : `La sesión de ${from} pasa ${toDay(to)}; ${from} es de descanso.`,
    actions: [{ label: 'Ver Planificación', target: 'planificacion' }],
  };
}

/** «Mover la sesión» sin decir a qué día: los días a los que se puede pasar la de hoy, como botones (cada uno es la frase que se escribiría). */
export function moveWhereAnswer(options: { label: string; ask: string }[]): AskAnswer {
  if (options.length === 0) return { lead: 'No encuentro a dónde pasarla.', tone: 'mid', text: 'Hoy no hay una sesión que se pueda mover (es descanso, ya está hecha o los días siguientes no admiten cambios). Dime qué día quieres mover: «pasa la del jueves al viernes».', actions: [] };
  return {
    lead: '¿A qué día la paso?',
    tone: 'info',
    text: 'Elige el día y te enseño cómo queda antes de cambiar nada. Si el día ya tiene sesión, se intercambian.',
    actions: [...options.map((o) => ({ label: o.label, target: 'planificacion' as const, ask: o.ask })), { label: 'Que elija Rex', target: 'planificacion' as const, ask: 'aplaza la sesion de hoy' }],
  };
}

export function moveRefusalAnswer(reason: MoveRefusal): AskAnswer {
  const text: Record<MoveRefusal, [string, string]> = {
    'mismo-dia': ['Es el mismo día.', 'Dime a qué día la paso: «pasa la sesión de hoy al jueves».'],
    'fuera-de-rango': ['Eso queda lejos.', 'Solo muevo sesiones de hoy en adelante y hasta dos semanas vista.'],
    hecho: ['Ese día ya está entrenado.', 'Una sesión registrada no se mueve. Puedes mover la de otro día.'],
    'sin-sesion': ['Ese día no hay sesión.', 'Es de descanso o no tienes nada programado, así que no hay nada que mover.'],
    'sin-hueco': ['No encuentro hueco.', 'Los seis días siguientes tienen sesión, y no quiero apilar dos. Dime a qué día la paso y las intercambio.'],
    competicion: ['Ahí hay competición.', 'No muevo sesiones de los días de la competición ni a ellos.'],
    'sin-estructura': ['No hay plan ese día.', 'No tienes macrociclo o programa activo esa fecha.'],
  };
  const [lead, body] = text[reason];
  return { lead, tone: 'mid', text: body, actions: [] };
}
