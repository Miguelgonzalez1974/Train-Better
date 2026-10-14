import type { DailySession, Goal } from '../data/athlete/types';
import { addDaysIso, getDayPlan, getWeekdayIndex, isoDiffDays, isStrengthOnlyDay, toLocalIsoDate } from './periodization';

/**
 * Modo competición: con un objetivo `preparar-competicion` el coach lleva la cuenta atrás de la competición y cambia
 * lo que programa según los días que faltan, igual que un entrenador de verdad prepara una prueba:
 *
 *   29+ días        normal
 *   22-28           construcción: sigue el bloque, y los WODs ya salen de programaciones de competición
 *   15-21           pico 1 (intensificación): sube la intensidad
 *   8-14            pico: intensidad alta y volumen contenido; un día hace el SIMULACRO de competición (~10 días antes)
 *   3-7             taper: volumen -40 %, intensidad igual, WODs cortos y afilados; sin tests ni dobles
 *   2               activación: sesión corta y técnica
 *   1               víspera: descanso activo
 *   competición     sin sesión: hoy compites
 *   1-3 después     recuperación: volumen bajo antes de volver al plan
 *
 * La seguridad manda sobre el plan: si el ACWR o el RPE piden descarga, se descarga aunque toque pico.
 */

export type CompetitionPhase = 'construccion' | 'pico-1' | 'pico' | 'taper' | 'activacion' | 'vispera' | 'evento' | 'post';

export interface CompetitionDay {
  goalId: string;
  /** Primer y último día de la competición (ISO). */
  eventStart: string;
  eventEnd: string;
  /** Días hasta el primer día (0 ese día; negativo durante y después). */
  daysToEvent: number;
  phase: CompetitionPhase;
  label: string;
  guidance: string;
  /** Semana de entrenamiento (1 acumulación, 2 intensificación, 3 pico, 4 descarga) que se fuerza hoy; null = la del macro. */
  week: 1 | 2 | 3 | 4 | null;
  /** Factor sobre las series de fuerza y el volumen del WOD (1 = sin recorte). */
  volumeScale: number;
  /** Tope de minutos del WOD de hoy (null = sin tope). */
  maxWodMinutes: number | null;
  /** Hoy es técnico-ligero: fuerza y oly bajan fuerte y el WOD es el foco. */
  technicalLight: boolean;
  noTests: boolean;
  noDouble: boolean;
  /** Hoy se programa una sesión de recuperación (víspera). */
  recoverySession: boolean;
  /** Hoy es el simulacro de competición. */
  simulacro: boolean;
  eventDay: boolean;
}

const WINDOW_START_DAYS = 28;
const POST_DAYS = 3;
/** Días antes de la competición a los que se prefiere el simulacro (por orden de preferencia si el día no es de entreno). */
const SIMULACRO_OFFSETS = [10, 9, 11, 8];

/** La competición que cuenta hoy: la más próxima cuya ventana (28 días antes hasta 3 después) incluye `todayIso`. */
function activeCompetition(goals: Goal[], todayIso: string): { goal: Goal; eventStart: string; eventEnd: string } | null {
  const candidates = goals
    .filter((g) => g.type === 'preparar-competicion')
    .map((g) => ({ goal: g, eventStart: g.targetDate, eventEnd: g.eventEndDate && g.eventEndDate >= g.targetDate ? g.eventEndDate : g.targetDate }))
    .filter((c) => isoDiffDays(todayIso, c.eventStart) <= WINDOW_START_DAYS && isoDiffDays(c.eventEnd, todayIso) <= POST_DAYS)
    .sort((a, b) => a.eventStart.localeCompare(b.eventStart));
  return candidates[0] ?? null;
}

/** La fecha del simulacro: el día de entreno "normal" más cercano a 10 días antes (ni recuperación ni solo fuerza). */
export function simulacroDateFor(eventStart: string, trainingDaysPerWeek: 3 | 4 | 5 | 6): string | null {
  for (const offset of SIMULACRO_OFFSETS) {
    const iso = addDaysIso(eventStart, -offset);
    const plan = getDayPlan(getWeekdayIndex(new Date(`${iso}T00:00:00`)), trainingDaysPerWeek);
    if (plan.isTrainingDay && !plan.isRecoveryDay && !isStrengthOnlyDay(trainingDaysPerWeek, plan.trainingDayIndex)) return iso;
  }
  return null;
}

