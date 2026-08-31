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
  /** Movimiento independiente en CrossFit (tecnica + fuerza de tren superior en posicion de sentadilla), no una simple variante del back/front squat. */
  overheadSquat?: number;
  /** Version "power" (recepcion parcial) del snatch/clean — PR propio para comparar potencia vs tecnica de recepcion completa. */
  powerSnatch?: number;
  powerClean?: number;
}

export interface BodyweightEntry {
  /** Fecha ISO (yyyy-mm-dd) del pesaje — un registro por dia, el mas reciente sustituye al anterior de ese mismo dia */
  date: string;
  kg: number;
}

/**
 * Un punto en el historial de un PR — se añade automaticamente cada vez que el valor de un
 * levantamiento cambia (test real, e1RM confirmado o edicion manual). Sin este log, "cuanto
 * progresa este atleta" no es medible: `prs` solo guarda el valor actual, sobrescrito. Ver
 * `src/engine/responseProfile.ts`.
 */
export interface PrLogEntry {
  /** Fecha ISO (yyyy-mm-dd) del cambio. */
  date: string;
  /** Clave del levantamiento — `keyof PersonalRecords` o `keyof VariantPersonalRecords`. */
  key: string;
  kg: number;
}

/** Sensacion de la primera serie de trabajo de un levantamiento, reportada en el momento (ver [[SetFeedbackEntry]]). */
export type SetFeel = 'sobro' | 'justo' | 'duro' | 'muy-duro';

/**
 * Feedback en caliente tras la primera serie de trabajo de un levantamiento de fuerza u oly: el
 * atleta toca como fue y el coach recalcula el peso (y a veces el numero) de las series que
 * quedan del MISMO ejercicio, sin parar la sesion ni tocar el resto de bloques. Aparte del ajuste
 * inmediato, cada punto es un dato de calibracion "carga prescrita vs. realidad, por
 * levantamiento" que el perfil de respuesta podra leer para afinar futuras prescripciones
 * (`src/engine/responseProfile.ts`). Un registro por dia y movimiento — volver a tocar lo
 * sustituye.
 */
export interface SetFeedbackEntry {
  /** Fecha ISO (yyyy-mm-dd) de la sesion. */
  date: string;
  /** Movimiento de la serie valorada. */
  movementId: string;
  /** De que bloque salio — fuerza u oly (nunca WOD: ahi no se puede parar). */
  block: 'strength' | 'oly';
  /** Carga prescrita de la primera serie, kg — se guarda para poder recalcular ajustes desde el original aunque el bloque ya se haya modificado. */
  prescribedKg: number;
  /** Reps por serie prescritas ese dia (ya parseadas a numero). */
  prescribedReps: number;
  /** Series totales prescritas ese dia. */
  prescribedSets: number;
  /** Sensacion reportada tras la primera serie de trabajo. */
  feel: SetFeel;
  /**
   * Clave de PR a la que pertenece este levantamiento (`keyof PersonalRecords` o
   * `keyof VariantPersonalRecords`), resuelta igual que la usa el motor — para que
   * `computeResponseProfile` pueda agregar la sensacion por levantamiento y el motor ajustar su
   * carga de trabajo. Ausente si el movimiento no mapea a ninguna clave de PR.
   */
  prKey?: string;
  /** Fraccion del PR de referencia que representaba `prescribedKg` (0-1), si se pudo resolver — para calibrar sensacion vs. intensidad real. */
  pctOf1rm?: number;
  /**
   * Registro cuantitativo opcional: la carga y reps REALES que el atleta movio en esa serie, y su
   * RPE. Si estan las tres, la app calcula `estimated1rm` y el perfil de respuesta lo usa como
   * medida directa del maximo de trabajo de ese lift para calibrar futuras prescripciones — una
   * senal mas precisa que la sensacion cualitativa (`feel`).
   */
  actualKg?: number;
  actualReps?: number;
  actualRpe?: number;
  /** e1RM estimado a partir de (actualKg, actualReps, actualRpe) — lo calcula la app al guardar (ver `estimateE1RMFromRpe`). */
  estimated1rm?: number;
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

export type StrengthMethod = '531' | 'lineal' | 'ondulante' | 'conjugado' | 'ruso' | 'texas' | 'juggernaut' | 'haltero' | 'temporada' | 'dieSet';

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
  /**
   * Fecha ISO en la que el atleta lo quito a mano ("ya estoy bien"). El aviso deja de evitar sus
   * patrones al instante, pero durante las siguientes semanas la carga de esos patrones vuelve de
   * forma progresiva en vez de saltar al 100% de golpe (ver `getPainReintroPatterns`).
   */
  clearedDate?: string;
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
  /**
   * Historial de cambios de PR (ver [[PrLogEntry]]) — se añade solo cuando un valor de `prs` o
   * `variantPrs` cambia de verdad. Lo consume `src/engine/responseProfile.ts` para medir el ritmo
   * de progreso por levantamiento.
   */
  prLog?: PrLogEntry[];
  /**
   * Feedback en caliente de la primera serie de trabajo (ver [[SetFeedbackEntry]]) — alimenta el
   * ajuste inmediato de las series restantes y, mas adelante, la calibracion de carga por
   * levantamiento del perfil de respuesta.
   */
  setFeedbackLog?: SetFeedbackEntry[];
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
  /** Notacion de tempo real (ej. "3011", "10X0"): excentrica-pausa abajo-concentrica-pausa arriba, "X" = maxima velocidad. Solo bloque strength. */
  tempo?: string;
  /**
   * Presente cuando el atleta valoro su primera serie de trabajo (ver [[SetFeedbackEntry]]) y el
   * coach ajusto las series restantes: `sets`/`loadKg` de este bloque YA reflejan el ajuste. Marca
   * el estado para no volver a pedir el feedback al recargar y para senalar en la tarjeta que los
   * numeros incluyen la correccion. Solo bloque strength/oly.
   */
  firstSetFeel?: SetFeel;
}

