import { Ghost as GhostIcon } from 'lucide-react';
import { secondsText, type GhostSummary } from '../../engine/wodGhost';

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const mmss = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/**
 * Al cerrar el WOD cronometrado por tramos: cada tramo con su tiempo y lo que ganó o perdió frente al fantasma, el total y la lectura del
 * coach («tu punto flojo: pull-ups»). Solo informa; el registro se guarda al confirmar la sesión y será el fantasma de la próxima vez.
 */
export function GhostSummaryCard({ summary }: { summary: GhostSummary }) {
  const { rows, ghost, totalDelta, outcome, insight, note } = summary;
  const headline =
    outcome === 'gana'
      ? `Has batido a tu fantasma por ${secondsText(totalDelta!)}`
      : outcome === 'pierde'
        ? `Tu fantasma te gana por ${secondsText(totalDelta!)}`
        : outcome === 'empata'
          ? 'Empate con tu fantasma'
          : ghost
            ? 'WOD sin terminar: no se compara con el fantasma'
            : 'Tus parciales';
  const tone = outcome === 'gana' ? 'text-good' : outcome === 'pierde' ? 'text-warn' : 'text-neutral-300';
  const against = ghost ? (ghost.kind === 'pauta' ? 'la pauta de Rex' : ghost.kind === 'estimado' ? 'objetivo del coach' : ghost.date ? `fantasma del ${shortDate(ghost.date)}` : 'fantasma') : null;
  return (
    <section className="flex flex-col gap-2.5 rounded-xl bg-white/[0.03] p-3" aria-label="Parciales del WOD">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          <GhostIcon size={13} aria-hidden="true" /> Por tramos
        </p>
        {against && <span className="text-[11px] text-neutral-500">contra {against}{ghost && ghost.kind !== 'parciales' ? ' · ritmo constante' : ''}</span>}
      </div>
      <p className={`text-sm font-semibold ${tone}`}>{headline}</p>
      <ul className="flex flex-col divide-y divide-white/[0.06] rounded-lg bg-white/[0.03] px-3 text-sm">
        {rows.map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-neutral-200">{r.label}</span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-neutral-300">{mmss(r.seconds)}</span>
              <span className={`w-14 text-right text-xs font-semibold ${r.delta === null ? 'text-neutral-600' : r.delta > 2 ? 'text-good' : r.delta < -2 ? 'text-warn' : 'text-neutral-500'}`}>
                {r.delta === null ? '—' : r.delta > 2 ? `−${secondsText(r.delta)}` : r.delta < -2 ? `+${secondsText(r.delta)}` : '='}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {insight && <p className="text-xs leading-relaxed text-neutral-300">{insight}</p>}
      {note && <p className="text-[11px] leading-relaxed text-warn">{note}</p>}
      <p className="text-[11px] leading-relaxed text-neutral-500">Al guardar la sesión, estos parciales serán tu fantasma la próxima vez que hagas este WOD.</p>
    </section>
  );
}
