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
  | 'olyLift'
  | 'gymnastics'
  | 'monostructural'
  | 'mobility';

export interface Movement {
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
  scoreType: 'time' | 'reps' | 'load' | 'rounds+reps';
  tags: string[];
}
