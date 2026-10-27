import type { PersonalRecords, SessionBlockResult, VariantPersonalRecords } from '../data/athlete/types';
import { BUILTIN_COMPLEXES, complexNotation, complexTotalReps, type ComplexFamily, type OlyComplex } from '../data/complexes';
import { roundToNearestPlate } from './oneRepMaxTables';

/**
 * Complejos de halterofilia en la sesión: cuándo salen (una vez a la semana de clean y otra de snatch), cuál se elige, con qué peso
 * y cómo se prescriben las series. Los kilos de un complejo se anotan aparte del resto de levantamientos (ver `complexLogId`):
 * encadenar movimientos pesa menos que cada uno suelto y falsearía el 1RM estimado si entrara en él.
 */

type Prs = PersonalRecords;
type Variants = VariantPersonalRecords | undefined;

/** Cuánto de lo que moverías en el paso más flojo se carga en un complejo: encadenar cansa, así que baja bastante. */
const CHAIN_FACTOR = 0.72;
/** Cada repetición extra de un paso resta un poco de lo que aguantas en él. */
const REP_PENALTY = 0.035;
/** Carga del complejo según la semana del bloque (técnica, carga, pico, descarga). */
export const COMPLEX_WEEK_LOAD: Record<1 | 2 | 3 | 4, number> = { 1: 0.94, 2: 1, 3: 1.06, 4: 0.85 };
/** Series del complejo según la semana. */
export const COMPLEX_WEEK_SETS: Record<1 | 2 | 3 | 4, number> = { 1: 4, 2: 5, 3: 4, 4: 3 };

interface CapacityRule {
  test: RegExp;
  /** Kilos de referencia (1 repetición) de ese movimiento para este atleta. */
  kg: (p: Prs, v: Variants) => number;
}

const jerkPr = (p: Prs, v: Variants) => v?.splitJerk ?? p.cleanAndJerk * 1.05;
const ohsPr = (p: Prs, v: Variants) => v?.overheadSquat ?? p.snatch * 0.9;
const mul = (n: number, f: (p: Prs, v: Variants) => number) => (p: Prs, v: Variants) => n * f(p, v);

/** De más específico a más general: la primera regla que casa manda. */
const CAPACITY_RULES: CapacityRule[] = [
  { test: /^split-jerk$/, kg: jerkPr },
  { test: /^push-jerk$/, kg: mul(0.9, jerkPr) },
  { test: /^(tall-jerk|jerk-balance|jerk-dip-drill)$/, kg: mul(0.7, jerkPr) },
  { test: /^push-press$/, kg: (p, v) => v?.pushPress ?? p.strictPress * 1.25 },
  { test: /^front-squat$/, kg: (p) => p.frontSquat },
  { test: /^in-the-hole-front-squat$/, kg: (p) => p.frontSquat * 0.85 },
  { test: /^pause-overhead-squat$/, kg: mul(0.85, ohsPr) },
  { test: /^overhead-squat$/, kg: ohsPr },
  { test: /^power-clean-and-jerk$/, kg: (p) => p.cleanAndJerk * 0.85 },
  { test: /^clean-and-jerk$/, kg: (p) => p.cleanAndJerk },
  // --- snatch ---
  { test: /^muscle-snatch$/, kg: (p) => p.snatch * 0.55 },
  { test: /^(snatch-pull|snatch-deadlift|no-touch-snatch-deadlift|snatch-shrug)$/, kg: (p) => p.snatch * 1.1 },
  { test: /^snatch-high-pull$/, kg: (p) => p.snatch * 0.85 },
  { test: /^power-snatch$/, kg: (p, v) => v?.powerSnatch ?? p.snatch * 0.8 },
  { test: /^hang-power-snatch$/, kg: (p, v) => (v?.powerSnatch ?? p.snatch * 0.8) * 0.95 },
  { test: /^snatch-balance$/, kg: (p) => p.snatch * 0.9 },
  { test: /^(hang-snatch|hang-snatch-above-knee|hang-squat-snatch|pause-snatch|off-blocks-snatch)$/, kg: (p) => p.snatch * 0.92 },
  { test: /^(snatch-drop|three-position-snatch|barski-snatch)$/, kg: (p) => p.snatch * 0.7 },
  { test: /^snatch$/, kg: (p) => p.snatch },
  // --- clean ---
  { test: /^muscle-clean$/, kg: (p) => p.clean * 0.55 },
  { test: /^(clean-pull|clean-deadlift|no-touch-clean-deadlift|clean-shrug|panda-pull|panda-pull-clean)$/, kg: (p) => p.clean * 1.1 },
  { test: /^clean-high-pull$/, kg: (p) => p.clean * 0.85 },
  { test: /^power-clean$/, kg: (p, v) => v?.powerClean ?? p.clean * 0.8 },
  { test: /^hang-power-clean$/, kg: (p, v) => (v?.powerClean ?? p.clean * 0.8) * 0.95 },
  { test: /^(hang-clean|hang-clean-above-knee|hang-squat-clean|off-blocks-clean)$/, kg: (p) => p.clean * 0.92 },
  { test: /^(three-position-clean|tall-clean)$/, kg: (p) => p.clean * 0.7 },
  { test: /^clean$/, kg: (p) => p.clean },
];

