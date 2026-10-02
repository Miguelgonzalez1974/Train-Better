import type { ProgressRow } from './progressOverview';

/** Objetivos que se enseñan como mucho (el resto, "+N más") — la tarjeta no debe crecer sin tope. */
const MAX_GOALS = 3;

/** "Vence en 18d" → 18; "Objetivo vencido" u otro texto → al final de la cola. */
function remainingDaysOf(row: ProgressRow): number {
  const m = row.sublabel.match(/Vence en (\d+)d/);
  return m ? Number(m[1]) : Infinity;
}

/** "Vence en 18d" → "18d"; "Objetivo vencido" → "vencido". */
function shortRemaining(row: ProgressRow): string {
  const m = row.sublabel.match(/Vence en (\d+d)/);
  return m ? m[1] : 'vencido';
}

/**
 * Macrociclo (o programa de fuerza) activo: una tira con un tramo por semana — las pasadas llenas, la de
 * hoy resaltada, las que quedan apagadas. Se ve en qué punto del bloque estás sin leer nada.
 */
function WeekStrip({ row }: { row: ProgressRow }) {
  const Icon = row.Icon;
  const m = row.sublabel.match(/Semana (\d+) de (\d+)(?: · (.+))?/);
  const week = m ? Number(m[1]) : 0;
  const total = m ? Number(m[2]) : 0;
  const phase = m?.[3];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${row.color}22`, color: row.color }}
        >
          <Icon size={13} strokeWidth={2.25} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white">{row.label}</p>
        <span className="num shrink-0 text-xs text-neutral-500">{row.pct}%</span>
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-1.5 gap-[2px]" role="img" aria-label={`Semana ${week} de ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="min-w-0 flex-1 rounded-[2px]"
                style={{ background: i < week - 1 ? row.color : i === week - 1 ? '#fff' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
          <p className="truncate text-[11px] leading-tight text-neutral-500">
            Semana <span className="num font-semibold text-neutral-300">{week}</span> de {total}
            {phase ? ` · ${phase}` : ''}
          </p>
        </>
      ) : (
        <p className="truncate text-[11px] leading-tight text-neutral-500">{row.sublabel}</p>
      )}
    </div>
  );
}

/** Un objetivo: una fila cuyo fondo se va llenando con el avance — porcentaje y días que quedan a la derecha. */
function GoalFillRow({ row }: { row: ProgressRow }) {
  const Icon = row.Icon;
  const pct = Math.min(100, Math.max(0, row.pct));
  return (
    <div className="relative overflow-hidden rounded-lg bg-white/[0.04]">
      <div className="absolute inset-y-0 left-0 transition-all duration-500" style={{ width: `${pct}%`, background: `${row.color}2e` }} />
      <div className="relative flex items-center gap-2 px-2.5 py-1.5">
        <Icon size={13} strokeWidth={2.25} className="shrink-0" style={{ color: row.color }} />
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{row.label}</p>
        <span className="num shrink-0 text-xs font-bold text-white">{pct}%</span>
        <span className="num w-9 shrink-0 text-right text-[11px] text-neutral-400">{shortRemaining(row)}</span>
      </div>
    </div>
  );
}

/**
 * Cabecera de la tarjeta de métricas: "dónde estás en el viaje" — el macrociclo (o programa de fuerza) activo
 * y los objetivos por orden de fecha. Sin tarjeta propia: vive dentro de la de los gauges para ahorrar
 * scroll. Toca y va a Objetivos.
 */
export function JourneyProgress({
  structureRow,
  goalRows,
  onNavigateToObjetivos,
}: {
  structureRow: ProgressRow | null;
  goalRows: ProgressRow[];
  onNavigateToObjetivos: () => void;
}) {
  if (!structureRow && goalRows.length === 0) return null;
  const sorted = [...goalRows].sort((a, b) => remainingDaysOf(a) - remainingDaysOf(b));
  const shown = sorted.slice(0, MAX_GOALS);
  const hidden = sorted.length - shown.length;

  return (
    <button
      onClick={onNavigateToObjetivos}
      className="flex w-full flex-col gap-2.5 rounded-xl p-1 text-left transition-colors duration-200 hover:bg-white/[0.04]"
    >
      {structureRow && <WeekStrip row={structureRow} />}
      {shown.length > 0 && (
        <div className="flex flex-col gap-1">
          {shown.map((row) => (
            <GoalFillRow key={row.id} row={row} />
          ))}
          {hidden > 0 && <p className="px-1 text-[11px] text-neutral-500">+{hidden} {hidden === 1 ? 'objetivo más' : 'objetivos más'}</p>}
        </div>
      )}
    </button>
  );
}
