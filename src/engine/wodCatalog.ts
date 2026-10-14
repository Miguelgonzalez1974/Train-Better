import type { BenchmarkWorkout, Movement } from '../data/movements/types';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { benchmarkHasExplicitScheme } from '../data/movements/benchmarkCompleteness';
import { usesExcludedMovement } from '../data/movements/excluded';
import { libraryWods, type LibraryWod } from '../data/library/libraryWods';
import type { PainArea } from '../data/athlete/types';
import { avoidsMovement, getAvoidedPatterns } from './painFlags';
import { getWodDomain, type EnergySystem, type WodDomain } from './wodDomains';

/**
 * Catálogo unificado de WODs de programaciones reales (PushJerk, Mayhem, CompTrain, Invictus y los clásicos), con cada
 * WOD normalizado y etiquetado: formato, duración, sistema energético, dominios, exigencia y si se puede programar.
 *
 * FASE 1 — solo lectura. Nada del coach lo usa todavía: sirve para medir si hay WODs reales suficientes para cada fase
 * y condición (informe de cobertura) antes de que el coach elija de aquí. Las etiquetas se DEDUCEN del texto de cada
 * WOD y llevan su base (`durationBasis`): una duración declarada por la fuente es firme; una estimada por el volumen o
 * por la etiqueta de la fuente es orientativa. Nunca se inventan cifras: lo que no se puede leer se marca y se excluye.
 */

export type WodSource = 'pushjerk' | 'mayhem' | 'comptrain' | 'invictus' | 'clasicos' | 'otros';
export const WOD_SOURCES: WodSource[] = ['pushjerk', 'mayhem', 'comptrain', 'invictus', 'clasicos', 'otros'];

export type CatalogFormat = 'forTime' | 'amrap' | 'emom' | 'interval' | 'ladder' | 'maxReps' | 'chipper' | 'other';

/** De dónde sale la duración: `cap`, `goal`, `header` y `format` las declara la fuente; `tag` y `estimate` son orientativas. */
export type DurationBasis = 'cap' | 'goal' | 'header' | 'format' | 'tag' | 'estimate';
const DECLARED_BASIS: DurationBasis[] = ['cap', 'goal', 'header', 'format'];

export type ExclusionReason = 'movimientos-desconocidos' | 'sin-pauta-clara' | 'varias-partes' | 'movimiento-excluido' | 'sin-duracion';

export interface CatalogWod {
  /** `lib:<id>` (biblioteca PushJerk) o `bm:<id>` (catálogo de benchmarks/programaciones). */
  id: string;
  origin: 'library' | 'benchmark';
  refId: string;
  source: WodSource;
  name: string;
  format: CatalogFormat;
  durationMin: number | null;
  durationBasis: DurationBasis | null;
  /** Sistema energético que le corresponde por su duración y su mezcla (null si no se conoce la duración). */
  energy: EnergySystem | null;
  movementIds: string[];
  /** Elementos del WOD que no son un movimiento del catálogo (texto libre): sin ellos no se puede cuidar dolor ni cargas. */
  unresolved: string[];
  domainCounts: Record<WodDomain, number>;
  leadDomain: WodDomain | null;
  /** Lleva barra con carga (clean, snatch, deadlift, thruster con barra…). */
  hasLoadedLift: boolean;
  /** Lleva gimnásticos de alta exigencia técnica (muscle-up, handstand push-up, rope climb…). */
  hasHighSkill: boolean;
  exclusions: ExclusionReason[];
  /** Se puede programar tal cual (sin exclusiones). */
  usable: boolean;
}

// ---------------------------------------------------------------------------------------------
// Lectura de duración y formato
// ---------------------------------------------------------------------------------------------

const midpoint = (a: number, b?: number) => (b === undefined ? a : (a + b) / 2);

/** "9 min.", "10-12 min.", "sub 8 min.", "< 12 min." -> minutos; null si el objetivo no es un tiempo. */
function parseGoalMinutes(goal: string | undefined): number | null {
  if (!goal) return null;
  const m = goal.trim().match(/^(?:sub\s+|under\s+|<\s*)?(\d+)(?:\s*-\s*(\d+))?\s*min/i);
  return m ? midpoint(Number(m[1]), m[2] ? Number(m[2]) : undefined) : null;
}

