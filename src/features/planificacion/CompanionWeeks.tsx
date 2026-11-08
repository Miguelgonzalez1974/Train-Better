import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { AthleteProfile, SessionHistoryEntry } from '../../data/athlete/types';
import { companionSchedule, type ScheduleState } from '../../engine/companionSchedule';
import type { CompanionProgram } from '../../engine/strengthCompanion';
import { STRENGTH_METHOD_LABEL } from '../../engine/strengthPrograms';
import { Modal } from '../shell/Modal';

const DAY = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

/** Lo que dice cada día del papel que hace en el ciclo del método: la última palabra de «Texas Method · día de volumen». */
function shortRole(role: string): string {
  const after = role.split('·').pop()?.trim() ?? role;
  return after.replace(/^día de /, '');
}

const DOT: Record<ScheduleState, string> = {
  hecha: 'text-good',
  saltada: 'text-neutral-600',
  siguiente: 'text-brand-orange',
  pendiente: 'text-neutral-700',
};

/**
 * «Cómo queda cada semana»: el programa entero, semana a semana, con el levantamiento, el esquema y la carga de cada sesión (con tus PR de
 * ahora y sin la autorregulación de hoy). Las hechas llevan una marca y la siguiente sale resaltada. El cálculo está en `engine/companionSchedule.ts`.
 */
export function CompanionWeeks({
  open,
  onClose,
  profile,
  history,
  program,
  todayIso,
}: {
  open: boolean;
  onClose: () => void;
  profile: AthleteProfile;
  history: SessionHistoryEntry[];
  program: CompanionProgram;
  todayIso: string;
}) {
  const weeks = useMemo(() => (open ? companionSchedule(profile, history, program, todayIso) : []), [open, profile, history, program, todayIso]);
  return (
    <Modal open={open} onClose={onClose} title={`${STRENGTH_METHOD_LABEL[program.method]} · semana a semana`}>
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-neutral-500">
          Con tus PR de ahora y sin la autorregulación de hoy: la carga real de cada día puede bajar o subir con tu preparación. Si aplazas una sesión, el resto se corre.
        </p>
        {weeks.map((w) => (
          <section key={w.week} className="rounded-xl border border-white/10 p-3" aria-label={`Semana ${w.week}`}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-400">Semana {w.week}</p>
            <ul className="divide-y divide-white/[0.06]">
              {w.sessions.map((s) => (
                <li key={s.index} className={`flex items-baseline gap-2 py-1.5 text-sm ${s.state === 'siguiente' ? 'text-white' : 'text-neutral-300'}`}>
                  <span className="w-9 shrink-0 text-xs font-semibold text-neutral-500">{DAY[s.weekday]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="num block text-xs text-neutral-500">{shortRole(s.role)}</span>
                    {s.lines.map((l) => (
                      <span key={l.movementName} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0">
                          {l.movementName}{' '}
                          <span className="num text-xs text-neutral-500">
                            {l.scheme}
                            {l.percent !== null ? ` · ${l.percent} %` : ''}
                            {l.attempt ? ' · marca' : ''}
                          </span>
                        </span>
                        <span className="num shrink-0 font-semibold">{kg(l.loadKg)}</span>
                      </span>
                    ))}
                  </span>
                  <span className={`w-4 shrink-0 ${DOT[s.state]}`} aria-label={s.state}>
                    {s.state === 'hecha' ? <Check size={14} aria-hidden="true" /> : s.state === 'siguiente' ? '●' : s.state === 'saltada' ? '–' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
