import { Ghost } from 'lucide-react';
import type { RepeatableWod } from '../../engine/wodRepeat';
import { Modal } from '../shell/Modal';

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/**
 * «Repetir un WOD que ya hice»: los WODs del historial que se pueden volver a poner (ver `engine/wodRepeat.ts`). Al elegir uno, el reloj de
 * entreno corre contra tu marca de entonces: con tus tiempos por tramo si los cronometraste, o a ritmo constante con tu tiempo final.
 */
export function RepeatWodModal({ open, onClose, list, onPick }: { open: boolean; onClose: () => void; list: RepeatableWod[]; onPick: (wod: RepeatableWod) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Repetir WOD fantasma">
      <p className="mb-3 text-sm leading-relaxed text-neutral-400">
        Elige un WOD que ya hiciste y el crono correrá contra tu marca de entonces: tu fantasma de verdad, no una estimación.
      </p>
      {list.length === 0 ? (
        <p className="rounded-lg bg-white/[0.04] px-3 py-3 text-sm leading-relaxed text-neutral-300">
          Todavía no hay WODs para repetir. Los que hagas a partir de ahora, y los de programación real que ya hiciste, saldrán aquí.
        </p>
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {list.map((w) => (
            <li key={w.key}>
              <button
                onClick={() => onPick(w)}
                className="flex w-full flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07] active:bg-white/10"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-white">{w.title}</span>
                  {w.withSplits && (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-good/15 px-1.5 py-0.5 text-[11px] font-semibold text-good">
                      <Ghost size={11} aria-hidden="true" /> Con parciales
                    </span>
                  )}
                </span>
                {w.summary && <span className="text-xs leading-relaxed text-neutral-400">{w.summary}</span>}
                <span className="text-[11px] text-neutral-500">
                  {w.times === 1 ? '1 vez' : `${w.times} veces`} · última {shortDate(w.lastDate)}
                  {w.best ? ` · mejor ${w.best.text}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
