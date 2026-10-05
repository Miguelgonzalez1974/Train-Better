import type { ReactNode } from 'react';

/**
 * Etiqueta de sección del estilo minimalista: texto pequeño, en mayúsculas y gris. Separa bloques sin
 * necesitar caja ni borde, y no compite con el protagonista de la pantalla.
 */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 ${className}`}>{children}</p>;
}
