import type { ReactNode } from 'react';
import { RexMascot, type RexMood } from '../objetivos/RexMascot';

export type RexNoteTone = 'good' | 'warn' | 'bad' | 'info' | 'gold';

const BORDER: Record<RexNoteTone, string> = {
  good: 'border-good/70',
  warn: 'border-warn/70',
  bad: 'border-bad/70',
  info: 'border-info/60',
  gold: 'border-brand-gold/70',
};

/**
 * La nota de Rex dentro de una pantalla (la conclusión del Análisis, lo que dice de tus marcas, la lectura del WOD, la pauta de ritmo, la guía de
 * movilidad…): una sola forma en todas partes — la mascota pequeña, un borde de color según el tono (bien, atención, mal, información) y el texto
 * a su lado. Lo que lleve dentro (la frase, los botones, una propuesta) lo pone quien la usa. El Rex de la esquina es otra cosa: aquel es el panel.
 */
export function RexNote({
  tone = 'info',
  mood = 'idle',
  label = 'Lo que dice Rex',
  className = '',
  children,
}: {
  tone?: RexNoteTone;
  mood?: RexMood;
  /** Nombre accesible de la nota. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className={`flex items-start gap-2.5 border-l-2 py-0.5 pl-3 ${BORDER[tone]} ${className}`}>
      <RexMascot size={24} mood={mood} className="mt-0.5" />
      <div className="min-w-0 flex-1" aria-live="polite">
        {children}
      </div>
    </section>
  );
}
