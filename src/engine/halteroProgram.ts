import type { PersonalRecords, StrengthProgram } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import type { DayPlan } from './periodization';
import { weeksSinceStart } from './periodization';
import { roundToNearestPlate } from './oneRepMaxTables';

/**
 * "Preparación Halterofilia 14 semanas" — ciclo real de competición transcrito de un documento del
 * usuario (Ciclo Haltero 14 semanas.pdf), no una interpretación genérica. A diferencia de las otras
 * 7 metodologias de `strengthPrograms.ts` (un unico levantamiento por dia, ya sea con un % fijo o
 * con pasos tipo Juggernaut), este ciclo prescribe VARIOS levantamientos por dia (2-6: familia
 * snatch, familia clean/jerk, tirones, sentadilla) y cada uno con su propia escalera ascendente de
 * calentamiento -> serie de trabajo dentro de la misma sesion — de ahi que viva en su propio
 * modulo en vez de encajarlo a la fuerza en `resolveStrengthProgramDay`.
 */

export interface HalteroStep {
  /** Fraccion de 1 (0.6 = 60%), no porcentaje entero. */
  percent: number;
  sets: number;
  reps: number;
}

export interface HalteroLift {
  /** Nombre a mostrar, tal cual lo escribe el documento fuente. */
  label: string;
  movementId: string;
  /** A que PR del atleta se refieren los %. Los tirones se calculan sobre el levantamiento del que tiran (no tienen PR propio), y los jerks sobre el clean & jerk — misma convencion que usa el propio documento. */
  prKey: keyof PersonalRecords;
  block: 'oly' | 'strength';
  steps: HalteroStep[];
  /** true en los 5 dias del ciclo en los que la ultima serie es un intento de maximo real (marcado "RM"/"1RM" en el documento) — ese dia el factor de autorregulacion no se aplica a este levantamiento, igual que en cualquier otro dia de test de la app. */
  isMaxAttempt?: boolean;
}

type HalteroDay = HalteroLift[];
type HalteroWeek = HalteroDay[];

/**
 * "60/3 70/3 75/2×3" -> [{60%,1x3},{70%,1x3},{75%,2x3}], tal y como lo define el propio documento
 * ("60/2×3 son 60% 2 series de 3 repeticiones, 60/3 es 60% 1 serie de 3 repeticiones"). Cualquier
 * token que no encaje en el patron numero/numero(x numero) se ignora sin más — el documento fuente
 * tiene alguna anotacion decorativa suelta (p.ej. "RM", "× 1" separado por un espacio) que no forma
 * parte de la escalera en si.
 */
function parseSteps(spec: string): HalteroStep[] {
  const steps: HalteroStep[] = [];
  const re = /(\d+)\/(\d+)(?:[x×](\d+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(spec))) {
    const percent = Number(match[1]) / 100;
    if (match[3]) {
      steps.push({ percent, sets: Number(match[2]), reps: Number(match[3]) });
    } else {
      steps.push({ percent, sets: 1, reps: Number(match[2]) });
    }
  }
  return steps;
}

function makeLift(
  label: string,
  movementId: string,
  prKey: keyof PersonalRecords,
  block: 'oly' | 'strength',
  spec: string,
  isMaxAttempt?: boolean,
): HalteroLift {
  return { label, movementId, prKey, block, steps: parseSteps(spec), isMaxAttempt };
}

