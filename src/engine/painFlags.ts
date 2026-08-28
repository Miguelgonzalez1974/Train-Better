import type { PainArea, PainFlag } from '../data/athlete/types';
import type { MovementPattern } from '../data/movements/types';
import { isoDiffDays } from './periodization';

export const PAIN_AREA_LABEL: Record<PainArea, string> = {
  hombro: 'Hombro',
  'cadera-lumbar': 'Cadera / lumbar',
  rodilla: 'Rodilla',
  'codo-muneca': 'Codo / muñeca',
};

/** Patrones de movimiento que el motor evita mientras un aviso de esa zona este activo. */
export const PAIN_AREA_PATTERNS: Record<PainArea, MovementPattern[]> = {
  hombro: ['verticalPush', 'verticalPull', 'olyLift'],
  'cadera-lumbar': ['hinge', 'squat', 'olyLift', 'carry'],
  rodilla: ['squat', 'lunge', 'jump'],
  'codo-muneca': ['horizontalPush', 'gymnastics'],
};

export type PainDuration = 'dias' | 'semanas' | 'indefinido';

const PAIN_DURATION_DAYS: Record<PainDuration, number | null> = {
  dias: 5,
  semanas: 12,
  indefinido: null,
};

/** Calcula `until` a partir de la duracion elegida en el picker — null = hasta que el atleta lo quite a mano. */
export function resolvePainFlagUntil(createdDateIso: string, duration: PainDuration): string | null {
  const days = PAIN_DURATION_DAYS[duration];
  if (days === null) return null;
  const until = new Date(createdDateIso);
  until.setDate(until.getDate() + days);
  return until.toISOString().slice(0, 10);
}

/** Avisos vigentes hoy — filtra los caducados (until pasado) y los que el atleta ya quito (clearedDate). */
export function getActivePainFlags(painFlags: PainFlag[] | undefined, todayIso: string): PainFlag[] {
  return (painFlags ?? []).filter((f) => !f.clearedDate && (f.until === null || f.until >= todayIso));
}

/** Semanas durante las que la carga de un patron vuelve de forma progresiva tras quitar (o caducar) un aviso. */
export const PAIN_REINTRO_WEEKS = 2;
const PAIN_REINTRO_DAYS = PAIN_REINTRO_WEEKS * 7;
/** Carga inicial (fraccion del 100%) el primer dia tras el fin del aviso — sube en linea recta hasta 1.0 al final de la ventana. */
const PAIN_REINTRO_START_FACTOR = 0.6;

/** Fecha ISO en la que un aviso dejo de estar activo — el atleta lo quito (clearedDate) o caduco solo (until). */
function painFlagEndDate(flag: PainFlag): string | null {
  if (flag.clearedDate) return flag.clearedDate;
  return flag.until; // null = indefinido, sigue activo
}

/**
 * Patrones que estan en "reintroduccion progresiva" hoy y su factor de carga (0.6 -> 1.0). Un patron
 * entra aqui cuando su aviso mas reciente termino (a mano o por caducidad) hace menos de
 * PAIN_REINTRO_WEEKS y ninguno sigue activo. Si varios avisos coinciden sobre el mismo patron, gana
 * el mas conservador (factor mas bajo). Vacio si no hay ninguno.
 */
export function getPainReintroPatterns(painFlags: PainFlag[] | undefined, todayIso: string): Map<MovementPattern, number> {
  const result = new Map<MovementPattern, number>();
  const flags = painFlags ?? [];
  const stillActive = new Set(getActivePainFlags(flags, todayIso).flatMap((f) => PAIN_AREA_PATTERNS[f.area]));

  for (const flag of flags) {
    const end = painFlagEndDate(flag);
    if (!end) continue;
    const daysSinceEnd = isoDiffDays(end, todayIso);
    if (daysSinceEnd < 0 || daysSinceEnd >= PAIN_REINTRO_DAYS) continue;

    const factor = PAIN_REINTRO_START_FACTOR + (1 - PAIN_REINTRO_START_FACTOR) * (daysSinceEnd / PAIN_REINTRO_DAYS);
    for (const pattern of PAIN_AREA_PATTERNS[flag.area]) {
      if (stillActive.has(pattern)) continue; // otro aviso de la misma zona aun activo: se evita, no se reintroduce
      result.set(pattern, Math.min(result.get(pattern) ?? 1, factor));
    }
  }
  return result;
}

/** Factor de carga (<= 1) a aplicar hoy dado el/los patron(es) implicados — el mas conservador entre ellos, o 1 si ninguno esta en reintroduccion. */
export function getPainReintroFactor(reintro: Map<MovementPattern, number>, patterns: MovementPattern[]): number {
  let factor = 1;
  for (const p of patterns) {
    const f = reintro.get(p);
    if (f !== undefined) factor = Math.min(factor, f);
  }
  return factor;
}

/**
 * Quita el conjunto de avisos que ya cerraron/caducaron hace mas de PAIN_REINTRO_WEEKS — su ventana
 * de reintroduccion tambien ha pasado, ya no influyen en nada. Se llama al guardar el perfil para
 * que la lista no crezca sin limite (los avisos activos e "indefinidos" nunca se tocan).
 */
export function prunePainFlags(painFlags: PainFlag[] | undefined, todayIso: string): PainFlag[] {
  return (painFlags ?? []).filter((f) => {
    const end = painFlagEndDate(f);
    if (!end) return true;
    return isoDiffDays(end, todayIso) < PAIN_REINTRO_DAYS;
  });
}

/** Union de patrones a evitar hoy segun los avisos activos — vacio si no hay ninguno. */
export function getAvoidedPatterns(painFlags: PainFlag[] | undefined, todayIso: string): Set<MovementPattern> {
  const active = getActivePainFlags(painFlags, todayIso);
  const patterns = active.flatMap((f) => PAIN_AREA_PATTERNS[f.area]);
  return new Set(patterns);
}

/** Filtra un pool de movimientos evitando los patrones marcados — si el filtro lo deja vacio, cae al pool completo (nunca bloquea la sesion). */
export function filterAvoidingPain<T extends { pattern: MovementPattern }>(pool: T[], avoided: Set<MovementPattern>): T[] {
  if (avoided.size === 0) return pool;
  const filtered = pool.filter((m) => !avoided.has(m.pattern));
  return filtered.length > 0 ? filtered : pool;
}
