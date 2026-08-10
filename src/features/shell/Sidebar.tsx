import { Brain } from 'lucide-react';
import { NAV_ITEMS, type TabId } from './navItems';

interface SidebarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-brand-border/70 bg-brand-surface/80 backdrop-blur md:flex">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-surface">
          <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-neon/20 blur-md" />
          <Brain size={18} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_5px_rgba(57,255,20,0.65)]" />
        </span>
        <span className="text-lg font-bold tracking-tight text-white">
          Train <span className="text-brand-gold">Better</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive ? 'bg-brand-orange/10 text-brand-gold' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
              }`}
            >
              <span
                className={`absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-gold transition-opacity duration-200 ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <Icon
                size={18}
                strokeWidth={2}
                className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-brand-orange' : ''}`}
              />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
