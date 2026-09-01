import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, LineChart } from 'lucide-react';
import type { PrLogEntry } from '../../data/athlete/types';
import { buildPrSeries, summarisePrProgress, type PrProgress } from '../../engine/progressSeries';
import { PR_ROWS } from './PersonalRecordsCard';
import { Sparkline } from './Sparkline';

interface PrTrajectoryCardProps {
  prLog: PrLogEntry[];
  /** Fecha de inicio del macrociclo activo, si lo hay — para el delta "desde que empezó el bloque". */
  macroStartIso?: string;
}

interface Row {
  key: string;
  label: string;
  values: number[];
  prog: PrProgress;
  spanFrom: string;
}

function fmtDelta(kg: number): string {
  return `${kg > 0 ? '+' : ''}${kg} kg`;
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('es', { month: 'short', year: '2-digit' }).format(new Date(`${iso}T00:00:00`));
}

const GAIN = { stroke: 'stroke-brand-neon', area: 'fill-brand-neon/10', dot: 'fill-brand-neon' };
const LOSS = { stroke: 'stroke-brand-orange', area: 'fill-brand-orange/10', dot: 'fill-brand-orange' };
const FLAT = { stroke: 'stroke-neutral-500', area: 'fill-white/[0.04]', dot: 'fill-neutral-500' };

function TrajectoryRow({ row, macroStartIso }: { row: Row; macroStartIso?: string }) {
  const c = row.prog.deltaKg > 0 ? GAIN : row.prog.deltaKg < 0 ? LOSS : FLAT;
  const deltaClass = row.prog.deltaKg > 0 ? 'text-brand-neon' : row.prog.deltaKg < 0 ? 'text-brand-orange' : 'text-neutral-500';
  return (
    <div className="border-l-2 border-white/10 py-1.5 pl-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-white">{row.label}</p>
        <p className="shrink-0 text-sm font-bold text-white">
          {row.prog.currentKg} <span className="text-[10px] font-normal text-neutral-500">kg</span>
        </p>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        <span className={deltaClass}>
          {fmtDelta(row.prog.deltaKg)} <span className="text-neutral-500">desde {fmtDate(row.spanFrom)}</span>
          {row.prog.deltaPct !== 0 && <span className="text-neutral-500"> · {row.prog.deltaPct > 0 ? '+' : ''}{row.prog.deltaPct}%</span>}
        </span>
        {macroStartIso && row.prog.sinceDeltaKg != null && row.prog.sinceDeltaKg !== 0 && (
          <span className={row.prog.sinceDeltaKg > 0 ? 'text-brand-neon' : 'text-brand-orange'}>
            {fmtDelta(row.prog.sinceDeltaKg)} <span className="text-neutral-500">este bloque</span>
          </span>
        )}
      </div>
      <Sparkline
        values={row.values}
        strokeClassName={c.stroke}
        areaClassName={c.area}
        dotClassName={c.dot}
        className="mt-1.5 h-10 w-full"
      />
    </div>
  );
}

/**
 * Complementa a `PersonalRecordsCard` (números actuales + una flecha de dirección): esta muestra la
 * TRAYECTORIA real de cada 1RM en el tiempo, a partir de `prLog` — cuánto has subido desde que
 * empezaste y desde que arrancó el bloque actual, con la forma de la curva (subida sostenida,
 * meseta, salto reciente). Colapsada por defecto; el titular ya adelanta el mayor progreso.
 * Devuelve null hasta que al menos un levantamiento tenga 2+ puntos (el `prLog` siembra 1 por lift).
 */
export function PrTrajectoryCard({ prLog, macroStartIso }: PrTrajectoryCardProps) {
  const [collapsed, setCollapsed] = useState(true);

  const rows = useMemo<Row[]>(() => {
    return PR_ROWS.flatMap(({ key, label }) => {
      const series = buildPrSeries(prLog, key);
      const prog = summarisePrProgress(series, macroStartIso);
      if (!prog) return [];
      return [{ key, label, values: series.map((p) => p.kg), prog, spanFrom: series[0].date }];
    }).sort((a, b) => b.prog.deltaKg - a.prog.deltaKg);
  }, [prLog, macroStartIso]);

  if (rows.length === 0) return null;

  const gainers = rows.filter((r) => r.prog.deltaKg > 0).length;
  const top = rows[0];

  return (
    <section className="card overflow-hidden p-0">
      <button onClick={() => setCollapsed((prev) => !prev)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-surfaceMuted">
          <span className="absolute inset-0 animate-pulse rounded-xl bg-brand-neon/20 blur-md" />
          <LineChart size={16} strokeWidth={2.25} className="relative text-brand-neon drop-shadow-[0_0_4px_rgba(57,255,20,0.6)]" />
        </span>
        <span className="flex flex-1 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-white">Trayectoria de PRs</span>
          {gainers > 0 && (
            <span className="rounded-full bg-brand-neon/15 px-2 py-0.5 text-[10px] font-bold text-brand-neon">
              {gainers} subiendo
            </span>
          )}
        </span>
        {collapsed ? (
          <ChevronDown size={16} className="shrink-0 text-neutral-500" />
        ) : (
          <ChevronUp size={16} className="shrink-0 text-neutral-500" />
        )}
      </button>

      {collapsed ? (
        <div className="border-t border-white/5 px-3.5 pb-3.5 pt-3">
          <div className="flex items-center gap-3 rounded-xl bg-brand-surfaceMuted/80 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{top.label}</p>
              <p className="text-xs text-neutral-500">
                {top.prog.currentKg} kg · {top.prog.deltaKg > 0 ? '+' : ''}
                {top.prog.deltaKg} kg desde {fmtDate(top.spanFrom)}
              </p>
            </div>
            <Sparkline
              values={top.values}
              strokeClassName={top.prog.deltaKg >= 0 ? GAIN.stroke : LOSS.stroke}
              areaClassName={top.prog.deltaKg >= 0 ? GAIN.area : LOSS.area}
              dotClassName={top.prog.deltaKg >= 0 ? GAIN.dot : LOSS.dot}
              className="h-9 w-24 shrink-0"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 border-t border-white/5 px-3.5 pb-3.5 pt-3">
          {rows.map((row) => (
            <TrajectoryRow key={row.key} row={row} macroStartIso={macroStartIso} />
          ))}
        </div>
      )}
    </section>
  );
}
