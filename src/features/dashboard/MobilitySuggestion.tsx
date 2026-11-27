import { useState } from 'react';
import { PersonStanding } from 'lucide-react';
import { EnergyPill } from './EnergyPill';

const CHOICES = [15, 30] as const;

/**
 * La movilidad que se propone en un día de descanso: con las zonas que más lo piden, de 15 o 30 minutos. Es una invitación: si no se hace, no pasa
 * nada y desaparece al acabar el día.
 */
export function MobilitySuggestion({ zones, why, gainFor, onStart }: { zones: string; why?: string; gainFor: (minutes: number) => number; onStart: (minutes: number) => void }) {
  const [minutes, setMinutes] = useState<number>(CHOICES[0]);
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-dashed border-white/25 p-3" data-testid="mobility-suggestion">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">Movilidad</span>
          <span className="mt-0.5 block text-xs leading-snug text-neutral-400">
            {zones}
            {why ? ` · ${why}` : ''}
          </span>
        </span>
        <EnergyPill gain={gainFor(minutes)} planned small icon={PersonStanding} />
      </div>
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
        <button type="button" onClick={() => onStart(minutes)} className="min-h-9 rounded-lg bg-white px-4 text-[13px] font-semibold text-brand-bg" data-testid="mobility-start">
          Empezar
        </button>
      </div>
    </div>
  );
}
