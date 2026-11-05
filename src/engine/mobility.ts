import type { AthleteProfile, DailySession, MobilityLogEntry, MobilityPurpose, MobilityRating, PainArea, SoreZoneId } from '../data/athlete/types';
import { MOBILITY_LIBRARY, MOBILITY_ZONE_LABEL, type MobilityExercise, type MobilityKind, type MobilityZone } from '../data/mobility';
import { getMovementById } from '../data/movements';
import type { MovementPattern } from '../data/movements/types';
import { getActivePainFlags } from './painFlags';
import { SORE_ZONE_LABEL } from './morningCheckIn';

/**
 * Movilidad y estiramientos con Rex: qué zonas conviene trabajar hoy (lo que carga la sesión, las agujetas y las zonas que el atleta
 * quiere potenciar), una rutina armada con esos ejercicios y el registro de lo hecho. Puro: sin React ni almacenamiento.
 * Orientativo, no es fisioterapia: con un aviso de molestia activo solo propone lo suave y nada que cargue esa zona.
 */

export const PURPOSE_LABEL: Record<MobilityPurpose, string> = {
  recuperar: 'Estirar tras entrenar',
  movilidad: 'Sesión de movilidad',
  calentar: 'Calentar para hoy',
};

/** Qué tipo de ejercicio entra en cada propósito y en qué orden. Estirar fuerte justo antes de levantar pesado resta rendimiento: calentar es dinámico. */
const PURPOSE_KINDS: Record<MobilityPurpose, MobilityKind[]> = {
  recuperar: ['liberacion', 'estatico'],
  movilidad: ['dinamico', 'activacion', 'estatico'],
  calentar: ['activacion', 'dinamico'],
};

/** Las zonas con aviso de molestia que cuelgan de cada zona del cuerpo de la app. */
const PAIN_ZONES: Record<PainArea, MobilityZone[]> = {
  hombro: ['hombros', 'toracica'],
  'cadera-lumbar': ['caderas', 'isquios'],
  rodilla: ['cuadriceps', 'tobillos'],
  'codo-muneca': ['munecas'],
};

/** Las agujetas del check-in (silueta) → zona de movilidad. */
const SORE_TO_ZONE: Record<SoreZoneId, MobilityZone> = {
  cuello: 'cuello',
  'hombro-i': 'hombros',
  'hombro-d': 'hombros',
  'codo-i': 'munecas',
  'codo-d': 'munecas',
  lumbar: 'isquios',
  'cadera-i': 'caderas',
  'cadera-d': 'caderas',
  'muslo-i': 'cuadriceps',
  'muslo-d': 'cuadriceps',
  'gemelo-i': 'tobillos',
  'gemelo-d': 'tobillos',
};

/** Qué zonas pide cada patrón de movimiento de la sesión, y cómo se dice en una frase. */
const PATTERN_ZONES: Partial<Record<MovementPattern, { zones: MobilityZone[]; text: string }>> = {
  squat: { zones: ['caderas', 'tobillos'], text: 'sentadillas' },
  lunge: { zones: ['caderas', 'cuadriceps'], text: 'zancadas' },
  hinge: { zones: ['isquios', 'caderas'], text: 'peso muerto' },
  horizontalPush: { zones: ['hombros', 'toracica'], text: 'empujes' },
  verticalPush: { zones: ['hombros', 'toracica'], text: 'empujes por encima de la cabeza' },
  horizontalPull: { zones: ['hombros', 'toracica'], text: 'tirones' },
  verticalPull: { zones: ['hombros', 'toracica'], text: 'dominadas' },
  olyLift: { zones: ['hombros', 'toracica', 'caderas'], text: 'halterofilia' },
  gymnastics: { zones: ['hombros', 'munecas'], text: 'gimnásticos' },
  impact: { zones: ['tobillos', 'cuadriceps'], text: 'impacto' },
  jump: { zones: ['tobillos', 'cuadriceps'], text: 'saltos' },
  monostructural: { zones: ['tobillos', 'cuadriceps'], text: 'cardio' },
};

export interface ZoneSuggestion {
  zone: MobilityZone;
  /** Por qué se propone, en una frase corta ("hoy hay sentadillas"). */
  why: string;
}

export interface SuggestInput {
  /** Patrones de movimiento de la sesión de hoy (ver `sessionPatterns`). */
  patterns: MovementPattern[];
  /** Agujetas de hoy (check-in). */
  soreZones?: Partial<Record<SoreZoneId, 1 | 2>>;
  /** Zonas que el atleta quiere potenciar. */
  focus?: MobilityZone[];
}

/** Los patrones de movimiento que carga la sesión (principal y secundarios), sin repetir. */
export function sessionPatterns(session: Pick<DailySession, 'blocks'> | null | undefined): MovementPattern[] {
  const out = new Set<MovementPattern>();
  for (const b of session?.blocks ?? []) {
    if (b.block === 'warmup' || b.block === 'cooldown') continue;
    const m = getMovementById(b.movementId);
    if (!m) continue;
    out.add(m.pattern);
    for (const p of m.alsoPatterns ?? []) out.add(p);
  }
  return [...out];
}

