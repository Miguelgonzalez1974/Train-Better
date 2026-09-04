import { useState } from 'react';
import { ChartSpline } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { PersonalRecords, PrLogEntry, VariantPersonalRecords, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { resolveLiftPrKey } from '../../engine/movementProgress';
import { MovementProgressModal } from './MovementProgressModal';

export interface MovementProgressData {
  prs: PersonalRecords;
  variantPrs: VariantPersonalRecords | undefined;
  prLog: PrLogEntry[];
  workLog: WorkSetEntry[];
}

interface LoadStatProps {
  kg: number;
  movementId?: string;
  block?: Block;
  /** Datos del atleta para el popup de progresión — si faltan, el recuadro es solo lectura. */
  progress?: MovementProgressData;
}

/**
 * El recuadro "kg" de una serie. En fuerza y oly con 1RM propio es tocable y abre la progresión del
 * movimiento (`MovementProgressModal`) — el atleta ve su 1RM y cómo de cerca lo trabaja sesión a
 * sesión. En el resto de bloques es un StatBox normal, sin interacción.
 */
export function LoadStat({ kg, movementId, block, progress }: LoadStatProps) {
  const [open, setOpen] = useState(false);
  const movement = movementId ? getMovementById(movementId) : undefined;
  const interactive =
    Boolean(progress) && (block === 'strength' || block === 'oly') && Boolean(movement && resolveLiftPrKey(movement));

  if (!interactive) {
    return (
      <div className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-black/20 px-2.5 py-1.5">
        <span className="text-sm font-bold text-white">{kg}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">kg</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-brand-neon/10 px-2.5 py-1.5 ring-1 ring-brand-neon/40 transition-colors duration-200 hover:bg-brand-neon/20 hover:ring-brand-neon/70"
        aria-label={`Ver progresión de ${movement?.name ?? 'este movimiento'}`}
      >
        <span className="flex items-center gap-1 text-sm font-bold text-white">
          {kg}
          <ChartSpline size={13} strokeWidth={2.5} className="text-brand-neon" />
        </span>
        <span className="text-[10px] uppercase tracking-wide text-brand-neon/80">kg · ver</span>
      </button>
      {open && progress && movementId && (
        <MovementProgressModal
          movementId={movementId}
          targetKg={kg}
          open={open}
          onClose={() => setOpen(false)}
          prs={progress.prs}
          variantPrs={progress.variantPrs}
          prLog={progress.prLog}
          workLog={progress.workLog}
        />
      )}
    </>
  );
}
