/**
 * Librería de complejos de halterofilia: una serie son varios movimientos seguidos sin soltar la barra, cada uno con sus
 * repeticiones (`1 clean + 2 front squat + 1 jerk`). Aquí están los de fábrica; los tuyos se guardan en el perfil
 * (`AthleteProfile.customComplexes`) y entran en el mismo sorteo. Este archivo no importa nada del resto de la app (solo ids de
 * movimiento): lo leen el motor, la sesión y la pantalla de la librería.
 */

export type ComplexFamily = 'snatch' | 'clean' | 'mixto';
export type ComplexFocus = 'tecnica' | 'potencia' | 'recepcion' | 'jerk' | 'fuerza';

export const COMPLEX_FOCUS_LABEL: Record<ComplexFocus, string> = {
  tecnica: 'Técnica',
  potencia: 'Potencia',
  recepcion: 'Recepción',
  jerk: 'Jerk',
  fuerza: 'Fuerza en posición',
};

export const COMPLEX_FAMILY_LABEL: Record<ComplexFamily, string> = { snatch: 'Snatch', clean: 'Clean', mixto: 'Mixto' };

export interface ComplexStep {
  /** Movimiento del catálogo (oly, o front squat y jerks de fuerza). */
  movementId: string;
  reps: number;
}

export interface OlyComplex {
  id: string;
  name: string;
  family: ComplexFamily;
  steps: ComplexStep[];
  focus: ComplexFocus[];
  /** Creado por el atleta (no es de fábrica). */
  custom?: boolean;
  /** Porcentaje propio sobre la carga calculada (1 = la calculada); solo los complejos propios lo usan. */
  loadAdjust?: number;
}

const c = (id: string, name: string, family: ComplexFamily, focus: ComplexFocus[], ...steps: [string, number][]): OlyComplex => ({
  id,
  name,
  family,
  focus,
  steps: steps.map(([movementId, reps]) => ({ movementId, reps })),
});

