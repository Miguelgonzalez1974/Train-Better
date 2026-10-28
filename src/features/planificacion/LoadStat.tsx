import { useState } from 'react';
import { ChartSpline } from 'lucide-react';
import type { Block } from '../../data/movements/types';
import type { PersonalRecords, PrLogEntry, VariantPersonalRecords, WorkSetEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { loadUnitLabel } from '../../data/movements/loadUnits';
import { fmtKgValue } from '../../lib/format';
import { resolveLiftPrKey } from '../../engine/movementProgress';
import { findTopWorkSet } from '../../engine/setFeedback';
import { toLocalIsoDate } from '../../engine/periodization';
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
  /** Datos del atleta para el popup de progresión — si faltan, la cifra es solo lectura. */
  progress?: MovementProgressData;
  /** `lg` = la carga es la cifra protagonista del bloque (levantamiento principal). */
  size?: 'sm' | 'lg';
}

/**
 * La columna "kg" de una serie: cifra en verde sin recuadro, como las demás columnas de la prescripción (series | reps | kg). En
 * fuerza y oly con 1RM propio es tocable y abre la progresión del movimiento (`MovementProgressModal`) — el atleta ve su 1RM y
 * cómo de cerca lo trabaja sesión a sesión; el icono de la gráfica avisa de que se puede tocar. En el resto de bloques es una
 * columna normal, sin interacción.
 *
 * El número que se muestra prioriza lo REAL sobre lo prescrito: si ya hay una serie de hoy
 * registrada en el modo enfocado para este movimiento, se enseña esa carga (con la etiqueta "kg
 * real"), no la que mandó el coach — antes, una vez entrenado, la cifra se quedaba fija en la
 * prescripción original aunque el atleta hubiera levantado otra cosa, lo cual confundía sobre si lo
 * que se veía era el plan o lo que de verdad se hizo.
 */
export function LoadStat({ kg, movementId, block, progress, size = 'sm' }: LoadStatProps) {
  const [open, setOpen] = useState(false);
  const movement = movementId ? getMovementById(movementId) : undefined;
  const interactive =
    Boolean(progress) && (block === 'strength' || block === 'oly') && Boolean(movement && resolveLiftPrKey(movement));
  const numClass = `num whitespace-nowrap font-extrabold leading-none text-brand-neon ${size === 'lg' ? 'text-[22px]' : 'text-xl'}`;
  const col = 'flex flex-col border-l border-white/10 px-4 first:border-l-0 first:pl-0';

  if (!interactive) {
    return (
      <div className={col}>
        <span className={numClass}>{fmtKgValue(kg)}</span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">{loadUnitLabel(movementId, block)}</span>
      </div>
    );
  }

  const todaySet =
    movementId && progress ? findTopWorkSet(progress.workLog.filter((e) => e.date === toLocalIsoDate(new Date())), movementId) : null;
  const displayKg = todaySet?.kg ?? kg;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`${col} text-left transition-opacity duration-200 hover:opacity-80`}
        aria-label={`Ver progresión de ${movement?.name ?? 'este movimiento'}`}
      >
        <span className={`flex items-center gap-1.5 ${numClass}`}>
          {fmtKgValue(displayKg)}
          <ChartSpline size={13} strokeWidth={2.5} className="text-brand-neon/70" aria-hidden="true" />
        </span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">{todaySet ? 'kg real · ver' : 'kg · ver'}</span>
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
