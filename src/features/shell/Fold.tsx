import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Un bloque plegable para lo que no hace falta ver cada día: una línea con el título (y, a la derecha, un resumen corto) que al
 * tocarla despliega el detalle. Así una pestaña enseña lo esencial y deja el resto a un toque, sin perderlo.
 */
export function Fold({ title, summary, defaultOpen = false, children }: { title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="rounded-2xl bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors duration-200 hover:bg-white/[0.04]"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{title}</span>
        {summary !== undefined && <span className="num shrink-0 text-xs text-neutral-400">{summary}</span>}
        <ChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="animate-section-in border-t border-white/[0.06] px-4 pb-4 pt-4 motion-reduce:animate-none">
          {children}
        </div>
      )}
    </section>
  );
}
