import type { Block, MovementPattern } from '../movements/types';

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

export type StrengthMethod =
  | '531'
  | 'lineal'
  | 'ondulante'
  | 'conjugado'
  | 'ruso'
  | 'texas'
  | 'juggernaut'
  | 'haltero'
  | 'temporada'
  | 'dieSet'
  | 'mayhem-base'
  | 'mayhem-tecnica'
  | 'mayhem-pico';

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

/**
 * Preferencias del módulo de nutrición (menús del día/semana). Todo opcional: sin ellas se usa el catálogo
 * entero y el horario por defecto. Ver `src/engine/mealPlan.ts`.
 */
export interface NutritionPrefs {
  /** Ids del catálogo (`data/nutrition/foods.ts`) que el atleta no quiere ver en sus menús. */
  excludedFoodIds?: string[];
  /** Cambios de alimento hechos a mano: clave `fecha|comida|hueco` → id del alimento elegido. */
  swaps?: Record<string, string>;
  /** Comidas marcadas como hechas, por fecha ISO (índices 0-4 en el orden del día). */
  doneMeals?: Record<string, number[]>;
  /** Hora de entreno por día de la semana (lunes = "0"). Sin valor: sábado 10:00, el resto 16:00. */
  trainingHours?: Record<string, number>;
}

export interface AthleteProfile {
  prs: PersonalRecords;
  trainingDaysPerWeek: 3 | 4 | 5 | 6;
  /** ISO del momento en que el atleta terminó (o saltó) el asistente de alta — ausente = no lo ha visto. */
  onboardedAt?: string;
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
  /**
   * Registro serie a serie de fuerza/oly, marcado en el modo entreno enfocado (ver [[WorkSetEntry]]).
   * Persiste qué series se completaron y con qué carga real — de momento solo para mostrarlo en el
   * resumen y el diario; mas adelante puede alimentar la calibracion de carga (`analyzeSetLoads`).
   */
  workLog?: WorkSetEntry[];
  /**
   * Cache de sesiones diarias generadas, por fecha ISO — vive en el perfil (en vez de una clave de
   * localStorage aparte) para que viaje con el resto del perfil en cada `pushRemote`/`pullRemoteOrSeed`.
   * Sin esto, dos dispositivos que abrían la app en momentos distintos podían generar cada uno su
   * propia sesión para el mismo día (cada uno determinista respecto a SU perfil local del momento,
   * pero no coordinados entre sí) y quedarse cada uno con la suya para siempre. Con esto, el primer
   * dispositivo que genera el día "gana" y el otro la hereda al sincronizar en vez de generar la suya.
   */
  sessionCache?: Record<string, DailySession>;
  /** Preferencias del módulo de nutrición — ver [[NutritionPrefs]]. */
  nutritionPrefs?: NutritionPrefs;
  /**
   * Movimiento de fuerza/oly (y, si aplica, accesorio por rol / benchmark del día de test) bloqueado
   * para ese día, por fecha ISO — decidido una vez al planificar la semana (ver `planWeekLocks` en
   * generateSession.ts) para que "qué toca" no cambie solo entre una vista y otra; la carga/series
   * siguen calculándose frescas cada vez a partir de lo ya fijado. El WOD "normal" (no-benchmark) no
   * se bloquea — ver planWeekLocks.
   */
  weeklyLocks?: Record<
    string,
    {
      strengthMovementId?: string;
      olyMovementId?: string;
      /** Movimiento bloqueado por rol de accesorio (ver `AccessoryRole` en generateSession.ts) — unión inline para no acoplar esta capa al motor. */
      accessoryMovements?: Partial<
        Record<'unilateralLeg' | 'plyo' | 'posterior' | 'hPush' | 'vPush' | 'hPull' | 'vPull', string>
      >;
      /** Id (sin el prefijo "benchmark:") del WOD de referencia bloqueado para este día, si ese día salió como día de test al planificar la semana. */
      wodBenchmarkId?: string;
      /** El día salió como día de doble WOD (solo acondicionamiento) al planificar la semana. Un día del hueco de doble WOD con bloqueo pero sin esta marca se planificó como día normal y no cambia después. Ver `doubleWodSlot`. */
      doubleWod?: boolean;
      /** El bloqueo lo planificó un motor que ya conocía el día de doble WOD, así que la ausencia de `doubleWod` significa "día normal" a propósito. Un bloqueo anterior (sin esta marca) no decide la estructura del día: se resuelve con el estado de ese día. */
      doubleDecided?: boolean;
      /** Fecha ISO en que se decidio este bloqueo — permite saber si un dia perdido de la semana ocurrio DESPUES de planificar (y hay que re-planificar los dias que quedan). */
      plannedOn?: string;
    }
  >;
}