/** Duración que declara la cabecera de un WOD de biblioteca: "12 min AMRAP", "20 min EMOM", "every 3 min for 15 min". */
function parseHeaderMinutes(header: string): number | null {
  const h = header.toLowerCase();
  const every = h.match(/every\s+[\w\s:]+?\s+for\s+(\d+)\s*min/);
  if (every) return Number(every[1]);
  const a = h.match(/(\d+)\s*(?:min(?:ute)?s?)\s*(?:alternating\s*)?(?:amrap|e\d?mom)/);
  if (a) return Number(a[1]);
  const b = h.match(/(?:amrap|e\d?mom)\s*(?:for\s*)?(\d+)\s*min/);
  if (b) return Number(b[1]);
  return null;
}

/** Segundos que cuesta cada unidad de una línea ("21-15-9", "400 m", "20 cal", "30 s", "2 min", "máx", "15"). */
function lineSeconds(qty: string): number {
  const q = qty.trim().toLowerCase();
  if (q.startsWith('máx') || q.startsWith('max')) return 15 * 3;
  const nums = (q.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length === 0) return 0;
  const total = nums.reduce((s, n) => s + n, 0);
  if (/\bmin\b/.test(q)) return total * 60;
  if (/\bs\b/.test(q)) return total;
  if (/\bm\b/.test(q)) return total * 0.25;
  if (/\bcal/.test(q)) return total * 3.5;
  return total * 3; // repeticiones
}

/**
 * Calibración de la estimación por volumen: contra los 175 WODs de biblioteca que declaran su duración, el volumen
 * puro se queda corto (mediana declarado/estimado = 1,30: transiciones, pausas y ritmo real), así que se corrige.
 */
const VOLUME_CALIBRATION = 1.3;

/** Minutos que costaría el volumen del WOD (rondas x suma de líneas), sin redondear ni acotar. */
function volumeMinutes(lines: [string, string][], header: string): number {
  const rounds = Number(header.toLowerCase().match(/(\d+)\s*rounds?/)?.[1] ?? 1);
  const seconds = lines.reduce((s, [, qty]) => s + lineSeconds(qty), 0) * rounds;
  return (seconds / 60) * VOLUME_CALIBRATION;
}

/** Estimación por volumen: orientativa, acotada a 3-60 min. */
function estimateMinutes(lines: [string, string][], header: string): number | null {
  const minutes = volumeMinutes(lines, header);
  if (minutes <= 0) return null;
  return Math.min(60, Math.max(3, Math.round(minutes)));
}

/**
 * ¿Cuánto acierta la estimación por volumen? Se compara con los WODs de biblioteca de tiempo libre ("for time") que
 * sí declaran su duración. `medianRatio` ≈ 1 es una estimación sin sesgo; `within30` es la fracción que cae a ±30 %.
 */
export function volumeEstimateAccuracy(): { n: number; medianRatio: number; within30: number } {
  const ratios: number[] = [];
  for (const w of libraryWods) {
    if (/amrap|e\d?mom|every/i.test(w.header)) continue; // su duración la fija el formato, no el volumen
    const declared = parseGoalMinutes(w.goal);
    if (declared === null) continue;
    const est = volumeMinutes(w.lines, w.header);
    if (est > 0) ratios.push(est / declared);
  }
  ratios.sort((a, b) => a - b);
  const within = ratios.filter((r) => r >= 0.7 && r <= 1.3).length;
  return { n: ratios.length, medianRatio: ratios[Math.floor(ratios.length / 2)] ?? 0, within30: ratios.length ? within / ratios.length : 0 };
}

function libraryFormat(header: string, lineCount: number): CatalogFormat {
  const h = header.toLowerCase();
  if (/amrap/.test(h) && /rounds? for max/.test(h)) return 'interval';
  if (/amrap/.test(h)) return 'amrap';
  if (/every\s+\d+\s*(?:sec|min)/.test(h)) return 'interval';
  if (/e\d?mom|emom/.test(h)) return 'emom';
  if (/for max|max reps|max calories/.test(h)) return 'maxReps';
  if (/\d+-\d+(?:-\d+)+/.test(h)) return 'ladder';
  if (/rounds?/.test(h)) return 'forTime';
  if (/for time/.test(h)) return lineCount >= 5 ? 'chipper' : 'forTime';
  return 'other';
}

