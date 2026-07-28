import { useState } from 'react';
import { Modal } from '../shell/Modal';
import { DaySessionBlocks } from '../planificacion/DaySessionBlocks';
import { athleteRepository } from '../../data/athlete/athleteRepository';
import { generateDailySession } from '../../engine/generateSession';
import { getWeekdayIndex } from '../../engine/periodization';
import type { DailySession } from '../../data/athlete/types';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface NextWeekPreviewProps {
  onClose: () => void;
}

/**
 * Vista previa de los 7 dias de la semana siguiente, generada al vuelo con el perfil/historial
 * actuales. No se persiste en ningun sitio: el dia real, cuando llegue, se genera (y cachea) de
 * nuevo con el ACWR mas fresco — esta vista es solo para poder mirar hacia adelante.
 */
export function NextWeekPreview({ onClose }: NextWeekPreviewProps) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [{ week, mesocycleStartDate }] = useState<{ week: DailySession[]; mesocycleStartDate: string }>(() => {
    const profile = athleteRepository.getProfile();
    const history = athleteRepository.getHistory();
    const goal = athleteRepository.getGoal();
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(nextMonday.getDate() - getWeekdayIndex(today) + 7);

    const week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(nextMonday);
      date.setDate(date.getDate() + i);
      return generateDailySession(profile, history, date, goal);
    });
    return { week, mesocycleStartDate: profile.mesocycleStartDate };
  });

  return (
    <Modal open onClose={onClose} title="Próxima semana">
      <p className="mb-3 text-xs text-neutral-500">
        Vista previa — el día real se genera con tu progreso más actualizado y puede variar.
      </p>
      <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
        {week.map((session, i) => {
          const isSelected = expanded === i;
          const beforeStart = session.date < mesocycleStartDate;
          return (
            <div key={session.date} className="rounded-xl bg-brand-surfaceMuted/60">
              {beforeStart ? (
                <div className="flex w-full items-center justify-between px-3 py-2.5 text-sm">
                  <span className="font-medium text-white">
                    {DAY_LABELS[i]} · {session.date}
                  </span>
                  <span className="text-xs text-neutral-500">Sin programar</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setExpanded((prev) => (prev === i ? null : i))}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium text-white">
                      {DAY_LABELS[i]} · {session.date}
                    </span>
                    <span className="text-xs text-neutral-500">{session.isRestDay ? 'Descanso' : isSelected ? 'Ocultar' : 'Ver'}</span>
                  </button>
                  {isSelected && !session.isRestDay && (
                    <div className="px-3 pb-3">
                      <DaySessionBlocks session={session} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
