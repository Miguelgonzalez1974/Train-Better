import { Check, Timer, Trophy } from 'lucide-react';
import { secondsText } from '../../engine/wodGhost';
import { capProgressText, type WodDoneInfo } from '../../engine/wodDone';

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** «0:40 menos» / «0:32 más» / «igual» respecto a la marca anterior (delta > 0 = más rápido). */
function versusText(info: NonNullable<WodDoneInfo['versus']>): { top: string; bottom: string } {
  const when = `que el ${shortDate(info.date)}`;
  if (info.outcome === 'empata') return { top: 'Igual', bottom: when };
  return { top: `${secondsText(info.delta)} ${info.delta > 0 ? 'menos' : 'más'}`, bottom: when };
}

/**
 * El resultado del WOD de una sesión hecha, bajo su tarjeta. Con mejor marca es un recuadro verde con trofeo; si no, una línea discreta
 * con el resultado, Rx o escalado y cómo quedó frente a tu marca anterior. Así no abruma en un día normal y premia cuando toca.
 */
export function WodDoneLine({ info, label }: { info: WodDoneInfo; label?: string }) {
  const versus = info.versus ? versusText(info.versus) : null;
  const mode = info.rx ? 'Rx' : 'Escalado';

  // Parado en el time cap: no hay tiempo que comparar, así que se dice lo que hiciste y a qué minuto se paró.
  if (info.capped) {
    return (
      <div className="mb-2 mt-1 flex items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5" data-testid="wod-done-line">
        <Timer size={24} strokeWidth={2} className="shrink-0 text-warn" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-warn">
            Time cap · {mode}
            {label ? ` · ${label}` : ''}
          </p>
          <p className="text-[22px] font-bold leading-tight text-white">{capProgressText(info.value)}</p>
        </div>
        {info.capSeconds ? (
          <p className="shrink-0 text-right text-xs leading-snug text-neutral-400">
            parado a los
            <br />
            <span className="text-warn">{secondsText(info.capSeconds)}</span>
          </p>
        ) : null}
      </div>
    );
  }

  if (info.best) {
    return (
      <div className="mb-2 mt-1 flex items-center gap-3 rounded-xl border border-good/40 bg-good/10 px-3 py-2.5" data-testid="wod-done-line">
        <Trophy size={24} strokeWidth={2} className="shrink-0 text-good" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-good">
            Mejor marca · {mode}
            {label ? ` · ${label}` : ''}
          </p>
          <p className="text-[22px] font-bold leading-tight text-white">{info.value}</p>
        </div>
        {versus && (
          <p className="shrink-0 text-right text-xs leading-snug text-good">
            {versus.top}
            <br />
            <span className="text-neutral-400">{versus.bottom}</span>
          </p>
        )}
      </div>
    );
  }

  const versusTone = info.versus?.outcome === 'pierde' ? 'text-warn' : 'text-neutral-400';
  return (
    <div className="mb-2 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-1.5 text-xs" data-testid="wod-done-line">
      <Check size={13} strokeWidth={3} className="text-good" aria-hidden="true" />
      {label && <span className="text-neutral-400">{label}</span>}
      <span className="text-sm font-bold text-white">{info.value}</span>
      <span className="text-neutral-400">· {mode}</span>
      {versus && (
        <span className={versusTone}>
          · {versus.top} {versus.bottom}
        </span>
      )}
    </div>
  );
}