const SERIES_BLOCK = /(\d+)\s*(?:series|sets|rondas)\s*de\s*AMRAP\s*(\d+)(?::00|\s*min)?/i;

function benchmarkFormat(format: string, movementCount: number): CatalogFormat {
  if (SERIES_BLOCK.test(format) || /\bintervalos?\b|\b\d+\s*(?:series|sets)\b/i.test(format)) return 'interval';
  if (/amrap/i.test(format)) return 'amrap';
  if (/emom|\bcada\s+\d/i.test(format)) return 'emom';
  if (/escalera|\d+-\d+(?:-\d+)+/i.test(format)) return 'ladder';
  if (/rondas|rounds|series|sets/i.test(format)) return 'forTime';
  if (/for time/i.test(format)) return movementCount >= 4 ? 'chipper' : 'forTime';
  if (/m[aá]xim|\bmax\b/i.test(format)) return 'maxReps';
  return 'other';
}

function parseBenchmarkMinutes(wod: BenchmarkWorkout): { min: number; basis: DurationBasis } | null {
  if (wod.timeCapMinutes) return { min: wod.timeCapMinutes, basis: 'cap' };
  const f = wod.format;
  const series = f.match(SERIES_BLOCK);
  if (series) {
    const n = Number(series[1]);
    const work = Number(series[2]);
    const rest = Number(f.match(/descanso\s*(\d+)(?::00|\s*min)?/i)?.[1] ?? 0);
    return { min: n * work + Math.max(0, n - 1) * rest, basis: 'format' };
  }
  const m =
    f.match(/AMRAP\s*(\d+)\s*min/i) ?? f.match(/(\d+)\s*min(?:utos)?\s*AMRAP/i) ?? f.match(/EMOM\s*(\d+)/i) ?? f.match(/(\d+)\s*min(?:utos)?\s*EMOM/i);
  if (m) return { min: Number(m[1]), basis: 'format' };
  const tag = wod.tags.find((t) => t in TAG_MINUTES);
  return tag ? { min: TAG_MINUTES[tag], basis: 'tag' } : null;
}

/**
 * Duración típica de cada etiqueta de la fuente (`corto`, `medio`…): la mediana de los WODs que además declaran su duración
 * (cap o formato). Es muy orientativa: `corto` y `medio` se solapan (mediana 10 min los dos), por eso `tag` es la base de menor confianza.
 */
const TAG_MINUTES: Record<string, number> = { corto: 9, medio: 11, largo: 20, 'muy-largo': 25 };

const MULTI_PART = /\b(?:luego|then|parte\s*[12]|part\s*[12])\b/i;

function sourceOf(wod: BenchmarkWorkout): WodSource {
  for (const s of ['mayhem', 'comptrain', 'invictus', 'pushjerk'] as const) if (wod.tags.includes(s)) return s;
  if (wod.category !== 'custom') return 'clasicos';
  return 'otros';
}

// ---------------------------------------------------------------------------------------------
// Etiquetas derivadas
// ---------------------------------------------------------------------------------------------

const HIGH_SKILL = /muscle-up|handstand-walk|handstand-push-up|rope-climb|legless|pistol|strict-hspu|ring-handstand/;

function energyFor(durationMin: number | null, tags: string[], counts: Record<WodDomain, number>): EnergySystem | null {
  if (tags.includes('recuperacion')) return 'recuperacion';
  if (durationMin === null) return null;
  const total = counts.gymnastics + counts.monostructural + counts.weighted;
  const monoShare = total > 0 ? counts.monostructural / total : 0;
  if (durationMin <= 8) return 'potencia';
  if (durationMin <= 20) return monoShare >= 0.67 && durationMin >= 14 ? 'base-aerobica' : 'umbral';
  return 'base-aerobica';
}

