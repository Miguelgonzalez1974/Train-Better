import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, type GlossaryKey } from './glossary';

const POP_WIDTH = 290;
const MARGIN = 8;
/** Alto aproximado de la explicación: si no cabe debajo del término, sale encima. */
const POP_HEIGHT = 150;

interface Placement {
  left: number;
  width: number;
  arrow: number;
  above: boolean;
  /** Distancia al borde superior (debajo del término) o al inferior (encima). */
  edge: number;
}

/**
 * Un término de la jerga (RPE, Rx, ACWR…) con una línea de puntos: tocarlo abre una explicación corta (ver `glossary.ts`) y se cierra
 * al tocar fuera, con Escape o al mover la pantalla. Si la explicación está abierta, el primer toque fuera solo la cierra: no llega
 * a lo que hubiera debajo (por ejemplo, el fondo de una ventana).
 */
export function Term({ k, children }: { k: GlossaryKey; children: ReactNode }) {
  const [place, setPlace] = useState<Placement | null>(null);
  const termRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const entry = GLOSSARY[k];

  function toggle() {
    if (place) return setPlace(null);
    const r = termRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(POP_WIDTH, window.innerWidth - MARGIN * 2);
    const left = Math.min(Math.max(MARGIN, r.left - 20), window.innerWidth - width - MARGIN);
    const above = r.bottom + 10 + POP_HEIGHT > window.innerHeight && r.top > POP_HEIGHT;
    setPlace({ left, width, arrow: Math.max(12, Math.min(width - 22, r.left + r.width / 2 - left - 5)), above, edge: above ? window.innerHeight - r.top + 10 : r.bottom + 10 });
  }

  useEffect(() => {
    if (!place) return;
    const close = () => setPlace(null);
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || termRef.current?.contains(target)) return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [place]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <>
      <span
        ref={termRef}
        role="button"
        tabIndex={0}
        aria-expanded={place !== null}
        aria-label={`${entry.title}: qué es`}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="cursor-pointer border-b border-dotted border-current"
      >
        {children}
      </span>
      {place &&
        createPortal(
          <div
            ref={popRef}
            role="note"
            className="fixed z-[70] rounded-xl border border-white/10 bg-brand-surface px-3.5 py-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-neutral-200 shadow-xl shadow-black/40"
            style={{ left: place.left, width: place.width, ...(place.above ? { bottom: place.edge } : { top: place.edge }) }}
          >
            <span
              aria-hidden="true"
              className={`absolute h-2.5 w-2.5 rotate-45 border-white/10 bg-brand-surface ${place.above ? '-bottom-[6px] border-b border-r' : '-top-[6px] border-l border-t'}`}
              style={{ left: place.arrow }}
            />
            <span className="mb-0.5 block text-xs font-bold text-brand-gold">{entry.title}</span>
            {entry.text}
          </div>,
          document.body,
        )}
    </>
  );
}
