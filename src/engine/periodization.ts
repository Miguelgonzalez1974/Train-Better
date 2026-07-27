import type { MovementPattern } from '../data/movements/types';

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

export function getMesocycleWeek(mesocycleStartDateIso: string, today: Date = new Date()): 1 | 2 | 3 | 4 {
  const start = new Date(mesocycleStartDateIso);
  const todayMidnight = new Date(today).setHours(0, 0, 0, 0);
  const startMidnight = new Date(start).setHours(0, 0, 0, 0);
  const diffMs = todayMidnight - startMidnight;
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const weeksSince = Math.floor(diffDays / 7);
  return ((weeksSince % 4) + 1) as 1 | 2 | 3 | 4;
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
