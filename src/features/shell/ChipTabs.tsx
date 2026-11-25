/** Los chips de una pantalla por apartados («Tu forma», «Tu nivel»): en una sola línea también en un móvil, cada uno según su texto. */
export function ChipTabs<T extends string>({ items, active, onChange, label }: { items: { id: T; label: string }[]; active: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label={label}>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={active === c.id}
          onClick={() => onChange(c.id)}
          className={`min-h-9 flex-auto whitespace-nowrap rounded-full border px-1.5 py-1.5 text-[11px] font-semibold transition-colors duration-200 ${
            active === c.id ? 'border-white bg-white text-brand-bg' : 'border-white/15 text-neutral-400 hover:text-neutral-100'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
