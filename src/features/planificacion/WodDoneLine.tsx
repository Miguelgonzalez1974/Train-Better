import { Check, Trophy } from 'lucide-react';
import { deltaText } from '../../engine/wodGhost';
import type { WodDoneInfo } from '../../engine/wodDone';

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/**
 * El pie del WOD de una sesión hecha: el resultado, Rx o escalado, «mejor marca» y cómo quedó frente a tu marca anterior. Una línea fina
 * justo debajo de la tarjeta del WOD, para no tener que abrir el resumen de la sesión para ver cómo te fue.
 */
export function WodDoneLine({ info, label }: { info: WodDoneInfo; label?: string }) {
  const versusTone = info.versus?.outcome === 'gana' ? 'text-good' : info.versus?.outcome === 'pierde' ? 'text-warn' : 'text-neutral-400';
  return (
    <div className="-mt-1 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-2 text-xs" data-testid="wod-done-line">
      <span className="flex items-center gap-1 font-semibold uppercase tracking-wide text-good">
        <Check size={13} strokeWidth={3} aria-hidden="true" />
        {label ? `Hecho · ${label}` : 'Hecho'}
      </span>
      <span className="text-sm font-bold text-white">{info.value}</span>
      <span className="text-neutral-400">{info.rx ? 'Rx' : 'Escalado'}</span>
      {info.best && (
        <span className="flex items-center gap-1 rounded-md bg-good/15 px-1.5 py-0.5 font-semibold text-good">
          <Trophy size={11} aria-hidden="true" /> Mejor marca
        </span>
      )}
      {info.versus && (
        <span className={versusTone}>
          {deltaText(info.versus.delta)} · {shortDate(info.versus.date)}
        </span>
      )}
    </div>
  );
}
