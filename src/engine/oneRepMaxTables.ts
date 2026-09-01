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

/**
 * Semana 1-3: progresion de intensidad clasica de un bloque de fuerza — abre en 73% x5 (volumen
 * real, no un lunes tímido), sube a 80% x3, y pica en 85% x2 con menos volumen. Semana 4: deload.
 * El pico no sube mas de 0.85 a proposito: encima ya multiplican autoregulacion, la calibracion
 * por e1RM medido y la dosis intra-fase, y un doble en semana 3 no debe salir prescrito al 95%+.
 */
export const STRENGTH_WEEK_SCHEMES: Record<1 | 2 | 3 | 4, WeekScheme> = {
  1: {
    percent: 0.73,
    sets: 5,
    reps: 5,
    label: 'Volumen (semana 1/4)',
    coachNote: 'Volumen de trabajo a intensidad de acumulación — técnica y velocidad de barra constantes en cada serie.',
  },
  2: {
    percent: 0.8,
    sets: 5,
    reps: 3,
    label: 'Intensificación (semana 2/4)',
    coachNote: 'Sube la intensidad manteniendo la velocidad de la barra constante en cada serie.',
  },
  3: {
    percent: 0.85,
    sets: 3,
    reps: 2,
    label: 'Pico (semana 3/4)',
    coachNote: 'Pico del mesociclo: menos volumen, más intensidad — dobles pesados, calidad absoluta en cada repetición.',
  },
  4: {
    percent: 0.62,
    sets: 3,
    reps: 5,
    label: 'Deload (semana 4/4)',
    coachNote: 'Semana de descarga — menos volumen para asimilar antes del siguiente bloque.',
  },
};

/**
 * El oly trabaja con menos repeticiones por serie que el strength, pero NO a un % ridiculamente
 * bajo — un levantamiento tecnico necesita carga real para que la posicion importe. Curva:
 * tecnica 72% x3 -> carga 78% x2 -> completo 85% x1 -> descarga 60% x2.
 */
export const OLY_WEEK_SCHEMES: Record<1 | 2 | 3 | 4, WeekScheme> = {
  1: {
    percent: 0.72,
    sets: 5,
    reps: 3,
    label: 'Técnica (semana 1/4)',
    coachNote: 'Fase técnica — prioriza posición y timing, pero con carga suficiente para que cuente.',
  },
  2: {
    percent: 0.78,
    sets: 5,
    reps: 2,
    label: 'Técnica-carga (semana 2/4)',
    coachNote: 'Añade carga sin perder las posiciones trabajadas la semana pasada.',
  },
  3: {
    percent: 0.85,
    sets: 4,
    reps: 1,
    label: 'Levantamiento completo (semana 3/4)',
    coachNote: 'Singles pesados con la técnica ya consolidada — cerca de tu máximo del ciclo.',
  },
  4: {
    percent: 0.6,
    sets: 3,
    reps: 2,
    label: 'Deload (semana 4/4)',
    coachNote: 'Descarga técnica — barras ligeras, foco absoluto en posiciones.',
  },
};

export function roundToNearestPlate(kg: number, increment = 2.5): number {
  return Math.round(kg / increment) * increment;
}