const snatch = (spec: string, isMaxAttempt?: boolean) => makeLift('Snatch', 'snatch', 'snatch', 'oly', spec, isMaxAttempt);
const powerSnatch = (spec: string) => makeLift('Power Snatch', 'power-snatch', 'snatch', 'oly', spec);
const hangSnatch = (spec: string, label = 'Hang Power Snatch') => makeLift(label, 'hang-snatch', 'snatch', 'oly', spec);
const snatchPull = (spec: string, label = 'Tirón Snatch') => makeLift(label, 'snatch-pull', 'snatch', 'oly', spec);
const clean = (spec: string) => makeLift('Clean', 'clean', 'clean', 'oly', spec);
const powerClean = (spec: string) => makeLift('Power Clean', 'power-clean', 'clean', 'oly', spec);
const hangClean = (spec: string) => makeLift('Hang Power Clean', 'hang-clean', 'clean', 'oly', spec);
const cleanPull = (spec: string, label = 'Tirón de Clean') => makeLift(label, 'clean-pull', 'clean', 'oly', spec);
const cleanJerk = (spec: string, isMaxAttempt?: boolean) => makeLift('Clean & Jerk', 'clean-and-jerk', 'cleanAndJerk', 'oly', spec, isMaxAttempt);
const pushJerk = (spec: string) => makeLift('Push Jerk', 'push-jerk', 'cleanAndJerk', 'oly', spec);
const splitJerk = (spec: string) => makeLift('Split Jerk', 'split-jerk', 'cleanAndJerk', 'oly', spec);
const backSquat = (spec: string, isMaxAttempt?: boolean) => makeLift('Back Squat', 'back-squat', 'backSquat', 'strength', spec, isMaxAttempt);
const frontSquat = (spec: string) => makeLift('Front Squat', 'front-squat', 'frontSquat', 'strength', spec);

/**
 * Las 14 semanas, 3 dias cada una, transcritas literalmente del documento fuente. Un par de lineas
 * del original traian un numero suelto o vacio (ej. semana 1 dia 3 "75/×4", semana 12 dia 2
 * "60/ 70/4") — probablemente un fallo de maquetacion del PDF original, no una escalera real de 0
 * pasos — en esos casos se completa con el numero de repeticiones mas coherente con el resto de esa
 * misma serie (marcado con un comentario junto a la linea).
 */
