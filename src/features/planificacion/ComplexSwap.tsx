import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { PersonalRecords, SessionBlockResult, VariantPersonalRecords } from '../../data/athlete/types';
import { COMPLEX_FOCUS_LABEL, complexNotation, type OlyComplex } from '../../data/complexes';
import { getMovementById } from '../../data/movements';
import { complexPreviewKg, swapComplexPatch, type ComplexPool } from '../../engine/olyComplexes';
import { Modal } from '../shell/Modal';

const nameOf = (id: string) => getMovementById(id)?.name ?? id;
const fmt = (n: number) => String(n).replace('.', ',');

interface Props {
  entry: SessionBlockResult;
  index: number;
  pool: ComplexPool;
  week: 1 | 2 | 3 | 4;
  prs: PersonalRecords;
  variantPrs?: VariantPersonalRecords;
  /** Si ya hay series marcadas del complejo no se cambia: el registro quedaría con otro nombre. */
  disabled?: boolean;
  onSwap: (index: number, patch: Partial<SessionBlockResult>) => void;
}

/**
 * Cambiar el complejo del día por otro de la librería, en el modo enfocado: el rack está ocupado, no te apetece o hoy no sale. Salen
 * los de la misma familia (y los mixtos), con su peso ya recalculado para hoy; se conservan las series y el ajuste del día.
 */
export function ComplexSwapButton({ entry, index, pool, week, prs, variantPrs, disabled, onSwap }: Props) {
  const [open, setOpen] = useState(false);
  const current = pool.all.find((x) => x.id === entry.complex?.id);
  const family = current?.family === 'snatch' || current?.family === 'clean' ? current.family : entry.movementId.includes('snatch') ? 'snatch' : 'clean';
  const options = useMemo(() => {
    const hidden = new Set(pool.hidden);
    return pool.all
      .filter((x) => x.id !== entry.complex?.id && !hidden.has(x.id) && (x.family === family || x.family === 'mixto'))
      .map((x) => ({ complex: x, patch: swapComplexPatch(entry, x, week, prs, variantPrs, nameOf, current) }))
      .filter((o): o is { complex: OlyComplex; patch: Partial<SessionBlockResult> } => o.patch !== null);
  }, [pool, entry, family, week, prs, variantPrs, current]);

  if (!entry.complex || options.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? 'Ya has marcado series de este complejo' : 'Cambiar el complejo'}
        aria-label={`Cambiar ${entry.complex.name}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-border text-neutral-300 transition-colors hover:border-brand-gold hover:text-brand-gold active:bg-white/10 disabled:opacity-30"
      >
        <ArrowLeftRight size={17} strokeWidth={2.25} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cambiar el complejo">
        <div className="flex flex-col">
          <p className="mb-2 text-sm text-neutral-400">Elige otro de la librería: se conservan las series y el ajuste de hoy, y el peso se recalcula.</p>
          {options.map(({ complex, patch }) => (
            <button
              key={complex.id}
              onClick={() => {
                onSwap(index, patch);
                setOpen(false);
              }}
              className="flex flex-col gap-0.5 border-t border-white/10 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/10"
            >
              <span className="text-sm font-bold text-white">{complex.name}</span>
              <span className="num text-sm font-bold text-brand-gold">
                {complexNotation(complex)} <span className="font-semibold text-neutral-300">· {typeof patch.loadKg === 'number' ? `${fmt(patch.loadKg)} kg` : ''}</span>
              </span>
              <span className="text-xs text-neutral-400">
                {complex.focus.map((f) => COMPLEX_FOCUS_LABEL[f]).join(' · ')}
                {complexPreviewKg(complex, week, prs, variantPrs) === null ? ' · sin peso' : ''}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
