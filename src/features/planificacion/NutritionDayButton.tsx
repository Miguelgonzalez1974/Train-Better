import { useEffect, useMemo, useState } from 'react';
import { Apple, ArrowLeft, Scale } from 'lucide-react';
import type { DailySession, NutritionPrefs } from '../../data/athlete/types';
import { computeDayFlow } from '../../engine/dayFlow';
import { MEAL_LABEL, type MealKey } from '../../engine/mealPlan';
import { classifyNutritionDay, NUTRITION_DAY_LABEL } from '../../engine/nutritionPlan';
import { DayFlow } from '../nutricion/DayFlow';
import { ExtraFoodPanel } from '../nutricion/ExtraFoodPanel';
import { MealBuilderPanel } from '../nutricion/MealBuilderPanel';
import { extraInputsFor, planFor, trainingHourFor, withoutExtra } from '../nutricion/nutritionData';
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
  updatePrefs: (update: (prefs: NutritionPrefs) => NutritionPrefs) => void;
}

const nowAsHour = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

/**
 * Icono de nutrición junto a la tirita semanal: el punto de color es el tipo de día de hoy. Al tocarlo se abre la
 * línea del día — lo hecho frente a lo previsto, antes y después del entreno — y tocar el punto o la barra de una
 * comida la abre, dentro del mismo panel, para montarla eligiendo alimentos. Sustituye a la tarjeta fija que había
 * en la sesión de hoy.
 */
export function NutritionDayButton({ session, weightKg, prefs, trainedToday, onOpenNutrition, updatePrefs }: NutritionDayButtonProps) {
  const [open, setOpen] = useState(false);
  const [openMeal, setOpenMeal] = useState<MealKey | null>(null);
  const [addingExtra, setAddingExtra] = useState(false);
  const [nowHour, setNowHour] = useState(nowAsHour);
  const dayType = classifyNutritionDay(session);

  // "Ahora" se refresca cada minuto mientras el panel está abierto.
  useEffect(() => {
    if (!open) return;
    setNowHour(nowAsHour());
    const id = window.setInterval(() => setNowHour(nowAsHour()), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const trainingHour = trainingHourFor(prefs, session.date);
  const plan = useMemo(
    () => (weightKg ? planFor(prefs, session.date, dayType, weightKg, trainingHour) : null),
    [weightKg, prefs, session.date, dayType, trainingHour],
  );
  const extras = useMemo(() => extraInputsFor(prefs, session.date), [prefs, session.date]);
  const flow = useMemo(
    () =>
      plan
        ? computeDayFlow(plan, prefs?.doneMeals?.[session.date] ?? [], extras, {
            trainingHour: dayType === 'descanso' ? null : trainingHour,
            nowHour,
            trained: trainedToday,
          })
        : null,
    [plan, prefs, session.date, extras, dayType, trainingHour, nowHour, trainedToday],
  );

  function close() {
    setOpen(false);
    setOpenMeal(null);
    setAddingExtra(false);
  }

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
        <Modal open onClose={close} title={openMeal ? MEAL_LABEL[openMeal] : addingExtra ? 'Añadir ahora' : 'Nutrición de hoy'}>
          {!weightKg || !plan || !flow ? (
            <div className="flex flex-col gap-3 text-sm text-neutral-300">
              <p>Las cantidades se calculan por kilo de peso corporal, así que primero necesito tu peso.</p>
              <button
                onClick={() => {
                  close();
                  onOpenNutrition();
                }}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black"
              >
                <Scale size={16} strokeWidth={2.25} aria-hidden="true" /> Registrar mi peso
              </button>
            </div>
          ) : openMeal ? (
            <div className="flex flex-col gap-3">
              <button onClick={() => setOpenMeal(null)} className="flex items-center gap-1.5 self-start text-xs font-semibold text-brand-gold">
                <ArrowLeft size={14} aria-hidden="true" /> Hoy
              </button>
              <MealBuilderPanel prefs={prefs ?? {}} weightKg={weightKg} updatePrefs={updatePrefs} iso={session.date} dayType={dayType} mealKey={openMeal} />
            </div>
          ) : addingExtra ? (
            <div className="flex flex-col gap-3">
              <button onClick={() => setAddingExtra(false)} className="flex items-center gap-1.5 self-start text-xs font-semibold text-brand-gold">
                <ArrowLeft size={14} aria-hidden="true" /> Hoy
              </button>
              <ExtraFoodPanel prefs={prefs ?? {}} updatePrefs={updatePrefs} iso={session.date} defaultHour={nowHour} onDone={() => setAddingExtra(false)} />
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

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Proteína del día</p>
                  <p className="num text-base font-bold text-white">
                    {plan.target.proteinG.min}-{plan.target.proteinG.max} <span className="text-xs font-normal text-neutral-500">g</span>
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Hidratos del día</p>
                  <p className="num text-base font-bold text-white">
                    {plan.target.carbsG.min}-{plan.target.carbsG.max} <span className="text-xs font-normal text-neutral-500">g</span>
                  </p>
                </div>
              </div>

              <DayFlow
                flow={flow}
                onOpenMeal={setOpenMeal}
                onAddExtra={() => setAddingExtra(true)}
                onRemoveExtra={(id) => updatePrefs((p) => withoutExtra(p, session.date, id))}
              />

              <button
                onClick={() => {
                  close();
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
