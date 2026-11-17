import { Check } from 'lucide-react';
import type { WorkDoneLine } from './workDoneLines';

/**
 * Lo hecho de verdad bajo un bloque de fuerza u oly: una línea fina por movimiento con las series anotadas y su peso. Va justo debajo de la
 * tarjeta, para que una sesión ya hecha (o en marcha) no parezca la misma del plan sin hacer.
 */
export function WorkDoneList({ lines }: { lines: WorkDoneLine[] }) {
  return (
    <ul className="mb-2 mt-1 flex flex-col gap-1 px-1 py-1.5" data-testid="work-done-lines">
      {lines.map((l) => (
        <li key={l.name} className="flex items-start gap-1.5 text-xs">
          <Check size={13} strokeWidth={3} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
          <span className="min-w-0">
            <span className="text-neutral-400">{l.name}</span> <span className="font-bold text-white">{l.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
