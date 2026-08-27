import { AlertTriangle } from 'lucide-react';
import type { AcwrResult } from '../../engine/loadMetrics';
import type { PatternStrain } from '../../engine/weakPoints';

/**
 * Con 8 tarjetas de peso visual identico, una zona ACWR alta o un punto debil real quedaban
 * enterrados hasta escanear toda la pantalla. Reutiliza datos que el Dashboard ya calcula (no hay
 * senal nueva) para decidir si hay algo que de verdad merece destacarse hoy — vacio (sin banner)
 * es el caso comun y correcto, no un estado a rellenar siempre.
 */
export function buildAttentionItems(acwr: AcwrResult, weakPoints: PatternStrain[]): string[] {
  const items: string[] = [];

  if (acwr.zone === 'alta' && acwr.acwr !== null) {
    items.push(`Tu ratio de carga aguda:crónica está en zona alta (${acwr.acwr.toFixed(2)}) — valora una sesión más suave hoy.`);
  }

  const toWork = weakPoints.filter((p) => p.status === 'a-trabajar');
  if (toWork.length > 0) {
    const names = toWork.map((p) => p.label).join(', ');
    items.push(toWork.length === 1 ? `Un patrón necesita trabajo: ${names}.` : `${toWork.length} patrones necesitan trabajo: ${names}.`);
  }

  return items;
}

export function AttentionBanner({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
          <AlertTriangle size={14} strokeWidth={2.5} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-400">
          {items.length === 1 ? '1 cosa a vigilar hoy' : `${items.length} cosas a vigilar hoy`}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="text-sm text-neutral-300">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
