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
  // `T00:00:00` fuerza el parseo en hora LOCAL — `new Date(startDateIso)` a secas interpreta un
  // ISO de solo fecha como medianoche UTC, y leer sus componentes locales despues desplaza un dia
  // hacia atras en cualquier huso horario negativo (America, p.ej.). Mismo bug/mismo arreglo que
  // `daysBetween` en loadMetrics.ts.
  const start = new Date(`${startDateIso}T00:00:00`);
  const startUtcMs = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayUtcMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.max(0, Math.floor((todayUtcMs - startUtcMs) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffDays / 7);
}

/**
 * Duracion total en semanas de un rango start/end (fin - inicio, redondeado a la semana mas
 * cercana). Generico a proposito — no solo Macrocycle, tambien StrengthProgram, ambos con el
 * mismo par de campos y la misma nocion de "cuanto dura esto".
 */
export function totalMacrocycleWeeks(range: { startDate: string; endDate: string }): number {
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(diffDays / 7));
}

/**
 * Semana actual (1-indexada, acotada a [1, semanas totales]) dentro de cualquier rango
 * start/end — mismo calculo que Objetivos.tsx ya usaba solo para macrociclos, generalizado para
 * que un StrengthProgram (misma forma start/end) pueda mostrar su propio progreso sin duplicar
 * la cuenta.
 */
export function currentWeekInRange(range: { startDate: string; endDate: string }, today: Date): number {
  const elapsed = weeksSinceStart(range.startDate, today) + 1;
  return Math.min(Math.max(elapsed, 1), totalMacrocycleWeeks(range));
}

/**
 * Aritmetica de fechas ISO (solo yyyy-mm-dd) compartida — `nextMacroSuggestion.ts` y
 * `seasonPlan.ts` planifican encadenando rangos y necesitan lo mismo. Siempre con el parseo
 * seguro `T00:00:00` (hora local), nunca `new Date(iso)` a secas (medianoche UTC -> desplaza
 * un dia en husos negativos, mismo bug ya arreglado en `daysBetween`/`weeksSinceStart`).
 */
export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

/** Dias enteros de `fromIso` a `toIso` (positivo si `toIso` es posterior). */
export function isoDiffDays(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24),
  );
}

/** Semanas de un rango ISO inclusivo (min. 1), redondeado a la semana mas cercana. */
export function weeksBetweenIso(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((isoDiffDays(startIso, endIso) + 1) / 7));
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
 * Igual que `resolveMacrocyclePhase` pero operando directamente sobre "semanas transcurridas desde
 * el inicio" en vez de una fecha — extraido para poder recorrer semana a semana todo el macrociclo
 * (ver `src/engine/macroPlan.ts`) sin tener que fabricar una fecha por cada semana.
 */
