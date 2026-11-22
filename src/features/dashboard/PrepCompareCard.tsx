import { useMemo } from 'react';
import { summarizePrepCompare, type PrepCompareRow } from './prepCompare';
import { recoveryColor } from './RecoveryCard';

const DAY = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' });
const label = (iso: string) => DAY.format(new Date(`${iso}T12:00:00`)).replace(/\./g, '');

function Num({ value, strong }: { value: number | null; strong?: boolean }) {
  return (
    <span className={`num tabular-nums ${strong ? 'text-[15px] font-bold' : 'text-[13px] font-medium'}`} style={value === null ? undefined : { color: recoveryColor(value) }}>
      {value === null ? '—' : value}
    </span>
  );
}

/**
 * Una prueba, no un cambio: tus últimos días con check-in con la preparación de ahora (media simple de la semana) y la que saldría dando más peso a lo
 * reciente (hoy la mitad, ayer una cuarta parte…), junto a la nota del propio check-in de cada día. Sirve para ver si el nuevo reparto te parece más lógico
 * antes de decidir nada. No cambia ninguna nota ni el coach.
 */
export function PrepCompareCard({ rows }: { rows: PrepCompareRow[] }) {
  const summary = useMemo(() => summarizePrepCompare(rows), [rows]);
  if (rows.length === 0) return <p className="text-xs leading-relaxed text-neutral-400">Aún no hay check-ins con los que comparar. Contesta unos días y aquí verás la prueba.</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="prep-compare">
      <p className="text-xs leading-relaxed text-neutral-400">
        Tu preparación de cada día, <b className="font-semibold text-neutral-200">como se calcula ahora</b> (cada día de la semana pesa igual) y{' '}
        <b className="font-semibold text-neutral-200">dando más peso a lo reciente</b> (hoy la mitad, ayer una cuarta parte, y así hacia atrás). Es una prueba: tu preparación de verdad no cambia.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_3.2rem_3.2rem] items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Día</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Check-in</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Ahora</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Nuevo</span>
        {rows.map((r) => (
          <div key={r.iso} className="contents">
            <span className="border-t border-white/[0.06] pt-1.5 text-[12.5px] capitalize text-neutral-300">{label(r.iso)}</span>
            <span className="border-t border-white/[0.06] pt-1.5 text-right">
              <Num value={r.check} />
            </span>
            <span className="border-t border-white/[0.06] pt-1.5 text-right">
              <Num value={r.now} />
            </span>
            <span className="border-t border-white/[0.06] pt-1.5 text-right">
              <Num value={r.recency} strong />
            </span>
          </div>
        ))}
      </div>
      {summary.days > 0 && (
        <p className="text-xs leading-relaxed text-neutral-300">
          De media, la nota se mueve <b className="font-semibold text-white">{String(summary.avgShift).replace('.', ',')} puntos</b>
          {summary.biggest ? (
            <>
              ; el día que más cambia es el {label(summary.biggest.iso)} (de {summary.biggest.from} a {summary.biggest.to}).
            </>
          ) : (
            '.'
          )}
        </p>
      )}
    </div>
  );
}
