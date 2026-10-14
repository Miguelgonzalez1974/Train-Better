import type { MovementPattern } from '../data/movements/types';
import { getMovementById } from '../data/movements';
import { benchmarkConflictsWithPain } from './painFlags';
import { isDeclaredDuration, type CatalogFormat, type CatalogWod, type WodSource } from './wodCatalog';
import type { EnergySystem, WodDomain } from './wodDomains';

/**
 * Selección del WOD del día entre los WODs REALES del catálogo (PushJerk, Mayhem, CompTrain, Invictus, clásicos):
 * en vez de inventar uno, el coach elige el que mejor encaja con el momento del macro y con cómo estás hoy.
 *
 * Primero se descartan los que no se pueden (molestias, repetidos, fuera de las fuentes permitidas) y después se
 * PUNTÚA el resto por cinco criterios — duración que pide el día, sistema energético y dominio planificados,
 * exigencia (barra con carga, gimnásticos duros) frente a cómo llegas, interferencia con la fuerza y el accesorio de
 * hoy, y variedad —. El que se sirve sale de los mejores con un sorteo ponderado (determinista por la semilla del día):
 * la puntuación manda, pero no es siempre el mismo.
 */

export interface SelectionContext {
  /** Minutos que pide el día (el tiempo del WOD ya escalado por fase, énfasis y dosis del día). */
  targetMin: number;
  /** Sistema energético planificado para hoy. */
  energy: EnergySystem;
  /** Dominio que manda hoy según la semana (barra / gimnásticos / cardio), si el plan lo fija. */
  leadDomain: WodDomain | null;
  /** Día de fuerza: el WOD no debe competir con la barra pesada ya hecha. */
  lowInterference: boolean;
  /** 0 (llegas bien) a 1 (llegas muy justo / descarga): empuja a WODs más cortos y menos exigentes. */
  lightPref: number;
  /** Hay un objetivo de competición en fase de pico o taper: se prefieren las programaciones de competición. */
  competitionPeak: boolean;
  /** Patrones que cargó la fuerza de hoy o la fatiga de zona: se evitan mientras queden alternativas. */
  excludePatterns: Set<MovementPattern>;
  /** Patrones que cargará el accesorio de hoy: se evitan si hay alternativas (penalizan, no excluyen). */
  softAvoidPatterns?: Set<MovementPattern>;
  /** Patrones que evitan los avisos de molestia: NUNCA se programa un WOD que los lleve. */
  painAvoided: Set<MovementPattern>;
  /** Ids de catálogo hechos hace poco (`lib:…` / `bm:…`): no se repiten. */
  recentCatalogIds: Set<string>;
  /** Fuentes del último WOD hecho y formatos de los últimos: para no encadenar el mismo. */
  lastSource?: WodSource;
  recentFormats?: CatalogFormat[];
  /** Fuentes de los últimos WODs reales (el más reciente primero): reparte entre programaciones en vez de quedarse con una. */
  recentSources?: WodSource[];
  /** Fuentes permitidas (por defecto todas). */
  allowedSources?: readonly WodSource[];
  /** Movimientos que no pueden salir (p. ej. los de la parte 1 de un día de doble WOD). */
  excludeMovementIds?: Set<string>;
  /** Formatos que no pueden salir. */
  excludeFormats?: readonly CatalogFormat[];
  /** Máximo de movimientos distintos del WOD (por defecto 7; las piezas de un doble WOD son más cortas). */
  maxMovements?: number;
  /**
   * Parte 2 de un día de doble WOD: el WOD debe COMPLEMENTAR a la parte 1 — otro dominio, ningún patrón compartido y otro
   * formato (pesa mucho en la puntuación).
   */
  complement?: { domain: WodDomain | null; patterns: Set<MovementPattern>; format: CatalogFormat | null };
}

export interface RankedWod {
  wod: CatalogWod;
  score: number;
  parts: { duration: number; energy: number; domain: number; demand: number; interference: number; variety: number; balance: number; competition: number; complement: number };
}

