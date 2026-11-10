import { useMemo } from 'react';
import { Dumbbell } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { getMovementById } from '../../data/movements';
import { companionIndexForDate, companionSchedule, type ScheduleSession } from '../../engine/companionSchedule';
import { summarizeCompanionEntry } from '../../engine/companionSummary';
import { isCompanionProgram } from '../../engine/strengthCompanion';

const nameOf = (id: string) => getMovementById(id)?.name ?? id;
const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

/**
 * El programa de fuerza que convive con el macro (el Texas), en el día que tocas en la tira de la semana: lo que hiciste o saltaste ese día, o la sesión
 * que le toca (marcada como «prevista»: el programa avanza por sesiones, no por fecha, así que si aplazas una, las siguientes se corren). Nada si ese día no toca.
 */
export function CompanionDayBlock({ profile, history, dateIso, todayIso }: { profile: AthleteProfile; history: SessionHistoryEntry[]; dateIso: string; todayIso: string }) {
  const done = (profile.companionLog ?? []).filter((e) => e.date === dateIso);
  const program = useMemo(() => (profile.strengthPrograms ?? []).filter(isCompanionProgram).find((p) => dateIso >= p.startDate && dateIso <= p.endDate), [profile.strengthPrograms, dateIso]);
  const planned = useMemo<ScheduleSession | null>(() => {
    if (!program || done.length > 0) return null;
    const index = companionIndexForDate(program, dateIso, todayIso);
    if (index === null) return null;
    return companionSchedule(profile, history, program, todayIso).flatMap((w) => w.sessions).find((s) => s.index === index) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, dateIso, todayIso, done.length, profile.prs, profile.companionLog]);

  if (done.length === 0 && !planned) return null;

  return (
    <section aria-label="Programa de fuerza" className="mt-4 border-t border-white/[0.06] pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        <Dumbbell size={12} aria-hidden="true" /> Programa de fuerza{planned ? ' · previsto' : ''}
      </p>
      {done.map((c) => {
        const s = summarizeCompanionEntry(c, nameOf);
        return (
          <div key={c.id} className="rounded-lg bg-white/[0.04] px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-white">{s.title}</p>
              {s.outcome === 'saltada' ? <span className="text-xs text-neutral-500">Saltada</span> : s.stats && <span className="text-xs text-neutral-400">{s.stats}</span>}
            </div>
            {s.lines.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-neutral-300">
                {s.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {planned && (
        <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
          <p className="text-sm font-semibold text-white">{planned.role}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-neutral-300">
            {planned.lines.map((l) => (
              <li key={l.movementName}>
                {l.movementName} · {l.attempt ? 'marca de 5' : l.scheme} · {kg(l.loadKg)}
                {l.percent !== null ? ` (${l.percent} %)` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">Previsto: el programa avanza por sesiones hechas, no por fecha. Si aplazas una, esta se corre al día siguiente que toque.</p>
        </div>
      )}
    </section>
  );
}