const joinAnd = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** Las zonas que más conviene trabajar ahora (hasta 3), con el motivo: agujetas > zonas prioritarias > lo que carga la sesión. */
export function suggestMobilityZones(input: SuggestInput): ZoneSuggestion[] {
  const score = new Map<MobilityZone, number>();
  const reasons = new Map<MobilityZone, string[]>();
  const add = (zone: MobilityZone, points: number, why: string) => {
    score.set(zone, (score.get(zone) ?? 0) + points);
    const list = reasons.get(zone) ?? [];
    if (!list.includes(why)) list.push(why);
    reasons.set(zone, list);
  };

  for (const [id, level] of Object.entries(input.soreZones ?? {}) as [SoreZoneId, 1 | 2][]) {
    const zone = SORE_TO_ZONE[id];
    if (zone) add(zone, level === 2 ? 4 : 3, `agujetas en ${SORE_ZONE_LABEL[id].toLowerCase()}`);
  }
  for (const zone of input.focus ?? []) add(zone, 2, 'es una de tus zonas prioritarias');
  for (const pattern of input.patterns) {
    const info = PATTERN_ZONES[pattern];
    if (info) for (const zone of info.zones) add(zone, 1, `hoy hay ${info.text}`);
  }

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || MOBILITY_ZONE_ORDER.indexOf(a[0]) - MOBILITY_ZONE_ORDER.indexOf(b[0]))
    .slice(0, 3)
    .map(([zone]) => ({ zone, why: joinAnd((reasons.get(zone) ?? []).slice(0, 2)) }));
}

const MOBILITY_ZONE_ORDER: MobilityZone[] = ['caderas', 'hombros', 'toracica', 'isquios', 'tobillos', 'cuadriceps', 'munecas', 'cuello'];

// ---------------------------------------------------------------------------------------------------------------------
// La rutina

export interface RoutineItem {
  exercise: MobilityExercise;
  /** Segundos por lado. */
  seconds: number;
  sides: 1 | 2;
}

export interface RoutineInput {
  purpose: MobilityPurpose;
  zones: MobilityZone[];
  minutes: number;
  /** Zonas con aviso de molestia activo. */
  painAreas: PainArea[];
  /** Para variar la rutina de un día a otro (p. ej. el día del año). */
  seed?: number;
}

/** Segundos de pausa para cambiar de ejercicio. */
export const TRANSITION_SECONDS = 8;
/** Cuántos segundos se admite pasarse del tiempo pedido. */
const OVERSHOOT_SECONDS = 20;

export const itemSeconds = (it: RoutineItem) => it.seconds * it.sides + TRANSITION_SECONDS;
export const routineSeconds = (items: RoutineItem[]) => items.reduce((s, it) => s + itemSeconds(it), 0);

/** Zonas de movilidad que tienen un aviso de molestia activo. */
export function painZones(painAreas: PainArea[]): Set<MobilityZone> {
  return new Set(painAreas.flatMap((a) => PAIN_ZONES[a]));
}

/** ¿Se puede proponer este ejercicio con esos avisos? Nunca uno que cargue una zona con aviso; en zonas con aviso, solo lo suave. */
export function allowedWithPain(exercise: MobilityExercise, painAreas: PainArea[]): boolean {
  if (exercise.loads?.some((a) => painAreas.includes(a))) return false;
  const hurt = painZones(painAreas);
  if (exercise.zones.some((z) => hurt.has(z)) && !exercise.gentle) return false;
  return true;
}

/**
 * Arma la rutina: reparte el tiempo entre las zonas elegidas (un ejercicio de cada zona por turno), solo con tipos que van con el
 * propósito, sin lo que cargue una molestia activa, y los ordena (calentar: activación primero; estirar: rodillo primero).
 */
export function buildRoutine(input: RoutineInput): RoutineItem[] {
  const kinds = PURPOSE_KINDS[input.purpose];
  const seed = input.seed ?? 0;
  const pools = input.zones.map((zone) => {
    const list = MOBILITY_LIBRARY.filter((e) => e.zones[0] === zone || e.zones.includes(zone))
      .filter((e) => kinds.includes(e.kind) && allowedWithPain(e, input.painAreas))
      // Primero los que tienen esa zona como principal.
      .sort((a, b) => Number(b.zones[0] === zone) - Number(a.zones[0] === zone) || kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
    const main = list.filter((e) => e.zones[0] === zone);
    const rest = list.filter((e) => e.zones[0] !== zone);
    const rot = main.length > 0 ? seed % main.length : 0;
    return [...main.slice(rot), ...main.slice(0, rot), ...rest];
  });

  const budget = Math.max(60, input.minutes * 60);
  const picked: RoutineItem[] = [];
  const used = new Set<string>();
  let total = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const pool of pools) {
      const next = pool.find((e) => !used.has(e.id));
      if (!next) continue;
      const item: RoutineItem = { exercise: next, seconds: next.seconds, sides: next.sides };
      const cost = itemSeconds(item);
      // Siempre cabe el primero de cada zona; luego, mientras no se pase del tiempo.
      if (picked.length >= input.zones.length && total + cost > budget + OVERSHOOT_SECONDS) {
        used.add(next.id);
        continue;
      }
      used.add(next.id);
      picked.push(item);
      total += cost;
      progressed = true;
    }
  }
  return picked.sort((a, b) => kinds.indexOf(a.exercise.kind) - kinds.indexOf(b.exercise.kind));
}