/** Los complejos de fábrica. */
export const BUILTIN_COMPLEXES: OlyComplex[] = [
  // --- Snatch ---
  c('sn-pull-hang-ohs', 'Tirón + hang snatch + overhead squat', 'snatch', ['potencia', 'recepcion'], ['snatch-pull', 1], ['hang-snatch', 1], ['overhead-squat', 1]),
  c('sn-muscle-ohs-snatch', 'Muscle snatch + overhead squat + snatch', 'snatch', ['tecnica'], ['muscle-snatch', 2], ['overhead-squat', 2], ['snatch', 1]),
  c('sn-balance-ohs-snatch', 'Snatch balance + overhead squat + snatch', 'snatch', ['recepcion'], ['snatch-balance', 2], ['overhead-squat', 2], ['snatch', 1]),
  c('sn-tres-alturas', 'Snatch a tres alturas', 'snatch', ['tecnica'], ['hang-snatch-above-knee', 1], ['hang-snatch', 1], ['snatch', 1]),
  c('sn-power-ohs', 'Power snatch + overhead squat', 'snatch', ['potencia', 'recepcion'], ['power-snatch', 2], ['overhead-squat', 1]),
  c('sn-hang-power-squat', 'Hang power snatch + hang squat snatch', 'snatch', ['potencia'], ['hang-power-snatch', 1], ['hang-squat-snatch', 1]),
  c('sn-pausa', 'Snatch con pausa + snatch', 'snatch', ['tecnica', 'fuerza'], ['pause-snatch', 1], ['snatch', 1]),
  c('sn-highpull-snatch', 'High pull + snatch', 'snatch', ['potencia'], ['snatch-high-pull', 2], ['snatch', 1]),
  c('sn-shrug-pull-hang', 'Shrug + high pull + hang snatch', 'snatch', ['tecnica', 'potencia'], ['snatch-shrug', 1], ['snatch-high-pull', 1], ['hang-snatch', 1]),
  c('sn-drop-snatch', 'Snatch drop + snatch', 'snatch', ['recepcion'], ['snatch-drop', 2], ['snatch', 1]),
  c('sn-pausa-ohs', 'Overhead squat con pausa + snatch', 'snatch', ['recepcion', 'fuerza'], ['pause-overhead-squat', 1], ['snatch', 1], ['overhead-squat', 1]),
  c('sn-snatch-ohs3', 'Snatch + 3 overhead squats', 'snatch', ['fuerza', 'recepcion'], ['snatch', 1], ['overhead-squat', 3]),

  // --- Clean (y jerk) ---
  c('cl-clasico', 'Clásico: clean + front squat + jerk', 'clean', ['fuerza', 'jerk'], ['clean', 1], ['front-squat', 2], ['split-jerk', 1]),
  c('cl-power-fs-pushjerk', 'Power clean + front squat + push jerk', 'clean', ['potencia', 'jerk'], ['power-clean', 1], ['front-squat', 2], ['push-jerk', 1]),
  c('cl-hang-escalera', 'Hang power clean + hang squat clean + split jerk', 'clean', ['potencia', 'jerk'], ['hang-power-clean', 1], ['hang-squat-clean', 1], ['split-jerk', 1]),
  c('cl-muscle-power-fs', 'Muscle clean + power clean + front squat', 'clean', ['tecnica'], ['muscle-clean', 2], ['power-clean', 1], ['front-squat', 1]),
  c('cl-highpull-clean', 'High pull + clean', 'clean', ['potencia'], ['clean-high-pull', 2], ['clean', 1]),
  c('cl-2clean-1jerk', 'Dos cleans + jerk', 'clean', ['jerk', 'fuerza'], ['clean', 2], ['split-jerk', 1]),
  c('cl-clean-2jerk', 'Clean + dos jerks', 'clean', ['jerk'], ['clean', 1], ['split-jerk', 2]),
  c('cl-tres-alturas', 'Clean a tres alturas', 'clean', ['tecnica'], ['hang-clean-above-knee', 1], ['hang-clean', 1], ['clean', 1]),
  c('cl-shrug-pull-hang', 'Shrug + high pull + hang clean', 'clean', ['tecnica', 'potencia'], ['clean-shrug', 1], ['clean-high-pull', 1], ['hang-clean', 1]),
  c('cl-tall-power-jerk', 'Tall clean + hang power clean + push jerk', 'clean', ['tecnica', 'jerk'], ['tall-clean', 2], ['hang-power-clean', 1], ['push-jerk', 1]),
  c('cl-escalera-jerk', 'Escalera de jerk: push press + push jerk + split jerk', 'clean', ['jerk'], ['push-press', 1], ['push-jerk', 1], ['split-jerk', 1]),
  c('cl-clean-fs-hole', 'Clean + front squat desde abajo', 'clean', ['fuerza'], ['clean', 1], ['in-the-hole-front-squat', 2]),
  c('cl-hang-clean-jerk', 'Hang clean + jerk', 'clean', ['potencia', 'jerk'], ['hang-clean', 2], ['split-jerk', 1]),

  // --- Mixtos ---
  c('mx-snatch-cj', 'Snatch + clean + jerk', 'mixto', ['fuerza'], ['snatch', 1], ['clean', 1], ['split-jerk', 1]),
  c('mx-power', 'Power snatch + power clean + push jerk', 'mixto', ['potencia'], ['power-snatch', 1], ['power-clean', 1], ['push-jerk', 1]),
  c('mx-hang', 'Hang snatch + hang clean + split jerk', 'mixto', ['tecnica', 'potencia'], ['hang-snatch', 1], ['hang-clean', 1], ['split-jerk', 1]),
];

/** `1+2+1`: las repeticiones de cada paso, en orden. */
export function complexNotation(complex: Pick<OlyComplex, 'steps'>): string {
  return complex.steps.map((s) => s.reps).join('+');
}

/** Repeticiones totales de una serie del complejo. */
export function complexTotalReps(complex: Pick<OlyComplex, 'steps'>): number {
  return complex.steps.reduce((sum, s) => sum + s.reps, 0);
}

/**
 * Clave con la que se guardan en el registro de series (`workLog`) las series de un complejo. No es un movimiento del catálogo,
 * así que NO cuenta para el 1RM estimado ni para las cargas aprendidas de ningún levantamiento: se anotan aparte.
 */
export const COMPLEX_LOG_PREFIX = 'complex:';
export const complexLogId = (complexId: string): string => `${COMPLEX_LOG_PREFIX}${complexId}`;
export const isComplexLogId = (movementId: string): boolean => movementId.startsWith(COMPLEX_LOG_PREFIX);

/** El nombre de un complejo de fábrica a partir de su clave de registro, o null si es uno propio (su nombre vive en el perfil). */
export function builtinComplexNameFromLogId(movementId: string): string | null {
  if (!isComplexLogId(movementId)) return null;
  const id = movementId.slice(COMPLEX_LOG_PREFIX.length);
  return BUILTIN_COMPLEXES.find((x) => x.id === id)?.name ?? null;
}
