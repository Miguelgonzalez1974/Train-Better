import type { PainArea, PainFlag } from '../data/athlete/types';
import type { MovementPattern } from '../data/movements/types';

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

/** Avisos vigentes hoy — filtra los caducados (until pasado) sin necesidad de borrarlos del perfil todavia. */
export function getActivePainFlags(painFlags: PainFlag[] | undefined, todayIso: string): PainFlag[] {
  return (painFlags ?? []).filter((f) => f.until === null || f.until >= todayIso);
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
