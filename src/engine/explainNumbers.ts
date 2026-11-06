import type { StrainTarget } from '../data/athlete/types';
import type { AcwrResult } from './loadMetrics';
import { strainFit, type PlanFit, type PlannedStrain } from './plannedStrain';
import type { ReadinessScore } from './readinessScore';
import type { StrainStatus } from './strain';

/**
 * «Pregúntale a Rex» sobre los números del anillo del Dashboard: de dónde sale la preparación, la carga, lo realizado, lo previsto y el
 * objetivo, en palabras y con el desglose real (los mismos datos con los que se calculan, nada inventado). Puro: lo pinta
 * `RexExplainBubble`, y los botones de cada explicación llevan a una pantalla con un `ExplainAction`.
 */

export type ExplainId = 'preparacion' | 'carga' | 'esfuerzo' | 'realizado' | 'previsto' | 'objetivo';

/** Color del verbo de la explicación (los colores de estado de la app, el del esfuerzo, el del previsto o el neutro). */
export type ExplainTone = 'good' | 'mid' | 'bad' | 'info' | 'plan' | 'effort' | 'neutral';

/** A dónde lleva un botón de la explicación. El Dashboard lo traduce a abrir una pestaña, la carga o Planificación. */
export type ExplainAction = 'ver-preparacion' | 'ver-esfuerzo' | 'ver-carga' | 'recovery' | 'planificacion';

export type ExplainRow =
  /** Una nota de 0 a 100 (con su peso en la media, si lo tiene). */
  | { kind: 'score'; label: string; value: number; detail?: string; weight?: string }
  /** Puntos que suma o resta a la nota final. */
  | { kind: 'delta'; label: string; value: number; detail?: string }
  /** Un dato con su valor. */
  | { kind: 'plain'; label: string; value: string; detail?: string };

export interface Explanation {
  id: ExplainId;
  lead: string;
  tone: ExplainTone;
  text: string;
  rows: ExplainRow[];
  foot: string;
  /** El primero es el botón principal. */
  actions: { label: string; action: ExplainAction }[];
}

const comma = (n: number) => String(n).replace('.', ',');

// ---------------------------------------------------------------------------------------------------------------------
// Preparación

/**
 * Cómo se ha formado la preparación: la media de lo que cuentas en el check-in (60 %) y de cómo te salen las sesiones (40 %), y después lo
 * que suma o resta (molestias, carga alta, HRV y pulso, descanso de ayer). Solo salen las piezas que hoy cuentan.
 */
export function explainReadiness(r: ReadinessScore): Explanation {
  if (r.total === null) {
    return {
      id: 'preparacion',
      lead: 'Aún sin datos.',
      tone: 'neutral',
      text: 'Todavía no tengo con qué calcular tu preparación: contesta el check-in unos días y entrena para que pueda leerte.',
      rows: [],
      foot: 'Con el check-in de unos días y alguna sesión, la nota se calcula sola.',
      actions: [{ label: 'Ver la preparación', action: 'ver-preparacion' }],
    };
  }

  const level = r.level ?? 'normal';
  const lead = level === 'alta' ? 'Llegas con ganas.' : level === 'baja' ? 'Llegas cansado.' : 'Llegas normal.';
  const tone: ExplainTone = level === 'alta' ? 'good' : level === 'baja' ? 'bad' : 'mid';

  const rows: ExplainRow[] = [];
  const both = r.feel.score !== null && r.performance.score !== null;
  if (r.feel.score !== null) rows.push({ kind: 'score', label: 'Lo que cuentas (check-in)', value: r.feel.score, detail: r.feel.detail, weight: both ? '60 %' : undefined });
  if (r.performance.score !== null) rows.push({ kind: 'score', label: 'Cómo te salen las sesiones', value: r.performance.score, detail: r.performance.detail, weight: both ? '40 %' : undefined });
  if (r.pain.penalty > 0) rows.push({ kind: 'delta', label: 'Molestias activas', value: -r.pain.penalty, detail: r.pain.areas.join(' y ') });
  if (r.loadPenalty > 0) rows.push({ kind: 'delta', label: 'Carga', value: -r.loadPenalty, detail: r.load.detail });
  if (r.hrv.penalty > 0) rows.push({ kind: 'delta', label: 'HRV y pulso', value: -r.hrv.penalty });
  if (r.rest.credit > 0) rows.push({ kind: 'delta', label: 'Descanso de ayer', value: r.rest.credit, detail: r.rest.detail });

  const text = r.estimated
    ? `Tu preparación es ${r.total} sobre 100. Aún sin check-in de esta semana: sale solo de lo que mide tu entrenamiento.`
    : `Tu preparación es ${r.total} sobre 100. Esto es lo que la ha formado:`;
  const foot = both
    ? 'Base: 60 % lo que cuentas en el check-in y 40 % cómo te salen las sesiones. Después resta las molestias, una carga alta o el HRV bajo, y suma el descanso de ayer.'
    : 'Base: lo único que hay con datos. Después resta las molestias, una carga alta o el HRV bajo, y suma el descanso de ayer.';
  const actions: Explanation['actions'] = [{ label: 'Ver la evolución', action: 'ver-preparacion' }];
  if (level !== 'alta') actions.push({ label: 'Hacer recovery', action: 'recovery' });
  return { id: 'preparacion', lead, tone, text, rows, foot, actions };
}

