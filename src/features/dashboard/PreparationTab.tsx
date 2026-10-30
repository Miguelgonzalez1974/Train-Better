import { useState } from 'react';
import { HeartPulse, Sparkles } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import type { ReadinessScore } from '../../engine/readinessScore';
import type { ReadinessLearning } from '../../engine/readinessLearning';
import { prepSentence } from '../../engine/prepSentence';
import { Fold } from '../shell/Fold';
import { CheckInSummary } from './CheckInSummary';
import { HrvChart } from './HrvChart';
import { LearnedInsights } from './LearnedInsights';
import { LEVEL_TEXT, RECOVERY_GOOD, RECOVERY_LOW, RECOVERY_MID, RecoveryDetail, recoveryColor } from './RecoveryCard';
import { ReadinessTrendChart } from './WeekCharts';

const AXIS_WORD = (score: number) => (score <= -0.34 ? 'mal' : score >= 0.34 ? 'bien' : 'regular');
const AXIS_COLOR = (score: number) => (score <= -0.34 ? RECOVERY_LOW : score >= 0.34 ? RECOVERY_GOOD : RECOVERY_MID);

/**
 * La pestaña Preparación, aligerada: lo que importa a diario a la vista (la nota, una frase del coach, la tendencia y las cuatro
 * señales de la semana) y el porqué de la nota y lo que el coach aprende de ti, plegados a un toque.
 */
export function PreparationTab({
  readiness,
  series,
  dayIso,
  isToday,
  log,
  todayCheck,
  learning,
  onSelect,
  onOpenMorning,
}: {
  readiness: ReadinessScore;
  series: { iso: string; total: number | null }[];
  dayIso: string;
  isToday: boolean;
  log: ReadinessCheck[];
  todayCheck: ReadinessCheck | undefined;
  learning: ReadinessLearning;
  onSelect: (iso: string) => void;
  onOpenMorning: () => void;
}) {
  const [showHrv, setShowHrv] = useState(false);
  const total = readiness.total;
  const axes = readiness.checkins.axes;
  const hasHrv = log.some((c) => c.hrv !== undefined);

  return (
    <div className="animate-section-in flex flex-col gap-3 motion-reduce:animate-none">
      {/* La nota de hoy y la frase del coach. */}
      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Tu preparación">
        <div className="flex items-end gap-3">
          <p className="num text-5xl font-extrabold leading-none" style={{ color: total === null ? undefined : recoveryColor(total) }}>
            {total === null ? '—' : total}
            {total !== null && <span className="ml-0.5 text-xl font-bold text-neutral-500">%</span>}
          </p>
          <div className="pb-0.5">
            <p className="text-sm font-semibold text-white">{readiness.level ? LEVEL_TEXT[readiness.level] : 'Sin nota todavía'}</p>
            {readiness.estimated && total !== null && <p className="text-[11px] text-neutral-500">estimada, sin check-in de hoy</p>}
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-neutral-200">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
          <span>{prepSentence(readiness)}</span>
        </p>
        {isToday && todayCheck && (
          <div className="mt-4 border-t border-white/[0.06] pt-3.5">
            <CheckInSummary check={todayCheck} onEdit={onOpenMorning} />
          </div>
        )}
      </section>

      {/* La tendencia, con la HRV a un toque si se mide. */}
      <div className="flex flex-col gap-3">
        <ReadinessTrendChart series={series} selectedIso={dayIso} onSelect={onSelect} />
        {hasHrv && (
          <>
            <button
              type="button"
              aria-pressed={showHrv}
              onClick={() => setShowHrv((v) => !v)}
              className={`flex items-center justify-center gap-1.5 self-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                showHrv ? 'border-white/25 bg-white/[0.1] text-white' : 'border-white/10 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <HeartPulse size={13} strokeWidth={2.25} aria-hidden="true" />
              {showHrv ? 'Ocultar HRV' : 'Ver mi HRV'}
            </button>
            {showHrv && <HrvChart log={log} dayIso={dayIso} />}
          </>
        )}
      </div>

      {/* Las cuatro señales de la semana, de un vistazo. */}
      {axes.length > 0 && (
        <section aria-label="Tus señales de la semana">
          <div className="grid grid-cols-4 gap-2">
            {axes.map((a) => (
              <div key={a.key} className="rounded-2xl bg-white/[0.03] px-2 py-3 text-center">
                <p className="text-[11px] text-neutral-500">{a.label}</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: AXIS_COLOR(a.score) }}>
                  {AXIS_WORD(a.score)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-center text-[11px] text-neutral-500">media de tus check-ins de los últimos 7 días</p>
        </section>
      )}

      <Fold title="Por qué esta nota" summary={total === null ? undefined : `${total} %`}>
        <RecoveryDetail readiness={readiness} inFold />
      </Fold>
      <Fold title="Lo que sé de ti" summary={learning.ready ? undefined : `${learning.pairs}/${learning.needed}`}>
        <LearnedInsights learning={learning} bare />
      </Fold>
    </div>
  );
}
