import { useMemo, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import type { PersonalRecords, PrLogEntry } from '../../data/athlete/types';
import type { PrTrendDirection } from '../../engine/weakPoints';
import { buildPrSeries, summarisePrProgress, type PrProgress } from '../../engine/progressSeries';
import { Sparkline } from './Sparkline';

/** Orden deliberado: fila 1 los grandes basicos, fila 2 press estricto + los 3 de halterofilia — no alfabetico, se lee como un atleta agruparia sus propios numeros. */
export const PR_ROWS: { key: keyof PersonalRecords; label: string }[] = [
  { key: 'backSquat', label: 'Back Squat' },
  { key: 'frontSquat', label: 'Front Squat' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'benchPress', label: 'Bench Press' },
  { key: 'strictPress', label: 'Strict Press' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'clean', label: 'Clean' },
  { key: 'cleanAndJerk', label: 'C&J' },
];

const TREND_META: Record<PrTrendDirection, { Icon: typeof TrendingUp; className: string }> = {
  subida: { Icon: TrendingUp, className: 'text-brand-neon' },
  bajada: { Icon: TrendingDown, className: 'text-brand-orange' },
  estable: { Icon: Minus, className: 'text-neutral-500' },
};

interface TrajectoryRow {
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

function TrajectoryRowView({ row, macroStartIso }: { row: TrajectoryRow; macroStartIso?: string }) {
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
          {row.prog.deltaPct !== 0 && (
            <span className="text-neutral-500">
              {' '}
              · {row.prog.deltaPct > 0 ? '+' : ''}
              {row.prog.deltaPct}%
            </span>
          )}
        </span>
        {macroStartIso && row.prog.sinceDeltaKg != null && row.prog.sinceDeltaKg !== 0 && (
          <span className={row.prog.sinceDeltaKg > 0 ? 'text-brand-neon' : 'text-brand-orange'}>
            {fmtDelta(row.prog.sinceDeltaKg)} <span className="text-neutral-500">este bloque</span>
          </span>
        )}
      </div>
      <Sparkline values={row.values} strokeClassName={c.stroke} areaClassName={c.area} dotClassName={c.dot} className="mt-1.5 h-10 w-full" />
    </div>
  );
}

interface PersonalRecordsCardProps {
  prs: PersonalRecords;
  trends: Partial<Record<keyof PersonalRecords, PrTrendDirection>>;
  /** Historial de cambios de PR — para la trayectoria en el tiempo, plegada por defecto. */
  prLog: PrLogEntry[];
  /** Fecha de inicio del macrociclo activo, si lo hay — para el delta "desde que empezó el bloque" en la trayectoria. */
  macroStartIso?: string;
}

/**
 * Tarjeta única de PRs: números actuales + tendencia + totales (siempre visibles, compacto) y la
 * trayectoria en el tiempo de cada lift (sparkline + delta) plegada detrás de un desplegable —
 * antes eran dos tarjetas (`PersonalRecordsCard` + `PrTrajectoryCard`) contando la misma historia
 * dos veces en el Dashboard. La flechita de tendencia y la trayectoria son lo que la diferencia de
 * un simple duplicado del perfil: comparan tests reales en el tiempo, como haría un coach de verdad.
 */
export function PersonalRecordsCard({ prs, trends, prLog, macroStartIso }: PersonalRecordsCardProps) {
  const [showTrajectory, setShowTrajectory] = useState(false);

  const trajectoryRows = useMemo<TrajectoryRow[]>(() => {
    return PR_ROWS.flatMap(({ key, label }) => {
      const series = buildPrSeries(prLog, key);
      const prog = summarisePrProgress(series, macroStartIso);
      if (!prog) return [];
      return [{ key, label, values: series.map((p) => p.kg), prog, spanFrom: series[0].date }];
    }).sort((a, b) => b.prog.deltaKg - a.prog.deltaKg);
  }, [prLog, macroStartIso]);

  const gainers = trajectoryRows.filter((r) => r.prog.deltaKg > 0).length;

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
          <Trophy size={14} strokeWidth={2.25} />
        </span>
        <p className="flex-1 text-sm font-semibold uppercase tracking-wide text-white">Tus PRs</p>
        {gainers > 0 && (
          <span className="rounded-full bg-brand-neon/15 px-2 py-0.5 text-[10px] font-bold text-brand-neon">{gainers} subiendo</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PR_ROWS.map(({ key, label }) => {
          const trend = trends[key];
          const TrendIcon = trend ? TREND_META[trend].Icon : null;
          return (
            <div key={key} className="relative flex flex-col items-center gap-0.5 rounded-lg bg-brand-surfaceMuted/80 px-1 py-2 text-center">
              {TrendIcon && (
                <span className={`absolute right-1 top-1 ${TREND_META[trend!].className}`} title={`Tendencia: ${trend}`}>
                  <TrendIcon size={11} strokeWidth={2.75} />
                </span>
              )}
              <span className="text-[15px] font-bold leading-none text-white">{prs[key]}</span>
              <span className="text-[9px] text-neutral-500">kg</span>
              <span className="mt-0.5 text-[9px] leading-tight text-neutral-400">{label}</span>
            </div>
          );
        })}
      </div>

      {/*
        Totales reales de competicion — no son un PR nuevo que trackear, son la suma de PRs que ya
        existen (igual que un Total olimpico o powerlifting de verdad). No hacia falta ningun campo
        nuevo en el perfil: es un dato derivado, se calcula aqui mismo.
      */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
        <div className="flex items-center justify-between rounded-lg bg-brand-surfaceMuted/80 px-3 py-2">
          <span className="text-[10px] text-neutral-400">Total Olímpico</span>
          <span className="text-sm font-bold text-white">
            {prs.snatch + prs.cleanAndJerk} <span className="text-[10px] font-normal text-neutral-500">kg</span>
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-brand-surfaceMuted/80 px-3 py-2">
          <span className="text-[10px] text-neutral-400">Total de Fuerza</span>
          <span className="text-sm font-bold text-white">
            {prs.backSquat + prs.benchPress + prs.deadlift} <span className="text-[10px] font-normal text-neutral-500">kg</span>
          </span>
        </div>
      </div>

      {trajectoryRows.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <button onClick={() => setShowTrajectory((prev) => !prev)} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="text-xs font-semibold text-neutral-300">Trayectoria en el tiempo</span>
            {showTrajectory ? (
              <ChevronUp size={14} className="shrink-0 text-neutral-500" />
            ) : (
              <ChevronDown size={14} className="shrink-0 text-neutral-500" />
            )}
          </button>
          {showTrajectory && (
            <div className="mt-2 flex flex-col gap-1">
              {trajectoryRows.map((row) => (
                <TrajectoryRowView key={row.key} row={row} macroStartIso={macroStartIso} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
