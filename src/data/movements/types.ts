export type Block =
  | 'warmup'
  | 'strength'
  | 'wod'
  | 'oly'
  | 'accessory'
  | 'skill'
  | 'cooldown';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontalPush'
  | 'verticalPush'
  | 'horizontalPull'
  | 'verticalPull'
  | 'lunge'
  | 'carry'
  | 'core'
  | 'jump'
  /** Trabajo ciclico de impacto en las piernas: correr, comba, lanzadera, saltos de calentamiento. Rodillas y tobillos lo notan aunque no sea una sentadilla. */
  | 'impact'
  | 'olyLift'
  | 'gymnastics'
  | 'monostructural'
  | 'mobility';

export interface Movement {
  /**
   * Otros patrones que el movimiento carga de verdad, ademas de `pattern`, para los avisos de molestia: un
   * devil's press es halterofilia (hombro, lumbar) Y un burpee con salto (rodilla); un hang squat clean recibe
   * en sentadilla. Solo afecta a lo que un aviso activo evita (ver `avoidsMovement` en painFlags.ts).
   */
  alsoPatterns?: MovementPattern[];
  id: string;
  name: string;
  blocks: Block[];
  pattern: MovementPattern;
  equipment: string[];
  primaryMuscles: string[];
  /** Descripcion general del estandar de ejecucion (rango de movimiento, criterios de rep valida) */
  standard: string;
  scaling: {
    easier: string[];
    harder: string[];
  };
  /** id del movimiento del que este es una progresion/variacion */
  progressionOf?: string;
  tags: string[];
}

export interface BenchmarkWorkout {
  id: string;
  name: string;
  category: 'girl' | 'hero' | 'open' | 'custom';
  format: string;
  /** ids de Movement, o texto libre para elementos externos (ej. "run 1 mile") */
  movements: string[];
  timeCapMinutes?: number;
  /** El `format` se ha revisado a mano y describe el WOD entero aunque `benchmarkHasExplicitScheme` no lo detecte (p.ej. bloques cronometrados "1:00 de cada movimiento"). */
  reviewed?: boolean;
  scoreType: 'time' | 'reps' | 'load' | 'rounds+reps';
  tags: string[];
}
