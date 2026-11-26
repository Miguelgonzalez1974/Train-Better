import { morningRows } from '../../engine/energy';
import type { ReadinessScore } from '../../engine/readinessScore';

/**
 * De dónde sale la energía de la mañana, fila a fila: con cuánto te acostaste, lo recuperado durmiendo y lo que resta o suma. Se usa en la
 * hoja de «Preparación» del Dashboard y en el apartado Preparación.
 */
export function MorningBreakdown({ readiness }: { readiness: ReadinessScore }) {
  if (readiness.total === null || readiness.energy === null) {
    return <p className="text-xs leading-relaxed text-neutral-500">Contesta el check-in unos días y entrena para que la cifra tenga de dónde salir.</p>;
  }
  return (
    <dl className="flex flex-col divide-y divide-white/[0.08]">
      {morningRows(readiness.energy).map((row) => (
        <div key={row.key} className="py-2.5 first:pt-0" data-testid={`morning-row-${row.key}`}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-[13px] text-neutral-200">{row.label}</dt>
            <dd className={`num shrink-0 text-sm font-semibold ${row.base ? 'text-white' : row.value < 0 ? 'text-bad' : row.key === 'sueno' ? 'text-sleep' : 'text-good'}`}>
              {row.base ? row.value : `${row.value > 0 ? '+' : row.value < 0 ? '−' : ''}${Math.abs(row.value)}`}
            </dd>
          </div>
          {row.detail && <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{row.detail}</p>}
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 pt-2.5">
        <dt className="text-[13px] font-semibold text-white">Sales con</dt>
        <dd className="num text-base font-bold text-white">{readiness.total}</dd>
      </div>
    </dl>
  );
}
