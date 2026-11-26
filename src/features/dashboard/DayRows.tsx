import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';
import { competitionHeadline } from '../shell/competitionMeta';
import { SectionLabel } from '../shell/SectionLabel';
import { ActivityList, type ActivityEntry } from './ActivityList';
import type { EnergyItem } from './dayEnergy';
import { SessionCard } from './SessionCard';
import type { SessionCardModel } from './sessionCardModel';

/**
 * Las filas de «Tu día»: la noche cuando toca, la tarjeta de la sesión mientras está por hacer, una fila por cada entreno hecho, «Añadir entreno»,
 * de dónde sales y Tu nivel.
 */
export function DayRows({
  isToday,
  session,
  card,
  sessionEnergy,
  others,
  top,
  morning,
  onOpenDone,
  onNavigateToPlanificacion,
  onAddWorkout,
  onEditWorkout,
  extra,
}: {
  isToday: boolean;
  /** La sesión de hoy (solo para el rótulo de la competición cercana). */
  session: DailySession | null;
  /** Lo que enseña la tarjeta de la sesión (ver `buildSessionCard`). */
  card: SessionCardModel;
  /** Lo que la sesión resta de energía, hecha o prevista. */
  sessionEnergy: EnergyItem | undefined;
  /** El programa de fuerza y los entrenos añadidos. */
  others: EnergyItem[];
  /** Lo que va antes de la sesión: la pregunta de la noche. */
  top?: ReactNode;
  /** De dónde sales, antes de entrenar. */
  morning?: ReactNode;
  /** Abre «Lo que hiciste»: la sesión del macro y la del programa de ese día. */
  onOpenDone: () => void;
  onNavigateToPlanificacion: () => void;
  onAddWorkout: () => void;
  onEditWorkout: (id: string) => void;
  /** La tarjeta «Tu nivel» (solo hoy), al final de «Tu día». */
  extra?: ReactNode;
}) {
  const sessionRow = sessionEnergy?.done ? sessionEnergy : undefined;
  // Las filas van en el orden en que se hicieron; lo que falta, al final.
  const items = [...(sessionRow ? [sessionRow] : []), ...others].sort((a, b) => Number(b.done) - Number(a.done) || (a.start ?? 24) - (b.start ?? 24));
  const rows: ActivityEntry[] = items.map((item) => ({
    item,
    onOpen: item.workoutId ? () => onEditWorkout(item.workoutId!) : item.done ? onOpenDone : onNavigateToPlanificacion,
  }));
  // La tarjeta sobra cuando su sesión ya es una fila, y en un día sin sesión en el que sí entrenaste otra cosa.
  const trained = items.some((i) => i.done);
  const hideCard = (card.kind === 'done' && sessionRow !== undefined) || ((card.kind === 'missing' || card.kind === 'program') && trained);

  return (
    <section className="mt-1 flex flex-col gap-3">
      {top}
      <SectionLabel className="px-1">Tu día</SectionLabel>
      {isToday && session?.competition && !session.competition.eventDay && (
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-brand-gold">
          <Trophy size={13} strokeWidth={2.5} aria-hidden="true" />
          {competitionHeadline(session.competition)}
        </p>
      )}
      {!hideCard && <SessionCard model={card} energy={sessionEnergy} onOpenPlan={onNavigateToPlanificacion} onOpenDone={onOpenDone} />}
      <ActivityList rows={rows} onAdd={onAddWorkout} />
      {morning}
      {extra}
    </section>
  );
}
