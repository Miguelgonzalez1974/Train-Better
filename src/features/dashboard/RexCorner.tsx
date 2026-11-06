import { useEffect, useState, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import { RexMascot } from '../objetivos/RexMascot';
import { RexBar } from './RexBar';
import type { RexSuggestion, RexTarget } from './rexDashboard';

/** Cuánto se queda el globo de la esquina antes de recogerse solo. */
const BUBBLE_MS = 9000;

const LEAD_COLOR: Record<NonNullable<RexSuggestion['tone']>, string> = {
  good: 'rgb(var(--c-state-good))',
  mid: 'rgb(var(--c-state-mid))',
  bad: 'rgb(var(--c-state-low))',
  info: 'rgb(var(--c-state-cool))',
  gold: 'rgb(var(--c-brand-gold))',
};

/** ¿Hay algo que merezca un punto en el botón? Lo urgente (check-in, revisión, cierre…) o un módulo con aviso. */
export function cornerNeedsAttention(suggestion: RexSuggestion, dots: RexTarget[]): boolean {
  return dots.length > 0 || (suggestion.id !== 'quiet' && suggestion.priority >= 80);
}

/**
 * Rex en la esquina, siempre a mano: un botón flotante abajo a la derecha que, al abrir la pantalla, dice en un globo lo más
 * importante (el consejo del día, el check-in pendiente…) y se recoge solo. Al tocarlo se abre un panel desde abajo con todo lo
 * que antes vivía arriba: su frase con atajos, las otras cosas que tiene que contar y los módulos de «Más».
 * Qué decir y qué recordar viene de `rexDashboard.ts`; esto solo lo dibuja.
 */
export function RexCorner({
  speak,
  ...bar
}: Omit<ComponentProps<typeof RexBar>, 'showDate' | 'modules' | 'defaultMore'> & {
  /** El globo de la esquina puede hablar solo (hoy sí; mirando un día pasado, no). */
  speak: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState(false);
  const { suggestion, dots } = bar;
  const quiet = suggestion.id === 'quiet';

  // El globo sale cuando Rex tiene algo nuevo que decir y se recoge solo; no sale con el panel abierto ni con la frase tranquila.
  useEffect(() => {
    if (!speak || quiet || open) {
      setBubble(false);
      return;
    }
    setBubble(true);
    const timer = window.setTimeout(() => setBubble(false), BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [speak, quiet, open, suggestion.id]);

  // Escape cierra el panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const leadLen = suggestion.lead && suggestion.text.startsWith(suggestion.lead) ? suggestion.lead.length : 0;
  const attention = cornerNeedsAttention(suggestion, dots);

  return (
    <>
      {!open && (
        <div className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-30 flex flex-col items-end gap-2 md:bottom-6 md:right-6">
          {bubble && (
            <button
              onClick={() => setOpen(true)}
              aria-label="Rex tiene algo que decirte: abrir"
              className="pointer-events-auto relative max-w-[min(18rem,calc(100vw-5.5rem))] animate-section-in rounded-2xl rounded-br-md border border-white/20 bg-brand-surface px-3.5 py-2.5 text-left shadow-xl shadow-black/40 motion-reduce:animate-none"
            >
              <p className="line-clamp-4 text-[13px] leading-snug text-neutral-100">
                {leadLen > 0 && (
                  <strong className="font-bold" style={{ color: LEAD_COLOR[suggestion.tone ?? 'info'] }}>
                    {suggestion.text.slice(0, leadLen)}
                  </strong>
                )}
                {suggestion.text.slice(leadLen)}
              </p>
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            aria-label="Hablar con Rex"
            aria-haspopup="dialog"
            className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-brand-surface shadow-xl shadow-black/40 transition-transform duration-200 active:scale-95"
          >
            <RexMascot size={42} mood={bubble ? suggestion.mood : 'idle'} />
            {attention && <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-brand-orange ring-2 ring-brand-bg" aria-label="Hay algo sin ver" />}
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[55]">
          <button aria-label="Cerrar a Rex" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
          <section
            role="dialog"
            aria-label="Rex"
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-xl animate-section-in overflow-y-auto rounded-t-3xl border border-b-0 border-white/15 bg-brand-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl motion-reduce:animate-none md:bottom-6 md:right-6 md:left-auto md:mx-0 md:rounded-3xl md:border-b"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="mx-auto h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden="true" />
              <button onClick={() => setOpen(false)} aria-label="Cerrar a Rex" className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <RexBar
              {...bar}
              showDate
              modules
              defaultMore
              // El globo ya la había dicho (o el panel se abre a pedido): sale entera, sin volver a escribirse.
              typedAlready
              onAction={(target) => {
                setOpen(false);
                bar.onAction(target);
              }}
            />
          </section>
        </div>
      )}
    </>
  );
}
