import { Zap, type LucideIcon } from 'lucide-react';

/**
 * La pastilla de energía de un entreno: lo que ha restado (sólida, del color del aro) o lo que restará si se hace como está previsto
 * (discontinua y con «previsto» escrito, para que no se lea como un gasto real).
 */
export function EnergyPill({ cost, planned = false, small = false, icon: Icon = Zap }: { cost: number; planned?: boolean; small?: boolean; icon?: LucideIcon }) {
  return (
    <span
      className={`num inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold ${small ? 'h-7 rounded-md px-2 text-xs' : 'h-9 rounded-lg px-2.5 text-sm'} ${
        planned ? 'border border-dashed border-white/30 text-neutral-300' : 'bg-white text-brand-bg'
      }`}
      data-testid="energy-pill"
    >
      <Icon size={small ? 13 : 15} strokeWidth={2.25} aria-hidden="true" />
      <span>
        {cost > 0 ? '−' : ''}
        {cost} %{planned && <span className="font-medium"> previsto</span>}
      </span>
    </span>
  );
}
