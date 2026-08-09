import { useState } from 'react';
import { Modal } from '../shell/Modal';
import { DaySessionBlocks } from '../planificacion/DaySessionBlocks';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { generateSessionForDate } from '../../engine/generateSession';
import { getActiveMacrocycle, getWeekdayIndex, toLocalIsoDate } from '../../engine/periodization';
import type { DailySession } from '../../data/athlete/types';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface NextWeekPreviewProps {
  onClose: () => void;
}

interface NextWeekDay {
  date: string;
  /** null cuando ese dia no tiene macrociclo activo y todavia no se ha elegido nada — no se auto-genera "Mantenimiento". */
  session: DailySession | null;
}

/**
 * Vista previa de los 7 dias de la semana siguiente. Cada dia se lee de la misma cache
 * persistente que usa Planificacion/WeekStrip (o se genera y se guarda ahi si es la primera
 * vez, y solo si ese dia cae dentro de un macrociclo activo) — asi el contenido no cambia entre
 * visitas, y cuando ese dia llegue a ser "hoy" se reutiliza exactamente lo mismo que ya se vio aqui.
 */
export function NextWeekPreview({ onClose }: NextWeekPreviewProps) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [week] = useState<NextWeekDay[]>(() => {
    const profile = athleteRepository.getProfile();
    const history = athleteRepository.getHistory();
    const goals = profile.goals;
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(nextMonday.getDate() - getWeekdayIndex(today) + 7);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(nextMonday);
      date.setDate(date.getDate() + i);
      const dateIso = toLocalIsoDate(date);
      const cached = athleteRepository.getCachedSession(dateIso);
      if (cached) return { date: dateIso, session: cached };
      if (!getActiveMacrocycle(profile.macrocycles, dateIso)) return { date: dateIso, session: null };
      const fresh = generateSessionForDate(profile, history, date, goals);
      athleteRepository.saveCachedSession(fresh);
      return { date: dateIso, session: fresh };
    });
  });

  return (
    <Modal open onClose={onClose} title="Próxima semana">
      <p className="mb-3 text-xs text-neutral-500">Vista previa de tu próxima semana de entrenamiento.</p>
      <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
        {week.map(({ date, session }, i) => {
          const isSelected = expanded === i;
          const isMaintenance = Boolean(session && !session.isRestDay && session.mesocycleWeek === 0);
          return (
            <div key={date} className="rounded-xl bg-brand-surfaceMuted/60">
              <button
                onClick={() => setExpanded((prev) => (prev === i ? null : i))}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2 font-medium text-white">
                  {DAY_LABELS[i]} · {date}
                  {isMaintenance && (
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                      Mantenimiento
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">
                  {!session ? 'Sin elegir' : session.isRestDay ? 'Descanso' : isSelected ? 'Ocultar' : 'Ver'}
                </span>
              </button>
              {isSelected && (
                <div className="px-3 pb-3">
                  {!session ? (
                    <p className="text-sm text-neutral-400">Sin macrociclo activo ese día todavía — ese día decides tú qué hacer.</p>
                  ) : session.isRestDay ? null : (
                    <DaySessionBlocks session={session} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
