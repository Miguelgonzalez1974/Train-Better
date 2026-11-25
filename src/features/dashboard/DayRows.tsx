import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';
import { competitionHeadline } from '../shell/competitionMeta';
import { SectionLabel } from '../shell/SectionLabel';
import { FormCard } from './FormCard';
import type { FormCardModel } from './formCardModel';
import { SessionCard } from './SessionCard';
import type { SessionCardModel } from './sessionCardModel';

/**
 * "Tu día" bajo el anillo: las tarjetas de la sesión (ver `SessionCard`), de «Tu forma» (ver `FormCard`) y de «Tu nivel» (ver `LevelSummaryCard`).
 * La nutrición y los objetivos viven en Rex y en sus pestañas.
 */
export function DayRows({
  isToday,
  session,
  card,
  formCard,
  onOpenDone,
  onNavigateToPlanificacion,
  onOpenForm,
  extra,
}: {
  isToday: boolean;
  /** La sesión de hoy (solo para el rótulo de la competición cercana). */
  session: DailySession | null;
  /** Lo que enseña la tarjeta de la sesión (ver `buildSessionCard`). */
  card: SessionCardModel;
  /** Lo que enseña la tarjeta «Tu forma» (ver `buildFormCard`). */
  formCard: FormCardModel;
  /** Abre «Lo que hiciste»: la sesión del macro y la del programa de ese día. */
  onOpenDone: () => void;
  onNavigateToPlanificacion: () => void;
  /** Abre la pantalla «Tu forma», con sus chips. */
  onOpenForm: () => void;
  /** La tarjeta «Tu nivel» (solo hoy), al final de «Tu día». */
  extra?: ReactNode;
}) {
  return (
    <section className="mt-1 flex flex-col gap-3">
      <SectionLabel className="px-1">Tu día</SectionLabel>
      {isToday && session?.competition && !session.competition.eventDay && (
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-brand-gold">
          <Trophy size={13} strokeWidth={2.5} aria-hidden="true" />
          {competitionHeadline(session.competition)}
        </p>
      )}
      <SessionCard model={card} onOpenPlan={onNavigateToPlanificacion} onOpenDone={onOpenDone} />
      {/* Tu forma: energía, sueño, carga y molestias; se abre con el detalle por apartados. */}
      <FormCard model={formCard} onOpen={onOpenForm} />
      {extra}
    </section>
  );
}
