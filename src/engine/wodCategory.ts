import type { DailySession, PersonalRecords, SessionBlockResult } from '../data/athlete/types';
import { getMovementById } from '../data/movements';
import { wodMovementsOfSession } from './generateSession';
import { resolveOlyPRKey, resolveStrengthPRKey } from './prResolution';
import { wodCapFor } from './wodCap';
import { getWodDomain } from './wodDomains';
import { getWodProfile, TYPICAL_KG } from './wodProfile';

/**
 * Las categorías de un WOD para «Tu nivel» (las de BTWB, menos las dos de barra, que salen de la fuerza y la halterofilia): Velocidad,
 * Resistencia, Peso corporal, Pesado, Ligero y Largo. Cada WOD cuenta para UNA sola, la que más encaja, y los que no encajan con claridad no
 * cuentan para ninguna (se dice por qué). Puro: lee los bloques del WOD y, para saber si pesa o no, tus marcas.
 *
 * Los umbrales son nuestros (no los de BTWB, que no los publica) y están todos aquí arriba para ajustarlos. Lo pesado es relativo a TI: un WOD
 * con peso muerto es pesado si el peso es una parte alta de tu 1RM de peso muerto, no por los kilos en sí.
 */
export type WodCategory = 'velocidad' | 'resistencia' | 'peso-corporal' | 'pesado' | 'ligero' | 'largo';

export const WOD_CATEGORY_LABEL: Record<WodCategory, string> = {
  velocidad: 'Velocidad',
  resistencia: 'Resistencia',
  'peso-corporal': 'Peso corporal',
  pesado: 'Pesado',
  ligero: 'Ligero',
  largo: 'Largo',
};

/** Hasta estos minutos un WOD es de velocidad (salvo que lleve una barra muy pesada para ti). */
export const SPEED_MAX_MIN = 5;
/** Desde estos minutos un WOD es largo (salvo que sea casi todo cardio, que es resistencia). */
export const LONG_MIN = 20;
/** Un WOD es de resistencia si el cardio (remo, bici, correr, comba…) es al menos esta parte de sus movimientos y dura al menos `ENDURANCE_MIN_MIN`. */
export const ENDURANCE_MONO_SHARE = 0.7;
export const ENDURANCE_MIN_MIN = 5;
/** Una barra con tu marca de referencia cuenta como pesada desde esta fracción de tu 1RM; con esta otra, un WOD corto también es pesado. */
export const HEAVY_FROM_1RM = 0.5;
export const VERY_HEAVY_FROM_1RM = 0.7;
/** Parte mínima de los movimientos con carga para que el WOD sea de carga (pesado o ligero) y no uno con un poco de peso. */
export const LOADED_MIN_SHARE = 0.3;

export interface WodCategoryVerdict {
  /** La categoría a la que cuenta, o null si no cuenta para ninguna. */
  category: WodCategory | null;
  /** Por qué, en una frase («Dura unos 8 min y lleva peso muerto al 56 % de tu 1RM»). */
  reason: string;
  /** Duración estimada en minutos, si se pudo saber. */
  minutes: number | null;
  /** true: no hay nada que decir (hoy no hay WOD o es recuperación): la pantalla no enseña pastilla ni «sin categoría». */
  silent?: boolean;
}

export interface WodCategoryContext {
  /** Tus marcas de 1RM: con ellas se sabe si una barra es pesada para ti. Sin ellas, un WOD con barra no se puede medir. */
  prs?: Partial<PersonalRecords>;
}

/** Una parte del WOD: la que tiene su `wodPart` o, en un día de un solo WOD, todas las entradas. */
function partOf(blocks: SessionBlockResult[], part: 1 | 2): SessionBlockResult[] {
  const wod = blocks.filter((b) => b.block === 'wod');
  return wod.some((b) => b.wodPart !== undefined) ? wod.filter((b) => (b.wodPart ?? 1) === part) : part === 1 ? wod : [];
}

/** Id del catálogo de un WOD de referencia, de programación o de biblioteca (con él se conoce su duración). */
function catalogIdOf(entries: SessionBlockResult[]): string | null {
  const cat = entries.find((b) => b.wodCatalogId)?.wodCatalogId;
  if (cat) return cat;
  const bench = entries.find((b) => b.movementId.startsWith('benchmark:'));
  if (bench) return `bm:${bench.movementId.slice('benchmark:'.length)}`;
  const lib = entries.find((b) => b.wodLibraryId)?.wodLibraryId;
  return lib ? `lib:${lib}` : null;
}

/** Cuánto dura el WOD, en minutos: el del catálogo, los minutos de un AMRAP, el objetivo del coach o el cap (a ~75 %). null si no se sabe. */
export function wodMinutesOf(entries: SessionBlockResult[], part: 1 | 2 = 1): number | null {
  const id = catalogIdOf(entries);
  const profile = id ? getWodProfile(id) : undefined;
  if (profile?.expectedMin) return profile.expectedMin;
  const cap = wodCapFor({ blocks: entries } as unknown as DailySession, part);
  if (cap?.kind === 'amrap') return cap.seconds / 60;
  const target = entries.find((b) => b.wodTarget)?.wodTarget;
  if (target && target.unit === 'seconds' && target.high > 0) return (target.low + target.high) / 2 / 60;
  if (cap?.kind === 'cap') return (cap.seconds / 60) * 0.75;
  return null;
}

