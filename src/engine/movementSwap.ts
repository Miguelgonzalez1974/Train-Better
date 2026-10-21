import type { Block, Movement, MovementPattern } from '../data/movements/types';
import type { PainFlag, PersonalRecords, SessionBlockResult, VariantPersonalRecords } from '../data/athlete/types';
import { getMovementById, getMovementsByBlock, getScalingOptions, parseLeadingRepCount, type ScalingOption } from '../data/movements';
import { roundToNearestPlate } from './oneRepMaxTables';
import { avoidsMovement, getAvoidedPatterns } from './painFlags';
import { resolveOlyPRKey, resolveStrengthPRKey, resolveVariantPR } from './prResolution';

/**
 * Sustituir un movimiento sobre la marcha (modo enfocado): el rack está ocupado, falta una barra, algo molesta o hoy no sale.
 * Ofrece alternativas del mismo bloque y del mismo patrón de movimiento (o las de escalado curadas del WOD), sin lo que evita
 * un aviso de molestia activo, y recalcula la carga cuando se puede: con barra en los dos movimientos se mantiene el mismo %
 * del PR; si cambia el material (mancuernas, peso corporal…) no se inventa un peso y la carga queda a elección del atleta.
 */

export type SwapKind = 'escalado' | 'mas-facil' | 'mas-dificil' | 'similar';

export interface SwapOption {
  movementId: string;
  name: string;
  kind: SwapKind;
  /** Material del movimiento nuevo, para elegir de un vistazo ("barra", "mancuernas", "peso corporal"…). */
  equipment: string;
  /** Reps nuevas si cambian (escalados con reps fijas o con proporción). */
  reps?: string;
  /** Carga nueva si se pudo recalcular (kg); null = el movimiento nuevo no lleva la carga de antes (a elección); undefined = el bloque no llevaba carga. */
  loadKg?: number | null;
  /** Lo que se escribe en la entrada del bloque al elegirla. */
  patch: Partial<SessionBlockResult>;
}

export interface SwapContext {
  prs: PersonalRecords;
  variantPrs?: VariantPersonalRecords;
  painFlags?: PainFlag[];
  todayIso: string;
}

const MAX_OPTIONS = 8;
/** El material del catálogo viene en texto libre ("barbell", "dumbbells (opcional)", "banda elastica"…): se deja corto y en español. */
export function equipmentLabel(m: Pick<Movement, 'equipment'>): string {
  const skip = /^(rack|bench|banco|box|caja|cajon|pared)/i;
  const first = m.equipment.find((e) => !skip.test(e)) ?? m.equipment[0];
  if (!first) return 'sin material';
  const clean = first.replace(/\s*\(opcional\)/i, '').trim();
  if (/^barbell/i.test(clean) || /^barra vac/i.test(clean) || /^pvc/i.test(clean)) return 'barra';
  if (/^(dumbbell|mancuerna)/i.test(clean)) return 'mancuernas';
  if (/^kettlebell/i.test(clean)) return 'kettlebell';
  return clean.length > 22 ? `${clean.slice(0, 20)}…` : clean;
}

/** ¿Va con barra con discos? (el catálogo escribe "barbell", "barbell o dumbbells (opcional)"…). */
function usesBarbell(m: Pick<Movement, 'equipment'>): boolean {
  return m.equipment.some((e) => /^barbell/i.test(e));
}
function referencePr(m: Movement, ctx: SwapContext): number | undefined {
  const variant = resolveVariantPR(m, ctx.variantPrs);
  if (variant) return variant;
  const key = resolveStrengthPRKey(m) ?? resolveOlyPRKey(m);
  const value = key ? ctx.prs[key] : undefined;
  return value && value > 0 ? value : undefined;
}

/** Una alternativa del mismo bloque y patrón, ordenada: primero las que el propio catálogo marca como más fáciles o difíciles, luego las que comparten más músculo. */
function similarPool(entry: SessionBlockResult, original: Movement, avoided: Set<MovementPattern>): { movement: Movement; kind: SwapKind }[] {
  const block: Block = entry.block;
  const easier = new Set(original.scaling.easier);
  const harder = new Set(original.scaling.harder);
  const isOlyFamily = (m: Movement) => (m.id.includes('snatch') ? 'snatch' : m.id.includes('clean') || m.id.includes('jerk') ? 'clean' : 'other');
  const overlap = (m: Movement) => m.primaryMuscles.filter((x) => original.primaryMuscles.includes(x)).length;
  const candidates = getMovementsByBlock(block).filter((m) => {
    if (m.id === original.id) return false;
    if (avoidsMovement(avoided, m)) return false;
    // Un jerk no es una alternativa de un press estricto: es otro gesto, mucho más pesado.
    if (block === 'strength' && /jerk/.test(m.id) && !/jerk/.test(original.id)) return false;
    if (block === 'oly') return isOlyFamily(m) === isOlyFamily(original) && m.pattern === original.pattern;
    return m.pattern === original.pattern;
  });
  const ranked = candidates.map((m) => ({
    movement: m,
    kind: (easier.has(m.id) ? 'mas-facil' : harder.has(m.id) ? 'mas-dificil' : 'similar') as SwapKind,
    score: (easier.has(m.id) || harder.has(m.id) ? 100 : 0) + overlap(m) * 10 + (m.progressionOf && m.progressionOf === original.progressionOf ? 5 : 0),
  }));
  ranked.sort((a, b) => b.score - a.score || a.movement.name.localeCompare(b.movement.name, 'es'));
  return ranked.map(({ movement, kind }) => ({ movement, kind }));
}

