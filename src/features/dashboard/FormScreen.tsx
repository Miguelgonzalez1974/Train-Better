import type { ReactNode } from 'react';
import { PartGuard } from '../shell/PartGuard';

export type FormChip = 'energia' | 'preparacion' | 'sueno' | 'carga';

const CHIPS: { id: FormChip; label: string }[] = [
  { id: 'energia', label: 'Energía' },
  { id: 'preparacion', label: 'Preparación' },
  { id: 'sueno', label: 'Sueño' },
  { id: 'carga', label: 'Carga' },
];

/** El chip que se ve de verdad: la energía mira hacia delante desde hoy, así que en un día pasado no está y se abre la preparación. */
export const shownChip = (chip: FormChip, isToday: boolean): FormChip => (!isToday && chip === 'energia' ? 'preparacion' : chip);

/** La pantalla «Tu forma»: los chips arriba y debajo el contenido del elegido. */
export function FormScreen({ chip, onChip, isToday, children }: { chip: FormChip; onChip: (chip: FormChip) => void; isToday: boolean; children: (chip: FormChip) => ReactNode }) {
  const shown = shownChip(chip, isToday);
  return (
    <div className="flex flex-col gap-3">
      {/* En una sola línea también en un móvil: cada uno según su texto y se reparten lo que sobra. */}
      <div className="flex gap-1" role="tablist" aria-label="Tu forma">
        {CHIPS.filter((c) => isToday || c.id !== 'energia').map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={shown === c.id}
            onClick={() => onChip(c.id)}
            className={`min-h-9 flex-auto whitespace-nowrap rounded-full border px-1.5 py-1.5 text-[11px] font-semibold transition-colors duration-200 ${
              shown === c.id ? 'border-white bg-white text-brand-bg' : 'border-white/15 text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <PartGuard key={shown} name={`el apartado ${shown} de Tu forma`} fallback={<p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-neutral-400">Esta parte no se ha podido mostrar. Prueba con otra.</p>}>
        {children(shown)}
      </PartGuard>
    </div>
  );
}
