import { ChevronRight, Target } from 'lucide-react';
import type { ProgressRow } from './progressOverview';

/**
 * Antes era una tarjeta con una barra de progreso por fila (macro/programa + cada objetivo) — la
 * misma evolución que ya vive en Objetivos, ocupando bastante alto en el Dashboard nada más
 * abrir. Aquí basta con saber "sí, hay algo en marcha": una sola línea, sin porcentajes ni
 * barras, que lleva directo a Objetivos si se quiere ver la evolución de verdad.
 */
export function ProgressOverviewCard({
  structureRow,
  goalRows,
  onNavigateToObjetivos,
}: {
  structureRow: ProgressRow | null;
  goalRows: ProgressRow[];
  onNavigateToObjetivos: () => void;
}) {
  if (!structureRow && goalRows.length === 0) return null;

  const goalsLabel = `${goalRows.length} ${goalRows.length === 1 ? 'objetivo activo' : 'objetivos activos'}`;
  const Icon = structureRow?.Icon ?? Target;
  const iconColor = structureRow?.color ?? '#d4af37';

  return (
    <button
      onClick={onNavigateToObjetivos}
      title="Ver macrociclos y objetivos"
      className="card flex items-center gap-3 p-3 text-left transition-colors duration-200 hover:border-brand-gold/40"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${iconColor}26`, color: iconColor }}
      >
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white">
          {structureRow ? structureRow.label : goalsLabel}
          {structureRow && <span className="text-neutral-500"> · {structureRow.sublabel}</span>}
        </p>
        {structureRow && goalRows.length > 0 && <p className="mt-0.5 truncate text-xs text-neutral-500">{goalsLabel}</p>}
      </div>
      <ChevronRight size={16} strokeWidth={2.25} className="shrink-0 text-neutral-500" />
    </button>
  );
}
