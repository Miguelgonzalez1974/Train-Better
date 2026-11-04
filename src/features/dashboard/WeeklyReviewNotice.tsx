import { ArrowRight } from 'lucide-react';
import { RexMascot } from '../objetivos/RexMascot';
import type { WeeklyReview } from './weeklyReview';

/** Texto corto de las fechas de la semana repasada: "2 nov al 8 nov". */
function rangeText(review: WeeklyReview): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${fmt(review.from)} al ${fmt(review.to)}`;
}

/** Un aviso en el Resumen (de lunes a miércoles) para repasar la semana pasada con Rex. Desaparece al darla por revisada. */
export function WeeklyReviewNotice({ review, onOpen }: { review: WeeklyReview; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.06] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.09]"
    >
      <RexMascot size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-white">Tu semana pasada está lista para repasar</span>
        <span className="mt-0.5 block text-xs text-neutral-400">{rangeText(review)}{review.planLine ? ` · ${review.planLine}` : ''}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-orange">
        Repasar con Rex <ArrowRight size={12} aria-hidden="true" />
      </span>
    </button>
  );
}
