import { NAV_ITEMS, type TabId } from './navItems';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-brand-border/70 bg-brand-surface/90 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md md:hidden">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-all duration-200 ${
              isActive ? 'text-brand-gold' : 'text-neutral-500'
            }`}
          >
            <span
              className={`absolute top-0 h-0.5 w-8 rounded-full bg-brand-gold transition-opacity duration-200 ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <Icon size={20} strokeWidth={2} className={`transition-transform duration-200 ${isActive ? 'scale-110 text-brand-orange' : ''}`} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
