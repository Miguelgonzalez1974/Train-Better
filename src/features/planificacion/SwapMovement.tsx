import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { SessionBlockResult } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { swapOptions, type SwapContext, type SwapKind, type SwapOption } from '../../engine/movementSwap';
import { Modal } from '../shell/Modal';

const KIND_META: Record<SwapKind, { label: string; className: string }> = {
  escalado: { label: 'Escalado', className: 'bg-brand-orange/15 text-brand-orange' },
  'mas-facil': { label: 'Más fácil', className: 'bg-brand-neon/15 text-brand-neon' },
  'mas-dificil': { label: 'Más difícil', className: 'bg-brand-gold/15 text-brand-gold' },
  similar: { label: 'Parecido', className: 'bg-white/10 text-neutral-300' },
};

function loadText(o: SwapOption): string | null {
  if (typeof o.loadKg === 'number') return `≈ ${String(o.loadKg).replace('.', ',')} kg · mismo % de tu marca`;
  if (o.loadKg === null) return 'Peso a tu elección';
  return null;
}

interface SwapButtonProps {
  entry: SessionBlockResult;
  index: number;
  ctx: SwapContext;
  /** Aplica el cambio sobre la entrada del bloque (el padre lo guarda en la sesión de hoy). */
  onSwap: (index: number, patch: Partial<SessionBlockResult>) => void;
  /** Si ya hay series marcadas de este movimiento no se cambia (el registro quedaría con otro nombre). */
  disabled?: boolean;
}

/**
 * Cambiar un movimiento sobre la marcha, en el modo enfocado: el rack está ocupado, falta material, algo molesta o hoy no sale.
 * Abre la lista de alternativas (ver `engine/movementSwap.ts`) con el material de cada una y, en las de barra, el peso
 * recalculado con el mismo % de tu marca.
 */
export function SwapButton({ entry, index, ctx, onSwap, disabled }: SwapButtonProps) {
  const [open, setOpen] = useState(false);
  const movement = getMovementById(entry.movementId);
  const options = useMemo(() => swapOptions(entry, ctx), [entry, ctx]);
  // Sin alternativas (o un WOD de referencia, que se escala aparte) no hay botón.
  if (entry.movementId.startsWith('benchmark:') || !movement || options.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? 'Ya has marcado series de este movimiento' : 'Cambiar este movimiento'}
        aria-label={`Cambiar ${movement.name}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-border text-neutral-300 transition-colors hover:border-brand-gold hover:text-brand-gold active:bg-white/10 disabled:opacity-30"
      >
        <ArrowLeftRight size={17} strokeWidth={2.25} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Cambiar ${movement.name}`}>
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-sm text-neutral-400">
            ¿El rack está ocupado, falta material o algo te molesta? Elige una alternativa y el resto de la sesión sigue igual.
          </p>
          {options.map((o) => {
            const meta = KIND_META[o.kind];
            const load = loadText(o);
            return (
              <button
                key={o.movementId}
                onClick={() => {
                  onSwap(index, o.patch);
                  setOpen(false);
                }}
                className="flex flex-col gap-1 rounded-xl border border-brand-border bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-brand-gold active:bg-white/10"
              >
                <span className="text-base font-semibold text-white">{o.name}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${meta.className}`}>{meta.label}</span>
                  <span className="text-neutral-400">{o.equipment}</span>
                  {o.reps && <span className="text-neutral-400">{o.reps} reps</span>}
                </span>
                {load && <span className="text-xs font-medium text-neutral-300">{load}</span>}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
