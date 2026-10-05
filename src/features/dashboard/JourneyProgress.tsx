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

/** "Subir PR — Clean" → "Clean": junto al anillo el sitio es poco y el icono ya dice el tipo de objetivo. */
function shortGoalLabel(row: ProgressRow): string {
  const i = row.label.indexOf(' — ');
  const name = i >= 0 ? row.label.slice(i + 3) : row.label;
  return name.replace(/\s*\([^)]*\)/g, '').trim() || name;
}

/**
 * Macrociclo (o programa de fuerza) activo: un anillo con el % del bloque y, debajo, la semana en la que
 * estás y la fase. Es lo que da el contexto de todo lo demás, así que lleva el protagonismo visual.
 */
function ProgramRing({ row }: { row: ProgressRow }) {
  const m = row.sublabel.match(/Semana (\d+) de (\d+)(?: · (.+))?/);
  const week = m ? Number(m[1]) : 0;
  const total = m ? Number(m[2]) : 0;
  const phase = m?.[3];
  const pct = Math.min(100, Math.max(0, row.pct));
  const r = 29;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex w-[92px] shrink-0 flex-col items-center gap-1 text-center" title={`${row.label} · ${row.sublabel}`}>
      <div className="relative h-[84px] w-[84px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" role="img" aria-label={`${row.label}: ${pct}%`}>
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="3" className="stroke-white/[0.08]" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-white"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="num text-[24px] font-semibold leading-none tracking-tight text-white">{pct}%</span>
        </div>
      </div>
      {total > 0 ? (
        <p className="num text-[11px] leading-tight text-neutral-400">
          Sem. {week}/{total}
        </p>
      ) : (
        <p className="w-full truncate text-[11px] leading-tight text-neutral-400">{row.label}</p>
      )}
      {phase && <p className="w-full truncate text-[10px] leading-tight text-neutral-600">{phase}</p>}
    </div>
  );
}

/** Un objetivo: una fila cuyo fondo se va llenando con el avance — porcentaje y días que quedan a la derecha. */
function GoalFillRow({ row }: { row: ProgressRow }) {
  const pct = Math.min(100, Math.max(0, row.pct));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] text-neutral-200" title={row.label}>
          {shortGoalLabel(row)}
        </p>
        <span className="num shrink-0 text-[15px] font-semibold text-white">{pct}%</span>
        <span className="num w-9 shrink-0 text-right text-[11px] text-neutral-500">{shortRemaining(row)}</span>
      </div>
      <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-white/80 transition-all duration-500" style={{ width: `${pct}%` }} />
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
      className="flex w-full items-center gap-3 rounded-xl p-1 text-left transition-colors duration-200 hover:bg-white/[0.04]"
    >
      {structureRow && <ProgramRing row={structureRow} />}
      {shown.length > 0 && (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {shown.map((row) => (
            <GoalFillRow key={row.id} row={row} />
          ))}
          {hidden > 0 && <p className="px-1 text-[11px] text-neutral-500">+{hidden} {hidden === 1 ? 'objetivo más' : 'objetivos más'}</p>}
        </div>
      )}
    </button>
  );
}