// ---------------------------------------------------------------------------------------------------------------------
// Carga

const ZONE_LEAD: Record<AcwrResult['zone'], { lead: string; tone: ExplainTone }> = {
  baja: { lead: 'Baja.', tone: 'info' },
  optima: { lead: 'Óptima.', tone: 'good' },
  moderada: { lead: 'Algo alta.', tone: 'mid' },
  alta: { lead: 'Muy alta.', tone: 'bad' },
};

/** La carga: cuánto has entrenado esta semana frente a las anteriores (ACWR), con lo que resta a la preparación. */
export function explainLoad(acwr: AcwrResult, loadPenalty: number): Explanation {
  if (acwr.coldStart || acwr.acwr === null) {
    return {
      id: 'carga',
      lead: 'Aún sin medir.',
      tone: 'neutral',
      text: 'Para medir tu carga hacen falta unas semanas de sesiones. Hasta entonces no la uso para frenarte ni para subirte.',
      rows: [],
      foot: 'La carga compara lo que has entrenado esta semana con lo de las cuatro anteriores.',
      actions: [{ label: 'Ver la carga', action: 'ver-carga' }],
    };
  }
  const { lead, tone } = ZONE_LEAD[acwr.zone];
  const ratio = comma(Math.round(acwr.acwr * 100) / 100);
  const text =
    acwr.zone === 'optima'
      ? 'Has entrenado a un ritmo parecido al de las semanas anteriores: ni te sobra ni te falta carga.'
      : acwr.zone === 'baja'
        ? 'Has entrenado menos que en las semanas anteriores: tienes margen para más.'
        : acwr.zone === 'moderada'
          ? 'Has entrenado más que en las semanas anteriores: conviene no apretar demasiado.'
          : 'Has entrenado bastante más que en las semanas anteriores: es donde más se acumula la fatiga.';
  const rows: ExplainRow[] = [{ kind: 'plain', label: 'Esta semana frente a las anteriores', value: `${ratio}×` }];
  if (loadPenalty > 0) rows.push({ kind: 'delta', label: 'Lo que resta a tu preparación', value: -loadPenalty });
  const foot =
    acwr.zone === 'optima'
      ? 'La zona óptima va de 0,8 a 1,3 veces lo habitual.'
      : acwr.zone === 'baja'
        ? 'Por debajo de 0,8 puedo subirte el volumen poco a poco.'
        : 'Por encima de 1,3 te frenaré: la preparación ya lo tiene en cuenta.';
  return { id: 'carga', lead, tone, text, rows, foot, actions: [{ label: 'Ver la carga', action: 'ver-carga' }] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Realizado, previsto y objetivo

export interface DoneInput {
  /** Esfuerzo hecho hoy, o null si aún no se entrenó. */
  real: number | null;
  planned: number | null;
  target: Pick<StrainTarget, 'low' | 'high'>;
  status: StrainStatus;
  rpe?: number;
  minutes?: number;
}

/** Lo realizado: el esfuerzo de la sesión (RPE por la duración) y cómo quedó frente a lo previsto y al objetivo. */
export function explainDone(i: DoneInput): Explanation {
  if (i.real === null) {
    return {
      id: 'realizado',
      lead: 'Aún sin entrenar.',
      tone: 'effort',
      text: 'Realizado es el esfuerzo de la sesión de hoy, cuando la cierres: tu RPE multiplicado por los minutos que duró.',
      rows: [],
      foot: 'Por ejemplo, un RPE de 7 durante 52 minutos son unos 52 de esfuerzo.',
      actions: [{ label: 'Ir a la sesión', action: 'planificacion' }],
    };
  }
  const range = `${i.target.low}–${i.target.high}`;
  const lead = i.status === 'pasado' ? 'Te has pasado del objetivo.' : i.status === 'por-debajo' ? 'Por debajo del objetivo.' : 'Dentro del objetivo.';
  const tone: ExplainTone = i.status === 'pasado' ? 'bad' : i.status === 'por-debajo' ? 'info' : 'good';
  const how = i.rpe !== undefined && i.minutes !== undefined ? ` Sale de un RPE de ${comma(i.rpe)} durante ${i.minutes} min.` : '';
  const rows: ExplainRow[] = [{ kind: 'plain', label: 'Realizado', value: String(i.real) }];
  if (i.planned !== null) rows.push({ kind: 'plain', label: 'Previsto', value: `~${i.planned}` });
  rows.push({ kind: 'plain', label: 'Objetivo', value: range });
  return {
    id: 'realizado',
    lead,
    tone,
    text: `Has hecho ${i.real} de esfuerzo; tu objetivo de hoy era ${range}.${how}`,
    rows,
    foot: 'El esfuerzo sale del RPE y de la duración de la sesión.',
    actions: [{ label: 'Ver el esfuerzo', action: 'ver-esfuerzo' }],
  };
}

/** Lo previsto: lo que cuesta la sesión programada hoy (minutos y RPE esperados) y cómo encaja con el objetivo. */
export function explainPlanned(planned: PlannedStrain | null, target: Pick<StrainTarget, 'low' | 'high'>, fit: { fit: PlanFit; diff: number } | null): Explanation {
  if (!planned) {
    return {
      id: 'previsto',
      lead: 'Sin sesión prevista.',
      tone: 'plan',
      text: 'Hoy no hay una sesión programada de la que calcular el esfuerzo previsto.',
      rows: [],
      foot: 'El previsto sale de los minutos de la sesión y del RPE que suele costarte ese tipo de entreno.',
      actions: [{ label: 'Ir a Planificación', action: 'planificacion' }],
    };
  }
  const range = `${target.low}–${target.high}`;
  const rows: ExplainRow[] = [
    { kind: 'plain', label: 'Duración estimada', value: `${Math.round(planned.minutes)} min` },
    { kind: 'plain', label: 'RPE esperado', value: comma(planned.rpe) },
    { kind: 'plain', label: 'Tu objetivo', value: range },
  ];
  const foot = !fit
    ? ''
    : fit.fit === 'dentro'
      ? `Cae dentro de tu objetivo (${range}): encaja.`
      : fit.fit === 'se-pasa'
        ? `Se pasa ${fit.diff} de tu objetivo (${range}): puedes ajustar la sesión.`
        : `Te deja margen sobre tu objetivo (${range}).`;
  const actions: Explanation['actions'] = [{ label: fit?.fit === 'se-pasa' ? 'Ajustar la sesión' : 'Ver la sesión', action: 'planificacion' }];
  return {
    id: 'previsto',
    lead: `La sesión de hoy cuesta ~${planned.strain}.`,
    tone: 'plan',
    text: `Unos ${Math.round(planned.minutes)} min a un RPE de ${comma(planned.rpe)}, como te suelen salir estas semanas.`,
    rows,
    foot,
    actions,
  };
}

/**
 * El aro del esfuerzo entero: lo realizado, lo previsto y el objetivo juntos, que son lo mismo mirado de tres formas. Es lo que sale al
 * tocar el aro de fuera; cada número, y el texto del objetivo, siguen teniendo su explicación suelta.
 */
export function explainEffort(i: DoneInput): Explanation {
  const range = `${i.target.low}–${i.target.high}`;
  const rows: ExplainRow[] = [
    { kind: 'plain', label: 'Realizado', value: i.real === null ? '—' : String(i.real) },
    { kind: 'plain', label: 'Previsto (la sesión de hoy)', value: i.planned === null ? '—' : `~${i.planned}` },
    { kind: 'plain', label: 'Objetivo (lo que te conviene)', value: range },
  ];
  if (i.real === null) {
    const fit = i.planned === null ? null : strainFit(i.planned, i.target);
    const foot = i.planned === null ? 'Hoy no hay una sesión de la que calcular el previsto.' : fit?.fit === 'se-pasa' ? `La sesión se pasa ${fit.diff} de tu objetivo: puedes ajustarla.` : fit?.fit === 'se-queda-corta' ? 'La sesión te deja margen sobre tu objetivo.' : 'La sesión cae dentro de tu objetivo: encaja.';
    return {
      id: 'esfuerzo',
      lead: 'Tu esfuerzo de hoy.',
      tone: 'effort',
      text: i.planned === null ? `Aún no has entrenado y tu objetivo es ${range}.` : `Aún no has entrenado: lo previsto es ~${i.planned} y tu objetivo ${range}.`,
      rows,
      foot,
      actions: [{ label: 'Ver la tendencia', action: 'ver-esfuerzo' }, { label: 'Ir a la sesión', action: 'planificacion' }],
    };
  }
  const word = i.status === 'pasado' ? 'Te has pasado del objetivo.' : i.status === 'por-debajo' ? 'Has quedado por debajo del objetivo.' : 'Has quedado dentro del objetivo.';
  return {
    id: 'esfuerzo',
    lead: 'Tu esfuerzo de hoy.',
    tone: i.status === 'pasado' ? 'bad' : 'effort',
    text: `Has hecho ${i.real}${i.planned !== null ? ` frente a ~${i.planned} previstos` : ''}, con un objetivo de ${range}.`,
    rows,
    foot: word,
    actions: [{ label: 'Ver la tendencia', action: 'ver-esfuerzo' }],
  };
}

/** El objetivo: cuánto esfuerzo te conviene hoy y por qué (las razones con las que se calculó). */
export function explainObjective(target: StrainTarget): Explanation {
  const range = `${target.low}–${target.high}`;
  const rows: ExplainRow[] = target.reasons.map((reason) => ({ kind: 'plain' as const, label: reason, value: '' }));
  return {
    id: 'objetivo',
    lead: `Cuánto te conviene hoy: ${range}.`,
    tone: 'neutral',
    text: target.provisional
      ? 'Es la zona de esfuerzo que te conviene hoy. Aún sin tu check-in: la rehago cuando lo contestes.'
      : target.readiness !== null
        ? `Es la zona de esfuerzo que te conviene hoy, con una preparación de ${Math.round(target.readiness)}. Por las razones de abajo, este es tu rango.`
        : 'Es la zona de esfuerzo que te conviene hoy, según cómo estás.',
    rows,
    foot: 'Con más preparación el rango sube; si vienes cargado, baja.',
    actions: [{ label: 'Ver la tendencia', action: 'ver-esfuerzo' }],
  };
}
