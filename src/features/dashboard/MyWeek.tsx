import { useMemo, useState, type ComponentProps } from 'react';
import { AlertCircle, Check, ChevronRight, Trophy } from 'lucide-react';
import type { AthleteProfile, DailySession, SessionHistoryEntry } from '../../data/athlete/types';
import { ChipTabs } from '../shell/ChipTabs';
import { PartGuard } from '../shell/PartGuard';
import { SectionLabel } from '../shell/SectionLabel';
import { buildCurrentWeek, type WeekDayStatus } from './currentWeek';
import { RexWeekly } from './RexWeekly';

export type WeekView = 'actual' | 'pasada';

const VIEWS: { id: WeekView; label: string }[] = [
  { id: 'actual', label: 'Esta semana' },
  { id: 'pasada', label: 'La pasada' },
];

const DOT: Record<WeekDayStatus, string> = {
  hecho: 'text-brand-bg',
  hoy: 'border-2 border-white',
  previsto: 'border border-dashed border-white/40',
  descanso: 'text-neutral-600',
  'sin-apuntar': 'border border-white/15 text-neutral-600',
};
const DOT_NAME: Record<WeekDayStatus, string> = { hecho: 'hecho', hoy: 'hoy', previsto: 'previsto', descanso: 'descanso', 'sin-apuntar': 'sin apuntar' };

function Figure({ value, label, first = false }: { value: string; label: string; first?: boolean }) {
  return (
    <div className={`min-w-0 ${first ? 'pr-2.5' : 'border-l border-white/[0.12] pl-[11px]'}`}>
      <p className="num truncate text-[15px] font-semibold text-white">{value}</p>
      <p className="text-[11px] leading-snug text-neutral-500">{label}</p>
    </div>
  );
}

/** «Esta semana»: los días, las cifras hasta hoy, lo mejor, lo que vigilar y lo que queda. */
function WeekNow({ profile, history, todayIso, todaySession, onOpenDay }: { profile: AthleteProfile; history: SessionHistoryEntry[]; todayIso: string; todaySession: DailySession | null; onOpenDay: (iso: string) => void }) {
  const week = useMemo(() => buildCurrentWeek({ profile, history, todayIso, todaySession }), [profile, history, todayIso, todaySession]);
  const card = 'rounded-2xl bg-white/[0.04] p-3.5';
  const pending = week.upcoming.length;
  return (
    <div className="flex flex-col gap-3" data-testid="week-now">
      <p className="px-1 text-[11px] text-neutral-500">
        {week.range}
        {week.planLine ? ` · ${week.planLine}` : ''}
      </p>

      <div className={`${card} grid grid-cols-7 gap-1 text-center`} aria-label="Los días de esta semana">
        {week.days.map((d) => (
          <div key={d.iso} className="flex flex-col items-center gap-1">
            <span className={`text-[11px] ${d.isToday ? 'font-bold text-white' : 'text-neutral-500'}`}>{d.letter}</span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${DOT[d.status]}`}
              style={d.status === 'hecho' ? { backgroundColor: 'rgb(var(--c-effort))' } : undefined}
              role="img"
              aria-label={`${d.letter}: ${DOT_NAME[d.status]}`}
              data-status={d.status}
            >
              {d.status === 'hecho' ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : d.status === 'descanso' || d.status === 'sin-apuntar' ? '–' : ''}
            </span>
          </div>
        ))}
      </div>

      {week.fresh ? (
        <p className={`${card} text-[13px] leading-relaxed text-neutral-200`}>
          La semana acaba de empezar: {pending === 0 ? 'no tienes sesiones previstas.' : `${pending} ${pending === 1 ? 'sesión' : 'sesiones'} por delante.`}
        </p>
      ) : (
        <div className={`${card} grid grid-cols-3`}>
          <Figure first value={`${week.sessions.done} de ${week.sessions.planned}`} label="sesiones" />
          <Figure value={week.load.value} label={week.load.word ? `carga ${week.load.word.toLowerCase()}` : 'carga'} />
          <Figure value={week.rpe ?? '—'} label="esfuerzo medio (RPE)" />
        </div>
      )}

      {week.best.length > 0 && (
        <section className={card} aria-label="Lo mejor hasta ahora">
          <SectionLabel>Lo mejor hasta ahora</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1.5">
            {week.best.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] leading-snug text-neutral-200">
                <Trophy size={14} strokeWidth={2.25} className="mt-px shrink-0 text-good" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {week.watch.length > 0 && (
        <section className={card} aria-label="A vigilar">
          <SectionLabel>A vigilar</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1.5">
            {week.watch.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] leading-snug text-neutral-200">
                <AlertCircle size={14} strokeWidth={2.25} className="mt-px shrink-0 text-warn" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card} aria-label="Lo que queda">
        <SectionLabel>{week.fresh ? 'Lo que viene' : 'Lo que queda'}</SectionLabel>
        {pending === 0 ? (
          <p className="mt-2 text-[13px] text-neutral-400">No queda ninguna sesión esta semana.</p>
        ) : (
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {week.upcoming.map((u) => (
              <li key={u.iso}>
                <button type="button" onClick={() => onOpenDay(u.iso)} className="flex w-full items-center gap-2.5 py-2.5 text-left" data-testid="week-upcoming">
                  <span className="w-8 shrink-0 text-[11px] text-neutral-500">{u.label}</span>
                  <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-snug text-white">{u.title}</span>
                  {u.minutes !== null && <span className="shrink-0 text-[11px] text-neutral-500">{u.minutes} min</span>}
                  <ChevronRight size={14} className="shrink-0 text-neutral-600" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * La ventana «Mi semana»: dos botones, «Esta semana» (cómo vas) y «La pasada» (la revisión con Rex, con sus propuestas). La conversación de la
 * pasada empieza la primera vez que la miras y se conserva al cambiar de botón.
 */
export function MyWeek({
  view,
  onView,
  profile,
  history,
  todayIso,
  todaySession,
  onOpenDay,
  review,
}: {
  view: WeekView;
  onView: (view: WeekView) => void;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  todayIso: string;
  todaySession: DailySession | null;
  onOpenDay: (iso: string) => void;
  /** La conversación de la semana pasada (null: aún no hay ninguna semana que repasar). */
  review: ComponentProps<typeof RexWeekly> | null;
}) {
  const [seenPast, setSeenPast] = useState(view === 'pasada');
  if (view === 'pasada' && !seenPast) setSeenPast(true);
  const fallback = <p className="rounded-2xl bg-white/[0.04] p-3.5 text-sm text-neutral-400">Esta parte no se ha podido mostrar.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ChipTabs items={VIEWS} active={view} onChange={onView} label="Mi semana" />
      {view === 'actual' && (
        <PartGuard name="esta semana" fallback={fallback}>
          <WeekNow profile={profile} history={history} todayIso={todayIso} todaySession={todaySession} onOpenDay={onOpenDay} />
        </PartGuard>
      )}
      {seenPast && (
        <div hidden={view !== 'pasada'}>
          <PartGuard name="la semana pasada" fallback={fallback}>
            {review ? (
              <RexWeekly {...review} />
            ) : (
              <p className="rounded-2xl bg-white/[0.04] p-3.5 text-[13px] leading-relaxed text-neutral-300">
                Aún no hay una semana que repasar. En cuanto tengas una semana con sesiones hechas, te la cuento aquí.
              </p>
            )}
          </PartGuard>
        </div>
      )}
    </div>
  );
}
