import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { DailySession } from '../../data/athlete/types';
import { getWeekdayIndex } from '../../engine/periodization';
import {
  classifyNutritionDay,
  defaultTrainingSlot,
  NUTRITION_DAY_LABEL,
  nutritionGlance,
  type NutritionDayType,
} from '../../engine/nutritionPlan';

/** Color del tipo de día (el mismo en el plan completo y en esta tarjeta): descanso gris, ligero verde, normal dorado, carga alta naranja. */
export const DAY_TYPE_STYLE: Record<NutritionDayType, string> = {
  descanso: 'bg-white/5 text-neutral-400',
  ligero: 'bg-emerald-500/15 text-emerald-300',
  normal: 'bg-brand-gold/15 text-brand-gold',
  alto: 'bg-brand-orange/20 text-brand-orange',
};

const DAY_TYPE_DOT: Record<NutritionDayType, string> = {
  descanso: 'bg-neutral-500',
  ligero: 'bg-emerald-400',
  normal: 'bg-brand-gold',
  alto: 'bg-brand-orange',
};

/**
 * Semáforo nutricional del día, en la tarjeta de hoy: tipo de día, proteína y carbohidrato objetivo y una
 * línea con el momento clave — sin abrir el plan completo (botón de nutrición del Dashboard). Mismas cifras
 * que ese plan (`nutritionGlance`). El horario sale del día de la semana (sábado por la mañana, el resto por
 * la tarde — `defaultTrainingSlot`). Sin peso registrado no se puede calcular y no se muestra.
 */
export function NutritionGlance({ session, weightKg, done = false }: { session: DailySession; weightKg: number; done?: boolean }) {
  const glance = useMemo(() => {
    const dayType = classifyNutritionDay(session);
    const slot = defaultTrainingSlot(getWeekdayIndex(new Date(`${session.date}T12:00:00`)));
    return { dayType, ...nutritionGlance(dayType, slot, weightKg, Boolean(session.doubleWod), done) };
  }, [session, weightKg, done]);
  const { nutrition, keyLine, dayType } = glance;

  return (
    <div className="rounded-xl border border-brand-border bg-brand-surfaceMuted/60 p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${DAY_TYPE_STYLE[dayType]}`}>
          <span className={`h-2 w-2 rounded-full ${DAY_TYPE_DOT[dayType]}`} aria-hidden="true" />
          {NUTRITION_DAY_LABEL[dayType]}
        </span>
        <span className="text-[11px] text-neutral-500">para {String(nutrition.weightKg).replace('.', ',')} kg</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.04] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Proteína</p>
          <p className="num text-xl font-bold text-white">
            {nutrition.proteinG.min}-{nutrition.proteinG.max} <span className="text-sm font-normal text-neutral-500">g</span>
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Carbohidrato</p>
          <p className="num text-xl font-bold text-white">
            {nutrition.carbsG.min}-{nutrition.carbsG.max} <span className="text-sm font-normal text-neutral-500">g</span>
          </p>
        </div>
      </div>
      <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-neutral-400">
        <Clock size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
        {keyLine}
      </p>
      <p className="mt-2 text-[11px] text-neutral-600">Plan completo y guía por manos: botón de nutrición del Dashboard.</p>
    </div>
  );
}
