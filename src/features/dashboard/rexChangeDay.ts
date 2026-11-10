/**
 * «Cambiar día», el menú guiado de Rex para reorganizar la semana sin escribir: primero se elige qué día (de los que tienen sesión) y después qué hacer con él
 * (pasarlo a otro día, intercambiarlo, desplazar la semana desde ahí). Cada botón es la frase que se escribiría, así que todo pasa por el mismo camino que lo
 * escrito (enseña la semana resultante, pide el «Sí» y deja «Deshacer»). Aquí solo están las frases y los botones; qué días valen lo decide `rexAskRouter.ts`.
 */
import { dayLabel } from '../../lib/sessionMove';
import type { AskAnswer } from './rexAsk';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «hoy», «mañana», «el jueves»: como se dice el día en una frase («cambiar día el jueves»). */
export const spokenDay = (iso: string, todayIso: string): string => dayLabel(iso, todayIso);

/** «de hoy», «de mañana», «del jueves». */
export const fromPhrase = (iso: string, todayIso: string): string => {
  const l = dayLabel(iso, todayIso);
  return l.startsWith('el ') ? `del ${l.slice(3)}` : `de ${l}`;
};

/** «a mañana», «al jueves». */
export const toPhrase = (iso: string, todayIso: string): string => {
  const l = dayLabel(iso, todayIso);
  return l.startsWith('el ') ? `al ${l.slice(3)}` : `a ${l}`;
};

export interface DayChoice {
  iso: string;
  /** Si el destino ya tiene sesión, se intercambian (o se inserta, a elegir). */
  swap?: boolean;
}

/** Paso 1: qué día quieres cambiar. */
export function changeDayPickAnswer(days: DayChoice[], todayIso: string): AskAnswer {
  if (days.length === 0) {
    return { lead: 'No hay sesiones que cambiar.', tone: 'mid', text: 'En los próximos días no tienes ninguna sesión que se pueda mover (descansos, días ya entrenados o sin plan).', actions: [] };
  }
  return {
    lead: '¿Qué día quieres cambiar?',
    tone: 'info',
    text: 'Elige un día con sesión. Después te pregunto qué hacer con él y te enseño cómo queda la semana antes de tocar nada.',
    actions: days.map((d) => ({ label: cap(spokenDay(d.iso, todayIso)), target: 'planificacion' as const, ask: `cambiar dia ${spokenDay(d.iso, todayIso)}` })),
  };
}

/** Paso 2: qué hacer con ese día. */
export function changeDayActionsAnswer(fromIso: string, targets: DayChoice[], canShift: boolean, canAuto: boolean, todayIso: string): AskAnswer {
  const from = spokenDay(fromIso, todayIso);
  const actions = targets.map((t) => ({
    label: t.swap ? `Con ${spokenDay(t.iso, todayIso)} (intercambio)` : cap(toPhrase(t.iso, todayIso)),
    target: 'planificacion' as const,
    ask: `pasa la sesion ${fromPhrase(fromIso, todayIso)} ${toPhrase(t.iso, todayIso)}`,
  }));
  if (canAuto) actions.push({ label: 'Que elija Rex', target: 'planificacion', ask: `aplaza la sesion ${fromPhrase(fromIso, todayIso)}` });
  if (canShift) actions.push({ label: 'Desplazar la semana desde aquí', target: 'planificacion', ask: `desplaza la semana desde ${from}` });
  return {
    lead: `${cap(from)}:`,
    tone: 'info',
    text: 'elige a qué día lo pasas (si ya tiene sesión, te enseño las dos formas: intercambiar o insertar), deja que elija yo el hueco, o desplaza toda la semana desde ese día.',
    actions,
  };
}