const HALTERO_PROGRAM: HalteroWeek[] = [
  // Semana 1
  [
    [snatch('60/3 70/3 75/2×3'), pushJerk('60/4 70/3×2'), hangClean('60/4 70/2×3'), backSquat('60/6 70/2×5')],
    [hangSnatch('60/3 65/3 70/2×5'), snatchPull('80/3 90/3×3'), splitJerk('60/3 70/3 75/4×2'), frontSquat('60/4 70/2×4 75/2×4')],
    [snatch('60/3 70/3 75/3×3'), clean('60/4 70/4 75/2×3'), cleanPull('80/2×3 90/2×3'), backSquat('60/4 70/2×4 75/2×4')], // "75/×4" del original interpretado como 75/2×4, coherente con el resto de la linea
  ],
  // Semana 2
  [
    [powerSnatch('60/3 70/2×3'), snatch('75/3 80/3×2'), clean('60/4 70/4 75/3 80/3×2'), cleanPull('90/3×3', 'Tirón de Clean (lento)'), backSquat('60/4 70/4 75/3×4')],
    [powerSnatch('60/3 70/3 75/2×3'), powerClean('60/3 70/3×3'), pushJerk('60/3 70/4×2'), frontSquat('60/5 70/5 75/3×4')],
    [snatch('60/3 70/3 75/3 80/2×3'), snatchPull('90/4 90/3×3', 'Tirón Snatch (lento)'), splitJerk('60/4 70/3 75/3 80/3×2'), backSquat('60/4 70/4 75/4 80/3×3')],
  ],
  // Semana 3
  [
    [snatch('60/4 70/4 75/3 80/3×3'), snatchPull('85/3 95/3×3'), hangClean('60/4 70/4 75/2×3'), backSquat('60/4 70/4 80/3×4')],
    [powerSnatch('60/3 70/3 75/3×3'), splitJerk('60/4 70/4 75/3 80/3×3'), cleanPull('70/3 80/3 90/3 95/2×2'), frontSquat('60/4 70/4 75/2×4 80/2×3')],
    [hangSnatch('60/4 70/2×3'), snatch('75/3 80/4×2'), pushJerk('60/4 70/4 75/2×3'), clean('60/4 70/4 75/3 80/3×3'), backSquat('70/4 75/4 80/4×4')],
  ],
  // Semana 4
  [
    [snatch('60/3 70/3 75/3 80/3 85/2×2'), splitJerk('60/3 70/3 80/3 85/3×2'), powerClean('60/3 70/3 75/2×3'), backSquat('60/4 70/4 75/2×4')],
    [hangSnatch('60/3 70/3 75/3×2'), snatchPull('70/3 80/3 90/2×3'), pushJerk('60/3 70/3 75/3×2'), frontSquat('60/4 70/4 75/4 80/2×3')],
    [snatch('60/3 70/3 75/3 80/3 85/3×2'), cleanJerk('60/3 70/3 75/3 80/3×2'), cleanPull('90/3 95/3×2'), backSquat('60/3 70/3 75/3 80/3×3')],
  ],
  // Semana 5 — "Semana muy dura" en el documento original (ver HALTERO_WEEK_NOTE)
  [
    [
      hangSnatch('60/3 70/3 75/3'),
      snatch('75/3 80/3 85/2×3'),
      snatchPull('90/3 100/2×3'),
      pushJerk('60/4 70/4 75/2×3'),
      clean('60/3 70/3 75/3 80/3 85/2×2'),
      backSquat('60/4 70/4 75/4 80/4 85/2×3'),
    ],
    [powerSnatch('60/4 70/4 75/2×3 80/2×3'), cleanJerk('60/3 70/3 80/3×3'), cleanPull('80/3 90/3 100/2×2'), frontSquat('60/5 70/5 75/4 80/3×3')],
    [snatch('60/4 70/4 75/3 80/3 85/3×3'), splitJerk('60/3 70/3 80/3 85/4×2'), hangClean('60/4 70/4 75/4×2'), backSquat('60/4 70/4 75/4 80/3 85/3×3')],
  ],
  // Semana 6
  [
    [hangSnatch('60/3 70/3 75/3'), snatch('75/3 80/3×2'), snatchPull('94/4 105/2×2'), pushJerk('60/3 70/3 80/3×2'), clean('60/3 70/3 80/3 85/2×3'), backSquat('70/4 75/4 80/4 85/2×4')],
    [snatch('60/3 70/3 75/3 80/3 85/2 90/4×1'), cleanJerk('60/3 70/3 75/3 80/2 85/3×2'), cleanPull('90/4 100/2×2'), frontSquat('60/4 70/4 75/2×4')],
    [snatch('60/3 70/3 75/3 80/3 85/3×2'), splitJerk('60/3 70/3 80/3 85/3 90/3×2'), powerClean('60/3 70/3 80/2×2'), backSquat('60/3 70/3 75/3 80/3 85/3 90/2×2')],
  ],
  // Semana 7
  [
    [snatch('60/3 70/3 75/3 80/3 85/2 90/2×2'), pushJerk('65/3 75/2×3'), clean('60/3 70/3 80/3 85/3 90/2×2'), backSquat('70/3 75/3 80/3 85/3 90/3×2')],
    [powerSnatch('60/3 70/2×3 75/2×3'), cleanJerk('60/3 70/3 80/3 85/3 90/2×2'), frontSquat('70/3 75/3 80/3 85/2×3')],
    [snatch('60/3 70/3 75/3 80/3 85/3 90/3×2'), snatchPull('100/3 105/2×3', 'Tirón de Snatch'), splitJerk('60/3 70/3 75/3 80/2×2'), backSquat('60/3 70/3 80/3 85/3 90/2×3')],
  ],
  // Semana 8
  [
    [snatch('60/3 70/3 75/2 80/2 85/2 90/2 95/2×1'), cleanJerk('60/3 70/3 75/3 80/2 85/2×1'), backSquat('60/3 70/3 80/3 85/3 90/3×3')],
    [powerSnatch('60/4 70/4 75/2×3'), pushJerk('60/3 70/3 75/2×3'), powerClean('60/3 70/3 75/2×3'), frontSquat('60/3 70/3 75/2×3')],
    [snatch('60/3 70/3 75/3 80/2×3'), cleanJerk('60/3 70/3 75/3 80/2 85/2 90/2×1 95/2×1'), backSquat('60/3 70/3 75/3 80/2×3')],
  ],
  // Semana 9 — dias 2 y 3 terminan en un intento de 1RM real
  [
    [powerSnatch('60/4 70/4 75/3 80/2×3'), powerClean('60/4 70/2×4 75/2×3'), splitJerk('60/4 70/2×3 75/2×3'), backSquat('60/4 70/4 75/4 80/2×3')],
    [snatch('60/3 70/3 75/3 80/2 85/2 90/1 95/1 100/1', true), cleanJerk('60/3 70/3 75/3 80/2×2'), frontSquat('60/4 70/4 75/3 80/3 85/2×2')],
    [snatch('60/4 70/4 75/2×3'), cleanJerk('60/3 70/3 75/3 80/2 85/1 90/1 95/1 100/1', true), backSquat('60/4 70/4 80/2×3')],
  ],
  // Semana 10
  [
    [powerSnatch('60/3 70/3 75/2×3 80/2×3'), splitJerk('60/3 70/3 75/3 80/2×3 85/2×2'), hangClean('60/3 70/3 75/2×3'), backSquat('60/4 70/4 75/4 80/4 85/2×3')],
    [snatch('60/4 70/4 75/4 80/3 85/2×2'), cleanJerk('60/3 70/3 75/3 80/3×2'), frontSquat('60/4 70/4 75/2×4 80/2×3')],
    [snatch('60/4 70/4 75/3 80/3 85/3×2'), pushJerk('60/3 70/3 75/3×3'), clean('60/3 70/3 75/3 80/3 85/2×2'), backSquat('70/4 75/4 80/4 85/3×4')],
  ],
  // Semana 11
  [
    [snatch('60/3 70/3 75/3 80/3 85/3×3'), pushJerk('60/3 70/3×2'), powerClean('60/3 70/3 75/3 80/3×2'), backSquat('65/3 75/3 80/3 85/3 90/3×2')],
    [hangSnatch('60/3 70/3 75/3×2'), cleanJerk('60/3 70/3 75/3 80/2×2 85/2×2'), cleanPull('90/3 95/3 100/2×2'), frontSquat('60/4 70/4 75/4 80/4')],
    [snatch('60/3 70/3 75/3 80/3 85/2 90/2×2'), snatchPull('95/3 100/2×3', 'Tirón de Snatch'), clean('60/3 70/3 75/3 80/3 85/3×2'), backSquat('70/3 75/3 80/3 85/3 90/3×3')],
  ],
  // Semana 12
  [
    [powerSnatch('60/3 70/3 75/3 80/2×3'), splitJerk('60/3 70/3 80/3 85/2×2 90/2×2'), powerClean('60/3 70/3 75/3 80/3 85/2×2'), backSquat('65/4 75/4 80/4 85/4 90/2×4')],
    [snatch('60/3 70/3 75/3 80/3 85/3 90/3×2'), cleanJerk('60/3 70/3 75/3 80/3 85/2×3'), cleanPull('90/3 100/3 105/2×2'), frontSquat('60/4 70/4 80/2×4')], // "60/" del original sin reps, interpretado como 60/4 por coherencia con el resto de la escalera
    [powerSnatch('60/3 70/3 75/3 80/3 85/3×2'), snatchPull('95/4 105/3×2', 'Tirón de Snatch'), clean('60/3 70/3 80/3 85/3 90/2×2'), pushJerk('60/3 70/3 75/3×2'), backSquat('65/5 75/4 80/4 85/2×3')],
  ],
  // Semana 13
  [
    [powerSnatch('60/3 70/3 75/3 80/3×2'), cleanJerk('60/3 70/3 75/3 80/3 85/3 90/2×2'), cleanPull('90/3 100/3 110/2×2'), backSquat('65/4 75/4 80/2×4')],
    [snatch('60/3 70/3 80/3 85/3 90/2×3'), pushJerk('60/3 70/3 75/3 80/3'), powerClean('65/3 75/3 80/2×3'), frontSquat('60/4 70/4 80/4 85/3 90/3 95/2×2')],
    [hangSnatch('60/3 70/3 75/3 80/2×3', 'Hang Snatch'), cleanJerk('60/3 70/3 75/3 80/3 85/3 90/3×2'), backSquat('60/4 70/4 75/2×4')],
  ],
  // Semana 14 — los 3 dias terminan en un intento de 1RM real (sentadilla, snatch, clean & jerk)
  [
    [powerSnatch('60/3 70/3 75/3 80/3 85/2×2'), cleanJerk('60/3 70/3 75/3 80/2×2 85/2×2'), backSquat('60/3 70/3 80/3 85/3 90/2 95/1 100/1', true)],
    [snatch('60/3 70/3 75/3 80/3 85/2 90/2 95/1 100/1', true), pushJerk('60/3 70/3 75/3×2'), powerClean('60/3 70/3 75/3 80/2×2'), frontSquat('60/4 70/4 75/4 80/2×3')],
    [snatch('60/3 70/3 75/3 80/2×3'), cleanJerk('60/3 70/3 75/3 80/2 85/2 90/1 95/1 100/1', true), backSquat('60/4 70/4 80/3 85/3 90/2×2')],
  ],
];

