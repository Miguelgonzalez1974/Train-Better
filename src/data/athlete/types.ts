import type { Block } from '../movements/types';

export interface PersonalRecords {
  backSquat: number;
  frontSquat: number;
  benchPress: number;
  deadlift: number;
  strictPress: number;
  clean: number;
  snatch: number;
  cleanAndJerk: number;
}

export interface BodyweightEntry {
  /** Fecha ISO (yyyy-mm-dd) del pesaje — un registro por dia, el mas reciente sustituye al anterior de ese mismo dia */
  date: string;
  kg: number;
}

export interface Macrocycle {
  id: string;
  /** Nombre libre del atleta, ej. "Prep competición otoño" */
  label: string;
  /** Fecha ISO de inicio (semana 1 del ciclo de 4 semanas) */
  startDate: string;
  /** Fecha ISO de fin — a partir de este dia, si no hay otro macrociclo activo, se cae a modo mantenimiento */
  endDate: string;
}

export interface AthleteProfile {
  prs: PersonalRecords;
  trainingDaysPerWeek: 3 | 4 | 5 | 6;
  /**
   * Macrociclos planificados (pasados, activo, futuros). Solo puede haber uno "activo" a la vez
   * (el que contiene la fecha de hoy) — fuera de todos ellos se entrena en modo mantenimiento.
   */
  macrocycles: Macrocycle[];
  /** Historial de peso corporal, opcional para no romper perfiles guardados antes de esta funcion */
  bodyweightLog?: BodyweightEntry[];
  /**
   * Fechas ISO (una por dia, deduplicadas) en las que se completo una sesion — a diferencia de
   * `SessionHistoryEntry[]` (limitado a las ultimas 30 para no crecer sin limite), este log solo
   * guarda la fecha y aguanta un cap mucho mayor, para poder calcular "dias entrenados este año"
   * sin que el contador se quede clavado al llegar al limite del historial detallado.
   */
  trainingDatesLog?: string[];
  /** Objetivos activos concurrentes — ver [[Goal]]. Varios pueden convivir (p.ej. competicion + un PR puntual). */
  goals: Goal[];
}

export interface SessionBlockResult {
  block: Block;
  movementId: string;
  sets?: number;
  reps?: string;
  loadKg?: number;
  notes?: string;
  /** Formato del WOD (ej. "For Time (3 rondas)"), usado solo por el bloque wod */
  format?: string;
  /** Etiqueta de subgrupo dentro del bloque (ej. "Para el WOD" / "Para Oly" en warmup) */
  subgroup?: string;
  /** Nombre propio del WOD custom del dia (ej. "Tormenta Salvaje"), usado solo por el bloque wod */
  title?: string;
}

export interface DailySession {
  date: string;
  mesocycleWeek: number;
  isRestDay: boolean;
  blocks: SessionBlockResult[];
  /** Si la semana de hoy fue sustituida por una descarga (fatiga acumulada o taper pre-competicion), no por calendario. */
  deloadReason?: 'fatiga' | 'taper';
  deloadNote?: string;
  /** 'custom' cuando el atleta escribio su propia sesion en vez de usar la generada — `blocks` va vacio y el contenido vive en customTitle/customNote. */
  source?: 'generated' | 'custom';
  customTitle?: string;
  customNote?: string;
  /** Etiqueta a mostrar en vez de "Mantenimiento" cuando el atleta cambio deliberadamente el tipo de sesion de hoy (propia/recuperacion/aleatoria) en vez de usar lo programado. */
  swapLabel?: string;
}

export type RxOrScaled = 'rx' | 'scaled';

export type WodScoreType = 'time' | 'reps' | 'load' | 'rounds+reps';

export interface WodResult {
  scoreType: WodScoreType;
  /** Valor formateado para mostrar, ej. "6:42", "8+12", "185 reps", "70 kg" */
  value: string;
}

export interface SessionHistoryEntry {
  date: string;
  mesocycleWeek: number;
  movementIds: string[];
  rxOrScaled: RxOrScaled;
  /** Percepcion de esfuerzo, escala 1-10 */
  rpe: number;
  /** Duracion real de la sesion en minutos, usada para calcular sRPE (RPE x duracion) */
  durationMin: number;
  /** Resultado real del WOD de esa sesion, si se registro */
  wodResult?: WodResult;
  /** Carga real levantada en un dia de test 1RM (fuerza u oly), si la sesion incluia uno */
  testLoadKg?: number;
}

export const DEFAULT_PROFILE: AthleteProfile = {
  prs: {
    backSquat: 100,
    frontSquat: 80,
    benchPress: 80,
    deadlift: 120,
    strictPress: 50,
    clean: 70,
    snatch: 55,
    cleanAndJerk: 75,
  },
  trainingDaysPerWeek: 4,
  macrocycles: [],
  goals: [],
};

export type GoalType =
  | 'subir-pr'
  | 'elevar-fuerza'
  | 'mejorar-gimnasticos'
  | 'mejorar-potencia'
  | 'preparar-competicion'
  | 'elevar-resistencia';

export type GoalEmphasis = 'moderado' | 'intensivo';

export interface Goal {
  id: string;
  type: GoalType;
  /** Requerido para subir-pr, elevar-fuerza, mejorar-potencia, mejorar-gimnasticos */
  movementId?: string;
  /** Fecha ISO objetivo (yyyy-mm-dd) */
  targetDate: string;
  emphasis: GoalEmphasis;
  createdAt: string;
}
