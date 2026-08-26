import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { PersonalRecords } from '../../data/athlete/types';
import type { PrTrendDirection } from '../../engine/weakPoints';

/** Orden deliberado: fila 1 los grandes basicos, fila 2 press estricto + los 3 de halterofilia — no alfabetico, se lee como un atleta agruparia sus propios numeros. */
const PR_ROWS: { key: keyof PersonalRecords; label: string }[] = [
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

/**
 * Tarjeta compacta de los 8 PRs raiz del atleta — antes no habia ni una cifra de 1RM visible en el
 * Dashboard pese a ser el dato mas central para el resto del motor. La flechita de tendencia (no
 * solo el numero, que ya se ve editable en el perfil) es lo que la diferencia de un simple
 * duplicado: compara los dos ultimos tests reales de cada lift, como haria un coach de verdad —
 * ver `computePrTrends`.
 */
export function PersonalRecordsCard({ prs, trends }: { prs: PersonalRecords; trends: Partial<Record<keyof PersonalRecords, PrTrendDirection>> }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
          <Trophy size={14} strokeWidth={2.25} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-white">Tus PRs</p>
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
    </section>
  );
}
