import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Droplet } from 'lucide-react';
import { MEAL_LABEL, TRAINING_HOUR_OPTIONS, type MealKey } from '../../engine/mealPlan';
import { Modal } from '../shell/Modal';
import { SectionLabel } from '../shell/SectionLabel';
import { computeDayFlow } from '../../engine/dayFlow';
import { DayFlow } from './DayFlow';
import { ExtraFoodPanel } from './ExtraFoodPanel';
import { MealBuilderPanel } from './MealBuilderPanel';
import { NUTRITION_DAY_LABEL, type NutritionDayType } from '../../engine/nutritionPlan';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { addDays, dayLabel, extraInputsFor, planFor, trainingHourFor, withoutExtra } from './nutritionData';
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
  const [addingExtra, setAddingExtra] = useState(false);
  useEffect(() => setTypeOverride(null), [iso]);

  const dayType = typeOverride ?? day?.type ?? 'normal';
  const hour = trainingHourFor(prefs, iso);
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg, hour), [prefs, iso, dayType, weightKg, hour]);

  const done = prefs.doneMeals?.[iso] ?? [];

  // "Ahora" solo tiene sentido en el día de hoy; se refresca cada minuto.
  const isToday = iso === todayIso;
  const [nowHour, setNowHour] = useState(() => new Date().getHours() + new Date().getMinutes() / 60);
  useEffect(() => {
    if (!isToday) return;
    const tick = () => setNowHour(new Date().getHours() + new Date().getMinutes() / 60);
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [isToday]);
  const extras = useMemo(() => extraInputsFor(prefs, iso), [prefs, iso]);
  const flow = useMemo(
    () => computeDayFlow(plan, done, extras, { trainingHour: dayType === 'descanso' ? null : hour, nowHour: isToday ? nowHour : null }),
    [plan, done, extras, dayType, hour, isToday, nowHour],
  );

  function setHour(h: number) {
    updatePrefs((p) => ({ ...p, trainingHours: { ...(p.trainingHours ?? {}), [String(day?.weekdayIndex ?? 0)]: h } }));
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

      {/* Tipo de día y hora */}
      <div className="flex flex-col gap-3">
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

      {/* Línea del día: lo hecho frente a lo previsto, con las comidas en su hora y el entreno como corte.
          Es la única vista de las comidas — no hay tarjetas fijas debajo; tocar un punto o una barra abre esa
          comida (automática o a mano) en el panel de abajo. */}
      <div>
        <SectionLabel className="mb-3">Tu día</SectionLabel>
        <DayFlow
          flow={flow}
          onOpenMeal={setBuildMeal}
          onAddExtra={() => setAddingExtra(true)}
          onRemoveExtra={(id) => updatePrefs((p) => withoutExtra(p, iso, id))}
        />
      </div>

      {buildMeal && (
        <Modal open onClose={() => setBuildMeal(null)} title={`${MEAL_LABEL[buildMeal]} · ${dayLabel(iso, todayIso)}`}>
          <MealBuilderPanel prefs={prefs} weightKg={weightKg} updatePrefs={updatePrefs} iso={iso} dayType={dayType} mealKey={buildMeal} />
        </Modal>
      )}

      {addingExtra && (
        <Modal open onClose={() => setAddingExtra(false)} title={`Añadir ahora · ${dayLabel(iso, todayIso)}`}>
          <ExtraFoodPanel prefs={prefs} updatePrefs={updatePrefs} iso={iso} defaultHour={isToday ? nowHour : hour} onDone={() => setAddingExtra(false)} />
        </Modal>
      )}

      {/* Agua */}
      {dayType !== 'descanso' && (
        <div className="flex items-start gap-2.5 px-1 text-xs leading-relaxed text-neutral-500">
          <Droplet size={16} className="mt-0.5 shrink-0 text-neutral-400" aria-hidden="true" />
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
