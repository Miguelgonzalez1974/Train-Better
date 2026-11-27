import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';
import { competitionHeadline } from '../shell/competitionMeta';
import { SectionLabel } from '../shell/SectionLabel';
import { ActivityList, type ActivityEntry } from './ActivityList';
import { isTraining, type EnergyItem } from './dayEnergy';
import { SessionCard } from './SessionCard';
import type { SessionCardModel } from './sessionCardModel';

/**
 * Las filas de «Tu día»: la noche cuando toca, la tarjeta de la sesión mientras está por hacer, una fila por cada cosa del día (entrenos,
 * descanso y movilidad), «Añadir entreno» y «Hoy no entreno», de dónde sales y Tu nivel.
 */
export function DayRows({
  isToday,
  session,
  card,
  sessionEnergy,
  others,
  resting,
  onRest,
  onRemoveRest,
  suggestion,
  onEditMobility,
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
  /** El resto del día: descanso, programa de fuerza, entrenos añadidos y movilidad. */
  others: EnergyItem[];
  /** Hoy está marcado como descanso y no has entrenado: la sesión se aparta. */
  resting: boolean;
  /** Marcar hoy como descanso; ausente cuando no toca ofrecerlo. */
  onRest?: () => void;
  /** Quitar la marca de descanso de hoy. */
  onRemoveRest?: () => void;
  /** La movilidad propuesta para un día de descanso. */
  suggestion?: ReactNode;
  onEditMobility: (id: string) => void;
  /** Lo que va antes de la sesión: la pregunta de la noche. */
  top?: ReactNode;
  /** De dónde sales, antes de entrenar. */
  morning?: ReactNode;
  /** Abre la pantalla del entreno hecho: la sesión del macro y la del programa de ese día. */
  onOpenDone: () => void;
  onNavigateToPlanificacion: () => void;
  onAddWorkout: () => void;
  onEditWorkout: (id: string) => void;
  /** La tarjeta «Tu nivel» (solo hoy), al final de «Tu día». */
  extra?: ReactNode;
}) {
  const sessionRow = sessionEnergy?.done ? sessionEnergy : undefined;
  // El descanso encabeza; luego lo hecho en su orden (la movilidad detrás de los entrenos) y, al final, lo que falta.
  const rank = (i: EnergyItem) => (!i.done ? 3 : i.kind === 'descanso' ? 0 : i.kind === 'movilidad' ? 2 : 1);
  const items = [...(sessionRow ? [sessionRow] : []), ...others].sort((a, b) => rank(a) - rank(b) || (a.start ?? 24) - (b.start ?? 24));
  const rows: ActivityEntry[] = items.map((item) => {
    if (item.kind === 'descanso') return { item, onRemove: onRemoveRest };
    if (item.mobilityId) return { item, onOpen: () => onEditMobility(item.mobilityId!) };
    return { item, onOpen: item.workoutId ? () => onEditWorkout(item.workoutId!) : item.done ? onOpenDone : onNavigateToPlanificacion };
  });
  // La tarjeta sobra cuando su sesión ya es una fila, en un día de descanso, y en un día sin sesión en el que sí hiciste otra cosa.
  const trained = items.some((i) => i.done && isTraining(i));
  const hideCard = resting || (card.kind === 'done' && sessionRow !== undefined) || ((card.kind === 'missing' || card.kind === 'program') && (trained || rows.length > 0));

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
      <ActivityList rows={rows} onAdd={onAddWorkout} onRest={onRest} suggestion={suggestion} />
      {morning}
      {extra}
    </section>
  );
}
