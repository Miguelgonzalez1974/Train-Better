import type { ReactNode } from 'react';
import { ChipTabs } from '../shell/ChipTabs';
import { PartGuard } from '../shell/PartGuard';

export type FormChip = 'preparacion' | 'sueno' | 'carga';

const CHIPS: { id: FormChip; label: string }[] = [
  { id: 'preparacion', label: 'Preparación' },
  { id: 'sueno', label: 'Sueño' },
  { id: 'carga', label: 'Carga' },
];

/** El detalle de cómo estás: los chips arriba y debajo el contenido del elegido. */
export function FormScreen({ chip, onChip, children }: { chip: FormChip; onChip: (chip: FormChip) => void; children: (chip: FormChip) => ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <ChipTabs items={CHIPS} active={chip} onChange={onChip} label="Cómo estás" />
      <PartGuard key={chip} name={`el apartado ${chip}`} fallback={<p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-neutral-400">Esta parte no se ha podido mostrar. Prueba con otra.</p>}>
        {children(chip)}
      </PartGuard>
    </div>
  );
}
