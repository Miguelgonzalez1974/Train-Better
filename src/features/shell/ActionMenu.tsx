import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  /** `danger` pinta la opción en rojo (borrar, deshacer). */
  tone?: 'default' | 'danger';
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Nombre accesible del botón "···". */
  label?: string;
  /** Resalta el botón (p.ej. hay un modo de edición activo). */
  active?: boolean;
  /** Punto rojo en la esquina: hay algo que no conviene olvidar dentro del menú. */
  alert?: boolean;
  /** Pulso suave mientras una acción del menú sigue trabajando. */
  busy?: boolean;
}

/**
 * Menú "···" para las acciones poco frecuentes de una pantalla: saca de la vista una fila de iconos
 * sin texto y deja una única puerta, con etiquetas claras. Teclado completo (flechas, Inicio/Fin,
 * Escape) y se cierra al tocar fuera.
 */
export function ActionMenu({ items, label = 'Más acciones', active = false, alert = false, busy = false }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    // Al abrir, el foco pasa a la primera opción para poder usar el teclado de inmediato.
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const entries = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      entries[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      entries[entries.length - 1]?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-200 ${
          active || open ? 'border-brand-gold text-brand-gold' : 'border-brand-border text-neutral-300 hover:border-brand-gold hover:text-brand-gold'
        }`}
      >
        <MoreHorizontal size={18} strokeWidth={2.25} className={busy ? 'animate-pulse' : ''} />
        {alert && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-brand-bg" />}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="card absolute right-0 top-12 z-40 flex w-60 origin-top-right animate-menu-in flex-col gap-0.5 p-1.5 shadow-xl motion-reduce:animate-none"
        >
          {items.map(({ label: itemLabel, Icon, onSelect, tone = 'default' }) => (
            <button
              key={itemLabel}
              role="menuitem"
              onClick={() => {
                close(false);
                onSelect();
              }}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm outline-none transition-colors focus-visible:bg-white/[0.08] hover:bg-white/[0.06] ${
                tone === 'danger' ? 'text-red-400' : 'text-neutral-200'
              }`}
            >
              <Icon size={15} strokeWidth={2.25} className={tone === 'danger' ? '' : 'text-neutral-400'} />
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
