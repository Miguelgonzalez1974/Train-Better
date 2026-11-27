import { Moon } from 'lucide-react';
import type { NightFeel } from '../../data/athlete/types';
import { hoursText, NIGHT_LABEL } from '../../engine/energy';
import type { ReadinessScore } from '../../engine/readinessScore';
import { PartGuard } from '../shell/PartGuard';
import type { DayEnergy } from './dayEnergy';
import { MorningBreakdown } from './MorningBreakdown';

/** Las tarjetas de «Tu día» que cuentan la energía: la noche y la mañana. Los entrenos van en filas (ver `ActivityList`). */

const FEELS: NightFeel[] = ['reventado', 'cansado', 'normal', 'bien'];

/** «¿Cómo acabas el día?»: un toque que corrige la energía con la que te vas a dormir y dice con cuánta podrías amanecer. */
export function NightCard({ energy, onPick, estimates }: { energy: DayEnergy; onPick: (feel: NightFeel) => void; estimates: { hours: number; energy: number }[] }) {
  return (
    <section className="day-card px-[13px] py-3" aria-label="¿Cómo acabas el día?" data-testid="night-card">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
        <Moon size={14} className="shrink-0 text-sleep" aria-hidden="true" />
        <span className="flex-1">¿Cómo acabas el día?</span>
        <span className="text-[11px] font-normal text-neutral-500">opcional</span>
      </p>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Cómo acabas el día">
        {FEELS.map((feel) => {
          const on = energy.nightFeel === feel;
          return (
            <button
              key={feel}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(feel)}
              className={`rounded-xl border px-1 py-2 text-xs font-semibold transition-colors ${on ? 'border-brand-orange bg-brand-orange/15 text-white' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}
            >
              {NIGHT_LABEL[feel]}
            </button>
          );
        })}
      </div>
      {energy.nightFeel === 'bien' && energy.computed !== null && energy.energy !== null && energy.energy > energy.computed && (
        <p className="mt-2 text-[11px] font-semibold leading-snug text-good" data-testid="night-gain">
          «Bien» te ha sumado {energy.energy - energy.computed}&nbsp;%.
        </p>
      )}
      {estimates.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">
          {estimates.map((e, i) => `${i === 0 ? 'Si duermes' : 'con'} ${hoursText(e.hours)}${i === 0 ? ' amanecerás sobre ' : ', sobre '}${e.energy} %`).join('; ')}.
        </p>
      )}
    </section>
  );
}

/** «De anoche a hoy»: de dónde sale la energía con la que sales, antes de entrenar. */
export function MorningCard({ readiness }: { readiness: ReadinessScore }) {
  return (
    <PartGuard name="la mañana" fallback={null}>
      <section className="day-card px-[13px] py-3" aria-label="De anoche a hoy" data-testid="morning-card">
        <p className="mb-2.5 text-[13px] font-semibold text-white">De anoche a hoy</p>
        <MorningBreakdown readiness={readiness} />
      </section>
    </PartGuard>
  );
}