/**
 * Version del generador de sesiones periodizadas. Se sube a mano cuando la logica de
 * `generateDailySession`/`generateStrengthProgramSession` cambia de forma que el mismo dia
 * deberia programarse distinto. Cada sesion cacheada se sella con este numero al guardarla
 * (`saveCachedSession`); al abrir la app, una sesion periodizada cacheada AUN NO COMPLETADA
 * con un sello anterior se descarta y se regenera —determinista— en vez de seguir mostrando
 * un entreno de una version vieja del motor. Asi el "mismo dia, mismo entreno en todos los
 * dispositivos" se auto-cura tras cada deploy sin tocar nada a mano. Las sesiones propias
 * (`source: 'custom'`), las elegidas a mano (`swapLabel`) y las ya registradas no se tocan.
 */
export const SESSION_GEN_VERSION = 2;

export interface DailySession {
  date: string;
  mesocycleWeek: number;
  isRestDay: boolean;
  blocks: SessionBlockResult[];
  /** Sello de `SESSION_GEN_VERSION` con el que se genero — lo pone `saveCachedSession`. Ausente en sesiones cacheadas antes de introducir el sello (se tratan como version 0). */
  genVersion?: number;
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
  /**
   * Enfasis del dia cuando el macrociclo lo desvia de "fuerza + WOD": 'fuerza' = solo barra, sin
   * WOD; 'metcon' = solo condicion fisica, sin fuerza pesada ni oly. Ausente = dia mixto normal.
   * Ver `resolveDayEmphasis` en periodization.ts.
   */
  dayEmphasis?: 'fuerza' | 'metcon';
  /** Sistema energetico del WOD de hoy (rotacion de dominios del microciclo) — solo con macrociclo activo y en dias no-benchmark. Ver `EnergySystem` en wodDomains.ts. */
  energySystem?: 'base-aerobica' | 'umbral' | 'potencia' | 'recuperacion';
  /** Intensidad relativa de hoy dentro de la onda dura/media/suave de la semana — ausente cuando es 'media' (el caso neutro). Ver `DayIntensity` en weekPlan.ts. */
  dayIntensity?: 'alta' | 'baja';
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
  /**
   * movementIds solo del bloque WOD de esa sesion (no toda la sesion) — para el analisis de
   * dominios de acondicionamiento sin tener que re-inferir que movimientos eran del metcon.
   * Ausente en entradas anteriores a esta feature.
   */
  wodMovementIds?: string[];
  /**
   * Sistema energetico que el planificador asigno al WOD de ese dia — estructuralmente igual a
   * `EnergySystem` de `src/engine/wodDomains.ts` (union inline aqui para no acoplar la capa de
   * datos con el motor). Ausente en entradas anteriores a esta feature y en dias de benchmark.
   */
  energySystem?: 'base-aerobica' | 'umbral' | 'potencia' | 'recuperacion';
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
  /**
   * Solo `mejorar-gimnasticos` con arbol de progresion: punto de partida declarado por el atleta,
   * 0-1 (0 = desde el principio, 1 = ya en el movimiento objetivo). El motor nunca programa un
   * escalon por debajo de esto — la fecha objetivo sigue tirando hacia arriba desde ahi. Ausente =
   * comportamiento anterior (empieza siempre por el escalon mas facil).
   */
  skillLevel?: number;
}
