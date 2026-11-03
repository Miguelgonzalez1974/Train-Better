import type { DailySession, SkippedPart, SkipReason } from '../data/athlete/types';
import { getMovementById } from '../data/movements';

/**
 * Qué partes tiene una sesión y cuáles no se hicieron. Al cerrar la sesión el atleta puede marcar una parte como "No" (y por qué):
 * esa parte se quita de lo que se anota en el historial (movimientos, formato y resultado del WOD) y queda guardada en
 * `SessionHistoryEntry.skipped` para contarlo en el Resumen. Todo viene como hecho por defecto.
 */

export type PartKey = 'strength' | 'oly' | 'wod1' | 'wod2' | 'accessory' | 'skill';

export interface SessionPart {
  key: PartKey;
  /** Cómo se llama en la fila del cierre de sesión ("Fuerza · Sentadilla", "WOD · parte 2"). */
  label: string;
}

/** Las partes que no se hicieron, por clave; `reason` es opcional. */
export type Skips = Partial<Record<PartKey, { reason?: SkipReason }>>;

export const SKIP_REASONS: SkipReason[] = ['molestia', 'cansancio', 'competicion', 'tiempo', 'otro'];

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  molestia: 'Molestia',
  cansancio: 'Cansancio',
  competicion: 'Competición',
  tiempo: 'Sin tiempo',
  otro: 'Otro',
};

const BLOCK_ORDER: PartKey[] = ['strength', 'oly', 'wod1', 'wod2', 'accessory', 'skill'];

function keyOf(block: DailySession['blocks'][number]): PartKey | null {
  switch (block.block) {
    case 'strength':
    case 'oly':
    case 'accessory':
    case 'skill':
      return block.block;
    case 'wod':
      return (block.wodPart ?? 1) === 2 ? 'wod2' : 'wod1';
    default:
      return null; // calentamiento y vuelta a la calma no se preguntan
  }
}

/** Las partes por las que se pregunta al cerrar la sesión (vacío en un día de descanso o una sesión propia). */
export function sessionParts(session: DailySession): SessionPart[] {
  if (session.isRestDay || session.source === 'custom') return [];
  const present = new Set<PartKey>();
  for (const b of session.blocks) {
    const k = keyOf(b);
    if (k) present.add(k);
  }
  const double = present.has('wod2');
  const nameOf = (key: 'strength' | 'oly') => {
    const b = session.blocks.find((x) => x.block === key && !x.subgroup) ?? session.blocks.find((x) => x.block === key);
    return b ? (b.complex?.name ?? getMovementById(b.movementId)?.name) : undefined;
  };
  return BLOCK_ORDER.filter((k) => present.has(k)).map((key) => {
    switch (key) {
      case 'strength':
        return { key, label: nameOf('strength') ? `Fuerza · ${nameOf('strength')}` : 'Fuerza' };
      case 'oly':
        return { key, label: nameOf('oly') ? `Oly · ${nameOf('oly')}` : 'Oly' };
      case 'wod1':
        return { key, label: double ? 'WOD · parte 1' : 'WOD' };
      case 'wod2':
        return { key, label: 'WOD · parte 2' };
      case 'accessory':
        return { key, label: 'Accesorio' };
      default:
        return { key, label: 'Técnica (skill)' };
    }
  });
}

/** La sesión sin las partes que no se hicieron: es la que se pasa a `toHistoryEntry` para que el historial solo recoja lo hecho. */
export function applySkips(session: DailySession, skips: Skips): DailySession {
  if (Object.keys(skips).length === 0) return session;
  const blocks = session.blocks.filter((b) => {
    const k = keyOf(b);
    return !(k && skips[k]);
  });
  // Sin WOD ese día, el sistema energético que el coach le puso al WOD tampoco cuenta.
  const wodLeft = blocks.some((b) => b.block === 'wod');
  return { ...session, blocks, ...(wodLeft ? {} : { energySystem: undefined }) };
}

/** Las partes no hechas como se guardan en el historial. */
export function skippedParts(skips: Skips): SkippedPart[] {
  return BLOCK_ORDER.filter((k) => skips[k]).map((k) => {
    const reason = skips[k]?.reason;
    const base: SkippedPart = k === 'wod1' ? { block: 'wod', part: 1 } : k === 'wod2' ? { block: 'wod', part: 2 } : { block: k };
    return reason ? { ...base, reason } : base;
  });
}

const PART_NOUN = (p: SkippedPart, double: boolean): string => {
  switch (p.block) {
    case 'strength':
      return 'la fuerza';
    case 'oly':
      return 'el oly';
    case 'wod':
      return double ? `el WOD (parte ${p.part ?? 1})` : 'el WOD';
    case 'accessory':
      return 'el accesorio';
    default:
      return 'la técnica';
  }
};

const REASON_PHRASE: Record<SkipReason, string> = {
  molestia: 'por la molestia',
  cansancio: 'por el cansancio',
  competicion: 'pensando en la competición',
  tiempo: 'por falta de tiempo',
  otro: '',
};

/** "Sin el WOD, por la molestia." — null si no se saltó nada. Si los motivos son distintos o no hay motivo, no se nombra ninguno. */
export function describeSkipped(skipped: SkippedPart[] | undefined): string | null {
  if (!skipped || skipped.length === 0) return null;
  const double = skipped.filter((p) => p.block === 'wod').length > 1;
  const nouns = skipped.map((p) => PART_NOUN(p, double));
  const list = nouns.length === 1 ? nouns[0] : `${nouns.slice(0, -1).join(', ')} y ${nouns[nouns.length - 1]}`;
  const reasons = [...new Set(skipped.map((p) => p.reason))];
  const phrase = reasons.length === 1 && reasons[0] ? REASON_PHRASE[reasons[0]] : '';
  return `Sin ${list}${phrase ? `, ${phrase}` : ''}.`;
}