function analyse(ids: string[], rawUnresolved: string[]) {
  const resolved: Movement[] = [];
  const unresolved = [...rawUnresolved];
  for (const id of ids) {
    const m = getMovementById(id);
    if (m) resolved.push(m);
    else unresolved.push(id);
  }
  const unique = [...new Set(resolved.map((m) => m.id))];
  const domainCounts: Record<WodDomain, number> = { gymnastics: 0, monostructural: 0, weighted: 0 };
  for (const id of unique) domainCounts[getWodDomain(id)] += 1;
  const lead = (Object.entries(domainCounts) as [WodDomain, number][]).sort((a, b) => b[1] - a[1])[0];
  return {
    movementIds: unique,
    unresolved,
    domainCounts,
    leadDomain: lead && lead[1] > 0 ? lead[0] : null,
    hasLoadedLift: resolved.some((m) => m.tags.includes('barbell')),
    hasHighSkill: unique.some((id) => HIGH_SKILL.test(id)),
  };
}

function finish(base: Omit<CatalogWod, 'exclusions' | 'usable' | 'energy'> & { tags: string[] }, extra: ExclusionReason[]): CatalogWod {
  const { tags, ...wod } = base;
  const exclusions = [...extra];
  if (wod.unresolved.length > 0) exclusions.push('movimientos-desconocidos');
  if (wod.durationMin === null) exclusions.push('sin-duracion');
  return { ...wod, energy: energyFor(wod.durationMin, tags, wod.domainCounts), exclusions, usable: exclusions.length === 0 };
}

function fromLibrary(w: LibraryWod): CatalogWod {
  const goal = parseGoalMinutes(w.goal);
  const header = parseHeaderMinutes(w.header);
  const estimated = estimateMinutes(w.lines, w.header);
  const duration: { min: number | null; basis: DurationBasis | null } =
    goal !== null ? { min: goal, basis: 'goal' } : header !== null ? { min: header, basis: 'header' } : estimated !== null ? { min: estimated, basis: 'estimate' } : { min: null, basis: null };
  const info = analyse(w.lines.map(([id]) => id), []);
  const extra: ExclusionReason[] = usesExcludedMovement(info.movementIds, w.original) ? ['movimiento-excluido'] : [];
  return finish(
    {
      id: `lib:${w.id}`,
      origin: 'library',
      refId: w.id,
      source: 'pushjerk',
      name: `PushJerk ${w.date}`,
      format: libraryFormat(w.header, w.lines.length),
      durationMin: duration.min,
      durationBasis: duration.basis,
      ...info,
      tags: [],
    },
    extra,
  );
}

function fromBenchmark(w: BenchmarkWorkout): CatalogWod {
  const duration = parseBenchmarkMinutes(w);
  const info = analyse(w.movements.filter((id) => getMovementById(id)), w.movements.filter((id) => !getMovementById(id)));
  const extra: ExclusionReason[] = [];
  if (!benchmarkHasExplicitScheme(w)) extra.push('sin-pauta-clara');
  if (MULTI_PART.test(w.format)) extra.push('varias-partes');
  if (usesExcludedMovement(w.movements, w.format)) extra.push('movimiento-excluido');
  return finish(
    {
      id: `bm:${w.id}`,
      origin: 'benchmark',
      refId: w.id,
      source: sourceOf(w),
      name: w.name,
      format: benchmarkFormat(w.format, w.movements.length),
      durationMin: duration?.min ?? null,
      durationBasis: duration?.basis ?? null,
      ...info,
      tags: w.tags,
    },
    extra,
  );
}

let cached: CatalogWod[] | null = null;

/** El catálogo entero (se construye una vez): biblioteca PushJerk + catálogo de benchmarks y programaciones. */
export function getWodCatalog(): CatalogWod[] {
  if (!cached) cached = [...libraryWods.map(fromLibrary), ...benchmarkWorkouts.map(fromBenchmark)];
  return cached;
}

export const isDeclaredDuration = (w: CatalogWod): boolean => w.durationBasis !== null && DECLARED_BASIS.includes(w.durationBasis);

// ---------------------------------------------------------------------------------------------
// Informe de cobertura
// ---------------------------------------------------------------------------------------------

export const DURATION_BUCKETS = ['≤6', '7-10', '11-15', '16-20', '21-30', '>30'] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export function durationBucket(min: number): DurationBucket {
  if (min <= 6) return '≤6';
  if (min <= 10) return '7-10';
  if (min <= 15) return '11-15';
  if (min <= 20) return '16-20';
  if (min <= 30) return '21-30';
  return '>30';
}