const WEIGHTS = { duration: 0.3, energy: 0.17, domain: 0.12, demand: 0.16, interference: 0.1, variety: 0.05, balance: 0.06, competition: 0.04, complement: 0 };
/** La parte 2 de un doble WOD pesa sobre todo por cuánto complementa a la parte 1. */
const COMPLEMENT_WEIGHT = 0.3;
/** Cuántos de los últimos WODs reales cuentan para repartir entre fuentes. */
const BALANCE_WINDOW = 12;
/** Más de esto y el WOD no se sirve como WOD del día (lista de movimientos demasiado larga). */
const MAX_MOVEMENTS = 7;
/** Candidatos mínimos para que los filtros "blandos" (patrones de hoy) se mantengan estrictos. */
const MIN_POOL = 8;
/** Cuántos de los mejores entran en el sorteo final (y en la lista que recorre "Otro WOD"). */
const TOP_K = 6;

const COMPETITION_SOURCES: WodSource[] = ['mayhem', 'invictus', 'comptrain'];

export const SOURCE_LABEL: Record<WodSource, string> = {
  pushjerk: 'PushJerk',
  mayhem: 'CrossFit Mayhem',
  comptrain: 'CompTrain',
  invictus: 'CrossFit Invictus',
  clasicos: 'WOD clásico',
  otros: 'programación',
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function patternsOf(w: CatalogWod): MovementPattern[] {
  return w.movementIds.map((id) => getMovementById(id)?.pattern).filter((p): p is MovementPattern => Boolean(p));
}

/** Un WOD choca con el aviso de molestia si alguno de sus movimientos cae en un patrón evitado (incluidos los secundarios). */
function conflictsWithPain(w: CatalogWod, painAvoided: Set<MovementPattern>): boolean {
  if (painAvoided.size === 0) return false;
  // Por los movimientos de la lista (también por sus patrones secundarios) y por las palabras del texto del WOD
  // (comba, carrera, saltos, sentadillas…) que la lista no siempre recoge.
  return benchmarkConflictsWithPain({ movements: w.movementIds, format: w.text }, painAvoided, getMovementById);
}

const ENERGY_ORDER: EnergySystem[] = ['potencia', 'umbral', 'base-aerobica'];

function energyFit(w: CatalogWod, planned: EnergySystem): number {
  const light = !w.hasLoadedLift && !w.hasHighSkill;
  if (planned === 'recuperacion') return light && (w.durationMin ?? 99) <= 15 ? 1 : 0.2;
  if (w.energy === null) return 0.4;
  if (w.energy === 'recuperacion') return 0.3;
  const d = Math.abs(ENERGY_ORDER.indexOf(w.energy) - ENERGY_ORDER.indexOf(planned));
  return d === 0 ? 1 : d === 1 ? 0.55 : 0.15;
}

function domainFit(w: CatalogWod, lead: WodDomain | null): number {
  if (lead === null) return 0.6;
  if (w.leadDomain === lead) return 1;
  return w.domainCounts[lead] >= 1 ? 0.5 : 0.15;
}

/** Cuánto pesa un WOD: barra con carga, gimnásticos duros y minutos de más. 0 (suave) a 1 (muy exigente). */
function heaviness(w: CatalogWod): number {
  return clamp01(0.5 * (w.hasLoadedLift ? 1 : 0) + 0.35 * (w.hasHighSkill ? 1 : 0) + 0.15 * ((w.durationMin ?? 0) > 18 ? 1 : 0));
}

function durationFit(w: CatalogWod, ctx: SelectionContext): number {
  if (w.durationMin === null) return 0;
  const target = ctx.targetMin * (1 - 0.25 * ctx.lightPref);
  const error = Math.abs(w.durationMin - target) / Math.max(4, target);
  // ±15 % es un ajuste casi perfecto; a partir de ±60 % ya no encaja. Una duración estimada vale algo menos que una declarada.
  const fit = clamp01(1 - Math.max(0, error - 0.1) / 0.5);
  return isDeclaredDuration(w) ? fit : fit * 0.93;
}

function demandFit(w: CatalogWod, ctx: SelectionContext): number {
  const h = heaviness(w);
  const lightNeed = Math.max(ctx.lightPref, ctx.lowInterference ? 0.7 : 0);
  if (lightNeed > 0) return clamp01(1 - lightNeed * h);
  // Llegas bien y no es día de fuerza: sin sesgo, con un pequeño premio a lo exigente.
  return 0.85 + 0.15 * h;
}

function interferenceFit(w: CatalogWod, ctx: SelectionContext): number {
  const soft = ctx.softAvoidPatterns;
  if (!soft || soft.size === 0) return 1;
  const patterns = patternsOf(w);
  if (patterns.length === 0) return 1;
  return 1 - patterns.filter((p) => soft.has(p)).length / patterns.length;
}

function varietyFit(w: CatalogWod, ctx: SelectionContext): number {
  const sameSource = ctx.lastSource !== undefined && ctx.lastSource === w.source ? 1 : 0;
  const sameFormat = ctx.recentFormats?.slice(0, 2).includes(w.format) ? 1 : 0;
  return 1 - 0.3 * sameSource - 0.4 * sameFormat;
}

/** Reparto entre programaciones: una fuente que ya ocupa buena parte de los últimos WODs puntúa menos; una poco vista, más. */
function balanceFit(w: CatalogWod, ctx: SelectionContext): number {
  const recent = ctx.recentSources?.slice(0, BALANCE_WINDOW) ?? [];
  if (recent.length < 4) return 1;
  const share = recent.filter((s) => s === w.source).length / recent.length;
  return clamp01(1 - (share - 0.15) / 0.5);
}

/** Qué tanto complementa a la parte 1: otro dominio (lo que más), sin patrones compartidos y otro formato. */
function complementFit(w: CatalogWod, ctx: SelectionContext): number {
  const c = ctx.complement;
  if (!c) return 1;
  const domain = c.domain !== null && w.leadDomain !== null && w.leadDomain !== c.domain ? 1 : 0.25;
  const patterns = patternsOf(w);
  const shared = patterns.length === 0 ? 0 : patterns.filter((p) => c.patterns.has(p)).length / patterns.length;
  const format = c.format !== null && w.format !== c.format ? 1 : 0.3;
  return 0.5 * domain + 0.3 * (1 - shared) + 0.2 * format;
}

function competitionFit(w: CatalogWod, ctx: SelectionContext): number {
  if (!ctx.competitionPeak) return 0.5;
  return COMPETITION_SOURCES.includes(w.source) ? 1 : 0.2;
}

/**
 * Candidatos ordenados de mejor a peor. Los filtros duros (usable, fuentes, repetidos, avisos de molestia) no se
 * relajan nunca; el de patrones de hoy sí, si dejaría menos de `MIN_POOL` opciones.
 */
export function rankCatalogWods(catalog: CatalogWod[], ctx: SelectionContext): RankedWod[] {
  const base = catalog.filter(
    (w) =>
      w.usable &&
      w.movementIds.length > 0 &&
      w.movementIds.length <= (ctx.maxMovements ?? MAX_MOVEMENTS) &&
      (!ctx.allowedSources || ctx.allowedSources.includes(w.source)) &&
      !ctx.recentCatalogIds.has(w.id) &&
      !(ctx.excludeFormats && ctx.excludeFormats.includes(w.format)) &&
      !(ctx.excludeMovementIds && w.movementIds.some((id) => ctx.excludeMovementIds!.has(id))) &&
      !conflictsWithPain(w, ctx.painAvoided),
  );
  const weights = ctx.complement ? { ...WEIGHTS, complement: COMPLEMENT_WEIGHT } : WEIGHTS;
  const strict = base.filter((w) => !patternsOf(w).some((p) => ctx.excludePatterns.has(p)));
  const pool = strict.length >= MIN_POOL ? strict : base;
  return pool
    .map((wod) => {
      const parts = {
        duration: durationFit(wod, ctx),
        energy: energyFit(wod, ctx.energy),
        domain: domainFit(wod, ctx.leadDomain),
        demand: demandFit(wod, ctx),
        interference: interferenceFit(wod, ctx),
        variety: varietyFit(wod, ctx),
        balance: balanceFit(wod, ctx),
        competition: competitionFit(wod, ctx),
        complement: complementFit(wod, ctx),
      };
      const score = (Object.keys(weights) as (keyof typeof weights)[]).reduce((s, k) => s + weights[k] * parts[k], 0);
      return { wod, score, parts };
    })
    .sort((a, b) => b.score - a.score || a.wod.id.localeCompare(b.wod.id));
}

/** Sorteo ponderado entre los mejores: la puntuación manda (peso ~ cuadrado de lo que supera al peor del grupo), pero no es siempre el primero. */
export function pickRanked(ranked: RankedWod[], rand: () => number, topK = TOP_K): RankedWod | null {
  const top = ranked.slice(0, topK);
  if (top.length === 0) return null;
  const floor = top[top.length - 1].score;
  const weights = top.map((r) => (r.score - floor + 0.03) ** 2);
  let roll = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i];
    if (roll < 0) return top[i];
  }
  return top[top.length - 1];
}

