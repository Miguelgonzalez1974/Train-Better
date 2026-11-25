import type { ReactNode } from 'react';
import { ChipTabs } from '../shell/ChipTabs';
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
      <ChipTabs items={CHIPS.filter((c) => isToday || c.id !== 'energia')} active={shown} onChange={onChip} label="Tu forma" />
      <PartGuard key={shown} name={`el apartado ${shown} de Tu forma`} fallback={<p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-neutral-400">Esta parte no se ha podido mostrar. Prueba con otra.</p>}>
        {children(shown)}
      </PartGuard>
    </div>
  );
}
