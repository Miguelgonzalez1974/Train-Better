import type { MovementPattern } from '../data/movements/types';
import type { Macrocycle } from '../data/athlete/types';

export type OlyFamily = 'snatch' | 'clean';

export interface DayPlan {
  isTrainingDay: boolean;
  trainingDayIndex: number;
  strengthPattern: MovementPattern;
  olyFamily: OlyFamily;
  /** Dia de recuperacion activa (jueves, en semanas de 6 dias): cardio suave, sin fuerza/oly. */
  isRecoveryDay: boolean;
}

/** Indices de dia de entrenamiento dentro de la semana, Lunes = 0 ... Domingo = 6 */
const TRAINING_DAY_TEMPLATES: Record<3 | 4 | 5 | 6, number[]> = {
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

const STRENGTH_PATTERN_CYCLE: MovementPattern[] = ['squat', 'hinge', 'verticalPush', 'horizontalPush'];
const OLY_FAMILY_CYCLE: OlyFamily[] = ['snatch', 'clean'];

export function getWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Fecha en formato yyyy-mm-dd usando los componentes LOCALES del Date (no UTC).
 * `date.toISOString()` convierte a UTC y puede desplazar un dia en zonas horarias
 * adelantadas a UTC cuando se combina con Date que ya se ajustaron a medianoche local.
 */
export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Macrociclo cuya ventana [startDate, endDate] contiene la fecha dada, o undefined si ninguno la
 * cubre (entonces se entrena en modo mantenimiento). Si dos se solapan por error del atleta, gana
 * el primero de la lista — no hay una regla de prioridad mas alla de eso, se asume que no debería pasar.
 */
export function getActiveMacrocycle(macrocycles: Macrocycle[], todayIso: string): Macrocycle | undefined {
  return macrocycles.find((m) => m.startDate <= todayIso && todayIso <= m.endDate);
}

/**
 * Dias/semanas transcurridas usando fechas UTC "sinteticas" (construidas a partir de los
 * componentes de calendario locales, no del instante real) en vez de restar milisegundos de
 * reloj local — un cambio de hora (DST) de por medio le resta o suma una hora real al intervalo,
 * lo que con la resta de milisegundos puede tirar el conteo de dias una semana entera para atras
 * justo esa semana. UTC no tiene DST, así que la resta siempre da un multiplo exacto de un dia.
 */
export function weeksSinceStart(startDateIso: string, today: Date): number {
  const start = new Date(startDateIso);
  const startUtcMs = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayUtcMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.max(0, Math.floor((todayUtcMs - startUtcMs) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffDays / 7);
}

export interface PhaseProgress {
  /** 1=acumulacion, 2=intensificacion, 3=pico, 4=descarga — mismo indice que usan las tablas de % de carga. */
  phaseIndex: 1 | 2 | 3 | 4;
  /** Semana dentro de la fase actual, 1-indexada. */
  weekInPhase: number;
  /** Duracion total en semanas de la fase actual. */
  phaseLengthWeeks: number;
}

/**
 * Resuelve en que fase del macrociclo cae `today`. Si el macrociclo no define `phaseWeeks`, usa
 * el ciclo clasico de 4 semanas iguales en bucle indefinido (comportamiento historico). Si lo
 * define, recorre esos bloques de duracion variable — un atleta puede pedir 6 semanas de
 * acumulacion, 6 de intensificacion, 4 de pico y el resto de descarga, y esto lo respeta.
 */
export function resolveMacrocyclePhase(macro: Macrocycle, today: Date = new Date()): PhaseProgress {
  const weeksSince = weeksSinceStart(macro.startDate, today);

  if (!macro.phaseWeeks) {
    // Ciclo clasico: cada fase dura exactamente 1 semana antes de rotar a la siguiente — el "4"
    // es la duracion del ciclo completo, no de una fase individual, asi que weekInPhase/
    // phaseLengthWeeks reflejan eso (1 de 1), no la posicion dentro del ciclo de 4.
    const weekInCycle = weeksSince % 4;
    return { phaseIndex: (weekInCycle + 1) as 1 | 2 | 3 | 4, weekInPhase: 1, phaseLengthWeeks: 1 };
  }

  let cursor = 0;
  for (let i = 0; i < macro.phaseWeeks.length; i++) {
    const length = Math.max(1, macro.phaseWeeks[i]);
    if (weeksSince < cursor + length) {
      return { phaseIndex: (i + 1) as 1 | 2 | 3 | 4, weekInPhase: weeksSince - cursor + 1, phaseLengthWeeks: length };
    }
    cursor += length;
  }

  // El macrociclo dura mas que la suma de fases planificadas: se queda en la ultima (normalmente descarga).
  const lastIndex = macro.phaseWeeks.length as 1 | 2 | 3 | 4;
  const lastLength = Math.max(1, macro.phaseWeeks[macro.phaseWeeks.length - 1]);
  return { phaseIndex: lastIndex, weekInPhase: lastLength, phaseLengthWeeks: lastLength };
}

/** Para sesgo "intensivo" de objetivos: aprox. la mitad de los dias de entreno son "de enfasis". */
export function isEmphasisDay(trainingDayIndex: number): boolean {
  return trainingDayIndex % 2 === 0;
}

export function getDayPlan(weekdayIndex: number, trainingDaysPerWeek: 3 | 4 | 5 | 6): DayPlan {
  const template = TRAINING_DAY_TEMPLATES[trainingDaysPerWeek];
  const trainingDayIndex = template.indexOf(weekdayIndex);
  const isTrainingDay = trainingDayIndex !== -1;

  return {
    isTrainingDay,
    trainingDayIndex: isTrainingDay ? trainingDayIndex : -1,
    strengthPattern: STRENGTH_PATTERN_CYCLE[Math.max(trainingDayIndex, 0) % STRENGTH_PATTERN_CYCLE.length],
    olyFamily: OLY_FAMILY_CYCLE[Math.max(trainingDayIndex, 0) % OLY_FAMILY_CYCLE.length],
    isRecoveryDay: isTrainingDay && trainingDaysPerWeek === 6 && weekdayIndex === 3,
  };
}
