import type { ProgressRow } from './progressOverview';

/** "Vence en 18d" → 18; "Objetivo vencido" u otro texto → al final de la cola. */
function remainingDaysOf(row: ProgressRow): number {
  const m = row.sublabel.match(/Vence en (\d+)d/);
  return m ? Number(m[1]) : Infinity;
}

function ProgressLine({ row }: { row: ProgressRow }) {
  const Icon = row.Icon;
  const pct = Math.min(100, Math.max(0, row.pct));
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${row.color}22`, color: row.color }}
      >
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-white">{row.label}</p>
          <span className="num shrink-0 text-xs text-neutral-500">{pct}%</span>
        </div>
        <p className="text-xs text-neutral-500">{row.sublabel}</p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: row.color }} />
        </div>
      </div>
    </div>
  );
}

/**
 * MOCKUP — "dónde estás en el viaje", no "qué vigilar": semana del macrociclo (o programa de fuerza)
 * activo + el objetivo más cercano a su fecha, cada uno con su barra de progreso. Datos que el
 * Dashboard ya calculaba para el numerito del icono de Objetivos — aquí pasan a ser protagonistas,
 * en positivo, en vez de vivir escondidos.
 */
export function JourneyBanner({
  structureRow,
  goalRows,
  onNavigateToObjetivos,
}: {
  structureRow: ProgressRow | null;
  goalRows: ProgressRow[];
  onNavigateToObjetivos: () => void;
}) {
  const closestGoal = goalRows.length > 0 ? [...goalRows].sort((a, b) => remainingDaysOf(a) - remainingDaysOf(b))[0] : null;
  if (!structureRow && !closestGoal) return null;

  return (
    <button
      onClick={onNavigateToObjetivos}
      className="card flex flex-col gap-3 p-3.5 text-left transition-colors duration-200 hover:border-brand-gold/40"
    >
      {structureRow && <ProgressLine row={structureRow} />}
      {closestGoal && <ProgressLine row={closestGoal} />}
    </button>
  );
}
