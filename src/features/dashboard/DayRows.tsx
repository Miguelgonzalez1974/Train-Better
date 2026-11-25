import type { ReactNode } from 'react';
import { ChevronRight, TrendingUp, Trophy } from 'lucide-react';
import { formToday, type FormSeries } from '../../engine/formCurve';
import type { DailySession } from '../../data/athlete/types';
import { competitionHeadline } from '../shell/competitionMeta';
import { SectionLabel } from '../shell/SectionLabel';
import { SessionCard } from './SessionCard';
import type { SessionCardModel } from './sessionCardModel';

/** La insignia de la izquierda de las demás filas: un cuadrado gris con un icono. */
function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgb(var(--c-white) / 0.08)', color: 'rgb(var(--c-white) / 0.8)' }}>
      {children}
    </span>
  );
}

function Row({ badge, title, sub, right, onClick }: { badge: ReactNode; title: string; sub: ReactNode; right?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 transition-colors duration-200 hover:bg-white/[0.07]">
      {badge}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">{sub}</span>
      </span>
      {right}
    </button>
  );
}

const chevron = <ChevronRight size={16} className="mr-1 shrink-0 text-neutral-600" aria-hidden="true" />;

/**
 * "Tu día" bajo el anillo: la tarjeta de la sesión (ver `SessionCard`) y las demás filas, una por cosa que cuenta. La curva de forma se abre en su
 * ventana. La nutrición y el análisis viven en Rex y en las pestañas.
 */
export function DayRows({
  isToday,
  session,
  card,
  form,
  formNote,
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
  /** La serie de la curva de forma (solo hoy; null en un día pasado o sin historial). */
  form: FormSeries | null;
  /** Lo que dice la fila sobre tus ventanas ("Próxima ventana en 5 días · jue 12 nov"); sin él, la frase de hoy. */
  formNote?: string | null;
  /** Abre «Lo que hiciste»: la sesión del macro y la del programa de ese día. */
  onOpenDone: () => void;
  onNavigateToPlanificacion: () => void;
  /** Abre la ventana con la curva de forma. */
  onOpenForm: () => void;
  /** Una fila más al final de «Tu día» (el nivel), con el mismo diseño. */
  extra?: ReactNode;
}) {
  const formNow = form ? formToday(form) : null;
  const formRow = form ? (
    <Row
      // Sin porcentaje ni estado: «cómo estás hoy» lo dice la Preparación del aro. Esta fila mira hacia delante (cuándo se abre tu próxima ventana); la energía de hoy está dentro de la ventana.
      badge={<Badge><TrendingUp size={20} strokeWidth={2.25} aria-hidden="true" /></Badge>}
      title="Tu forma"
      sub={formNow ? (formNow.state === 'cargado' && formNow.reason ? formNow.reason : (formNote ?? formNow.sentence)) : `Aún poco historial: ${form.sessions} sesiones registradas`}
      right={chevron}
      onClick={onOpenForm}
    />
  ) : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel className="px-1">Tu día</SectionLabel>
      {isToday && session?.competition && !session.competition.eventDay && (
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-brand-gold">
          <Trophy size={13} strokeWidth={2.5} aria-hidden="true" />
          {competitionHeadline(session.competition)}
        </p>
      )}
      <SessionCard model={card} onOpenPlan={onNavigateToPlanificacion} onOpenDone={onOpenDone} />
      {/* Tu forma: la curva de supercompensación; con poco historial dice cuánto falta para tenerla. */}
      {formRow}
      {extra}
    </section>
  );
}
