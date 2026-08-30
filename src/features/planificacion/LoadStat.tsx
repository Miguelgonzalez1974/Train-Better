import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { PlateCalculator } from './PlateCalculator';

/**
 * El recuadro "kg" de una serie, pero tocable: abre la calculadora de discos. Mismo aspecto que
 * `StatBox` para no romper la fila, con un icono pequeño como pista de que es interactivo.
 */
export function LoadStat({ kg }: { kg: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-black/20 px-2.5 py-1.5 transition-colors duration-200 hover:bg-black/40"
        aria-label={`Calcular discos para ${kg} kg`}
      >
        <span className="flex items-center gap-1 text-sm font-bold text-white">
          {kg}
          <Calculator size={11} strokeWidth={2.25} className="text-neutral-500" />
        </span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">kg</span>
      </button>
      <PlateCalculator targetKg={kg} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
