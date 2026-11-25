import { Sparkles } from 'lucide-react';
import type { ReadinessCheck } from '../../data/athlete/types';
import type { ReadinessScore } from '../../engine/readinessScore';
import type { ReadinessLearning } from '../../engine/readinessLearning';
import { prepSentence } from '../../engine/prepSentence';
import { SORE_ZONE_LABEL } from '../../engine/morningCheckIn';
import type { SoreZoneId } from '../../data/athlete/types';
import { SectionLabel } from '../shell/SectionLabel';
import { Fold } from '../shell/Fold';
import { CheckInSummary } from './CheckInSummary';
import { HrvChart } from './HrvChart';
import { LearnedInsights } from './LearnedInsights';
import { LEVEL_TEXT, RECOVERY_GOOD, RECOVERY_LOW, RECOVERY_MID, RecoveryDetail, recoveryColor } from './RecoveryCard';
import { ReadinessTrendChart } from './WeekCharts';
import { PrepCompareCard } from './PrepCompareCard';
import type { PrepCompareRow } from './prepCompare';

const AXIS_WORD = (score: number) => (score <= -0.34 ? 'mal' : score >= 0.34 ? 'bien' : 'regular');
const AXIS_COLOR = (score: number) => (score <= -0.34 ? RECOVERY_LOW : score >= 0.34 ? RECOVERY_GOOD : RECOVERY_MID);

/**
 * El apartado «Preparación» de «Tu forma»: a la vista la nota con la frase del coach, la tendencia, por qué sale esa nota y tus molestias y
 * agujetas; el check-in, la HRV y lo que el coach aprende de ti, plegados a un toque.
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
  compare,
  pain,
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
  /** La prueba del reparto de pesos de la preparación con tus últimos días (ver `PrepCompareCard`). */
  compare: PrepCompareRow[];
  /** Las zonas con una molestia activa ese día. */
  pain: string[];
}) {
  const total = readiness.total;
  const axes = readiness.checkins.axes;
  const hasHrv = log.some((c) => c.hrv !== undefined);
  const soreZones = log.find((c) => c.date === dayIso)?.soreZones ?? {};
  const sore = (Object.keys(soreZones) as SoreZoneId[]).map((z) => `${SORE_ZONE_LABEL[z] ?? z}${soreZones[z] === 2 ? ' (fuertes)' : ''}`);

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
      </section>

      <ReadinessTrendChart series={series} selectedIso={dayIso} onSelect={onSelect} />

      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Por qué esta nota">
        <SectionLabel className="mb-3">Por qué esta nota</SectionLabel>
        <RecoveryDetail readiness={readiness} inFold />
      </section>

      <section className="rounded-2xl bg-white/[0.03] p-5" aria-label="Molestias y agujetas">
        <SectionLabel>Molestias y agujetas</SectionLabel>
        <p className={`mt-2 text-[13px] leading-snug ${pain.length > 0 ? 'text-warn' : 'text-neutral-200'}`}>{pain.length > 0 ? `Molestia activa: ${pain.join(', ')}` : 'Sin molestias activas'}</p>
        <p className="mt-1 text-[13px] leading-snug text-neutral-400">{sore.length > 0 ? `Agujetas: ${sore.join(', ')}` : 'Sin agujetas anotadas ese día'}</p>
      </section>

      <Fold title={isToday ? 'Check-in de hoy' : 'Tus check-ins'}>
        <div className="flex flex-col gap-4">
          {isToday &&
            (todayCheck ? (
              <CheckInSummary check={todayCheck} onEdit={onOpenMorning} />
            ) : (
              <button type="button" onClick={onOpenMorning} className="self-start rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:bg-white/5">
                Hacer el check-in de hoy
              </button>
            ))}
          {/* Las cuatro señales de la semana, de un vistazo. */}
          {axes.length > 0 ? (
            <section aria-label="Tus señales de la semana">
              <div className="grid grid-cols-4 gap-2">
                {axes.map((a) => (
                  <div key={a.key} className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center">
                    <p className="text-[11px] text-neutral-500">{a.label}</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: AXIS_COLOR(a.score) }}>
                      {AXIS_WORD(a.score)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 px-1 text-center text-[11px] text-neutral-500">media de tus check-ins de los últimos 7 días</p>
            </section>
          ) : (
            <p className="text-xs text-neutral-500">Aún no hay check-ins estos 7 días.</p>
          )}
        </div>
      </Fold>
      {hasHrv && (
        <Fold title="Tu HRV">
          <HrvChart log={log} dayIso={dayIso} />
        </Fold>
      )}
      <Fold title="Lo que sé de ti" summary={learning.ready ? undefined : `${learning.pairs}/${learning.needed}`}>
        <div className="flex flex-col gap-5">
          <LearnedInsights learning={learning} bare />
          <div className="border-t border-white/[0.06] pt-4">
            <SectionLabel className="mb-3">Probar un reparto distinto</SectionLabel>
            <PrepCompareCard rows={compare} />
          </div>
        </div>
      </Fold>
    </div>
  );
}