// ---------------------------------------------------------------------------------------------------------------------
// La guía paso a paso

export interface Phase {
  exercise: MobilityExercise;
  /** Qué lado: 1 o 2 (en los ejercicios de un solo lado, siempre 1). */
  side: 1 | 2;
  sides: 1 | 2;
  seconds: number;
  /** Índice del ejercicio en la rutina. */
  index: number;
}

/** La rutina como una lista de fases: un ejercicio de dos lados son dos fases seguidas. */
export function expandPhases(items: RoutineItem[]): Phase[] {
  return items.flatMap((it, index) =>
    Array.from({ length: it.sides }, (_, s) => ({ exercise: it.exercise, side: (s + 1) as 1 | 2, sides: it.sides, seconds: it.seconds, index })),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Registro, zonas prioritarias y valoraciones

const LOG_LIMIT = 200;

export function withMobilityDone(profile: AthleteProfile, entry: MobilityLogEntry): AthleteProfile {
  const log = [...(profile.mobilityLog ?? []).filter((e) => e.id !== entry.id), entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-LOG_LIMIT);
  return { ...profile, mobilityLog: log };
}

/** Guarda (o quita, con una lista vacía) las zonas que el atleta quiere potenciar. */
export function withMobilityFocus(profile: AthleteProfile, zones: MobilityZone[]): AthleteProfile {
  return { ...profile, mobilityFocus: zones.length > 0 ? [...new Set(zones)] : undefined };
}

export function withMobilityRating(profile: AthleteProfile, rating: MobilityRating): AthleteProfile {
  const kept = (profile.mobilityRatings ?? []).filter((r) => !(r.date === rating.date && r.zone === rating.zone));
  return { ...profile, mobilityRatings: [...kept, rating].sort((a, b) => a.date.localeCompare(b.date)).slice(-LOG_LIMIT) };
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Lunes de la semana de `iso`. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

/** Minutos de movilidad hechos en la semana de `todayIso` (lunes a domingo). */
export function weeklyMobilityMinutes(profile: Pick<AthleteProfile, 'mobilityLog'>, todayIso: string): number {
  const monday = mondayOf(todayIso);
  return (profile.mobilityLog ?? []).filter((e) => e.date >= monday && e.date <= todayIso).reduce((s, e) => s + e.minutes, 0);
}

/**
 * Una zona prioritaria por valorar: la que se trabajó en alguna rutina anterior a hoy y aún no tiene valoración posterior. Así Rex
 * pregunta «¿cómo notas las caderas?» el día siguiente y no vuelve a preguntar hasta que se vuelva a trabajar.
 */
export function ratingDue(profile: Pick<AthleteProfile, 'mobilityLog' | 'mobilityFocus' | 'mobilityRatings'>, todayIso: string): MobilityZone | null {
  for (const zone of profile.mobilityFocus ?? []) {
    const lastDone = (profile.mobilityLog ?? []).filter((e) => e.zones.includes(zone) && e.date < todayIso).map((e) => e.date).sort().pop();
    if (!lastDone) continue;
    const lastRated = (profile.mobilityRatings ?? []).filter((r) => r.zone === zone).map((r) => r.date).sort().pop();
    if (!lastRated || lastRated < lastDone) return zone;
  }
  return null;
}

/** Cómo va una zona: la última valoración y la anterior (para decir si mejora). */
export function ratingTrend(profile: Pick<AthleteProfile, 'mobilityRatings'>, zone: MobilityZone): { last: number; previous: number | null; direction: 'mejora' | 'igual' | 'empeora' | null } | null {
  const list = (profile.mobilityRatings ?? []).filter((r) => r.zone === zone).sort((a, b) => a.date.localeCompare(b.date));
  const last = list[list.length - 1];
  if (!last) return null;
  const previous = list.length > 1 ? list[list.length - 2].value : null;
  return { last: last.value, previous, direction: previous === null ? null : last.value > previous ? 'mejora' : last.value < previous ? 'empeora' : 'igual' };
}

/** Los avisos de molestia activos hoy, como las zonas del cuerpo que usa la app. */
export function activePainAreas(profile: Pick<AthleteProfile, 'painFlags'>, todayIso: string): PainArea[] {
  return getActivePainFlags(profile.painFlags, todayIso).map((f) => f.area);
}

export { MOBILITY_ZONE_LABEL };
