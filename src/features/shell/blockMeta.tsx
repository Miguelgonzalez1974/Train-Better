import { Flame, Dumbbell, Zap, Trophy, Layers, Star, Wind, type LucideIcon } from 'lucide-react';
import type { Block } from '../../data/movements/types';

/**
 * Icono y color de cada bloque de sesión — fuente única para la tarjeta de un bloque (Planificación)
 * y para cualquier resumen compacto que quiera hablar el mismo lenguaje visual (p.ej. el titular de
 * "hoy" del Dashboard) sin arrastrar el resto de Planificación a su chunk.
 */
export type Accent = 'orange' | 'gold' | 'neutral';

// Estilo minimalista: el color queda reservado para el estado y la acción principal. Los bloques se
// reconocen por su icono y su nombre, así que todos comparten el mismo gris (la vuelta a la calma, más tenue).
export const ACCENT_CLASSES: Record<Accent, { icon: string; bar: string }> = {
  orange: { icon: 'text-neutral-300', bar: 'bg-white/20' },
  gold: { icon: 'text-neutral-300', bar: 'bg-white/20' },
  neutral: { icon: 'text-neutral-500', bar: 'bg-white/10' },
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

/**
 * El icono de un bloque dentro de un cuadradito redondeado. Todos neutros (el color queda para el estado y la marca): el
 * bloque que está ABIERTO se tiñe con el naranja de marca, que es lo único que destaca.
 */
export function BlockTile({ block, size = 36, active = false }: { block: Block; size?: number; active?: boolean }) {
  const { Icon } = BLOCK_META[block];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
        active ? 'bg-brand-orange/15 text-brand-orange' : 'bg-white/[0.07] text-neutral-300'
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.25} />
    </span>
  );
}
