import { CheckCircle2 } from 'lucide-react';
import type { SessionHistoryEntry } from '../../data/athlete/types';

/**
 * La cabecera de una sesión ya hecha: el estado dicho claro («Sesión hecha», Rx o escalado, RPE y minutos) y los dos botones que antes
 * estaban sueltos en la frase de Rex («Ver resumen» y «Corregir datos»). Va encima de los bloques, que debajo enseñan lo hecho de verdad.
 */
export function SessionDoneHeader({ entry, onSummary, onCorrect }: { entry: SessionHistoryEntry; onSummary: () => void; onCorrect: () => void }) {
  const pill = 'rounded-md px-2 py-0.5 text-xs font-semibold';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-good/30 bg-good/[0.07] px-4 py-3" data-testid="session-done-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-sm font-bold text-good">
          <CheckCircle2 size={16} strokeWidth={2.5} aria-hidden="true" />
          Sesión hecha
        </span>
        <span className={`${pill} ${entry.rxOrScaled === 'rx' ? 'bg-white/10 text-white' : 'bg-warn/15 text-warn'}`}>{entry.rxOrScaled === 'rx' ? 'Rx' : 'Escalado'}</span>
        <span className="text-xs text-neutral-300">RPE {entry.rpe}</span>
        {entry.durationMin > 0 && <span className="text-xs text-neutral-300">{entry.durationMin} min</span>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSummary}
          className="flex-1 rounded-lg bg-good/20 px-3 py-2 text-sm font-semibold text-good transition-colors duration-200 hover:bg-good/30"
        >
          Ver resumen
        </button>
        <button
          onClick={onCorrect}
          className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-neutral-300 transition-colors duration-200 hover:bg-white/[0.06]"
        >
          Corregir datos
        </button>
      </div>
    </div>
  );
}
