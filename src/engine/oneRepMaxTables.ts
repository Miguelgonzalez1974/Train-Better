export interface WeekScheme {
  percent: number;
  sets: number;
  reps: number;
  label: string;
  /** Explicacion tipo "coach" de por que esta semana se entrena asi */
  coachNote: string;
}

/** Nombre de fase del mesociclo por semana, para mostrar contexto de periodizacion al atleta. */
export const MESOCYCLE_PHASE: Record<1 | 2 | 3 | 4, string> = {
  1: 'Acumulación',
  2: 'Intensificación',
  3: 'Pico',
  4: 'Descarga',
};

/** Semana 1-3: progresion de intensidad. Semana 4: deload. */
export const STRENGTH_WEEK_SCHEMES: Record<1 | 2 | 3 | 4, WeekScheme> = {
  1: {
    percent: 0.7,
    sets: 5,
    reps: 5,
    label: 'Volumen (semana 1/4)',
    coachNote: 'Volumen alto a intensidad moderada — prioriza la técnica sobre la velocidad de la barra.',
  },
  2: {
    percent: 0.75,
    sets: 5,
    reps: 3,
    label: 'Intensificación (semana 2/4)',
    coachNote: 'Sube la intensidad manteniendo la velocidad de la barra constante en cada serie.',
  },
  3: {
    percent: 0.82,
    sets: 4,
    reps: 3,
    label: 'Pico (semana 3/4)',
    coachNote: 'Pico de intensidad del mesociclo — calidad sobre cantidad, cuida cada repetición.',
  },
  4: {
    percent: 0.6,
    sets: 3,
    reps: 5,
    label: 'Deload (semana 4/4)',
    coachNote: 'Semana de descarga — baja el volumen para permitir la supercompensación antes del siguiente bloque.',
  },
};

/** El oly trabaja a % mas bajo que el strength y con menos repeticiones por serie. */
export const OLY_WEEK_SCHEMES: Record<1 | 2 | 3 | 4, WeekScheme> = {
  1: {
    percent: 0.68,
    sets: 5,
    reps: 3,
    label: 'Técnica (semana 1/4)',
    coachNote: 'Fase técnica — prioriza posición y timing antes que el peso en la barra.',
  },
  2: {
    percent: 0.7,
    sets: 5,
    reps: 2,
    label: 'Técnica-carga (semana 2/4)',
    coachNote: 'Añade algo más de carga sin perder las posiciones trabajadas la semana pasada.',
  },
  3: {
    percent: 0.78,
    sets: 5,
    reps: 1,
    label: 'Levantamiento completo (semana 3/4)',
    coachNote: 'Levantamiento completo a mayor intensidad — la técnica ya está consolidada.',
  },
  4: {
    percent: 0.55,
    sets: 3,
    reps: 2,
    label: 'Deload (semana 4/4)',
    coachNote: 'Descarga técnica — barras ligeras, foco absoluto en posiciones.',
  },
};

export function roundToNearestPlate(kg: number, increment = 2.5): number {
  return Math.round(kg / increment) * increment;
}
