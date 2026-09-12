import { Apple, Utensils } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';
import { getNutritionTip } from '../../engine/nutritionTips';

/**
 * Aviso corto de nutrición, anclado al tipo de sesión de hoy — sentido común de coach, no un plan
 * de macros. `variant='pre'` (antes/durante) va arriba de la sesión, antes de entrenar;
 * `variant='post'` (recuperación) va en el recap al completarla. Ver `getNutritionTip`.
 */
export function NutritionTip({ session, variant }: { session: DailySession; variant: 'pre' | 'post' }) {
  const tip = getNutritionTip(session);
  if (!tip) return null;

  if (variant === 'pre') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-brand-gold/25 bg-brand-gold/[0.08] px-3.5 py-3">
        <Apple size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" />
        <div className="flex flex-col gap-1 text-xs leading-relaxed text-neutral-300">
          <p>
            <span className="font-semibold text-brand-gold">Antes</span> · {tip.before}
          </p>
          {tip.during && (
            <p>
              <span className="font-semibold text-brand-gold">Durante</span> · {tip.during}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-brand-neon/25 bg-brand-neon/[0.08] px-3.5 py-3">
      <Utensils size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-neon" />
      <p className="text-xs leading-relaxed text-neutral-300">
        <span className="font-semibold text-brand-neon">Recuperación</span> · {tip.after}
      </p>
    </div>
  );
}