/** Lo que este atleta movería en un paso (a 1 repetición); null si no se sabe valorar (el complejo no se prescribe por peso). */
export function stepCapacityKg(movementId: string, prs: Prs, variantPrs?: Variants): number | null {
  const rule = CAPACITY_RULES.find((r) => r.test.test(movementId));
  if (!rule) return null;
  const kg = rule.kg(prs, variantPrs);
  return kg > 0 ? kg : null;
}

/** Peso base de una serie del complejo (semana 2, sin ajustes del día): el del paso más flojo × lo que cansa encadenar. */
export function complexBaseKg(complex: OlyComplex, prs: Prs, variantPrs?: Variants): number | null {
  const caps: number[] = [];
  for (const step of complex.steps) {
    const cap = stepCapacityKg(step.movementId, prs, variantPrs);
    if (cap === null) return null;
    caps.push(cap * (1 - REP_PENALTY * Math.max(0, step.reps - 1)));
  }
  if (caps.length === 0) return null;
  return Math.min(...caps) * CHAIN_FACTOR * (complex.loadAdjust ?? 1);
}

export interface ComplexPool {
  /** Todos los complejos disponibles (fábrica + propios). */
  all: OlyComplex[];
  favorites: string[];
  hidden: string[];
}

export function buildComplexPool(custom: OlyComplex[] | undefined, prefs: { favorites: string[]; hidden: string[] } | undefined): ComplexPool {
  return { all: [...BUILTIN_COMPLEXES, ...(custom ?? [])], favorites: prefs?.favorites ?? [], hidden: prefs?.hidden ?? [] };
}

/** Qué enfoque se prefiere en cada semana del bloque: posiciones, potencia y recepción, jerk y fuerza, y de nuevo técnica en la descarga. */
const WEEK_FOCUS: Record<1 | 2 | 3 | 4, OlyComplex['focus']> = {
  1: ['tecnica'],
  2: ['potencia', 'recepcion'],
  3: ['jerk', 'fuerza'],
  4: ['tecnica'],
};

export interface PickComplexInput {
  family: Exclude<ComplexFamily, 'mixto'>;
  week: 1 | 2 | 3 | 4;
  pool: ComplexPool;
  /** Movimientos usados hace poco: se prefiere el complejo que menos pasos repite. */
  recentMovementIds: Set<string>;
  /** Hoy el foco es recibir abajo (desbalance de recepción): se prefieren los de recepción. */
  receivingFocus: boolean;
  /** Generador del día (siempre se gasta igual). */
  draw: () => number;
}

/**
 * El complejo de hoy, o null si no hay ninguno que valga. Primero los de la familia del día (y los mixtos); luego se prefiere el
 * enfoque de la semana (o la recepción si toca); entre ellos, el que menos movimientos repita de los últimos días, con los
 * favoritos y los propios con ventaja; el sorteo decide entre los que empatan.
 */
export function pickComplex(input: PickComplexInput): OlyComplex | null {
  const { family, week, pool, recentMovementIds, receivingFocus, draw } = input;
  const roll = draw();
  const hidden = new Set(pool.hidden);
  const eligible = pool.all.filter((x) => !hidden.has(x.id) && (x.family === family || x.family === 'mixto') && x.steps.length >= 2);
  if (eligible.length === 0) return null;
  const wanted = receivingFocus ? (['recepcion'] as OlyComplex['focus']) : WEEK_FOCUS[week];
  const byFocus = eligible.filter((x) => x.focus.some((f) => wanted.includes(f)));
  const candidates = byFocus.length > 0 ? byFocus : eligible;
  const score = (x: OlyComplex) => x.steps.filter((s) => recentMovementIds.has(s.movementId)).length;
  const best = Math.min(...candidates.map(score));
  const tied = candidates.filter((x) => score(x) === best);
  // Favoritos y propios cuentan doble en el sorteo.
  const favs = new Set(pool.favorites);
  const weighted = tied.flatMap((x) => (favs.has(x.id) || x.custom ? [x, x] : [x]));
  return weighted[Math.min(weighted.length - 1, Math.floor(roll * weighted.length))];
}

