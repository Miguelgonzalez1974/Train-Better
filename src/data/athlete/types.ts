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
  /**
   * Duracion en semanas de cada fase — [acumulacion, intensificacion, pico, descarga], en ese
   * orden fijo. Si se omite, se usa el ciclo clasico de 4 semanas iguales en bucle indefinido
   * durante todo el macrociclo. Si se define, el atleta manda: puede tener 6 semanas de
   * acumulacion, 6 de intensificacion, 4 de pico y el resto de descarga, por ejemplo.
   */
  phaseWeeks?: [number, number, number, number];
}

export type StrengthMethod = '531' | 'lineal' | 'ondulante' | 'conjugado' | 'ruso' | 'texas';

export interface StrengthProgram {
  id: string;
  /** Fecha ISO de inicio. */
  startDate: string;
  /** Fecha ISO de fin — al pasar esta fecha, vuelve automaticamente al macrociclo (si sigue activo) o a mantenimiento. */
  endDate: string;
  method: StrengthMethod;
  /**
   * Levantamientos incluidos, en el orden en que rotan por dia de entreno. Vacio o ausente = los 4
   * clasicos (sentadilla trasera, press banca, peso muerto, press militar).
   */
  lifts: (keyof PersonalRecords)[];
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
  /**
   * Periodos de fuerza pura (ver [[StrengthProgram]]) — mientras uno esta activo, sustituye entera
   * la sesion del dia (sin wod/oly/skill salvo que el atleta lo añada) y pausa el macrociclo hasta
   * su fecha de fin. Como mucho uno activo a la vez; si el atleta solapa dos por error gana el
   * primero de la lista, igual que macrocycles.
   */
  strengthPrograms?: StrengthProgram[];
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
  /** En que semana de la fase actual del macrociclo cae hoy (1-indexado) — solo con macrociclo activo. */
  phaseWeekInPhase?: number;
  /** Duracion total en semanas de la fase actual — junto a `phaseWeekInPhase` da "semana 3 de 6". */
  phaseLengthWeeks?: number;
  /** Presente cuando hoy cae dentro de un StrengthProgram activo — etiqueta tipo "5/3/1 · Semana 3" a mostrar en vez de la fase del macrociclo. */
  strengthProgramLabel?: string;
  /** Etiqueta junto al bloque wod cuando se añadio opcionalmente sobre un dia de programa de fuerza (ej. "de tu macrociclo"). */
  wodTag?: string;
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
  strengthPrograms: [],
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