/** Una serie de trabajo registrada de un levantamiento de fuerza u oly. Clave: date+movementId+setNumber. */
export interface WorkSetEntry {
  /** Fecha ISO (yyyy-mm-dd). */
  date: string;
  movementId: string;
  block: 'strength' | 'oly';
  /** 1-indexado. */
  setNumber: number;
  /** Carga real de esa serie (kg). */
  kg: number;
  /** Reps de esa serie — 0 si la prescripción no da un número limpio (rampas "5-3-1", EMOM…). */
  reps: number;
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
  /** WOD de referencia (`movementId` = "benchmark:x"): escalados por movimiento, movementId original -> sustituto elegido. El formato oficial del benchmark no se toca (comparabilidad del resultado); esto solo anota que movimiento hacer en su lugar. */
  benchmarkSwaps?: Record<string, string>;
  /** Notacion de tempo real (ej. "3011", "10X0"): excentrica-pausa abajo-concentrica-pausa arriba, "X" = maxima velocidad. Solo bloque strength. */
  tempo?: string;
  /**
   * Formatos de serie unica (single pesado del dia, EMOM de 1 rep/min, test de 1RM): no llevan `sets`,
   * pero el atleta necesita registrar el peso realmente movido y valorar el esfuerzo. Con este flag,
   * FocusMode pinta una unica fila de registro ("Top @ X kg") que escribe en `workLog` igual que el
   * stepper multiserie, y el bloque entra en la tarjeta de RPE. Bloques strength y oly.
   */
  logAsSingle?: boolean;
  /** Marca series rectas de oly encadenadas sin soltar la barra (touch-and-go) — pastilla "T&G" junto a series/reps. Ausente = reset entre reps (default). Solo bloque oly. */
  repStyle?: 'touch-and-go';
  /** Rol que cubre esta entrada dentro del superset de accesorio (ver `AccessoryRole` en generateSession.ts) — permite bloquear el movimiento de ese rol al planificar la semana. Solo bloque accessory, ausente en el fallback de pool agotado. */
  accessoryRole?: 'unilateralLeg' | 'plyo' | 'posterior' | 'hPush' | 'vPush' | 'hPull' | 'vPull';
  /** Tipo de formato del WOD generado (`WodFormatKind` del motor, string para no acoplar la capa de datos) — lo lee `toHistoryEntry` para la memoria de formato. Solo bloque wod generado (no benchmark). */
  wodKind?: string;
  /** Parte del día de doble WOD a la que pertenece esta entrada (1 = pieza corta del generador, 2 = WOD real de la biblioteca). Ausente en un día de un solo WOD. */
  wodPart?: 1 | 2;
  /** Id del WOD real de la biblioteca (`src/data/library`) que sirve este bloque — permite no repetirlo en el historial. Solo WOD de tipo "library". */
  wodLibraryId?: string;
  /**
   * Objetivo orientativo del WOD estimado por el motor (`src/engine/wodTargets.ts`) — banda de
   * tiempo / rondas / reps. Solo bloque 'wod' generado (no benchmark). `low === 0 && high === 0`
   * significa objetivo cualitativo (solo la frase ya va en `notes`). Se usa para juzgar el
   * resultado al completar la sesion. Union inline para no acoplar la capa de datos con el motor.
   */
  wodTarget?: {
    scoreType: 'time' | 'reps' | 'load' | 'rounds+reps';
    unit: 'seconds' | 'rounds' | 'reps';
    low: number;
    high: number;
    display: string;
    /** Factor con el que el motor reescalo su estimacion base segun los WODs anteriores del atleta (ausente = sin ajuste). El historial lo usa para recuperar la estimacion base. */
    calibration?: number;
  };
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
export const SESSION_GEN_VERSION = 62;

export interface DailySession {
  date: string;
  mesocycleWeek: number;
  isRestDay: boolean;
  blocks: SessionBlockResult[];
  /** Sello de `SESSION_GEN_VERSION` con el que se genero — lo pone `saveCachedSession`. Ausente en sesiones cacheadas antes de introducir el sello (se tratan como version 0). */
  genVersion?: number;
  /** Si la semana de hoy fue sustituida por una descarga (fatiga acumulada o taper pre-competicion), no por calendario. */
  deloadReason?: 'fatiga' | 'taper' | 'rpe-alto';
  deloadNote?: string;
  /**
   * Resumen "por que tu sesion es asi hoy" — mismos fragmentos ya visibles dentro de cada bloque
   * (autorregulacion, rampa de vuelta, balance semanal/punto debil, sustitucion por dolor),
   * recogidos aparte y deduplicados para poder verlos de un vistazo sin leer bloque a bloque. Ver
   * `collectReasons` en generateSession.ts — nunca es una segunda fuente de verdad, siempre los
   * mismos textos que ya se concatenan en `SessionBlockResult.notes`.
   */
  coachReasons?: string[];
  /**
   * Huella del historial (`historyStamp`) con el que se genero esta sesion — la pone `saveCachedSession`
   * la primera vez que se cachea y no se toca despues. Si el historial cambia (se registra una sesion) y
   * el dia aun no se ha entrenado, la cacheada esta vieja (`isCachedSessionStale`) y se regenera con lo
   * que el coach sabe ahora. Ausente en cacheadas anteriores a esta huella (no se consideran viejas por esto).
   */
  genHistoryStamp?: string;
  /** Huella de los avisos de molestia vigentes para la fecha de la sesión cuando se generó (`painStamp`): si cambia (se marca, quita o caduca un aviso) la sesión cacheada se regenera. Ausente en cacheadas anteriores. */
  genPainStamp?: string;
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
  /** Día de doble WOD (solo acondicionamiento, sin fuerza ni oly): dos piezas con 5-10 min de descanso; las entradas de WOD llevan `wodPart` 1 y 2. Ver `doubleWodSlot`. */
  doubleWod?: boolean;
  /** El bloqueo semanal planificó doble WOD para este día pero hoy no se pudo (descarga, ACWR alto, poca disponibilidad, test, taper…): es un día normal a propósito, no un desacuerdo con el bloqueo. */
  doubleWodSkipped?: boolean;
  /** El WOD de referencia bloqueado para hoy choca con un aviso de molestia activo y se sirvió otro: la sesión no contradice al bloqueo a propósito. */
  wodLockSkipped?: boolean;
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
  /**
   * El atleta corrigio a mano un movimiento/WOD de esta sesion generada (modo edicion, fila a fila —
   * no el reemplazo completo de `source: 'custom'`). Cuenta como sesion "elegida" para todo lo demas:
   * no se regenera aunque el sello de motor quede viejo (`isCachedSessionStale`), no se descarta por
   * huerfana (`isCachedSessionOrphaned`), y gana los empates de sincronizacion entre dispositivos
   * (`mergeSessionCache`) — lo que el atleta puso a mano prevalece sobre lo generado.
   */
  editedByAthlete?: boolean;
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
  /** Resultado de la parte 2 de un día de doble WOD (`wodResult` guarda el de la parte 1). Ausente en un día de un solo WOD. */
  wodResult2?: WodResult;
  /** Carga real levantada en un dia de test 1RM (fuerza u oly), si la sesion incluia uno */
  testLoadKg?: number;
  /**
   * movementIds solo del bloque WOD de esa sesion (no toda la sesion) — para el analisis de
   * dominios de acondicionamiento sin tener que re-inferir que movimientos eran del metcon.
   * Ausente en entradas anteriores a esta feature.
   */
  wodMovementIds?: string[];
  /**
   * Patron del levantamiento de fuerza principal de esa sesion (bloque 'strength'). Lo escribe
   * `toHistoryEntry`. Es la fuente fiable para "no repetir patron dos dias seguidos": `movementIds`
   * se contamina con movimientos de barra del calentamiento y del WOD. Ausente en entradas
   * anteriores a esta feature (se cae al escaneo de `movementIds`).
   */
  strengthPattern?: MovementPattern;
  /**
   * Familia del levantamiento olimpico principal de esa sesion (bloque 'oly'): 'snatch' o 'clean'
   * (agrupa clean & jerk). Lo escribe `toHistoryEntry`. Misma razon que `strengthPattern`: sin esto,
   * detectar la familia escaneando `movementIds` se contamina con un power-clean o clean-and-jerk
   * que el WOD haya programado ese dia, y el motor "ve" la familia equivocada al decidir si repite.
   * Union inline en vez de importar `OlyFamily` del motor para no acoplar la capa de datos con el
   * motor (mismo motivo que `energySystem`). Ausente en entradas anteriores a esta feature.
   */
  olyFamily?: 'snatch' | 'clean';
  /**
   * Sistema energetico que el planificador asigno al WOD de ese dia — estructuralmente igual a
   * `EnergySystem` de `src/engine/wodDomains.ts` (union inline aqui para no acoplar la capa de
   * datos con el motor). Ausente en entradas anteriores a esta feature y en dias de benchmark.
   */
  energySystem?: 'base-aerobica' | 'umbral' | 'potencia' | 'recuperacion';
  /**
   * Tipo de formato del WOD generado ese dia (`WodFormatKind` del motor, como string para no acoplar
   * la capa de datos) — memoria para no repetir formato dos dias seguidos. Ausente en benchmarks y
   * en entradas anteriores a esta feature.
   */
  wodFormatKind?: string;
  /** Id del WOD real de la biblioteca hecho ese día (ver `SessionBlockResult.wodLibraryId`), para no repetirlo pronto. */
  wodLibraryId?: string;
  /**
   * Punto medio de la banda BASE (sin calibrar) del objetivo del WOD de ese dia, con su formato y
   * unidad — junto a `wodResult` permite medir cuanto rinde el atleta respecto a la estimacion del
   * motor y calibrarla (ver `getWodPerformance`). Ausente en benchmarks, objetivos cualitativos y
   * entradas anteriores a esta feature.
   */
  wodTargetBase?: { kind: string; unit: 'seconds' | 'rounds' | 'reps'; mid: number };
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
