import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { makeFoodResolver } from '../../engine/customFoods';
import { totalsOf } from '../../engine/mealBuilder';
import { fixedPortion, MEAL_LABEL, type MealKey } from '../../engine/mealPlan';
import { NUTRITION_DAY_LABEL, type NutritionDayType } from '../../engine/nutritionPlan';
import type { ExtraFoodEntry } from '../../data/athlete/types';
import { Modal } from '../shell/Modal';
import { SectionLabel } from '../shell/SectionLabel';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { ExtraFoodPanel } from './ExtraFoodPanel';
import { MacroRing } from './MacroRing';
import { QuantityStepper } from './QuantityStepper';
import { addDays, dayLabel, planFor, trainingHourFor, withExtra, withExtraItemGrams, withoutExtra } from './nutritionData';
import type { NutritionShared } from './shared';

const DAY_TYPES: NutritionDayType[] = ['descanso', 'ligero', 'normal', 'alto'];
const DAY_TYPE_SHORT: Record<NutritionDayType, string> = { descanso: 'Descanso', ligero: 'Ligero', normal: 'Normal', alto: 'Fuerte' };
/** Cuántos alimentos "recientes" se ofrecen para añadir de un toque, y cuántos días atrás se mira. */
const RECENT_COUNT = 6;
const RECENT_DAYS = 21;

interface DiarioViewProps {
  shared: NutritionShared;
  iso: string;
  onChangeIso: (iso: string) => void;
  onOpenGuide: () => void;
}

/**
 * Diario del día: dos anillos (proteína e hidratos) que se llenan según apuntas lo que comes, sin comida ni hora que
 * elegir. El objetivo es el del día según el entreno y tu peso. Lo apuntado se guarda como `extraFoods` del día.
 */