/** La intensidad de una barra frente a tu 1RM (0-1,2), o null si no hay marca de referencia para ese movimiento. */
function barIntensity(movementId: string, kg: number | undefined, prs: Partial<PersonalRecords> | undefined): number | null {
  const movement = getMovementById(movementId);
  if (!movement || !kg || kg <= 0 || !prs) return null;
  const key = resolveStrengthPRKey(movement) ?? resolveOlyPRKey(movement);
  const pr = key ? prs[key] : undefined;
  if (!pr || pr <= 0) return null;
  return Math.min(1.2, kg / pr);
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const minText = (m: number) => `${Math.round(m)} min`;

/**
 * La categoría de una parte de un WOD a partir de sus bloques (los de la sesión o los guardados en el historial) y tus marcas.
 * Orden: recuperación y lo que no se puede medir no cuentan; muy largo = Largo; casi todo cardio = Resistencia (o Velocidad si es muy corto);
 * muy corto = Velocidad (salvo barra muy pesada); y de 5 a 20 minutos, por la carga: Pesado, Ligero o Peso corporal.
 */
export function classifyWodBlocks(blocks: SessionBlockResult[], ctx: WodCategoryContext = {}, part: 1 | 2 = 1): WodCategoryVerdict {
  const entries = partOf(blocks, part);
  if (entries.length === 0) return { category: null, reason: 'Hoy no hay WOD.', minutes: null, silent: true };
  if (entries[0].format?.startsWith('RPE 2')) return { category: null, reason: 'Es recuperación: no se mide.', minutes: null, silent: true };

  const minutes = wodMinutesOf(entries, part);
  const session = { blocks: entries } as unknown as DailySession;
  const ids = [...new Set(wodMovementsOfSession(session).map((m) => m.movementId))];
  if (ids.length === 0) return { category: null, reason: 'No se reconocen sus movimientos.', minutes };
  if (minutes === null) return { category: null, reason: 'No se sabe cuánto dura, así que no se puede clasificar.', minutes };

  const domains = ids.map((id) => getWodDomain(id));
  const share = (d: 'monostructural' | 'weighted' | 'gymnastics') => domains.filter((x) => x === d).length / ids.length;
  const mono = share('monostructural');
  const weighted = share('weighted');

  if (minutes >= LONG_MIN && mono < ENDURANCE_MONO_SHARE) return { category: 'largo', reason: `Dura unos ${minText(minutes)}: es un WOD largo.`, minutes };
  if (mono >= ENDURANCE_MONO_SHARE) {
    return minutes >= ENDURANCE_MIN_MIN
      ? { category: 'resistencia', reason: `Casi todo es cardio y dura unos ${minText(minutes)}.`, minutes }
      : { category: 'velocidad', reason: `Cardio muy corto (unos ${minText(minutes)}): es velocidad.`, minutes };
  }

  // Cargas de las barras con marca de referencia: la más alta decide si es pesado para ti. La carga es la del bloque, la que propone el coach en un WOD
  // de programación o, si no hay ninguna, la Rx típica del movimiento.
  const loadOf = (id: string): number | undefined =>
    entries.find((e) => e.movementId === id)?.loadKg ?? entries.map((e) => e.benchmarkLoads?.[id]).find((kg) => kg) ?? TYPICAL_KG[id];
  const bars = ids
    .map((id) => ({ id, intensity: barIntensity(id, loadOf(id), ctx.prs) }))
    .filter((b): b is { id: string; intensity: number } => b.intensity !== null);
  const top = bars.length > 0 ? bars.reduce((a, b) => (b.intensity > a.intensity ? b : a)) : null;
  const topName = top ? (getMovementById(top.id)?.name ?? top.id).toLowerCase() : '';

  if (minutes <= SPEED_MAX_MIN) {
    if (top && top.intensity >= VERY_HEAVY_FROM_1RM) {
      return { category: 'pesado', reason: `Dura unos ${minText(minutes)}, pero lleva ${topName} al ${pct(top.intensity)} de tu 1RM.`, minutes };
    }
    return { category: 'velocidad', reason: `Dura unos ${minText(minutes)}: es un WOD corto y rápido.`, minutes };
  }

  if (weighted >= LOADED_MIN_SHARE) {
    if (top && top.intensity >= HEAVY_FROM_1RM) {
      return { category: 'pesado', reason: `Lleva ${topName} al ${pct(top.intensity)} de tu 1RM, y dura unos ${minText(minutes)}.`, minutes };
    }
    if (top) return { category: 'ligero', reason: `Lleva peso, pero ligero para ti: ${topName} al ${pct(top.intensity)} de tu 1RM.`, minutes };
    // Con carga pero sin barra con marca de referencia (balón, mancuernas, kettlebell): ligero; si hay barra sin tu marca, no se puede medir.
    const hasBarWithoutPr = ids.some((id) => {
      const m = getMovementById(id);
      return m && (resolveStrengthPRKey(m) || resolveOlyPRKey(m));
    });
    if (hasBarWithoutPr) return { category: null, reason: 'Lleva barra, pero no tienes anotada la marca para saber si es pesada.', minutes };
    return { category: 'ligero', reason: 'Lleva peso de implementos (balón, mancuernas, kettlebell): es de carga ligera.', minutes };
  }

  if (weighted === 0) return { category: 'peso-corporal', reason: 'No lleva carga externa: solo tu peso corporal.', minutes };

  return { category: null, reason: 'Mezcla de cargas y movimientos: no encaja en una sola categoría.', minutes };
}

/** La categoría de la parte de un WOD de una sesión del día (con las marcas del atleta). */
export function classifyWod(session: Pick<DailySession, 'blocks'>, part: 1 | 2, ctx: WodCategoryContext = {}): WodCategoryVerdict {
  return classifyWodBlocks(session.blocks, ctx, part);
}
