import type { AthleteProfile, LevelResult, PersonalRecords, SessionBlockResult, SessionHistoryEntry, WodResult } from '../data/athlete/types';
import { benchmarkWorkouts, getMovementById } from '../data/movements';
import { OLY_ROOT_PR_MAP, resolveOlyPRKey, resolveStrengthPRKey, STRENGTH_ROOT_PR_MAP } from './prResolution';
import { toLocalIsoDate } from './periodization';
import { classifyWodBlocks, WOD_CATEGORY_LABEL, type WodCategory } from './wodCategory';
import { historyWodKey, parseTimeSeconds, wodKeyOfBlocks } from './wodGhost';
import { getCatalogWod } from './wodCatalog';
import { computeYearConsistency } from './yearConsistency';

/**
 * «Tu nivel» con las 8 categorías de BTWB, medido contra TUS PROPIAS marcas (no contra otros atletas): Power lifts y Olímpicos salen de tus marcas de barra; las otras seis
 * (Velocidad, Resistencia, Peso corporal, Pesado, Ligero y Largo) de tus resultados de WOD, clasificados con `engine/wodCategory.ts`.
 *
 *  - Cada categoría puntúa de 0 a 100: 100 = estás en tu mejor marca de los últimos 12 meses. Baja si rindes menos que tu mejor vez y, poco a poco, si pasa el tiempo sin repetirla.
 *  - Con un solo resultado la categoría es «provisional»; hace falta un segundo para fiarse (como en BTWB). Los resultados caducan a los 12 meses.
 *  - Solo cuentan los WODs hechos en Rx (uno escalado no mide lo mismo). La constancia NO entra: es un hábito, va aparte.
 * Puro: lee el perfil y el historial y devuelve la foto de hoy y la de hace 3 meses.
 */
export type LevelKey = 'power-lifts' | 'olimpicos' | WodCategory;

/** El orden en el radar, empezando por arriba y en el sentido de las agujas del reloj. */
export const LEVEL_ORDER: LevelKey[] = ['power-lifts', 'olimpicos', 'velocidad', 'resistencia', 'peso-corporal', 'pesado', 'ligero', 'largo'];

export const LEVEL_LABEL: Record<LevelKey, string> = {
  'power-lifts': 'Power lifts',
  olimpicos: 'Olímpicos',
  ...WOD_CATEGORY_LABEL,
};

/** Los resultados valen 12 meses. */
export const WINDOW_DAYS = 365;
/** Una marca de hace menos de esto no pierde nada; después baja `DECAY_PER_MONTH` por mes (con un suelo en `DECAY_FLOOR`). */
export const GRACE_DAYS = 21;
export const DECAY_PER_MONTH = 0.03;
export const DECAY_FLOOR = 0.64;
/** Lo que se ve en el radar «de hace tiempo». */
export const BEFORE_DAYS = 90;
/** Para el nivel de una barra se mira lo mejor de las últimas semanas, no una serie suelta más ligera. */
export const RECENT_DAYS = 56;
/** Resultados que hacen falta para fiarse de una categoría. */
export const RELIABLE_RESULTS = 2;
/** Categorías con datos que hacen falta para dar un número único. */
export const MIN_CATEGORIES_FOR_OVERALL = 3;

const POWER_KEYS: (keyof PersonalRecords)[] = ['backSquat', 'frontSquat', 'deadlift', 'benchPress', 'strictPress'];
const OLY_KEYS: (keyof PersonalRecords)[] = ['snatch', 'clean', 'cleanAndJerk'];
const LIFT_LABEL: Record<keyof PersonalRecords, string> = {
  backSquat: 'Sentadilla',
  frontSquat: 'Sentadilla frontal',
  deadlift: 'Peso muerto',
  benchPress: 'Press banca',
  strictPress: 'Press estricto',
  clean: 'Clean',
  snatch: 'Arrancada',
  cleanAndJerk: 'Dos tiempos',
};

const dayNumber = (iso: string) => Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
const daysBetween = (fromIso: string, toIso: string) => dayNumber(toIso) - dayNumber(fromIso);
const addDays = (iso: string, delta: number) => new Date((dayNumber(iso) + delta) * 86_400_000).toISOString().slice(0, 10);

