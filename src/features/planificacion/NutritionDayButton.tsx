import { useEffect, useMemo, useState } from 'react';
import { Apple, Scale } from 'lucide-react';
import type { DailySession, NutritionPrefs } from '../../data/athlete/types';
import { computeDayFlow } from '../../engine/dayFlow';
import { classifyNutritionDay, NUTRITION_DAY_LABEL, nutritionGlance } from '../../engine/nutritionPlan';
import { DayFlow } from '../nutricion/DayFlow';
import { planFor, trainingHourFor } from '../nutricion/nutritionData';
import { Modal } from '../shell/Modal';
import { DAY_TYPE_DOT, DAY_TYPE_STYLE } from './NutritionGlance';

interface NutritionDayButtonProps {
  /** Sesión de hoy: de ella salen el tipo de día y si hay doble WOD. */
  session: DailySession;
  /** Peso más reciente; sin peso no se pueden calcular las cantidades. */
  weightKg: number | null;
  prefs: NutritionPrefs | undefined;
  /** El entreno de hoy ya está registrado. */
  trainedToday: boolean;
  onOpenNutrition: () => void;
}

const nowAsHour = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

/**
 * Icono de nutrición junto a la tirita semanal: el punto de color es el tipo de día de hoy y, al tocarlo, se abre el
 * consejo del día (tipo de día, objetivo, el momento clave alrededor del entreno) con la línea del día — cuánta proteína
 * e hidrato lleva ya el atleta frente a lo previsto, antes y después del entreno. Sustituye a la tarjeta fija que había
 * en la sesión de hoy.
 */
export function NutritionDayButton({ session, weightKg, prefs, trainedToday, onOpenNutrition }: NutritionDayButtonProps) {
  const [open, setOpen] = useState(false);
  const [nowHour, setNowHour] = useState(nowAsHour);
  const dayType = classifyNutritionDay(session);

  // "Ahora" se refresca cada minuto mientras el panel está abierto.
  useEffect(() => {
    if (!open) return;
    setNowHour(nowAsHour());
    const id = window.setInterval(() => setNowHour(nowAsHour()), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const trainingHour = dayType === 'descanso' ? null : trainingHourFor(prefs, session.date);

  const flow = useMemo(() => {
    if (!weightKg) return null;
    const plan = planFor(prefs, session.date, dayType, weightKg);
    return computeDayFlow(plan, prefs?.doneMeals?.[session.date] ?? [], { trainingHour, nowHour, trained: trainedToday });
  }, [weightKg, prefs, session.date, dayType, trainingHour, nowHour, trainedToday]);

  const glance = weightKg
    ? nutritionGlance(dayType, trainingHour !== null && trainingHour < 13 ? 'manana' : 'tarde', weightKg, Boolean(session.doubleWod), trainedToday)
    : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Nutrición de hoy: ${NUTRITION_DAY_LABEL[dayType]}`}
        title={`Nutrición de hoy · ${NUTRITION_DAY_LABEL[dayType]}`}
        className="relative flex w-11 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-white/[0.03] text-brand-gold transition-colors duration-200 hover:bg-white/[0.08]"
      >
        <Apple size={20} strokeWidth={2} aria-hidden="true" />
        <span className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-brand-surface ${DAY_TYPE_DOT[dayType]}`} aria-hidden="true" />
      </button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title="Nutrición de hoy">
          {!weightKg || !flow || !glance ? (
            <div className="flex flex-col gap-3 text-sm text-neutral-300">
              <p>Las cantidades se calculan por kilo de peso corporal, así que primero necesito tu peso.</p>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenNutrition();
                }}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black"
              >
                <Scale size={16} strokeWidth={2.25} aria-hidden="true" /> Registrar mi peso
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${DAY_TYPE_STYLE[dayType]}`}>
                  <span className={`h-2 w-2 rounded-full ${DAY_TYPE_DOT[dayType]}`} aria-hidden="true" />
                  {NUTRITION_DAY_LABEL[dayType]}
                </span>
                <span className="text-[11px] text-neutral-500">para {String(weightKg).replace('.', ',')} kg</span>
              </div>

              <p className="text-sm leading-relaxed text-neutral-300">{glance.keyLine}</p>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Proteína del día</p>
                  <p className="num text-base font-bold text-white">
                    {glance.nutrition.proteinG.min}-{glance.nutrition.proteinG.max} <span className="text-xs font-normal text-neutral-500">g</span>
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Hidratos del día</p>
                  <p className="num text-base font-bold text-white">
                    {glance.nutrition.carbsG.min}-{glance.nutrition.carbsG.max} <span className="text-xs font-normal text-neutral-500">g</span>
                  </p>
                </div>
              </div>

              <DayFlow flow={flow} />

              <button
                onClick={() => {
                  setOpen(false);
                  onOpenNutrition();
                }}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark"
              >
                Ver el menú de este día
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
