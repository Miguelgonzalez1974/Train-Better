import { useState } from 'react';
import { ChevronDown, PersonStanding } from 'lucide-react';

const CHOICES = [15, 30] as const;

/**
 * La movilidad que se propone en un día de descanso: con las zonas que más lo piden, de 15 o 30 minutos. Es una invitación, así que sale plegada en
 * una línea discreta; si no se toca, no pasa nada y desaparece al acabar el día. El descanso ya cuenta por sí solo.
 */
export function MobilitySuggestion({ zones, why, gainFor, onStart }: { zones: string; why?: string; gainFor: (minutes: number) => number; onStart: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number>(CHOICES[0]);
  const most = gainFor(CHOICES[CHOICES.length - 1]);
  const gain = open ? gainFor(minutes) : 0;
  return (
    <div className="flex flex-col" data-testid="mobility-suggestion">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-2 text-left transition-colors hover:bg-white/[0.04]" data-testid="mobility-toggle">
        <PersonStanding size={16} strokeWidth={2.25} className="shrink-0 text-neutral-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-xs text-neutral-400">
          Movilidad, opcional
          {!open && most > 0 && (
            <>
              {' · '}hasta <span className="num font-semibold text-neutral-300">+{most} %</span>
            </>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 px-2 pb-1.5 pt-1">
          <p className="text-xs leading-snug text-neutral-400">
            {zones}
            {why ? ` · ${why}` : ''}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex gap-0.5 rounded-lg bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Cuánto tiempo">
              {CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={minutes === m}
                  onClick={() => setMinutes(m)}
                  className={`num min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${minutes === m ? 'bg-white text-brand-bg' : 'text-neutral-300 hover:bg-white/5'}`}
                >
                  {m} min
                </button>
              ))}
            </span>
            <button type="button" onClick={() => onStart(minutes)} className="num min-h-9 whitespace-nowrap rounded-lg border border-white/25 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.06]" data-testid="mobility-start">
              Empezar{gain > 0 ? ` · +${gain} %` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
