import { ArrowRight, Target } from 'lucide-react';
import type { EmphasisReview } from '../../data/athlete/types';
import { emphasisSubject, formatRatio } from '../../engine/programmingEmphasis';

/** La frase del aviso: de lo revisado, lo que más se movió, y cuántas cosas más hay. */
function headline(review: EmphasisReview): string {
  const decided = review.entries.filter((e) => e.decision !== 'esperar');
  const e = [...decided].sort((a, b) => Math.abs((b.now ?? 0) - (b.before ?? 0)) - Math.abs((a.now ?? 0) - (a.before ?? 0)))[0];
  if (!e || e.before === null || e.now === null) return 'Revisión lista: mira qué ha cambiado en tus 4 semanas.';
  const name = emphasisSubject(e.area, e.key.split(':')[1]);
  if (e.decision === 'rotar') return `Revisión lista: ${name} no ha mejorado en 8 semanas, así que paso a otra cosa.`;
  const verb = e.now > e.before ? 'ha mejorado' : 'sigue igual';
  return `Revisión lista: ${name} ${verb}. Pasó de ${formatRatio(e.area, e.before)} a ${formatRatio(e.area, e.now)}.`;
}

/**
 * Un aviso de una sola vez en el Resumen cuando el coach ha revisado lo que priorizaba (ver `reviewPlan` en
 * `engine/programmingEmphasis.ts`): lleva a Objetivos → Perfil, donde está la revisión entera, y deja de salir al verla.
 */
export function EmphasisReviewNotice({ review, onOpen }: { review: EmphasisReview; onOpen: () => void }) {
  const decided = review.entries.filter((e) => e.decision !== 'esperar').length;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.06] px-3.5 py-3 text-left text-[13px] leading-relaxed text-neutral-300 transition-colors hover:bg-white/[0.09]"
    >
      <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange" aria-hidden="true">
        <Target size={13} strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="font-semibold text-white">{headline(review)}</strong>
        <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-brand-orange">
          Ver la revisión{decided > 1 ? ` (${decided} cosas)` : ''} <ArrowRight size={12} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
