import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Droplet } from 'lucide-react';
import { MEAL_LABEL, TRAINING_HOUR_OPTIONS, type MealKey, type MealPlanInput } from '../../engine/mealPlan';
import { Modal } from '../shell/Modal';
import { MealBuilderPanel } from './MealBuilderPanel';
import { NUTRITION_DAY_LABEL, type NutritionDayType } from '../../engine/nutritionPlan';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { MealCard } from './MealCard';
import { addDays, dayLabel, planFor, trainingHourFor } from './nutritionData';
import type { NutritionShared } from './shared';

const DAY_TYPES: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];
const DAY_TYPE_SHORT: Record<NutritionDayType, string> = { descanso: 'Descanso', ligero: 'Ligero', normal: 'Normal', alto: 'Fuerte' };

const round50 = (ml: number) => Math.round(ml / 50) * 50;

interface HoyViewProps {
  shared: NutritionShared;
  iso: string;
  onChangeIso: (iso: string) => void;
  onOpenGuide: () => void;
}

/** Menú de un día: 5 comidas con cantidades, ajustadas al tipo de día y a la hora de entreno. */
export function HoyView({ shared, iso, onChangeIso, onOpenGuide }: HoyViewProps) {
  const { prefs, weightKg, todayIso, updatePrefs, getWeek } = shared;
  const day = getWeek(iso).find((d) => d.iso === iso);
  const [typeOverride, setTypeOverride] = useState<NutritionDayType | null>(null);
  const [buildMeal, setBuildMeal] = useState<MealKey | null>(null);
  useEffect(() => setTypeOverride(null), [iso]);

  const dayType = typeOverride ?? day?.type ?? 'normal';
  const hour = trainingHourFor(prefs, iso);
  const excluded = useMemo(() => prefs.excludedFoodIds ?? [], [prefs.excludedFoodIds]);
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg, hour), [prefs, iso, dayType, weightKg, hour]);
  const input: MealPlanInput = { date: iso, dayType, weightKg, trainingHour: hour, prefs: { excludedFoodIds: excluded, swaps: prefs.swaps } };

  const done = prefs.doneMeals?.[iso] ?? [];
  const doneMeals = plan.meals.filter((_, i) => done.includes(i));
  const doneProtein = doneMeals.reduce((s, m) => s + m.protein, 0);
  const doneCarbs = doneMeals.reduce((s, m) => s + m.carbs, 0);

  function toggleDone(index: number) {
    updatePrefs((p) => {
      const current = p.doneMeals?.[iso] ?? [];
      const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort();
      return { ...p, doneMeals: { ...(p.doneMeals ?? {}), [iso]: next } };
    });
  }

  function swap(key: string, foodId: string) {
    updatePrefs((p) => ({ ...p, swaps: { ...(p.swaps ?? {}), [key]: foodId } }));
  }

  function setHour(h: number) {
    updatePrefs((p) => ({ ...p, trainingHours: { ...(p.trainingHours ?? {}), [String(day?.weekdayIndex ?? 0)]: h } }));
  }

  const pTotal = plan.totals.protein;
  const cTotal = plan.totals.carbs;

  return (
    <div className="flex flex-col gap-3">
      {/* Fecha */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => onChangeIso(addDays(iso, -1))} aria-label="Día anterior" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-base font-semibold capitalize text-white">{dayLabel(iso, todayIso)}</p>
          {iso !== todayIso && (
            <button onClick={() => onChangeIso(todayIso)} className="text-[11px] font-semibold text-brand-gold underline decoration-dotted">
              Volver a hoy
            </button>
          )}
        </div>
        <button onClick={() => onChangeIso(addDays(iso, 1))} aria-label="Día siguiente" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Tipo de día y hora */}
      <div className="card flex flex-col gap-2.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DAY_TYPE_STYLE[dayType]}`}>{NUTRITION_DAY_LABEL[dayType]}</span>
          <span className="text-[11px] text-neutral-500">para {String(weightKg).replace('.', ',')} kg</span>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Tipo de día">
          {DAY_TYPES.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={dayType === t}
              onClick={() => setTypeOverride(t === day?.type ? null : t)}
              className={`flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                dayType === t ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {DAY_TYPE_SHORT[t]}
            </button>
          ))}
        </div>
        {dayType !== 'descanso' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Entreno a las</span>
            <div className="flex gap-1.5">
              {TRAINING_HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHour(h)}
                  aria-pressed={hour === h}
                  className={`num rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    hour === h ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-400 hover:text-white'
                  }`}
                >
                  {h}:00
                </button>
              ))}
            </div>
          </div>
        )}
        {typeOverride && <p className="text-[11px] text-neutral-500">Has cambiado el tipo de día a mano; el entreno planificado dice «{DAY_TYPE_SHORT[day?.type ?? 'normal']}».</p>}
      </div>

      {/* Objetivo del día */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Proteína</p>
          <p className="num text-xl font-bold text-white">
            {doneProtein} <span className="text-sm font-normal text-neutral-500">/ {pTotal} g</span>
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-red-400/80 transition-all duration-300" style={{ width: `${Math.min(100, (doneProtein / Math.max(1, pTotal)) * 100)}%` }} />
          </div>
        </div>
        <div className="card px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Hidratos</p>
          <p className="num text-xl font-bold text-white">
            {doneCarbs} <span className="text-sm font-normal text-neutral-500">/ {cTotal} g</span>
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-gold transition-all duration-300" style={{ width: `${Math.min(100, (doneCarbs / Math.max(1, cTotal)) * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Comidas */}
      {plan.meals.map((meal, i) => (
        <MealCard
          key={meal.key}
          meal={meal}
          done={done.includes(i)}
          onToggleDone={() => toggleDone(i)}
          input={input}
          excludedFoodIds={excluded}
          onSwap={swap}
          onBuild={() => setBuildMeal(meal.key)}
        />
      ))}

      {buildMeal && (
        <Modal open onClose={() => setBuildMeal(null)} title={`${MEAL_LABEL[buildMeal]} · ${dayLabel(iso, todayIso)}`}>
          <MealBuilderPanel shared={shared} iso={iso} dayType={dayType} mealKey={buildMeal} />
        </Modal>
      )}

      {/* Agua */}
      {dayType !== 'descanso' && (
        <div className="card flex items-start gap-2.5 p-3.5 text-xs leading-relaxed text-neutral-400">
          <Droplet size={16} className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
          <p>
            Bebe {round50(5 * weightKg)}-{round50(7 * weightKg)} ml de agua unas 4 h antes de entrenar y a sorbos durante la sesión (5-7 ml/kg, ACSM 2016). Creatina 3-5 g al
            día es opcional.
          </p>
        </div>
      )}

      <button onClick={onOpenGuide} className="flex items-center justify-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white">
        <BookOpen size={14} aria-hidden="true" /> Guía completa, tendencia de peso y fuentes
      </button>
      <p className="text-[11px] leading-relaxed text-neutral-600">
        Orientativo, no una dieta ni un consejo médico. Las cantidades son aproximadas (carne, pescado, arroz, pasta y patata, en crudo) y no cuentan calorías.
      </p>
    </div>
  );
}
