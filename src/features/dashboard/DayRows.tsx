import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';
import { competitionHeadline } from '../shell/competitionMeta';
import { SectionLabel } from '../shell/SectionLabel';
import type { EnergyItem } from './dayEnergy';
import { ActivityCard, AddWorkoutButton } from './EnergyCards';
import { SessionCard } from './SessionCard';
import type { SessionCardModel } from './sessionCardModel';

/**
 * Las filas de «Tu día»: la mañana o la noche cuando tocan, la sesión con lo que resta cada bloque, el resto de entrenos, «+ Entreno», cómo ha
 * bajado la energía y Tu nivel.
 */
export function DayRows({
  isToday,
  session,
  card,
  sessionEnergy,
  others,
  top,
  chart,
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
  /** Lo que va antes de la sesión: la pregunta de la noche o de dónde sales. */
  top?: ReactNode;
  /** Cómo ha bajado la energía. */
  chart?: ReactNode;
  /** Abre «Lo que hiciste»: la sesión del macro y la del programa de ese día. */
  onOpenDone: () => void;
  onNavigateToPlanificacion: () => void;
  onAddWorkout: () => void;
  onEditWorkout: (id: string) => void;
  /** La tarjeta «Tu nivel» (solo hoy), al final de «Tu día». */
  extra?: ReactNode;
}) {
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
      <SessionCard model={card} energy={sessionEnergy} onOpenPlan={onNavigateToPlanificacion} onOpenDone={onOpenDone} />
      {others.map((item) => (
        <ActivityCard key={item.id} item={item} onClick={item.workoutId ? () => onEditWorkout(item.workoutId!) : item.done ? onOpenDone : onNavigateToPlanificacion} />
      ))}
      <AddWorkoutButton onClick={onAddWorkout} />
      {chart}
      {extra}
    </section>
  );
}
