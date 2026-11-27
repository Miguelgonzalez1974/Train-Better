import { Zap, type LucideIcon } from 'lucide-react';

/**
 * La pastilla de energía de una actividad: lo que ha restado (sólida, del color del aro), lo que ha sumado (verde, con «+») o lo que restará o
 * sumará si se hace como está previsto (discontinua y con «previsto» escrito, para que no se lea como algo ya pasado).
 */
export function EnergyPill({ cost = 0, gain, planned = false, small = false, icon: Icon = Zap }: { cost?: number; gain?: number; planned?: boolean; small?: boolean; icon?: LucideIcon }) {
  const adds = gain !== undefined;
  const tone = planned ? `border border-dashed border-white/30 ${adds ? 'text-good' : 'text-neutral-300'}` : adds ? 'bg-good/15 text-good' : 'bg-white text-brand-bg';
  return (
    <span
      className={`num inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold ${small ? 'h-7 rounded-md px-2 text-xs' : 'h-9 rounded-lg px-2.5 text-sm'} ${tone}`}
      data-testid="energy-pill"
    >
      <Icon size={small ? 13 : 15} strokeWidth={2.25} aria-hidden="true" />
      <span>
        {adds ? '+' : cost > 0 ? '−' : ''}
        {adds ? gain : cost} %{planned && <span className="font-medium"> previsto</span>}
      </span>
    </span>
  );
}