export interface BuildComplexInput {
  complex: OlyComplex;
  week: 1 | 2 | 3 | 4;
  prs: Prs;
  variantPrs?: Variants;
  /** Producto de los ajustes del día (preparación, carga aguda…): ya calculado por el bloque de oly. */
  dayFactor: number;
  notes: string;
  /** Si se da, las series que lleva (un cambio de complejo en la sesión conserva las del día). */
  sets?: number;
}

/** Nombre de un paso con sus repeticiones, para las notas ("2 Front Squat"). */
function stepText(s: { movementId: string; reps: number }, nameOf: (id: string) => string): string {
  return `${s.reps > 1 ? `${s.reps} ` : ''}${nameOf(s.movementId)}`;
}

/** La nota del coach de un complejo: qué es cada serie y cómo se carga. */
export function complexNote(complex: Pick<OlyComplex, 'steps'>, nameOf: (id: string) => string): string {
  return (
    `Complejo ${complexNotation(complex)}: ${complex.steps.map((s) => stepText(s, nameOf)).join(' + ')}, sin soltar la barra entre pasos. ` +
    `El peso lo marca el paso más flojo; las series de la segunda mitad suben un escalón. Descansa 2-3 min entre series.`
  );
}

/**
 * Lo que cambia en un bloque de complejo al cambiarlo por otro (en el modo enfocado): el complejo, su peso y sus series. Conserva el
 * ajuste del día (preparación, carga aguda…) que llevaba el complejo anterior, deshaciendo lo que ponía la semana y el propio
 * complejo, y las series que ya tenía.
 */
export function swapComplexPatch(
  current: SessionBlockResult,
  next: OlyComplex,
  week: 1 | 2 | 3 | 4,
  prs: Prs,
  variantPrs: Variants,
  nameOf: (id: string) => string,
  currentComplex?: OlyComplex,
): Partial<SessionBlockResult> | null {
  const curBase = currentComplex ? complexBaseKg(currentComplex, prs, variantPrs) : null;
  const dayFactor = curBase && current.loadKg ? current.loadKg / (curBase * COMPLEX_WEEK_LOAD[week]) : 1;
  const block = buildComplexBlock({ complex: next, week, prs, variantPrs, dayFactor, sets: current.sets, notes: complexNote(next, nameOf) });
  if (!block) return null;
  return { movementId: block.movementId, reps: block.reps, loadKg: block.loadKg, setPlan: block.setPlan, complex: block.complex, notes: block.notes };
}

/** El peso orientativo de un complejo para una semana del bloque (sin los ajustes del día), o null si no se puede valorar. */
export function complexPreviewKg(complex: OlyComplex, week: 1 | 2 | 3 | 4, prs: Prs, variantPrs?: Variants): number | null {
  const base = complexBaseKg(complex, prs, variantPrs);
  return base === null ? null : Math.max(2.5, roundToNearestPlate(base * COMPLEX_WEEK_LOAD[week]));
}

/** El bloque de oly con el complejo, o null si algún paso no se puede valorar con tus marcas. */
export function buildComplexBlock(input: BuildComplexInput): SessionBlockResult | null {
  const { complex, week, prs, variantPrs, dayFactor, notes } = input;
  const base = complexBaseKg(complex, prs, variantPrs);
  if (base === null) return null;
  const topKg = Math.max(2.5, roundToNearestPlate(base * COMPLEX_WEEK_LOAD[week] * dayFactor));
  const sets = input.sets ?? COMPLEX_WEEK_SETS[week];
  // Las series de la segunda mitad suben un escalón: se entra en calor con el peso de salida y se acaba en el fuerte.
  const stepUp = Math.max(2.5, roundToNearestPlate(topKg * 0.04));
  const firstKg = Math.max(2.5, topKg - stepUp);
  const total = complexTotalReps(complex);
  const setPlan = Array.from({ length: sets }, (_, i) => ({ reps: total, kg: i < Math.ceil(sets / 2) ? firstKg : topKg }));
  const notation = complexNotation(complex);
  return {
    block: 'oly',
    movementId: complex.steps[0].movementId,
    format: 'Complejo',
    sets,
    reps: notation,
    loadKg: topKg,
    setPlan,
    complex: { id: complex.id, name: complex.name, steps: complex.steps.map((s) => ({ movementId: s.movementId, reps: s.reps })) },
    notes,
  };
}