/**
 * Los mejores candidatos en el orden en que se ofrecen: primero el que sale del sorteo ponderado (el WOD "de siempre"
 * de ese día) y después los demás en orden de puntuación. "Otro WOD" recorre esta lista de uno en uno — sin repetir
 * hasta dar la vuelta —, así que cada pulsación da el siguiente mejor y no un sorteo nuevo.
 */
export function rankedSequence(ranked: RankedWod[], rand: () => number, topK = TOP_K): RankedWod[] {
  const top = ranked.slice(0, Math.max(topK, 1));
  const base = pickRanked(top, rand, top.length);
  if (!base) return [];
  return [base, ...top.filter((r) => r !== base)];
}

/** Las frases que explican por qué se eligió este WOD (van a la nota y al resumen "por qué tu sesión es así hoy"). */
export function explainChoice(r: RankedWod, ctx: SelectionContext): string[] {
  const w = r.wod;
  const out: string[] = [];
  if (w.durationMin !== null) {
    const exact = isDeclaredDuration(w) ? 'duración declarada' : 'duración estimada';
    out.push(`Dura unos ${Math.round(w.durationMin)} min (${exact}); hoy tocaban unos ${Math.round(ctx.targetMin)}.`);
  }
  if (w.energy && r.parts.energy >= 1) out.push(`Encaja con el sistema energético de hoy (${ENERGY_LABEL[w.energy]}).`);
  if (ctx.leadDomain && r.parts.domain >= 1) out.push(`Manda el dominio que pide la semana (${DOMAIN_LABEL[ctx.leadDomain]}).`);
  if (ctx.lightPref >= 0.4) out.push('Llegas justo hoy: se prefiere un WOD más corto y menos exigente.');
  else if (ctx.lowInterference) out.push('Es día de fuerza: se prefiere un WOD que no compita con la barra pesada.');
  if (ctx.competitionPeak && COMPETITION_SOURCES.includes(w.source)) out.push('Tu competición está cerca: se prefieren las programaciones de competición.');
  return out;
}

const ENERGY_LABEL: Record<EnergySystem, string> = { 'base-aerobica': 'base aeróbica', umbral: 'umbral', potencia: 'potencia', recuperacion: 'recuperación' };
const DOMAIN_LABEL: Record<WodDomain, string> = { weighted: 'barra', gymnastics: 'gimnásticos', monostructural: 'cardio' };
