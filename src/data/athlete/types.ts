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

/**
 * PRs de variantes concretas, aparte de los 8 levantamientos raiz — opcionales: si el atleta no
 * rellena una, esa variante sigue heredando el PR del movimiento raiz (comportamiento previo).
 * Solo cubre variantes que de verdad se entrenan como levantamiento propio con numero distinto al
 * raiz (ver CONJUGATE_ME_VARIANTS en strengthPrograms.ts, que es donde mas se nota la diferencia).
 */
export interface VariantPersonalRecords {
  sumoDeadlift?: number;
  pushPress?: number;
  splitJerk?: number;
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

export type StrengthMethod = '531' | 'lineal' | 'ondulante' | 'conjugado' | 'ruso' | 'texas' | 'juggernaut' | 'haltero';

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

/**
 * Rampa de vuelta al entrenar sin macrociclo ni programa de fuerza activo: en vez de arrancar al
 * 100% desde el primer dia, la carga de fuerza/oly y la exigencia de los WOD suben gradualmente a
 * lo largo del numero de semanas que elija el atleta en cada dominio (0 = sin rampa en ese dominio).
 */
export interface IntensityRamp {
  /** Fecha ISO en la que empezo la rampa. */
  startDate: string;
  strengthWeeks: number;
  olyWeeks: number;
  wodWeeks: number;
}

export type PainArea = 'hombro' | 'cadera-lumbar' | 'rodilla' | 'codo-muneca';

export interface PainFlag {
  id: string;
  area: PainArea;
  /** Fecha ISO en la que se marco el aviso. */
  createdDate: string;
  /** Fecha ISO a partir de la cual el aviso deja de aplicarse; null = hasta que el atleta lo quite a mano. */
  until: string | null;
}

export type SleepLevel = 'mal' | 'regular' | 'bien';
export type SorenessLevel = 'alto' | 'leve' | 'ninguno';
export type StressLevel = 'alto' | 'medio' | 'bajo';
export type MotivationLevel = 'baja' | 'normal' | 'alta';

/**
 * Check-in diario de energia (sueno, agujetas, estres, motivacion) — un coach real pregunta esto
 * antes de decidir cuanto exigir hoy, en vez de esperar a que el volumen acumulado (ACWR) lo note
 * dias despues. Ver `src/engine/readiness.ts` para como se convierte en un factor de carga.
 */
export interface ReadinessCheck {
  /** Fecha ISO (yyyy-mm-dd) — un check-in por dia, el mas reciente sustituye al anterior de ese mismo dia. */
  date: string;
  sleep: SleepLevel;
  soreness: SorenessLevel;
  stress: StressLevel;
  motivation: MotivationLevel;
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
  /** Avisos activos de molestia/dolor (ver [[PainFlag]]) — el motor evita el patron de movimiento asociado mientras esten vigentes. */
  painFlags?: PainFlag[];
  /** Rampa de vuelta activa (ver [[IntensityRamp]]), si el atleta configuro una. */
  intensityRamp?: IntensityRamp;
  /** PRs de variantes concretas (ver [[VariantPersonalRecords]]) — sumo deadlift, push press, split jerk. */
  variantPrs?: VariantPersonalRecords;
  /** Check-ins diarios de energia (ver [[ReadinessCheck]]) — el motor los lee por fecha para ajustar la carga de hoy. */
  readinessLog?: ReadinessCheck[];
  /**
   * Claves `macroId:semana` de revisiones semanales del macrociclo ya mostradas (confirmadas o
   * descartadas) — ver `src/engine/macroReview.ts`. Evita repetir el mismo aviso cada dia dentro de
   * la misma semana del macrociclo.
   */
  reviewedMacroWeeks?: string[];
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
  /** Nombre del movimiento original cuando este bloque se escalo a una alternativa (ver src/data/movements/scalingGuide.ts) — deja constancia de que hoy no fue el prescrito. */
  scaledFrom?: string;
}

export interface DailySession {
  date: string;
  mesocycleWeek: number;
  isRestDay: boolean;
  blocks: SessionBlockResult[];
  /** Si la semana de hoy fue sustituida por una descarga (fatiga acumulada o taper pre-competicion), no por calendario. */
  deloadReason?: 'fatiga' | 'taper';
  deloadNote?: string;
  /**
   * Resumen "por que tu sesion es asi hoy" — mismos fragmentos ya visibles dentro de cada bloque
   * (autorregulacion, rampa de vuelta, balance semanal/punto debil, sustitucion por dolor),
   * recogidos aparte y deduplicados para poder verlos de un vistazo sin leer bloque a bloque. Ver
   * `collectReasons` en generateSession.ts — nunca es una segunda fuente de verdad, siempre los
   * mismos textos que ya se concatenan en `SessionBlockResult.notes`.
   */
  coachReasons?: string[];
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
  painFlags: [],
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
