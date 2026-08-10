import type { PersonalRecords, StrengthProgram } from '../data/athlete/types';
import type { DayPlan } from './periodization';
import { weeksSinceStart } from './periodization';
import { roundToNearestPlate } from './oneRepMaxTables';

export const DEFAULT_STRENGTH_PROGRAM_LIFTS: (keyof PersonalRecords)[] = ['backSquat', 'benchPress', 'deadlift', 'strictPress'];

export const STRENGTH_METHOD_LABEL: Record<StrengthProgram['method'], string> = {
  '531': '5/3/1',
  lineal: 'Lineal',
  ondulante: 'Ondulante',
};

/** Programa cuya ventana [startDate, endDate] contiene la fecha dada, o undefined — mismo criterio que getActiveMacrocycle. */
export function getActiveStrengthProgram(programs: StrengthProgram[], todayIso: string): StrengthProgram | undefined {
  return programs.find((p) => p.startDate <= todayIso && todayIso <= p.endDate);
}

export function resolveProgramLifts(program: StrengthProgram): (keyof PersonalRecords)[] {
  return program.lifts.length > 0 ? program.lifts : DEFAULT_STRENGTH_PROGRAM_LIFTS;
}

/**
 * Levantamiento fijo del dia segun el indice de dia de entreno (no varia por variedad como el resto
 * del motor — varia por metodologia: 5/3/1 y lineal asignan un levantamiento distinto cada dia de
 * entreno de la semana, en vez de rotar patrones con aleatoriedad).
 */
export function resolveProgramLift(program: StrengthProgram, trainingDayIndex: number): keyof PersonalRecords {
  const lifts = resolveProgramLifts(program);
  return lifts[Math.max(trainingDayIndex, 0) % lifts.length];
}

/** Semana del programa (1-4), ciclando indefinidamente cada 4 semanas mientras el programa siga activo. */
export function resolveStrengthProgramWeek(program: StrengthProgram, today: Date): 1 | 2 | 3 | 4 {
  const elapsed = weeksSinceStart(program.startDate, today);
  return (((elapsed % 4) + 1) as 1 | 2 | 3 | 4);
}

interface FiveThreeOneScheme {
  percents: [number, number, number];
  reps: [string, string, string];
  label: string;
  coachNote: string;
}

const FIVETHREEONE_SCHEMES: Record<1 | 2 | 3 | 4, FiveThreeOneScheme> = {
  1: {
    percents: [0.65, 0.75, 0.85],
    reps: ['5', '5', '5+'],
    label: '5/3/1 · Semana 1 (5s)',
    coachNote: 'Sobre tu training max (90% de tu PR). Última serie: tantas reps de más como puedas con buena técnica.',
  },
  2: {
    percents: [0.7, 0.8, 0.9],
    reps: ['3', '3', '3+'],
    label: '5/3/1 · Semana 2 (3s)',
    coachNote: 'Sobre tu training max. Última serie: tantas reps de más como puedas con buena técnica.',
  },
  3: {
    percents: [0.75, 0.85, 0.95],
    reps: ['5', '3', '1+'],
    label: '5/3/1 · Semana 3 (5-3-1)',
    coachNote: 'Sobre tu training max — la semana de mayor intensidad del ciclo. Última serie AMRAP.',
  },
  4: {
    percents: [0.4, 0.5, 0.6],
    reps: ['5', '5', '5'],
    label: '5/3/1 · Semana 4 (descarga)',
    coachNote: 'Descarga programada del ciclo — baja la intensidad a propósito para asimilar antes de la siguiente onda.',
  },
};

interface LinealScheme {
  sets: number;
  reps: number;
  percent: number;
  label: string;
  coachNote: string;
}

const LINEAL_SCHEMES: Record<1 | 2 | 3 | 4, LinealScheme> = {
  1: { sets: 4, reps: 8, percent: 0.65, label: 'Lineal · Semana 1', coachNote: 'Bloque de acumulación: volumen alto, carga moderada.' },
  2: { sets: 4, reps: 6, percent: 0.72, label: 'Lineal · Semana 2', coachNote: 'Sube la intensidad, baja ligeramente el volumen.' },
  3: { sets: 4, reps: 4, percent: 0.8, label: 'Lineal · Semana 3', coachNote: 'Zona de fuerza — menos repeticiones, más peso.' },
  4: {
    sets: 3,
    reps: 3,
    percent: 0.87,
    label: 'Lineal · Semana 4 (pico)',
    coachNote: 'Semana de pico del bloque — si te sientes con margen, este es el día para buscar un número nuevo.',
  },
};

interface UndulatingStyle {
  sets: number;
  reps: number;
  percent: number;
  label: string;
  coachNote: string;
}

/** 3 estimulos que rotan por dia de entreno (no por semana) — el mismo levantamiento se siente distinto cada vez que aparece. */
const UNDULATING_STYLES: UndulatingStyle[] = [
  { sets: 5, reps: 3, percent: 0.85, label: 'Ondulante · pesado', coachNote: 'Día pesado: pocas repeticiones, cerca de tu máximo de la semana.' },
  { sets: 4, reps: 8, percent: 0.7, label: 'Ondulante · volumen', coachNote: 'Día de volumen: más series y repeticiones a carga moderada.' },
  {
    sets: 6,
    reps: 2,
    percent: 0.78,
    label: 'Ondulante · potencia',
    coachNote: 'Día de potencia: repeticiones bajas y explosivas — prioriza la velocidad de la barra.',
  },
];

export interface StrengthProgramPrescription {
  sets: number;
  reps: string;
  loadKg: number;
  format: string;
  notes: string;
}

/**
 * Prescripcion del dia para el levantamiento ya resuelto (`resolveProgramLift`), segun la
 * metodologia del programa. `currentPR` es la marca actual de ese levantamiento;
 * `autoregFactor` es el mismo multiplicador (ACWR + RPE reciente) que ya usa el resto del motor,
 * para no dejar de autorregular solo porque el atleta esta en un programa de fuerza pura.
 */
export function buildStrengthProgramPrescription(
  program: StrengthProgram,
  dayPlan: DayPlan,
  currentPR: number,
  autoregFactor: number,
  today: Date,
): StrengthProgramPrescription {
  if (program.method === '531') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = FIVETHREEONE_SCHEMES[week];
    const trainingMax = currentPR * 0.9;
    const loads = scheme.percents.map((percent) => roundToNearestPlate(trainingMax * percent * autoregFactor));
    return {
      sets: 3,
      reps: scheme.reps.join('-'),
      loadKg: loads[loads.length - 1],
      format: scheme.label,
      notes: `${scheme.coachNote} Series: ${loads.map((load, i) => `${scheme.reps[i]} @ ${load} kg`).join(', ')}.`,
    };
  }

  if (program.method === 'lineal') {
    const week = resolveStrengthProgramWeek(program, today);
    const scheme = LINEAL_SCHEMES[week];
    const loadKg = roundToNearestPlate(currentPR * scheme.percent * autoregFactor);
    return { sets: scheme.sets, reps: String(scheme.reps), loadKg, format: scheme.label, notes: scheme.coachNote };
  }

  const style = UNDULATING_STYLES[Math.max(dayPlan.trainingDayIndex, 0) % UNDULATING_STYLES.length];
  const loadKg = roundToNearestPlate(currentPR * style.percent * autoregFactor);
  return { sets: style.sets, reps: String(style.reps), loadKg, format: style.label, notes: style.coachNote };
}