/** Lo que hay que recordar para deshacer el cambio: el primer original (si ya se había cambiado antes, se conserva ese). */
function originOf(entry: SessionBlockResult): NonNullable<SessionBlockResult['swapOrigin']> {
  return (
    entry.swapOrigin ?? {
      movementId: entry.movementId,
      reps: entry.reps,
      loadKg: entry.loadKg,
      setPlan: entry.setPlan,
      scaledFrom: entry.scaledFrom,
    }
  );
}
/** Convierte una opción curada de escalado del WOD en el parche de la entrada (mismas reglas que el escalado de la sesión). */
function scalingPatch(entry: SessionBlockResult, option: ScalingOption, original: Movement | undefined): Partial<SessionBlockResult> {
  const patch: Partial<SessionBlockResult> = {
    movementId: option.movementId,
    scaledFrom: entry.scaledFrom ?? original?.name ?? entry.movementId,
    swapOrigin: originOf(entry),
  };
  if (option.reps) patch.reps = option.reps;
  else if (option.perRepRatio) {
    const base = parseLeadingRepCount(entry.reps);
    if (base) patch.reps = String(Math.round(base * option.perRepRatio));
  }
  return patch;
}

export function swapOptions(entry: SessionBlockResult, ctx: SwapContext): SwapOption[] {
  if (entry.movementId.startsWith('benchmark:')) return [];
  const original = getMovementById(entry.movementId);
  if (!original) return [];
  const avoided = getAvoidedPatterns(ctx.painFlags, ctx.todayIso);
  const options: SwapOption[] = [];
  const seen = new Set<string>([original.id]);
  const push = (o: SwapOption) => {
    if (seen.has(o.movementId) || options.length >= MAX_OPTIONS) return;
    seen.add(o.movementId);
    options.push(o);
  };

  // WOD: primero el escalado curado (Mayhem), que trae reps ya pensadas para el cambio.
  if (entry.block === 'wod') {
    for (const option of getScalingOptions(entry.movementId, entry.reps)) {
      const m = getMovementById(option.movementId);
      if (!m || avoidsMovement(avoided, m)) continue;
      const patch = scalingPatch(entry, option, original);
      push({ movementId: m.id, name: option.label ?? m.name, kind: 'escalado', equipment: equipmentLabel(m), reps: patch.reps, patch });
    }
  }

  const withLoad = (entry.block === 'strength' || entry.block === 'oly') && Boolean(entry.loadKg && entry.loadKg > 0);
  const originalRef = withLoad ? referencePr(original, ctx) : undefined;
  const originalBar = usesBarbell(original);

  // Después de las variantes de fuerza, las del mismo patrón que hay en accesorios (mancuernas, máquinas, peso corporal…):
  // es lo que se busca cuando el rack o la barra están ocupados.
  const accessoryOnes: { movement: Movement; kind: SwapKind }[] =
    entry.block === 'strength'
      ? getMovementsByBlock('accessory')
          // Con al menos dos músculos en común (si el original tiene dos o más): un press con mancuernas sí, una elevación lateral no.
          .filter(
            (m) =>
              m.id !== original.id &&
              m.pattern === original.pattern &&
              !avoidsMovement(avoided, m) &&
              m.primaryMuscles.filter((x) => original.primaryMuscles.includes(x)).length >= Math.min(2, original.primaryMuscles.length),
          )
          .sort(
            (a, b) =>
              b.primaryMuscles.filter((x) => original.primaryMuscles.includes(x)).length - a.primaryMuscles.filter((x) => original.primaryMuscles.includes(x)).length ||
              a.name.localeCompare(b.name, 'es'),
          )
          .map((movement) => ({ movement, kind: 'similar' as SwapKind }))
      : [];
  const strengthOnes = similarPool(entry, original, avoided);
  // Hasta 5 de la misma categoría y el resto de accesorios, para que siempre haya alguna opción sin barra.
  const pool = [...strengthOnes.slice(0, 5), ...accessoryOnes.slice(0, 3), ...strengthOnes.slice(5), ...accessoryOnes.slice(3)];

  for (const { movement: m, kind } of pool) {
    const patch: Partial<SessionBlockResult> = { movementId: m.id, scaledFrom: entry.scaledFrom ?? original.name, swapOrigin: originOf(entry) };
    let loadKg: number | null | undefined;
    if (withLoad) {
      const altRef = referencePr(m, ctx);
      if (originalRef && altRef && originalBar && usesBarbell(m)) {
        loadKg = roundToNearestPlate(altRef * (entry.loadKg! / originalRef));
        patch.loadKg = loadKg;
        if (entry.setPlan && entry.setPlan.length >= 2) {
          const ratio = loadKg / entry.loadKg!;
          patch.setPlan = entry.setPlan.map((s) => ({ reps: s.reps, kg: roundToNearestPlate(s.kg * ratio) }));
        }
      } else {
        // Cambia el material o no hay referencia: no se inventa un peso, queda a elección y se quita el plan serie a serie.
        loadKg = null;
        patch.loadKg = undefined;
        // La rampa se queda con sus repeticiones y sin pesos (0): el atleta pone el peso real al hacerla.
        patch.setPlan = entry.setPlan && entry.setPlan.length >= 2 ? entry.setPlan.map((s) => ({ reps: s.reps, kg: 0 })) : undefined;
      }
    } else if (entry.loadKg && entry.block === 'wod') {
      // En un WOD la carga solo tiene sentido si el nuevo también va con barra.
      if (!usesBarbell(m)) patch.loadKg = undefined;
    }
    push({ movementId: m.id, name: m.name, kind, equipment: equipmentLabel(m), loadKg, patch });
  }
  return options;
}
