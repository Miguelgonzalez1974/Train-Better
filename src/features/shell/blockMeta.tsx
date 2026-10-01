import { Flame, Dumbbell, Zap, Trophy, Layers, Star, Wind, type LucideIcon } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { DailySession } from '../../data/athlete/types';

/**
 * Icono y color de cada bloque de sesión — fuente única para la tarjeta de un bloque (Planificación)
 * y para cualquier resumen compacto que quiera hablar el mismo lenguaje visual (p.ej. el titular de
 * "hoy" del Dashboard) sin arrastrar el resto de Planificación a su chunk.
 */
export type Accent = 'orange' | 'gold' | 'neutral';

export const ACCENT_CLASSES: Record<Accent, { icon: string; bar: string }> = {
  orange: { icon: 'text-brand-orange', bar: 'bg-brand-orange/50' },
  gold: { icon: 'text-brand-gold', bar: 'bg-brand-gold/45' },
  neutral: { icon: 'text-neutral-400', bar: 'bg-white/15' },
};

export const BLOCK_META: Record<Block, { label: string; Icon: LucideIcon; accent: Accent }> = {
  warmup: { label: 'Calentamiento', Icon: Flame, accent: 'gold' },
  strength: { label: 'Fuerza', Icon: Dumbbell, accent: 'orange' },
  wod: { label: 'WOD', Icon: Zap, accent: 'gold' },
  oly: { label: 'Oly', Icon: Trophy, accent: 'orange' },
  accessory: { label: 'Accesorio', Icon: Layers, accent: 'gold' },
  skill: { label: 'Skill', Icon: Star, accent: 'orange' },
  cooldown: { label: 'Vuelta a la calma', Icon: Wind, accent: 'neutral' },
};

/** Orden de bloques, igual que `BLOCK_ORDER` en `DaySessionBlocks.tsx` (duplicado a propósito: ese
 * archivo sí tira de toda la tarjeta de sesión, esto es solo el orden, nada más). */
const BLOCK_ORDER: Block[] = ['warmup', 'strength', 'wod', 'oly', 'accessory', 'skill', 'cooldown'];

/** Bloques que no dan información (casi siempre presentes, no cambian la forma del día). */
const DAY_SHAPE_SKIP = new Set<Block>(['warmup', 'cooldown']);

/**
 * Forma del día de un vistazo: un chip por bloque presente, con su icono/color de siempre — antes de
 * bajar a leer cada parte. Se usa en Planificación (bajo los botones de acción) y en el titular de
 * "hoy" del Dashboard.
 */
export function DayShapeChips({ session, className = '' }: { session: DailySession; className?: string }) {
  const present = BLOCK_ORDER.filter((block) => !DAY_SHAPE_SKIP.has(block) && session.blocks.some((b) => b.block === block));
  if (present.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {present.map((block) => {
        const { label, Icon, accent } = BLOCK_META[block];
        const accentClasses = ACCENT_CLASSES[accent];
        const suffix = block === 'wod' && session.doubleWod ? ' ×2' : '';
        return (
          <span key={block} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] font-medium text-neutral-300">
            <Icon size={11} strokeWidth={2.5} className={accentClasses.icon} aria-hidden="true" />
            {label}
            {suffix}
          </span>
        );
      })}
    </div>
  );
}