export function DiarioView({ shared, iso, onChangeIso, onOpenGuide }: DiarioViewProps) {
  const { prefs, weightKg, todayIso, updatePrefs, getWeek } = shared;
  const day = getWeek(iso).find((d) => d.iso === iso);
  const [typeOverride, setTypeOverride] = useState<NutritionDayType | null>(null);
  const [changingType, setChangingType] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    setTypeOverride(null);
    setChangingType(false);
  }, [iso]);

  const dayType = typeOverride ?? day?.type ?? 'normal';
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg, trainingHourFor(prefs, iso)), [prefs, iso, dayType, weightKg]);
  const objective = {
    protein: Math.round((plan.target.proteinG.min + plan.target.proteinG.max) / 2),
    carbs: Math.round((plan.target.carbsG.min + plan.target.carbsG.max) / 2),
  };

  const resolve = useMemo(() => makeFoodResolver(prefs.customFoods), [prefs.customFoods]);
  const entries = prefs.extraFoods?.[iso] ?? [];
  const rows = entries.map((e) => {
    const t = totalsOf(e.items, resolve);
    const items = e.items.flatMap((it, index) => {
      const food = resolve(it.foodId);
      if (!food) return [];
      return [{ index, food, grams: it.grams }];
    });
    return { entry: e, items, protein: t.protein, carbs: t.carbs };
  });

  function setGrams(entryId: string, itemIndex: number, grams: number) {
    updatePrefs((p) => withExtraItemGrams(p, iso, entryId, itemIndex, grams));
  }
  const done = rows.reduce((acc, r) => ({ protein: acc.protein + r.protein, carbs: acc.carbs + r.carbs }), { protein: 0, carbs: 0 });
  const missing = { protein: Math.max(0, objective.protein - done.protein), carbs: Math.max(0, objective.carbs - done.carbs) };
  const covered = missing.protein === 0 && missing.carbs === 0;

  // Lo que más has apuntado estas semanas: un toque y se añade con su ración habitual.
  const recents = useMemo(() => {
    const since = addDays(todayIso, -RECENT_DAYS);
    const count = new Map<string, number>();
    for (const [date, list] of Object.entries(prefs.extraFoods ?? {})) {
      if (date < since) continue;
      for (const e of list) for (const it of e.items) count.set(it.foodId, (count.get(it.foodId) ?? 0) + 1);
    }
    const excluded = new Set(prefs.excludedFoodIds ?? []);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => resolve(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f) && !excluded.has(f!.id))
      .slice(0, RECENT_COUNT);
  }, [prefs.extraFoods, prefs.excludedFoodIds, todayIso, resolve]);

  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
  function quickAdd(foodId: string) {
    const food = resolve(foodId);
    if (!food) return;
    const entry: ExtraFoodEntry = { id: `extra${Date.now()}`, hour: iso === todayIso ? nowHour : 12, items: [{ foodId, grams: fixedPortion(food).grams }] };
    updatePrefs((p) => withExtra(p, iso, entry));
  }

  return (
    <div className="flex flex-col gap-4">
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

      {/* Los dos anillos del día */}
      <section className="rounded-2xl bg-white/[0.03] px-4 pb-4 pt-5" aria-label="Proteína e hidratos del día">
        <div className="flex items-start justify-around">
          <MacroRing label="Proteína" value={done.protein} target={objective.protein} size={132} strokeWidth={10} />
          <MacroRing label="Hidratos" value={done.carbs} target={objective.carbs} size={132} strokeWidth={10} />
        </div>
        <p className="mt-3 text-center text-sm font-semibold text-neutral-200">
          {entries.length === 0
            ? 'Apunta lo que vayas comiendo y los anillos se llenan.'
            : covered
              ? 'Objetivo del día cubierto.'
              : `Te faltan ${missing.protein} g de proteína y ${missing.carbs} g de hidratos.`}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DAY_TYPE_STYLE[dayType]}`}>{NUTRITION_DAY_LABEL[dayType]}</span>
          <span>para {String(weightKg).replace('.', ',')} kg</span>
          <button onClick={() => setChangingType((v) => !v)} className="font-semibold text-neutral-400 underline decoration-dotted hover:text-white">
            {changingType ? 'Cerrar' : 'Cambiar'}
          </button>
        </div>
        {changingType && (
          <div className="mt-2 flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Tipo de día">
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
        )}
      </section>

      <button
        onClick={() => setAdding(true)}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand-orange px-4 py-3 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark"
      >
        <Plus size={16} strokeWidth={2.5} /> Añadir alimento
      </button>

      {recents.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Lo de siempre</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {recents.map((f) => (
              <button
                key={f.id}
                onClick={() => quickAdd(f.id)}
                className="flex min-h-[34px] items-center gap-1 rounded-full border border-brand-border px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-brand-gold hover:text-white"
              >
                <Plus size={12} className="shrink-0 text-brand-gold" aria-hidden="true" />
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Lo que has comido</SectionLabel>
          <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] px-4">
            {rows.map(({ entry, items, protein, carbs }) => (
              <li key={entry.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  {entry.id.startsWith('menu-') && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{MEAL_LABEL[entry.id.slice(5) as MealKey] ?? 'Menú'}</p>}
                  <ul className="flex flex-col gap-1.5">
                    {items.map((it) => (
                      <li key={`${entry.id}-${it.index}`} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 text-sm leading-snug text-neutral-100">{it.food.name}</span>
                        <QuantityStepper size="sm" food={it.food} grams={it.grams} onChange={(g) => setGrams(entry.id, it.index, g)} />
                      </li>
                    ))}
                  </ul>
                  <p className="num mt-1.5 text-[11px] text-neutral-500">
                    {protein} g prot · {carbs} g hid.
                  </p>
                </div>
                <button
                  onClick={() => updatePrefs((p) => withoutExtra(p, iso, entry.id))}
                  aria-label="Quitar"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-bad/10 hover:text-bad"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <Modal open onClose={() => setAdding(false)} title={`Añadir al diario · ${dayLabel(iso, todayIso)}`}>
          <ExtraFoodPanel prefs={prefs} updatePrefs={updatePrefs} iso={iso} defaultHour={iso === todayIso ? nowHour : 12} onDone={() => setAdding(false)} mode="diario" />
        </Modal>
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
