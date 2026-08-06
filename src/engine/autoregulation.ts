import type { AcwrZone } from './loadMetrics';

/**
 * Autorregulacion de carga por ACWR (Gabbett et al., mismas zonas que el gauge del Dashboard):
 * si el atleta viene de un pico de carga aguda frente a su carga cronica, un coach real reduce
 * el %1RM de hoy en vez de aplicar la progresion de la semana a ciegas.
 */
const AUTOREG_FACTOR: Record<AcwrZone, number> = {
  baja: 1,
  optima: 1,
  moderada: 0.95,
  alta: 0.88,
};

const AUTOREG_NOTE: Partial<Record<AcwrZone, string>> = {
  moderada: 'Carga ajustada -5% por tu volumen acumulado esta semana (ACWR en riesgo moderado) — prioriza la técnica.',
  alta: 'Carga ajustada -12% por tu volumen acumulado (ACWR alto) — hoy toca bajar el pie del acelerador, no sumar más fatiga.',
};

/** Nota distinta a la de riesgo moderado real: aqui la cautela es por falta de historial, no por volumen acumulado. */
const COLD_START_NOTE =
  'Carga ajustada con cautela — todavía no hay suficiente historial reciente para calcular tu ACWR real, así que el coach empieza conservador hasta conocer tu tolerancia.';

export function getAutoregFactor(zone: AcwrZone): number {
  return AUTOREG_FACTOR[zone];
}

export function getAutoregNote(zone: AcwrZone, coldStart = false): string | undefined {
  if (coldStart) return COLD_START_NOTE;
  return AUTOREG_NOTE[zone];
}
