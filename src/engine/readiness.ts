import type { ReadinessCheck } from '../data/athlete/types';

const SLEEP_SCORE: Record<ReadinessCheck['sleep'], number> = { mal: -1, regular: 0, bien: 1 };
const SORENESS_SCORE: Record<ReadinessCheck['soreness'], number> = { alto: -1, leve: 0, ninguno: 1 };
const STRESS_SCORE: Record<ReadinessCheck['stress'], number> = { alto: -1, medio: 0, bajo: 1 };
const MOTIVATION_SCORE: Record<ReadinessCheck['motivation'], number> = { baja: -1, normal: 0, alta: 1 };

const READINESS_LOW_FACTOR = 0.92;
const READINESS_HIGH_FACTOR = 1.04;
/** Suma de los 4 ejes (rango -4..4) a partir de la cual el check-in de hoy pinta mal o bien de verdad — un unico eje suelto en contra no mueve nada. */
const READINESS_LOW_THRESHOLD = -2;
const READINESS_HIGH_THRESHOLD = 2;

export interface ReadinessAutoregResult {
  factor: number;
  note?: string;
  /** true cuando el check-in de hoy pinta mal de verdad — se usa en dias de test para avisar de aplazarlo en vez de descontar la carga. */
  isLow: boolean;
}

function scoreCheck(check: ReadinessCheck): number {
  return SLEEP_SCORE[check.sleep] + SORENESS_SCORE[check.soreness] + STRESS_SCORE[check.stress] + MOTIVATION_SCORE[check.motivation];
}

/**
 * Cuarta senal de autorregulacion, independiente de ACWR y RPE reciente: el check-in diario de
 * sueno, agujetas, estres y motivacion. Un coach real no cambia el peso del dia porque un unico eje
 * ande regular — pero dos o mas ejes en contra a la vez si son una senal real de que hoy no es el
 * dia de forzar. El factor resultante entra en `combineAutoregFactors` junto a ACWR y RPE, que ya
 * tiene un suelo y un techo (0.7-1.05) — este check-in nunca puede mover la carga fuera de ese rango
 * ni tocar la periodizacion (fase, semana, movimiento del dia, dias de test): solo afina el ultimo
 * tramo de intensidad de la sesion ya decidida.
 */
export function getReadinessFactor(check: ReadinessCheck | undefined): ReadinessAutoregResult {
  if (!check) return { factor: 1, isLow: false };
  const score = scoreCheck(check);

  if (score <= READINESS_LOW_THRESHOLD) {
    return {
      factor: READINESS_LOW_FACTOR,
      note: 'Check-in de hoy con poca energía — se reduce un poco la carga.',
      isLow: true,
    };
  }
  if (score >= READINESS_HIGH_THRESHOLD) {
    return {
      factor: READINESS_HIGH_FACTOR,
      note: 'Check-in de hoy positivo — se sube un poco la intensidad.',
      isLow: false,
    };
  }
  return { factor: 1, isLow: false };
}

/** Nota que se añade a un dia de Test 1RM cuando el check-in pinta mal — un test a intencion reducida no es un dato valido, mejor aplazarlo que descontarlo en silencio. */
export const READINESS_TEST_POSTPONE_NOTE =
  ' Tu check-in de hoy indica poca energía — si puedes, mejor aplaza el test a otro día para que el máximo registrado sea real.';

export function getReadinessCheckForDate(log: ReadinessCheck[] | undefined, dateIso: string): ReadinessCheck | undefined {
  return (log ?? []).find((entry) => entry.date === dateIso);
}