const BASE: Omit<CompetitionDay, 'goalId' | 'eventStart' | 'eventEnd' | 'daysToEvent' | 'phase' | 'label' | 'guidance'> = {
  week: null,
  volumeScale: 1,
  maxWodMinutes: null,
  technicalLight: false,
  noTests: false,
  noDouble: false,
  recoverySession: false,
  simulacro: false,
  eventDay: false,
};

/** Qué toca hoy en la cuenta atrás de la competición, o null si hoy no hay ninguna (lejos, pasada o sin objetivo). */
export function computeCompetitionDay(goals: Goal[] | undefined, date: Date, trainingDaysPerWeek: 3 | 4 | 5 | 6): CompetitionDay | null {
  const todayIso = toLocalIsoDate(date);
  const active = activeCompetition(goals ?? [], todayIso);
  if (!active) return null;
  const { goal, eventStart, eventEnd } = active;
  const d = isoDiffDays(todayIso, eventStart);
  const ids = { goalId: goal.id, eventStart, eventEnd, daysToEvent: d };

  if (todayIso >= eventStart && todayIso <= eventEnd) {
    return {
      ...BASE, ...ids, phase: 'evento', label: 'Competición', eventDay: true, noTests: true, noDouble: true,
      guidance: 'Hoy compites: calienta como un WOD, come y bebe lo de siempre y no pruebes nada nuevo. Disfruta.',
    };
  }
  if (todayIso > eventEnd) {
    return {
      ...BASE, ...ids, phase: 'post', label: 'Recuperación tras la competición', week: 4, volumeScale: 0.6, noTests: true, noDouble: true,
      guidance: 'Baja la carga unos días: moverte sí, vaciarte no. Después volvemos al plan.',
    };
  }
  if (d === 1) {
    return {
      ...BASE, ...ids, phase: 'vispera', label: 'Víspera', week: 3, recoverySession: true, noTests: true, noDouble: true,
      guidance: 'Descanso activo: movilidad, algo de cardio suave, dormir y comer bien. Hoy no se entrena.',
    };
  }
  if (d === 2) {
    return {
      ...BASE, ...ids, phase: 'activacion', label: 'Activación', week: 3, volumeScale: 0.5, maxWodMinutes: 6, technicalLight: true, noTests: true, noDouble: true,
      guidance: 'Sesión corta y técnica: mueves sangre y afinas movimientos sin cansarte.',
    };
  }
  if (d >= 3 && d <= 7) {
    return {
      ...BASE, ...ids, phase: 'taper', label: 'Taper', week: 3, volumeScale: 0.6, maxWodMinutes: 9, noTests: true, noDouble: true,
      guidance: 'Bajamos el volumen un 40 % y mantenemos la intensidad: WODs cortos y afilados para llegar fresco.',
    };
  }
  if (d >= 8 && d <= 14) {
    const simulacro = simulacroDateFor(eventStart, trainingDaysPerWeek) === todayIso;
    return {
      ...BASE, ...ids, phase: 'pico', week: 3, noTests: true, noDouble: d <= 12, simulacro, technicalLight: simulacro,
      label: simulacro ? 'Simulacro de competición' : 'Pico',
      guidance: simulacro
        ? 'Ensayo general: un WOD de programación de competición para probar ritmo, transiciones y estrategia. Hoy la fuerza va ligera.'
        : 'Intensidad alta y volumen contenido: afinas el ritmo de competición sin acumular fatiga.',
    };
  }
  if (d >= 15 && d <= 21) {
    return {
      ...BASE, ...ids, phase: 'pico-1', label: 'Pico · intensidad', week: 2, noTests: true,
      guidance: 'Sube la intensidad: WODs de competición y fuerza pesada con poco volumen.',
    };
  }
  return {
    ...BASE, ...ids, phase: 'construccion', label: 'Construcción',
    guidance: 'Sigue el bloque: la competición se prepara ahora. Los WODs ya salen de programaciones de competición.',
  };
}

/** Lo que se guarda en `DailySession.competition`. */
export function competitionInfo(c: CompetitionDay): NonNullable<DailySession['competition']> {
  return {
    phase: c.phase,
    label: c.label,
    guidance: c.guidance,
    daysToEvent: c.daysToEvent,
    ...(c.simulacro ? { simulacro: true } : {}),
    ...(c.eventDay ? { eventDay: true } : {}),
  };
}

/** Fases en las que el coach recorta y afila (los últimos 7 días): sin tests ni WODs largos. */
export function isCompetitionTaper(c: CompetitionDay | null): boolean {
  return c !== null && c.daysToEvent >= 1 && c.daysToEvent <= 7;
}
