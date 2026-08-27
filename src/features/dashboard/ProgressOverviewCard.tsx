import { Compass } from 'lucide-react';
import type { ProgressRow } from './progressOverview';

function ProgressBar({ row }: { row: ProgressRow }) {
  return (
    <div className="rounded-xl bg-brand-surfaceMuted/80 px-3 py-2.5 transition-colors duration-200 hover:bg-brand-surfaceMuted">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${row.color}26`, color: row.color }}
        >
          <row.Icon size={15} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{row.label}</p>
          <p className="truncate text-[11px] text-neutral-500">{row.sublabel}</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-white">{row.pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, row.pct))}%`, background: row.color }}
        />
      </div>
    </div>
  );
}

/**
 * Une en un solo sitio lo que antes vivia repartido: la linea "Semana X de Y" del header del
 * Dashboard (solo cubria macrociclos, nunca programas de fuerza) y `GoalsProgressCard` (solo
 * objetivos). La rampa de vuelta se queda fuera a proposito — es un modificador temporal sobre
 * el entrenamiento, no una estructura con una meta propia que "completar".
 *
 * Estructura (macrociclo/programa) y objetivos se muestran en subgrupos separados aunque compartan
 * la misma barra: uno mide tiempo transcurrido, el otro rendimiento real, y mezclarlos sin
 * distincion podria leerse como si significaran lo mismo.
 */
export function ProgressOverviewCard({ structureRow, goalRows }: { structureRow: ProgressRow | null; goalRows: ProgressRow[] }) {
  if (!structureRow && goalRows.length === 0) return null;

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {/* Gold: categoria "rendimiento/objetivos" — mismo acento que Tus PRs, agrupa lo que mide como de cerca estas de una meta. */}
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gold/15 text-brand-gold">
          <Compass size={18} strokeWidth={2.25} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-white">Tu progreso</p>
      </div>

      <div className="flex flex-col gap-4">
        {structureRow && (
          <div className="flex flex-col gap-2">
            {goalRows.length > 0 && <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Estructura activa</p>}
            <ProgressBar row={structureRow} />
          </div>
        )}

        {goalRows.length > 0 && (
          <div className="flex flex-col gap-2">
            {structureRow && <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Objetivos</p>}
            <div className="flex flex-col gap-2">
              {goalRows.map((row) => (
                <ProgressBar key={row.id} row={row} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
