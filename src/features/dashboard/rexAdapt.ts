/**
 * Las frases de Rex al cambiar la sesión de hoy hablando: lo que ha entendido (con el botón para aplicarlo), lo que ha hecho y por qué no puede. Puras:
 * el cálculo de qué partes se quitan está en `lib/sessionAdapt.ts` y aplicar el cambio lo hace Planificación.
 */
import type { PartKey } from '../../engine/sessionParts';
import type { AdaptPlan, AdaptRefusal, AdaptRequest } from '../../lib/sessionAdapt';
import type { AskAnswer } from './rexAsk';

const WORD: Record<PartKey, string> = { strength: 'fuerza', oly: 'oly', wod1: 'wod', wod2: 'wod', accessory: 'accesorio', skill: 'tecnica' };

/** El texto que lleva el botón «Sí, aplicar»: lo mismo que se pidió, que la caja vuelve a leer como confirmado. */
export function confirmAdaptText(request: AdaptRequest): string {
  if (request.how === 'minutos') return `confirmo cambio minutos ${request.minutes}`;
  const words = [...new Set(request.parts.map((p) => WORD[p]))].join(' ');
  return `confirmo cambio ${request.how} ${words}`;
}

const joinNames = (labels: string[]): string => {
  const names = labels.map((l) => l.toLowerCase());
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
};

/** Lo que Rex enseña antes de cambiar nada. */
export function adaptProposalAnswer(request: AdaptRequest, plan: AdaptPlan): AskAnswer {
  const quitar = joinNames(plan.removed.map((r) => r.label));
  const apply = { label: 'Sí, aplicar', target: 'planificacion' as const, ask: confirmAdaptText(request) };

  if (request.how === 'minutos') {
    if (plan.removed.length === 0) return { lead: 'Ya cabe.', tone: 'good', text: `La sesión de hoy dura unos ${plan.before} min: cabe en tus ${request.minutes}.`, actions: [] };
    if (plan.reached === false) {
      return {
        lead: `No llego a ${request.minutes} min.`,
        tone: 'mid',
        text: `Quitando ${quitar} bajaría de ~${plan.before} a ~${plan.after} min, y de ahí no pasa sin tocar la fuerza o el WOD. ¿Lo dejo así? También puedes decirme «solo fuerza» o «solo el WOD».`,
        actions: [apply],
      };
    }
    return { lead: 'Para que quepa:', tone: 'info', text: `quito ${quitar} y la sesión pasa de ~${plan.before} a ~${plan.after} min (tienes ${request.minutes}). ¿La cambio?`, actions: [apply] };
  }
  if (request.how === 'sin') return { lead: 'Sin eso:', tone: 'info', text: `quito ${quitar}: pasa de ~${plan.before} a ~${plan.after} min. ¿La cambio?`, actions: [apply] };
  return { lead: 'Solo eso:', tone: 'info', text: `me quedo con lo que pides y quito ${quitar}: pasa de ~${plan.before} a ~${plan.after} min. ¿La cambio?`, actions: [apply] };
}

/** Después de aplicar. */
export function adaptDoneAnswer(plan: AdaptPlan): AskAnswer {
  return {
    lead: 'Hecho.',
    tone: 'good',
    text: `Sesión cambiada: sin ${joinNames(plan.removed.map((r) => r.label))}, unos ${plan.after} min. Si cambias de idea, dime «deshaz el cambio».`,
    actions: [{ label: 'Deshacer', target: 'planificacion', ask: 'deshaz el cambio' }],
  };
}

/** «Acortar la sesión» sin decir cuánto: se pregunta con botones (cada uno es lo mismo que escribir «tengo N minutos»). */
export function adaptHowMuchAnswer(): AskAnswer {
  return {
    lead: '¿Cuánto tiempo tienes?',
    tone: 'info',
    text: 'Dímelo y te enseño qué quitaría de la sesión de hoy. Elige o escribe, por ejemplo «tengo 40 minutos».',
    actions: [
      { label: '30 min', target: 'planificacion', ask: 'tengo 30 minutos' },
      { label: '45 min', target: 'planificacion', ask: 'tengo 45 minutos' },
      { label: '1 hora', target: 'planificacion', ask: 'tengo una hora' },
      { label: 'Sin accesorio', target: 'planificacion', ask: 'hoy sin accesorio' },
      { label: 'Solo fuerza', target: 'planificacion', ask: 'solo fuerza' },
    ],
  };
}

/** Cuando no se puede cambiar nada. */
export function adaptRefusalAnswer(reason: AdaptRefusal | 'hecha' | 'nada-que-deshacer'): AskAnswer {
  switch (reason) {
    case 'sin-sesion':
      return { lead: 'No hay sesión que cambiar.', tone: 'info', text: 'Hoy no hay una sesión de entrenamiento programada (es descanso o una sesión propia).', actions: [] };
    case 'hecha':
      return { lead: 'La sesión de hoy ya está hecha.', tone: 'info', text: 'Una sesión registrada no se cambia. Si quieres rehacerla, usa «Deshacer el registro» en Más.', actions: [] };
    case 'nada-que-quitar':
      return { lead: 'No encuentro eso en la sesión.', tone: 'mid', text: 'Hoy no hay esa parte, o ya cabe en el tiempo. Prueba con «sin accesorio», «solo fuerza» o «tengo 40 minutos».', actions: [] };
    case 'dejaria-vacia':
      return { lead: 'Eso la dejaría vacía.', tone: 'mid', text: 'Quitar todo no tiene sentido: dime qué parte prefieres mantener («solo fuerza», «solo el WOD»).', actions: [] };
    case 'nada-que-deshacer':
      return { lead: 'Nada que deshacer.', tone: 'info', text: 'No he cambiado la sesión de hoy desde que abriste Planificación.', actions: [] };
  }
}
