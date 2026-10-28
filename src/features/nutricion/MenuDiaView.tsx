import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Droplet, Plus } from 'lucide-react';
import { MEAL_LABEL, TRAINING_HOUR_OPTIONS, type MealKey } from '../../engine/mealPlan';
import { NUTRITION_DAY_LABEL, type NutritionDayType } from '../../engine/nutritionPlan';
import { parseHour } from '../../engine/dayFlow';
import { materialize } from '../../engine/mealBuilder';
import { Modal } from '../shell/Modal';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { MealBuilderPanel } from './MealBuilderPanel';
import { addDays, dayLabel, isMenuEaten, planFor, trainingHourFor, withMenuEaten, withoutMenuEaten } from './nutritionData';
import type { NutritionShared } from './shared';

const DAY_TYPES: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];
const DAY_TYPE_SHORT: Record<NutritionDayType, string> = { descanso: 'Descanso', ligero: 'Ligero', normal: 'Normal', alto: 'Fuerte' };

const round50 = (ml: number) => Math.round(ml / 50) * 50;

interface MenuDiaViewProps {
  shared: NutritionShared;
  iso: string;
  onChangeIso: (iso: string) => void;
}

/**
 * Menú posible de un día: las cinco comidas con sus alimentos y cantidades según el tipo de día y la hora de entreno. Cada
 * comida se puede comer de un toque (se apunta en el diario de Hoy) o abrir para cambiarla y montarla a tu manera.
 */
export function MenuDiaView({ shared, iso, onChangeIso }: MenuDiaViewProps) {
  const { prefs, weightKg, todayIso, updatePrefs, getWeek } = shared;
  const day = getWeek(iso).find((d) => d.iso === iso);
  const [typeOverride, setTypeOverride] = useState<NutritionDayType | null>(null);
  const [openMeal, setOpenMeal] = useState<MealKey | null>(null);
  useEffect(() => setTypeOverride(null), [iso]);

  const dayType = typeOverride ?? day?.type ?? 'normal';
  const hour = trainingHourFor(prefs, iso);
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg, hour), [prefs, iso, dayType, weightKg, hour]);

  function setHour(h: number) {
    updatePrefs((p) => ({ ...p, trainingHours: { ...(p.trainingHours ?? {}), [String(day?.weekdayIndex ?? 0)]: h } }));
  }

  function toggleEat(key: MealKey) {
    const meal = plan.meals.find((m) => m.key === key);
    if (!meal) return;
    updatePrefs((p) => (isMenuEaten(p, iso, key) ? withoutMenuEaten(p, iso, key) : withMenuEaten(p, iso, key, parseHour(meal.time), materialize(meal))));
  }

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

      {/* Tipo de día y hora de entreno */}
      <div className="flex flex-col gap-2.5">
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
                dayType === t ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'
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
                    hour === h ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
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

      {/* Las cinco comidas */}
      <ul className="flex flex-col gap-2">
        {plan.meals.map((m) => {
          const eaten = isMenuEaten(prefs, iso, m.key);
          return (
            <li key={m.key} className={`rounded-2xl p-3.5 transition-colors ${eaten ? 'bg-good/[0.07]' : 'bg-white/[0.03]'}`}>
              <button onClick={() => setOpenMeal(m.key)} className="block w-full text-left" aria-label={`${MEAL_LABEL[m.key]}: ver o cambiar`}>
                <p className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{m.label}</span>
                  <span className="num text-[11px] text-neutral-500">{m.time}</span>
                  {m.tag && <span className="text-[11px] text-neutral-400">{m.tag}</span>}
                  {m.custom && <span className="text-[11px] text-brand-gold">a tu manera</span>}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-300">{m.items.filter((i) => i.kind !== 'fat').map((i) => `${i.name} ${i.quantity}`).join(' · ')}</p>
                <p className="num mt-1 text-[11px] text-neutral-500">
                  ≈ {m.protein} g prot · {m.carbs} g hid.
                </p>
              </button>
              <button
                onClick={() => toggleEat(m.key)}
                aria-pressed={eaten}
                className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  eaten ? 'border-good/40 bg-good/15 text-good' : 'border-brand-border text-neutral-300 hover:border-brand-gold hover:text-white'
                }`}
              >
                {eaten ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                {eaten ? 'En tu diario (tocar para quitar)' : 'Comer esto'}
              </button>
            </li>
          );
        })}
      </ul>

      {openMeal && (
        <Modal open onClose={() => setOpenMeal(null)} title={`${MEAL_LABEL[openMeal]} · ${dayLabel(iso, todayIso)}`}>
          <MealBuilderPanel prefs={prefs} weightKg={weightKg} updatePrefs={updatePrefs} iso={iso} dayType={dayType} mealKey={openMeal} />
        </Modal>
      )}

      {dayType !== 'descanso' && (
        <div className="flex items-start gap-2.5 px-1 text-xs leading-relaxed text-neutral-500">
          <Droplet size={16} className="mt-0.5 shrink-0 text-neutral-400" aria-hidden="true" />
          <p>
            Bebe {round50(5 * weightKg)}-{round50(7 * weightKg)} ml de agua unas 4 h antes de entrenar y a sorbos durante la sesión (5-7 ml/kg, ACSM 2016). Creatina 3-5 g al
            día es opcional.
          </p>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-neutral-600">
        Orientativo, no una dieta ni un consejo médico. Las cantidades son aproximadas (carne, pescado, arroz, pasta y patata, en crudo) y no cuentan calorías.
      </p>
    </div>
  );
}
