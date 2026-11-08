import { ArrowLeft } from 'lucide-react';
import { RexMascot } from '../objetivos/RexMascot';
import { useLabReturnPending } from '../../lib/labReturn';

/**
 * «Volver a RexLab»: si abriste algo desde el lab de Rex y te has ido a otra pestaña (Objetivos, Nutrición, Planificación), un botón abajo a
 * la izquierda te devuelve al Dashboard con el lab abierto. Se va solo cuando vuelves al Dashboard por cualquier camino.
 */
export function BackToLab({ onBack, raised = false }: { onBack: () => void; /** Más arriba, para no tapar el reloj de entreno (Planificación). */ raised?: boolean }) {
  const pending = useLabReturnPending();
  if (!pending) return null;
  return (
    <button
      onClick={onBack}
      aria-label="Volver a RexLab"
      className={`fixed left-3 z-20 flex animate-section-in items-center gap-2 rounded-full border border-white/20 bg-brand-surface py-1.5 pl-2 pr-3.5 text-xs font-semibold text-neutral-100 shadow-xl shadow-black/40 transition-colors hover:border-white/40 motion-reduce:animate-none md:bottom-[11rem] md:left-auto md:right-6 ${raised ? 'bottom-[calc(10.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))]'}`}
    >
      <RexMascot size={26} />
      <ArrowLeft size={14} aria-hidden="true" />
      Volver a RexLab
    </button>
  );
}