export function resolvePhaseAtWeek(macro: Macrocycle, weeksSince: number): PhaseProgress {
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

/**
 * Resuelve en que fase del macrociclo cae `today`. Si el macrociclo no define `phaseWeeks`, usa
 * el ciclo clasico de 4 semanas iguales en bucle indefinido (comportamiento historico). Si lo
 * define, recorre esos bloques de duracion variable — un atleta puede pedir 6 semanas de
 * acumulacion, 6 de intensificacion, 4 de pico y el resto de descarga, y esto lo respeta.
 */
export function resolveMacrocyclePhase(macro: Macrocycle, today: Date = new Date()): PhaseProgress {
  return resolvePhaseAtWeek(macro, weeksSinceStart(macro.startDate, today));
}

export interface WeekProgression {
  /** 0 en la primera semana de la fase, 1 en la ultima (0 si la fase dura <=1 semana). */
  t: number;
  /** Multiplicador de volumen del WOD (rondas / minutos). */
  wodVolume: number;
  /** Multiplicador de volumen de fuerza y accesorio (numero de series). */
  strengthVolume: number;
  /** Nudge de carga de fuerza — pequeño y solo la Intensificacion lo mueve de verdad. */
  strengthLoad: number;
  /** Nota de coach de la progresion dentro del bloque (vacia si no aplica). */
  note: string;
}

const PHASE_NAME: Record<1 | 2 | 3 | 4, string> = {
  1: 'Acumulación',
  2: 'Intensificación',
  3: 'Pico',
  4: 'Descarga',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Progresion DENTRO de un mesociclo: sin esto, las N semanas de una misma fase se entrenan con el
 * mismo volumen y la misma intensidad (un bloque de 4 semanas de Acumulacion era metabolicamente
 * plano). Un coach de verdad ondula la dosis dentro del bloque — Acumulacion sube volumen semana a
 * semana, Intensificacion sube carga y baja volumen, Pico afina bajando volumen, Descarga es plana
 * (el esquema de deload ya recorta). `phaseLengthWeeks <= 1` (ciclo clasico sin `phaseWeeks`) -> t=0
 * -> todos los factores a 1.0, comportamiento identico al anterior.
 */
export function resolveWeekProgression(
  phaseIndex: 1 | 2 | 3 | 4,
  weekInPhase: number,
  phaseLengthWeeks: number,
): WeekProgression {
  // Ciclo clasico (fases de 1 semana en bucle) o descarga: sin progresion intra-fase — todo a 1.0,
  // comportamiento identico al anterior.
  if (phaseLengthWeeks <= 1 || phaseIndex === 4) {
    return { t: 0, wodVolume: 1, strengthVolume: 1, strengthLoad: 1, note: '' };
  }

  const t = Math.min(1, Math.max(0, (weekInPhase - 1) / (phaseLengthWeeks - 1)));

  let wodVolume = 1;
  let strengthVolume = 1;
  let strengthLoad = 1;
  let what = '';
  if (phaseIndex === 1) {
    // Acumulacion: la semana 1 arranca a la carga base (sin recorte) y sube ~5% hasta la ultima
    // semana de la fase; el volumen es lo que mas crece.
    wodVolume = lerp(0.92, 1.1, t);
    strengthVolume = lerp(0.92, 1.1, t);
    strengthLoad = lerp(1.0, 1.05, t);
    what = 'la carga sube ~5% y el volumen bastante más a lo largo del bloque';
  } else if (phaseIndex === 2) {
    wodVolume = lerp(1.02, 0.9, t);
    strengthVolume = lerp(1.0, 0.88, t);
    strengthLoad = lerp(1.0, 1.06, t);
    what = 'la intensidad sube y el volumen baja a medida que avanza el bloque';
  } else {
    wodVolume = lerp(0.98, 0.86, t);
    strengthVolume = lerp(0.95, 0.85, t);
    strengthLoad = lerp(1.0, 1.02, t);
    what = 'afinando hacia el pico, el volumen baja semana a semana';
  }

  const note = `Semana ${weekInPhase} de ${phaseLengthWeeks} de ${PHASE_NAME[phaseIndex]} — ${what}.`;

  return { t, wodVolume, strengthVolume, strengthLoad, note };
}

/** Para sesgo "intensivo" de objetivos: aprox. la mitad de los dias de entreno son "de enfasis". */
export function isEmphasisDay(trainingDayIndex: number): boolean {
  return trainingDayIndex % 2 === 0;
}

/**
 * Cuantos dias de la semana producen de verdad un bloque de fuerza — no `trainingDaysPerWeek`
 * en crudo, porque en el calendario de 6 dias uno de esos dias es el de recuperacion activa de
 * mitad de semana (jueves), que nunca genera bloque de fuerza. Cualquier logica que necesite saber
 * "cuantas sesiones de fuerza son una semana completa para este atleta" (p.ej. el balance semanal
 * de patrones) debe usar esto, no el numero de dias de entreno a secas.
 */
export function expectedStrengthSessionsPerWeek(trainingDaysPerWeek: 3 | 4 | 5 | 6): number {
  return trainingDaysPerWeek === 6 ? 5 : trainingDaysPerWeek;
}

export type DayEmphasis = 'mixto' | 'fuerza' | 'metcon';

/**
 * Reparto fuerza / metcon / mixto de un dia de entreno segun la fase del macrociclo. Un coach real
 * no mete fuerza pesada + WOD todos los dias: en acumulacion carga mas dias de solo barra (base de
 * fuerza), cerca del pico mas dias de solo condicion fisica (afinar, estilo competicion). En medio,
 * mixto. Deterministico por (fase, posicion en la semana) — la semana tiene una forma estable, no
 * aleatoria. El dia 0 siempre es 'mixto' porque es el dia del benchmark de referencia.
 *
 *  - fase 1 (Acumulacion): los dias impares de la semana son solo fuerza
 *  - fase 2 (Intensificacion): solo el ultimo dia es fuerza pura, el resto mixto
 *  - fase 3 (Pico): la segunda mitad de la semana es solo metcon
 *  - fase 4 (Descarga): todo mixto (la carga ya viene reducida por el esquema de deload)
 *
 * `generateDailySession` aplica ademas dos anulaciones: en taper el ultimo dia pasa a 'metcon'
 * (simulacion), y un dia de test de maximo nunca se salta la fuerza (vuelve a 'mixto').
 */
export function resolveDayEmphasis(week: 1 | 2 | 3 | 4, trainingDayIndex: number, trainingDaysPerWeek: 3 | 4 | 5 | 6): DayEmphasis {
  if (trainingDayIndex <= 0) return 'mixto';
  const n = trainingDaysPerWeek;
  switch (week) {
    case 1:
      return trainingDayIndex % 2 === 1 ? 'fuerza' : 'mixto';
    case 2:
      return trainingDayIndex >= n - 1 ? 'fuerza' : 'mixto';
    case 3:
      return trainingDayIndex >= Math.ceil(n / 2) ? 'metcon' : 'mixto';
    default:
      return 'mixto';
  }
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
