import type { LucideIcon } from 'lucide-react';

type EmptyStateAccent = 'neon' | 'gold';

const ACCENT_CLASSES: Record<EmptyStateAccent, { border: string; glow: string; icon: string; drop: string }> = {
  neon: {
    border: 'border-brand-neon/20',
    glow: 'bg-brand-neon/25',
    icon: 'text-brand-neon',
    drop: 'drop-shadow-[0_0_5px_rgba(57,255,20,0.6)]',
  },
  gold: {
    border: 'border-brand-gold/20',
    glow: 'bg-brand-gold/25',
    icon: 'text-brand-gold',
    drop: 'drop-shadow-[0_0_5px_rgba(212,175,55,0.6)]',
  },
};

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  accent?: EmptyStateAccent;
}

/**
 * Estado vacío curado — icono grande de fondo (decorativo, casi invisible) + insignia con glow +
 * título/descripción. Mismo lenguaje visual que ya usaba la tarjeta vacía de "Macrociclos" en
 * Objetivos; extraído aquí para no repetir el marcado en cada sitio con una lista que puede estar
 * vacía (Diario, Volumen...) en vez de dejarlos en un simple párrafo gris.
 */
export function EmptyState({ Icon, title, description, accent = 'neon' }: EmptyStateProps) {
  const c = ACCENT_CLASSES[accent];
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${c.border} bg-gradient-to-br from-brand-surfaceMuted to-brand-surface p-6`}>
      <Icon size={110} strokeWidth={1.5} className="pointer-events-none absolute -bottom-5 -right-4 text-white/[0.05]" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-bg">
          <span className={`absolute inset-0 rounded-2xl ${c.glow} blur-md`} />
          <Icon size={24} strokeWidth={2} className={`relative ${c.icon} ${c.drop}`} />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mx-auto mt-1 max-w-[22rem] text-xs leading-relaxed text-neutral-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