export const HALTERO_TOTAL_WEEKS = HALTERO_PROGRAM.length;

/** Nota especial para semanas con una advertencia explicita del documento original (solo la semana 5, "semana muy dura"). */
const HALTERO_WEEK_NOTE: Partial<Record<number, string>> = {
  5: 'Semana muy dura marcada así en el ciclo original — llega descansado, hoy no es el día de forzar fuera de lo prescrito.',
};

export interface HalteroDayResult {
  weekNumber: number;
  lifts: {
    movementId: string;
    prKey: keyof PersonalRecords;
    block: 'oly' | 'strength';
    sets: number;
    reps: string;
    loadKg: number;
    format: string;
    notes: string;
  }[];
}

/**
 * Resuelve el dia de hoy dentro del ciclo: en que semana (1-14, se queda en la 14 si el atleta
 * alarga la fecha de fin mas alla de las 14 semanas reales) y cual de los 3 dias del documento toca
 * — usando el mismo indice continuo que ya usan Texas/Conjugado para no depender del calendario
 * natural de la semana del atleta, solo de cuantos dias de entreno han pasado desde que empezo el
 * programa.
 */
export function resolveHalteroDay(
  program: StrengthProgram,
  dayPlan: DayPlan,
  prs: PersonalRecords,
  autoregFactor: number,
  today: Date,
): HalteroDayResult | null {
  const weeksElapsed = weeksSinceStart(program.startDate, today);
  const weekIndex = Math.min(weeksElapsed, HALTERO_TOTAL_WEEKS - 1);
  const week = HALTERO_PROGRAM[weekIndex];
  const dayIndex = Math.max(dayPlan.trainingDayIndex, 0) % week.length;
  const day = week[dayIndex];
  const weekNumber = weekIndex + 1;
  const weekNote = HALTERO_WEEK_NOTE[weekNumber];

  const lifts = day
    .map((lift) => {
      const movement = getMovementById(lift.movementId);
      if (!movement) return null;
      // Un intento de maximo real no se descuenta por autorregulacion — igual que cualquier otro
      // dia de test en el resto de la app, un numero rebajado no es un maximo de verdad.
      const factor = lift.isMaxAttempt ? 1 : autoregFactor;
      const baseLoad = prs[lift.prKey];
      const stepLines = lift.steps.map((step) => {
        const load = roundToNearestPlate(baseLoad * step.percent * factor);
        const setsLabel = step.sets > 1 ? `${step.sets}x${step.reps}` : `${step.reps}`;
        return { load, setsLabel, percentLabel: `${Math.round(step.percent * 100)}%` };
      });
      const lastStep = lift.steps[lift.steps.length - 1];
      const lastLine = stepLines[stepLines.length - 1];
      const maxAttemptNote = lift.isMaxAttempt
        ? ` Último número de la escalera: intento de 1RM real de ${lift.label.toLowerCase()} — el resto de la sesión sí lleva ajuste por tu estado de hoy, esto no.`
        : '';
      const notes = `Escalera: ${stepLines.map((l) => `${l.percentLabel} ${l.setsLabel} @ ${l.load} kg`).join(', ')}.${maxAttemptNote}${weekNote ? ` ${weekNote}` : ''}`;

      return {
        movementId: lift.movementId,
        prKey: lift.prKey,
        block: lift.block,
        sets: lastStep.sets,
        reps: String(lastStep.reps),
        loadKg: lastLine.load,
        format: `Ciclo Halterofilia · Semana ${weekNumber}/${HALTERO_TOTAL_WEEKS} · ${lift.label}`,
        notes,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lifts.length === 0) return null;
  return { weekNumber, lifts };
}
