import { roundToNearestPlate } from './oneRepMaxTables';

/**
 * Olas en la parte olímpica: de vez en cuando el levantamiento principal (el power clean, por ejemplo) no son series rectas sino
 * dos o tres olas de repeticiones que bajan y peso que sube, p. ej. `5×50, 3×55, 1×60` y luego `5×55, 3×60, 1×65`. Cada ola es una
 * mini-rampa; la siguiente arranca más alta, y la última serie de la última ola es la carga fuerte del día (la que ya calcula el
 * motor, así que las cargas aprendidas y la progresión siguen igual). El primer técnico y el tirón no cambian.
 */

export interface OlyWaveTemplate {
  /** Repeticiones de cada serie de una ola, en orden (la última es la serie fuerte de la ola). */
  reps: number[];
  /** Cuántas olas. */
  waves: number;
  /** Carga de la última serie de la última ola, como fracción del PR del levantamiento (más alta que en series rectas: es una sola repetición). */
  topPct: number;
  /** Cómo se llama el patrón, tal como se lee en la sesión ("5-3-1"). */
  pattern: string;
}

const t = (reps: number[], waves: number, topPct: number): OlyWaveTemplate => ({ reps, waves, topPct, pattern: reps.join('-') });

/**
 * Plantillas por semana del bloque. Semana 1 (técnica): más olas y más suaves; semana 2: olas medias; semana 3 (pico): olas cortas y
 * pesadas hasta casi el máximo. En la descarga (semana 4) no hay olas. Dentro de cada semana el patrón se sortea.
 */
export const OLY_WAVE_TEMPLATES: Record<1 | 2 | 3, OlyWaveTemplate[]> = {
  1: [t([5, 3, 1], 3, 0.78), t([3, 2, 1], 3, 0.78)],
  2: [t([5, 3, 1], 2, 0.85), t([4, 2, 1], 2, 0.85)],
  3: [t([3, 2, 1], 2, 0.9), t([2, 1, 1], 2, 0.9), t([1, 1, 1], 2, 0.9)],
};

/** Probabilidad de que un día de oly lleve olas en cada semana: de vez en cuando, como el EMOM o los 10 singles. */
export const OLY_WAVE_CHANCE: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.3, 3: 0.3 };

/** Cuánto sube cada ola respecto a la anterior, como fracción de la carga fuerte (unos 5 kg en un levantamiento de 80). */
const WAVE_STEP_FRACTION = 0.06;
/** Dentro de una ola, cada serie anterior a la última baja este tanto: 0,83 · 0,915 · 1 (50, 55, 60 kg en una ola que acaba en 60). */
const WITHIN_WAVE_DROP = 0.085;

/**
 * Elige la plantilla de hoy, o null si hoy no toca. `draw` es un generador propio del día (no el del resto de la programación) y se
 * gasta siempre igual, haya olas o no, para que decidir esto no mueva ningún otro sorteo.
 */
export function pickOlyWaveTemplate(week: 1 | 2 | 3 | 4, draw: () => number): OlyWaveTemplate | null {
  const chance = draw();
  const pick = draw();
  if (week === 4) return null;
  if (chance >= OLY_WAVE_CHANCE[week]) return null;
  const options = OLY_WAVE_TEMPLATES[week];
  return options[Math.min(options.length - 1, Math.floor(pick * options.length))];
}

export interface OlyWavePlan {
  /** Repeticiones y kilos de cada serie, en orden, ola tras ola. */
  setPlan: { reps: number; kg: number }[];
  /** Series por ola (para agruparlas al enseñarlas). */
  waveSize: number;
  /** Lo que sube cada ola respecto a la anterior (kg). */
  stepKg: number;
}

/** Los kilos de cada serie a partir de la carga fuerte (la última serie de la última ola). */
export function buildOlyWavePlan(topKg: number, template: OlyWaveTemplate): OlyWavePlan {
  const stepKg = Math.max(2.5, roundToNearestPlate(topKg * WAVE_STEP_FRACTION));
  const size = template.reps.length;
  const setPlan: { reps: number; kg: number }[] = [];
  for (let w = 0; w < template.waves; w++) {
    const waveTop = topKg - (template.waves - 1 - w) * stepKg;
    template.reps.forEach((reps, i) => {
      const fromTop = size - 1 - i;
      const kg = fromTop === 0 ? waveTop : roundToNearestPlate(waveTop * (1 - WITHIN_WAVE_DROP * fromTop));
      setPlan.push({ reps, kg: Math.max(0, kg) });
    });
  }
  return { setPlan, waveSize: size, stepKg };
}
