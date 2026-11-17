import type { ExplainRow } from '../../engine/explainNumbers';

/** Color de una nota de 0 a 100 con los mismos tramos que el aro de preparación. */
function scoreColor(value: number): string {
  return value >= 65 ? 'rgb(var(--c-ring-good))' : value <= 40 ? 'rgb(var(--c-ring-low))' : 'rgb(var(--c-ring-mid))';
}

function Row({ row }: { row: ExplainRow }) {
  if (row.kind === 'plain') {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
        <span className="min-w-0 text-neutral-300">{row.label}</span>
        {row.value && <span className="num shrink-0 font-semibold text-white">{row.value}</span>}
      </div>
    );
  }
  if (row.kind === 'score') {
    const color = scoreColor(row.value);
    return (
      <div className="py-1">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 text-neutral-300">
            {row.label}
            {row.weight && <span className="ml-1 text-neutral-500">· {row.weight}</span>}
          </span>
          <span className="num shrink-0 font-semibold" style={{ color }}>
            {row.value}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.value))}%`, backgroundColor: color }} />
        </div>
        {row.detail && <p className="mt-1 text-[11px] leading-snug text-neutral-500">{row.detail}</p>}
      </div>
    );
  }
  const positive = row.value > 0;
  const color = positive ? 'rgb(var(--c-ring-good))' : 'rgb(var(--c-ring-low))';
  const width = Math.min(50, Math.abs(row.value) * 3);
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 text-neutral-300">{row.label}</span>
        <span className="num shrink-0 font-semibold" style={{ color }}>
          {positive ? '+' : '−'}
          {Math.abs(row.value)}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-white/[0.08]" aria-hidden="true">
        <div className="absolute bottom-0 top-0 rounded-full" style={{ [positive ? 'left' : 'right']: '50%', width: `${width}%`, backgroundColor: color }} />
      </div>
      {row.detail && <p className="mt-1 text-[11px] leading-snug text-neutral-500">{row.detail}</p>}
    </div>
  );
}

/** El desglose de una respuesta de Rex: cada fila con su valor y, si lo tiene, su barra. */
export function ExplainRows({ rows }: { rows: ExplainRow[] }) {
  return (
    <div className="mt-2 divide-y divide-white/[0.06]" data-testid="explain-rows">
      {rows.map((row, i) => (
        <Row key={`${row.label}-${i}`} row={row} />
      ))}
    </div>
  );
}