/** Lo que conservas de una marca según lo vieja que sea: nada hasta 3 semanas, luego un 3 % por mes, con suelo. */
export function recency(ageDays: number): number {
  return 1 - Math.min(1 - DECAY_FLOOR, (DECAY_PER_MONTH * Math.max(0, ageDays - GRACE_DAYS)) / 30);
}

// ---------------------------------------------------------------------------------------------
// Resultados de WOD
// ---------------------------------------------------------------------------------------------

/** El resultado de un WOD como un número comparable: segundos, rondas (con las repeticiones sueltas como fracción), repeticiones o kilos. null si no se puede. */
export function resultValue(result: WodResult): number | null {
  if (result.scoreType === 'time') {
    if (result.capped) return result.capSeconds && result.capSeconds > 0 ? result.capSeconds : null;
    return parseTimeSeconds(result.value);
  }
  if (result.scoreType === 'rounds+reps') {
    const m = result.value.match(/^(\d+)(?:\+(\d+))?/);
    return m ? Number(m[1]) + Math.min(99, Number(m[2] ?? 0)) / 100 : null;
  }
  const n = Number.parseFloat(result.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const REF_UNIT: Record<LevelResult['scoreType'], 'seconds' | 'rounds' | 'reps' | null> = { time: 'seconds', 'rounds+reps': 'rounds', reps: 'reps', load: null };

/** El resultado de una parte de un WOD como `LevelResult`; null si no cuenta (no es Rx, no tiene categoría o no se puede medir). */
export function buildLevelResult(args: {
  date: string;
  part: 1 | 2;
  category: LevelResult['category'] | null;
  key: string | null;
  result: WodResult | undefined;
  rx: boolean;
  ref?: { unit: 'seconds' | 'rounds' | 'reps'; mid: number };
}): LevelResult | null {
  const { date, part, category, key, result, rx, ref } = args;
  if (!rx || !category || !key || !result) return null;
  const value = resultValue(result);
  if (value === null || value <= 0) return null;
  const useRef = ref && ref.mid > 0 && REF_UNIT[result.scoreType] === ref.unit;
  return { date, part, category, key, scoreType: result.scoreType, value, ...(useRef ? { ref: ref!.mid } : {}) };
}

/** Los bloques de una parte para clasificar un WOD de una entrada del historial: los guardados o, para un WOD de referencia o de programación, los que se reconstruyen con su id. */
function blocksOfEntry(entry: SessionHistoryEntry, part: 1 | 2): SessionBlockResult[] | null {
  if (entry.wodBlocks && entry.wodBlocks.length > 0) return entry.wodBlocks;
  if (part !== 1) return null;
  const bench = entry.movementIds.find((id) => id.startsWith('benchmark:'));
  if (entry.wodCatalogId) return [{ block: 'wod', movementId: bench ?? entry.movementIds[0] ?? 'thruster', wodCatalogId: entry.wodCatalogId }];
  if (bench) return [{ block: 'wod', movementId: bench }];
  if (entry.wodLibraryId) return [{ block: 'wod', movementId: entry.movementIds[0] ?? 'thruster', wodLibraryId: entry.wodLibraryId }];
  return null;
}

/** Los resultados de una entrada del historial que cuentan para «Tu nivel» (con la categoría guardada o, si no hay, clasificando de nuevo con tus marcas de hoy). */
export function levelResultsOfEntry(entry: SessionHistoryEntry, prs: Partial<PersonalRecords>): LevelResult[] {
  if (entry.levelResults && entry.levelResults.length > 0) return entry.levelResults;
  const out: LevelResult[] = [];
  const rx = entry.rxOrScaled === 'rx';
  for (const part of [1, 2] as const) {
    const result = part === 1 ? entry.wodResult : entry.wodResult2;
    if (!result || (entry.skipped ?? []).some((s) => s.block === 'wod' && (s.part ?? 1) === part)) continue;
    let category: LevelResult['category'] | null = entry.wodCategories?.[part] ?? null;
    if (!category) {
      const blocks = blocksOfEntry(entry, part);
      if (blocks) category = classifyWodBlocks(blocks, { prs }, part).category;
    }
    const key = part === 1 ? historyWodKey(entry) : entry.wodBlocks ? wodKeyOfBlocks(entry.wodBlocks, 2) : null;
    const base = part === 1 ? entry.wodTargetBase : undefined;
    const r = buildLevelResult({ date: entry.date, part, category, key: key ?? `${entry.date}|${part}`, result, rx, ...(base ? { ref: { unit: base.unit, mid: base.mid } } : {}) });
    if (r) out.push(r);
  }
  return out;
}

/** Todos los resultados conocidos: el registro largo y los del historial que aún no estén en él. */
export function allLevelResults(profile: AthleteProfile, history: SessionHistoryEntry[]): LevelResult[] {
  const byId = new Map<string, LevelResult>();
  for (const e of history) for (const r of levelResultsOfEntry(e, profile.prs)) byId.set(`${r.date}|${r.part}`, r);
  for (const r of profile.levelLog ?? []) byId.set(`${r.date}|${r.part}`, r);
  return [...byId.values()];
}

/** Lo bien que va un WOD (0-1): el último resultado frente a tu mejor marca de ese mismo WOD; con uno solo, frente a lo que el motor estimaba (o 1 si no había estimación). */
function wodRelative(group: LevelResult[]): number {
  const lowerIsBetter = group[0].scoreType === 'time';
  const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.part - b.part);
  const last = sorted[sorted.length - 1];
  const better = (a: number, b: number) => (lowerIsBetter ? a < b : a > b);
  const best = sorted.reduce((acc, r) => (better(r.value, acc) ? r.value : acc), sorted[0].value);
  if (sorted.length >= 2) return Math.min(1, lowerIsBetter ? best / last.value : last.value / best);
  if (last.ref) return Math.min(1, lowerIsBetter ? last.ref / last.value : last.value / last.ref);
  return 1;
}

// ---------------------------------------------------------------------------------------------
// Marcas de barra
// ---------------------------------------------------------------------------------------------

interface LiftMark {
  key: keyof PersonalRecords;
  date: string;
  kg: number;
}

/** Una serie de trabajo como marca: su 1RM estimado (Epley), solo con series de 1 a 8 repeticiones. */
function estimate1rm(kg: number, reps: number): number | null {
  if (!(kg > 0) || reps < 1 || reps > 8) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

/** Las marcas de barra con fecha: los cambios de PR anotados, los tests y lo mejor de cada día de entreno. Sin ninguna anotada para una barra, el PR actual cuenta desde el alta. */
export function liftMarks(profile: AthleteProfile, history: SessionHistoryEntry[]): LiftMark[] {
  const marks: LiftMark[] = [];
  const keys = new Set<string>([...POWER_KEYS, ...OLY_KEYS]);
  for (const l of profile.prLog ?? []) if (keys.has(l.key) && l.kg > 0) marks.push({ key: l.key as keyof PersonalRecords, date: l.date, kg: l.kg });
  for (const e of history) {
    if (e.testLoadKg == null || e.testLoadKg <= 0) continue;
    for (const id of e.movementIds) {
      if (id.startsWith('benchmark:')) continue;
      const m = getMovementById(id);
      const k = m && (resolveStrengthPRKey(m) ?? resolveOlyPRKey(m));
      if (k && keys.has(k)) marks.push({ key: k, date: e.date, kg: e.testLoadKg });
    }
  }
  const bestPerDay = new Map<string, LiftMark>();
  for (const s of profile.workLog ?? []) {
    if (s.quality === 'fallada') continue;
    const m = getMovementById(s.movementId);
    const root = m && (STRENGTH_ROOT_PR_MAP[m.id] ?? OLY_ROOT_PR_MAP[m.id]);
    if (!root || !keys.has(root)) continue;
    const est = estimate1rm(s.kg, s.reps);
    if (est === null) continue;
    const id = `${root}|${s.date}`;
    if (!bestPerDay.has(id) || est > bestPerDay.get(id)!.kg) bestPerDay.set(id, { key: root, date: s.date, kg: est });
  }
  marks.push(...bestPerDay.values());
  const have = new Set(marks.map((m) => m.key));
  const since = profile.onboardedAt ? profile.onboardedAt.slice(0, 10) : null;
  if (since) for (const k of [...POWER_KEYS, ...OLY_KEYS]) if (!have.has(k) && profile.prs[k] > 0) marks.push({ key: k, date: since, kg: profile.prs[k] });
  return marks;
}

/** El nivel de una barra (0-1) a una fecha: lo mejor de las últimas semanas frente a tu mejor marca de 12 meses, con el desgaste del tiempo. null sin marcas. */
function liftLevel(marks: LiftMark[], key: keyof PersonalRecords, asOf: string): { level: number; kg: number; best: number; age: number } | null {
  const window = marks.filter((m) => m.key === key && m.date <= asOf && daysBetween(m.date, asOf) <= WINDOW_DAYS);
  if (window.length === 0) return null;
  const best = Math.max(...window.map((m) => m.kg));
  const recent = window.filter((m) => daysBetween(m.date, asOf) <= RECENT_DAYS);
  const pool = recent.length > 0 ? recent : [window.reduce((a, b) => (b.date > a.date ? b : a))];
  const top = pool.reduce((a, b) => (b.kg > a.kg ? b : a));
  const age = daysBetween(top.date, asOf);
  return { level: Math.min(1, top.kg / best) * recency(age), kg: top.kg, best, age };
}

// ---------------------------------------------------------------------------------------------
// El nivel de cada categoría
// ---------------------------------------------------------------------------------------------

export type LevelConfidence = 'sin-datos' | 'provisional' | 'fiable';

export interface CategoryLevel {
  key: LevelKey;
  label: string;
  /** 0-100; null sin datos. */
  score: number | null;
  /** Lo mismo hace `BEFORE_DAYS` días. */
  before: number | null;
  /** Cambio frente a entonces (null si falta alguno de los dos). */
  delta: number | null;
  confidence: LevelConfidence;
  /** Resultados que hay detrás (barras con marca, o WODs). */
  results: number;
  /** Una línea con lo que hay detrás. */
  detail: string;
  /** Lo que falta para fiarse, si falta algo. */
  need: string | null;
}

export interface LevelSnapshot {
  categories: CategoryLevel[];
  /** Media de las categorías con datos (sin la constancia); null con menos de `MIN_CATEGORIES_FOR_OVERALL`. */
  overall: number | null;
  overallBefore: number | null;
  delta: number | null;
  /** Cuántas categorías tienen datos. */
  filled: number;
  /** La constancia de las últimas 8 semanas (%), aparte: no entra en el nivel. */
  consistencyPct: number | null;
}

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const round = (x: number) => Math.round(x);

function confidenceOf(results: number): LevelConfidence {
  return results === 0 ? 'sin-datos' : results >= RELIABLE_RESULTS ? 'fiable' : 'provisional';
}

function barScore(marks: LiftMark[], keys: (keyof PersonalRecords)[], asOf: string): { score: number; lifts: { key: keyof PersonalRecords; level: number }[] } | null {
  const lifts = keys.flatMap((key) => {
    const l = liftLevel(marks, key, asOf);
    return l ? [{ key, level: l.level }] : [];
  });
  if (lifts.length === 0) return null;
  return { score: round(100 * mean(lifts.map((l) => l.level))), lifts };
}

function wodScore(results: LevelResult[], category: WodCategory, asOf: string): { score: number; count: number; last: string } | null {
  const mine = results.filter((r) => r.category === category && r.date <= asOf && daysBetween(r.date, asOf) <= WINDOW_DAYS);
  if (mine.length === 0) return null;
  const groups = new Map<string, LevelResult[]>();
  for (const r of mine) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  const levels = [...groups.values()].map((g) => {
    const lastDate = g.reduce((d, r) => (r.date > d ? r.date : d), g[0].date);
    return wodRelative(g) * recency(daysBetween(lastDate, asOf));
  });
  return { score: round(100 * mean(levels)), count: mine.length, last: mine.reduce((d, r) => (r.date > d ? r.date : d), mine[0].date) };
}

const agoText = (days: number) => (days <= 0 ? 'hoy' : days === 1 ? 'ayer' : days < 14 ? `hace ${days} días` : days < 60 ? `hace ${Math.round(days / 7)} semanas` : `hace ${Math.round(days / 30)} meses`);

/** La foto de «Tu nivel» de hoy y de hace 3 meses. */
export function computeLevel(input: { profile: AthleteProfile; history: SessionHistoryEntry[]; today?: Date }): LevelSnapshot {
  const { profile, history } = input;
  const today = input.today ?? new Date();
  const todayIso = toLocalIsoDate(today);
  const beforeIso = addDays(todayIso, -BEFORE_DAYS);
  const marks = liftMarks(profile, history);
  const results = allLevelResults(profile, history);

  const categories: CategoryLevel[] = LEVEL_ORDER.map((key): CategoryLevel => {
    const label = LEVEL_LABEL[key];
    if (key === 'power-lifts' || key === 'olimpicos') {
      const keys = key === 'power-lifts' ? POWER_KEYS : OLY_KEYS;
      const now = barScore(marks, keys, todayIso);
      const before = barScore(marks, keys, beforeIso);
      const count = now?.lifts.length ?? 0;
      const missing = keys.filter((k) => !now?.lifts.some((l) => l.key === k)).map((k) => LIFT_LABEL[k].toLowerCase());
      return {
        key,
        label,
        score: now?.score ?? null,
        before: before?.score ?? null,
        delta: now && before ? now.score - before.score : null,
        confidence: confidenceOf(count),
        results: count,
        detail: now ? now.lifts.map((l) => `${LIFT_LABEL[l.key]} ${round(100 * l.level)}`).join(' · ') : 'Sin marcas',
        need: count === 0 ? 'Anota tus marcas de barra en Objetivos.' : count < RELIABLE_RESULTS ? `Te falta una marca más (${missing[0]}).` : null,
      };
    }
    const now = wodScore(results, key, todayIso);
    const before = wodScore(results, key, beforeIso);
    const count = now?.count ?? 0;
    return {
      key,
      label,
      score: now?.score ?? null,
      before: before?.score ?? null,
      delta: now && before ? now.score - before.score : null,
      confidence: confidenceOf(count),
      results: count,
      detail: now ? `${count} ${count === 1 ? 'resultado' : 'resultados'} · el último ${agoText(daysBetween(now.last, todayIso))}` : 'Aún sin resultados',
      need: count === 0 ? `Hace falta un WOD de ${label.toLowerCase()} hecho en Rx.` : count < RELIABLE_RESULTS ? 'Te falta un resultado más para fiarme.' : null,
    };
  });

  const scored = categories.filter((c) => c.score !== null);
  const overall = scored.length >= MIN_CATEGORIES_FOR_OVERALL ? round(mean(scored.map((c) => c.score!))) : null;
  // Hace 3 meses se compara con las mismas categorías de hoy, para que un cambio de categorías con datos no parezca una mejora.
  const common = scored.filter((c) => c.before !== null);
  const overallBefore = common.length >= MIN_CATEGORIES_FOR_OVERALL ? round(mean(common.map((c) => c.before!))) : null;
  const overallNow = common.length >= MIN_CATEGORIES_FOR_OVERALL ? round(mean(common.map((c) => c.score!))) : null;
  const consistency = computeYearConsistency(profile, history, today, { windowDays: 56 });
  return {
    categories,
    overall,
    overallBefore,
    delta: overallNow !== null && overallBefore !== null ? overallNow - overallBefore : null,
    filled: scored.length,
    consistencyPct: consistency.pct,
  };
}

// ---------------------------------------------------------------------------------------------
// Qué categoría de WOD le falta al atleta (lo que el coach intenta completar)
// ---------------------------------------------------------------------------------------------

/** Una categoría vista hace menos de esto no se vuelve a pedir (ni se pide otra vez la que ya salió esta semana). */
export const NEED_PAUSE_DAYS = 7;
/** Una categoría fiable sin resultados desde hace más de esto vuelve a faltar (se desgasta y conviene refrescarla). */
export const STALE_DAYS = 56;

export interface WodNeed {
  category: WodCategory;
  /** completar: tiene un solo resultado y falta el segundo; estrenar: aún ninguno; repetir: lleva mucho sin resultados. */
  kind: 'completar' | 'estrenar' | 'repetir';
  /** Id de catálogo del WOD que ya hiciste en esa categoría: repetirlo da el segundo resultado comparable. */
  repeatCatalogId?: string;
  /** Una frase para la nota del WOD y para Rex. */
  reason: string;
}

const WOD_CATEGORIES: WodCategory[] = ['velocidad', 'resistencia', 'peso-corporal', 'pesado', 'ligero', 'largo'];

/** La clave de un resultado como id de catálogo, si lo es (para volver a ponerlo). */
function catalogIdOfKey(key: string): string | undefined {
  if (key.startsWith('benchmark:')) return `bm:${key.slice('benchmark:'.length)}`;
  return key.startsWith('bm:') || key.startsWith('lib:') ? key : undefined;
}

/** La categoría de cada parte de una entrada del historial, con la guardada o clasificando de nuevo. */
function categoryOfEntryPart(e: SessionHistoryEntry, part: 1 | 2, prs: Partial<PersonalRecords>): LevelResult['category'] | null {
  const stored = e.wodCategories?.[part];
  if (stored) return stored;
  const blocks = blocksOfEntry(e, part);
  return blocks ? classifyWodBlocks(blocks, { prs }, part).category : null;
}

/**
 * La categoría de WOD que más conviene completar hoy, o null: primero la que tiene un solo resultado (el segundo la hace fiable), luego la que no tiene ninguno y, por último,
 * la que lleva más de `STALE_DAYS` sin resultados. No se pide una categoría que ya salió en los últimos `NEED_PAUSE_DAYS` días, y mientras no tengas ningún resultado de WOD
 * (empezando) no se empuja nada: el coach programa como siempre. Solo sugiere: el coach lo usa como un pequeño empujón al elegir el WOD (`engine/wodSelection.ts`).
 */
export function wodCategoryNeed(profile: AthleteProfile, history: SessionHistoryEntry[], todayIso: string): WodNeed | null {
  const results = allLevelResults(profile, history);
  if (results.length === 0) return null;
  const since = addDays(todayIso, -NEED_PAUSE_DAYS);
  const served = new Set<string>();
  for (const e of history) {
    if (e.date < since || e.date > todayIso) continue;
    for (const part of [1, 2] as const) {
      const c = (part === 1 ? e.wodResult : e.wodResult2) ? categoryOfEntryPart(e, part, profile.prs) : null;
      if (c) served.add(c);
    }
  }
  const mine = (c: WodCategory) => results.filter((r) => r.category === c && daysBetween(r.date, todayIso) <= WINDOW_DAYS).sort((a, b) => b.date.localeCompare(a.date));
  const label = (c: WodCategory) => WOD_CATEGORY_LABEL[c].toLowerCase();
  const open = WOD_CATEGORIES.filter((c) => !served.has(c));
  const one = open.find((c) => mine(c).length === 1);
  if (one) {
    const only = mine(one)[0];
    const repeat = catalogIdOfKey(only.key);
    return {
      category: one,
      kind: 'completar',
      ...(repeat ? { repeatCatalogId: repeat } : {}),
      reason: `Solo tienes un resultado de ${label(one)}: otro WOD de ese tipo hace fiable tu nivel.`,
    };
  }
  const none = open.find((c) => mine(c).length === 0);
  if (none) return { category: none, kind: 'estrenar', reason: `Aún no tienes ningún WOD de ${label(none)} en tu nivel: hoy toca uno.` };
  const stale = open
    .map((c) => ({ c, last: mine(c)[0]?.date }))
    .filter((x): x is { c: WodCategory; last: string } => Boolean(x.last) && daysBetween(x.last!, todayIso) > STALE_DAYS)
    .sort((a, b) => a.last.localeCompare(b.last))[0];
  if (stale) return { category: stale.c, kind: 'repetir', reason: `Llevas ${Math.round(daysBetween(stale.last, todayIso) / 7)} semanas sin un WOD de ${label(stale.c)}: se te desgasta en tu nivel.` };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Evolución y últimos entrenos de cada categoría
// ---------------------------------------------------------------------------------------------

/** Cuántos meses atrás llega la evolución de cada categoría. */
export const SERIES_MONTHS = 12;

/** La nota de cada categoría en los últimos 12 meses, mes a mes (de hace 11 meses hasta hoy; null donde no había datos). */
export function levelSeries(input: { profile: AthleteProfile; history: SessionHistoryEntry[]; today?: Date }): Record<LevelKey, (number | null)[]> {
  const today = input.today ?? new Date();
  const out = Object.fromEntries(LEVEL_ORDER.map((k) => [k, [] as (number | null)[]])) as Record<LevelKey, (number | null)[]>;
  const baseIso = toLocalIsoDate(today);
  for (let m = SERIES_MONTHS - 1; m >= 0; m--) {
    const at = new Date(`${addDays(baseIso, -30 * m)}T12:00:00`);
    const snap = computeLevel({ profile: input.profile, history: input.history, today: at });
    for (const c of snap.categories) out[c.key].push(c.score);
  }
  return out;
}

/** Un entreno reciente de una categoría: qué fue, qué hiciste, cómo quedó frente a tu mejor marca y si cuenta para el nivel. */
export interface RecentItem {
  date: string;
  title: string;
  /** Lo que hiciste («6:12», «120 kg × 5», «8+12»). */
  value: string;
  /** Frente a tu mejor marca de eso («tu mejor marca», «+8 % más lento», «92 % de tu mejor»), o null. */
  vs: string | null;
  /** Cuenta para el nivel (un WOD escalado no). */
  counts: boolean;
  note: string | null;
}

/** El nombre de un WOD a partir de su clave (la del modo fantasma): el del benchmark o del catálogo, o los movimientos de uno generado. */
export function wodTitleOfKey(key: string): string {
  if (key.startsWith('benchmark:')) {
    const id = key.slice('benchmark:'.length);
    return benchmarkWorkouts.find((w) => w.id === id)?.name ?? id;
  }
  if (key.startsWith('bm:') || key.startsWith('lib:')) return getCatalogWod(key)?.name ?? key.replace(/^(bm|lib):/, '');
  if (key.startsWith('gen:')) {
    const [format, list = ''] = key.slice(4).split('|');
    const names = list
      .split(',')
      .map((s) => s.replace(/x\d.*$/, ''))
      .map((id) => getMovementById(id)?.name)
      .filter((n): n is string => Boolean(n));
    const uniq = [...new Set(names)].slice(0, 3);
    return uniq.length > 0 ? `${uniq.join(', ')}${format ? ` · ${format}` : ''}` : format || 'WOD';
  }
  return key;
}

const secText = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
function valueText(r: LevelResult): string {
  if (r.scoreType === 'time') return secText(r.value);
  if (r.scoreType === 'rounds+reps') {
    const rounds = Math.floor(r.value);
    const extra = Math.round((r.value - rounds) * 100);
    return extra > 0 ? `${rounds}+${extra}` : `${rounds}`;
  }
  return r.scoreType === 'reps' ? `${Math.round(r.value)} reps` : `${Math.round(r.value)} kg`;
}

/** Cómo quedó un resultado frente a tus resultados anteriores del mismo WOD. */
function versusEarlier(r: LevelResult, all: LevelResult[]): string | null {
  const earlier = all.filter((x) => x.key === r.key && x.date < r.date);
  if (earlier.length === 0) return 'primera vez';
  const lowerIsBetter = r.scoreType === 'time';
  const best = earlier.reduce((b, x) => ((lowerIsBetter ? x.value < b : x.value > b) ? x.value : b), earlier[0].value);
  const better = lowerIsBetter ? r.value <= best : r.value >= best;
  if (better) return 'tu mejor marca';
  const pct = Math.round(Math.abs(r.value / best - 1) * 100);
  return pct === 0 ? 'como tu mejor marca' : lowerIsBetter ? `${pct} % más lento que tu mejor` : `${pct} % menos que tu mejor`;
}

/**
 * Los últimos entrenos de una categoría (hasta `n`, de más reciente a más antiguo). Las de WOD: los resultados en Rx del registro largo y del historial, más los entrenos
 * clasificados que no cuentan (escalados), para entender por qué no se mueve. Las de barra: tus mejores series de cada día (con su 1RM estimado frente a tu mejor marca) y tus tests.
 */
export function recentOfCategory(input: { profile: AthleteProfile; history: SessionHistoryEntry[]; key: LevelKey; n?: number }): RecentItem[] {
  const { profile, history, key } = input;
  const n = input.n ?? 3;
  if (key === 'power-lifts' || key === 'olimpicos') {
    const keys = new Set<string>(key === 'power-lifts' ? POWER_KEYS : OLY_KEYS);
    const marks = liftMarks(profile, history).filter((m) => keys.has(m.key));
    const sets: { date: string; lift: keyof PersonalRecords; kg: number; reps: number; est: number; test: boolean }[] = [];
    for (const s of profile.workLog ?? []) {
      const m = getMovementById(s.movementId);
      const root = m && (STRENGTH_ROOT_PR_MAP[m.id] ?? OLY_ROOT_PR_MAP[m.id]);
      if (!root || !keys.has(root) || s.quality === 'fallada') continue;
      const est = estimate1rm(s.kg, s.reps);
      if (est === null) continue;
      const cur = sets.find((x) => x.date === s.date && x.lift === root);
      if (!cur) sets.push({ date: s.date, lift: root, kg: s.kg, reps: s.reps, est, test: false });
      else if (est > cur.est) Object.assign(cur, { kg: s.kg, reps: s.reps, est });
    }
    for (const e of history) {
      if (e.testLoadKg == null || e.testLoadKg <= 0) continue;
      for (const id of e.movementIds) {
        const m = id.startsWith('benchmark:') ? undefined : getMovementById(id);
        const k = m && (resolveStrengthPRKey(m) ?? resolveOlyPRKey(m));
        if (k && keys.has(k) && !sets.some((x) => x.date === e.date && x.lift === k && x.test)) sets.push({ date: e.date, lift: k, kg: e.testLoadKg, reps: 1, est: e.testLoadKg, test: true });
      }
    }
    return sets
      .sort((a, b) => b.date.localeCompare(a.date) || b.est - a.est)
      .slice(0, n)
      .map((s) => {
        const best = Math.max(...marks.filter((m) => m.key === s.lift && m.date <= s.date).map((m) => m.kg), s.est);
        const pct = Math.round((s.est / best) * 100);
        return {
          date: s.date,
          title: LIFT_LABEL[s.lift] + (s.test ? ' · test' : ''),
          value: `${Math.round(s.kg * 10) / 10} kg × ${s.reps}`,
          vs: pct >= 100 ? 'tu mejor marca' : `${pct} % de tu mejor`,
          counts: true,
          note: s.reps > 1 ? `1RM estimado ~${Math.round(s.est)} kg` : null,
        };
      });
  }

  // WODs: los que cuentan (Rx) y los clasificados que no cuentan.
  const counted = allLevelResults(profile, history);
  // Un WOD generado tiene nombre propio en el historial («Tormenta Salvaje»); el resto, el de su clave.
  const titleByDate = new Map<string, string>();
  for (const e of history) for (const part of [1, 2] as const) {
    const blocks = e.wodBlocks?.filter((b) => (b.wodPart ?? 1) === part && b.title);
    if (blocks && blocks.length > 0) titleByDate.set(`${e.date}|${part}`, blocks[0].title!);
  }
  const items: RecentItem[] = counted
    .filter((r) => r.category === key)
    .map((r) => ({ date: r.date, title: titleByDate.get(`${r.date}|${r.part}`) ?? wodTitleOfKey(r.key), value: valueText(r), vs: versusEarlier(r, counted), counts: true, note: null }));
  const have = new Set(counted.filter((r) => r.category === key).map((r) => `${r.date}|${r.part}`));
  for (const e of history) {
    for (const part of [1, 2] as const) {
      const result = part === 1 ? e.wodResult : e.wodResult2;
      if (!result || have.has(`${e.date}|${part}`) || (e.skipped ?? []).some((s) => s.block === 'wod' && (s.part ?? 1) === part)) continue;
      let category: LevelResult['category'] | null = e.wodCategories?.[part] ?? null;
      if (!category) {
        const blocks = blocksOfEntry(e, part);
        if (blocks) category = classifyWodBlocks(blocks, { prs: profile.prs }, part).category;
      }
      if (category !== key) continue;
      const k = part === 1 ? historyWodKey(e) : null;
      items.push({ date: e.date, title: k ? wodTitleOfKey(k) : (e.wodBlocks?.[0]?.title ?? 'WOD'), value: result.value, vs: null, counts: false, note: e.rxOrScaled === 'rx' ? 'No cuenta: no se pudo medir' : 'Escalado: no cuenta' });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}