export interface CatalogCoverage {
  total: number;
  usable: number;
  bySource: Record<WodSource, { total: number; usable: number }>;
  exclusions: Record<ExclusionReason, number>;
  /** WODs programables por sistema energético x dominio que manda: lo que necesita el planificador semanal. */
  energyByDomain: Record<EnergySystem, Record<WodDomain, number>>;
  durationBuckets: Record<DurationBucket, number>;
  /** Cuántos WODs programables quedan si hay un aviso de molestia activo en cada zona. */
  painSurvivors: Record<PainArea, number>;
  /** Los elementos de texto libre que más WODs dejan fuera (candidatos a añadir al catálogo de movimientos). */
  topUnresolved: [string, number][];
  /** Pares biblioteca/benchmark con los mismos movimientos y duración parecida: posible mismo WOD en dos fuentes. */
  possibleDuplicates: number;
  /** Cuántos programables tienen la duración declarada por la fuente (frente a estimada). */
  declaredDuration: number;
  /** Programables "ligeros": hasta 15 min, sin barra con carga ni gimnásticos exigentes — para descarga o días de poca preparación. */
  light: number;
}

const PAIN_AREAS: PainArea[] = ['hombro', 'cadera-lumbar', 'rodilla', 'codo-muneca'];
const ENERGIES: EnergySystem[] = ['potencia', 'umbral', 'base-aerobica', 'recuperacion'];
const DOMAINS: WodDomain[] = ['weighted', 'gymnastics', 'monostructural'];

export function summarizeCatalog(catalog: CatalogWod[]): CatalogCoverage {
  const bySource = Object.fromEntries(WOD_SOURCES.map((s) => [s, { total: 0, usable: 0 }])) as CatalogCoverage['bySource'];
  const exclusions = { 'movimientos-desconocidos': 0, 'sin-pauta-clara': 0, 'varias-partes': 0, 'movimiento-excluido': 0, 'sin-duracion': 0 } as CatalogCoverage['exclusions'];
  const energyByDomain = Object.fromEntries(ENERGIES.map((e) => [e, Object.fromEntries(DOMAINS.map((d) => [d, 0]))])) as CatalogCoverage['energyByDomain'];
  const buckets = Object.fromEntries(DURATION_BUCKETS.map((b) => [b, 0])) as CatalogCoverage['durationBuckets'];
  const unresolved = new Map<string, number>();
  let declared = 0;

  for (const w of catalog) {
    bySource[w.source].total += 1;
    for (const r of w.exclusions) exclusions[r] += 1;
    for (const u of w.unresolved) unresolved.set(u, (unresolved.get(u) ?? 0) + 1);
    if (!w.usable) continue;
    bySource[w.source].usable += 1;
    if (isDeclaredDuration(w)) declared += 1;
    if (w.energy && w.leadDomain) energyByDomain[w.energy][w.leadDomain] += 1;
    if (w.durationMin !== null) buckets[durationBucket(w.durationMin)] += 1;
  }

  const usableList = catalog.filter((w) => w.usable);
  const painSurvivors = Object.fromEntries(
    PAIN_AREAS.map((area) => {
      const avoided = getAvoidedPatterns([{ id: 'x', area, createdDate: '2026-01-01', until: null }], '2026-06-01');
      const ok = usableList.filter((w) => w.movementIds.every((id) => !avoidsMovement(avoided, getMovementById(id)!))).length;
      return [area, ok];
    }),
  ) as CatalogCoverage['painSurvivors'];

  const sig = (w: CatalogWod) => `${[...w.movementIds].sort().join(',')}|${w.durationMin === null ? '?' : Math.round(w.durationMin / 3)}`;
  const libSigs = new Set(usableList.filter((w) => w.origin === 'library').map(sig));
  const possibleDuplicates = usableList.filter((w) => w.origin === 'benchmark' && libSigs.has(sig(w))).length;

  return {
    total: catalog.length,
    usable: usableList.length,
    bySource,
    exclusions,
    energyByDomain,
    durationBuckets: buckets,
    painSurvivors,
    topUnresolved: [...unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    possibleDuplicates,
    declaredDuration: declared,
    light: usableList.filter((w) => !w.hasLoadedLift && !w.hasHighSkill && (w.durationMin ?? 99) <= 15).length,
  };
}
