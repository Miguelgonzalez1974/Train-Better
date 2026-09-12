import type { DailySession } from '../data/athlete/types';

export interface NutritionTip {
  before: string;
  during?: string;
  after: string;
}

/**
 * Consejo de nutrición breve y genérico, anclado al tipo de sesión de hoy — no un plan de macros
 * ni una recomendación médica personalizada, el mismo sentido común que daría un coach antes/
 * después de un tipo de sesión concreto. Deriva de campos que el motor YA calcula para hoy
 * (`energySystem`, `dayEmphasis`, `dayIntensity`) — no añade ningún dato nuevo del atleta ni abre
 * una segunda fuente de verdad sobre el esfuerzo del día.
 */
export function getNutritionTip(session: DailySession): NutritionTip | null {
  if (session.isRestDay || session.source === 'custom') return null;

  const lightDay = session.energySystem === 'recuperacion' || session.dayIntensity === 'baja';
  const longConditioning = session.energySystem === 'base-aerobica' || session.dayEmphasis === 'metcon';
  const powerOrHeavy = session.energySystem === 'potencia' || session.dayEmphasis === 'fuerza';

  if (lightDay) {
    return {
      before: 'Sesión suave hoy — con tu comida habitual vale, no hace falta nada especial.',
      after: 'Hidratación y una comida normal con algo de proteína bastan para recuperar.',
    };
  }
  if (longConditioning) {
    return {
      before: 'Algo de carbohidrato de fácil digestión 1-2h antes (fruta, tostada, arroz) — hoy quemas bastante combustible.',
      during: 'Agua a sorbos toda la sesión; si pasa de 45 min, un poco de sal o una bebida con electrolitos ayuda.',
      after: 'Proteína + carbohidrato en la próxima hora para reponer y recuperar mejor (batido, yogur con fruta, arroz con pollo).',
    };
  }
  if (powerOrHeavy) {
    return {
      before: 'Llega hidratado y sin ir muy lleno — mejor una comida ligera 1-2h antes que algo pesado justo al entrar.',
      after: 'Proteína pronto después de la sesión ayuda a recuperar el músculo que hoy has cargado.',
    };
  }
  return {
    before: 'Come normal 1-2h antes, con algo de carbohidrato si notas que te falta energía en sesiones así.',
    after: 'Proteína + carbohidrato en la hora siguiente para recuperar mejor.',
  };
}
