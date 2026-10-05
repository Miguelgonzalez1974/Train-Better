import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { NUTRITION_DAY_LABEL } from '../../engine/nutritionPlan';
import { DAY_TYPE_DOT } from '../planificacion/NutritionGlance';
import { MacroRing } from './MacroRing';
import { addDays, extraInputsFor, mondayOf, parseIso, planFor, WEEKDAY_LONG } from './nutritionData';
import type { NutritionShared } from './shared';

interface SemanaViewProps {
  shared: NutritionShared;
  onOpenDay: (iso: string) => void;
}

/**
 * Menú de la semana entera: un vistazo por día con dos donuts compactos (lo hecho + extras frente al objetivo de
 * ese día, igual que en "Tu día") y, desplegado, qué se come en cada comida. Los días futuros muestran los donuts
 * vacíos — aún no hay nada marcado, es la previsión del menú.
 */
export function SemanaView({ shared, onOpenDay }: SemanaViewProps) {
  const { prefs, weightKg, todayIso, getWeek } = shared;
  const [offset, setOffset] = useState<0 | 1>(0);
  const [openIso, setOpenIso] = useState<string | null>(todayIso);
  const anchor = offset === 0 ? todayIso : addDays(mondayOf(todayIso), 7);

  const days = useMemo(
    () =>
      getWeek(anchor).map((d) => {
        const plan = planFor(prefs, d.iso, d.type, weightKg);
        const doneIdx = prefs.doneMeals?.[d.iso] ?? [];
        const extras = extraInputsFor(prefs, d.iso);
        const doneProtein = plan.meals.reduce((s, m, i) => s + (doneIdx.includes(i) ? m.protein : 0), 0) + extras.reduce((s, e) => s + e.protein, 0);
        const doneCarbs = plan.meals.reduce((s, m, i) => s + (doneIdx.includes(i) ? m.carbs : 0), 0) + extras.reduce((s, e) => s + e.carbs, 0);
        // Objetivo fijo del día (punto medio del rango) — no lo compuesto, que puede bajar si una comida se monta a mano con menos.
        const objectiveProtein = Math.round((plan.target.proteinG.min + plan.target.proteinG.max) / 2);
        const objectiveCarbs = Math.round((plan.target.carbsG.min + plan.target.carbsG.max) / 2);
        return { ...d, plan, doneIdx, doneProtein, doneCarbs, objectiveProtein, objectiveCarbs };
      }),
    [getWeek, anchor, prefs, weightKg],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Semana">
        {(['Esta semana', 'Próxima semana'] as const).map((label, i) => (
          <button
            key={label}
            role="tab"
            aria-selected={offset === i}
            onClick={() => setOffset(i as 0 | 1)}
            className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${offset === i ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {offset === 1 && (
        <p className="text-[11px] text-neutral-500">Previsión: los entrenos de la semana que viene pueden cambiar cuando se planifiquen, y con ellos el tipo de día.</p>
      )}

      {days.map((d) => {
        const open = openIso === d.iso;
        const Chevron = open ? ChevronDown : ChevronRight;
        const date = parseIso(d.iso);
        return (
          <section key={d.iso} className={`overflow-hidden rounded-xl bg-white/[0.03] ${d.iso === todayIso ? 'ring-1 ring-white/30' : ''} ${d.iso < todayIso ? 'opacity-60' : ''}`}>
            <button onClick={() => setOpenIso(open ? null : d.iso)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
              <Chevron size={16} className="shrink-0 text-neutral-500" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DAY_TYPE_DOT[d.type]}`} aria-hidden="true" />
                  <span className="truncate text-sm font-semibold capitalize text-white">
                    {WEEKDAY_LONG[d.weekdayIndex]} {date.getDate()}
                  </span>
                </span>
                <span className="block text-[11px] text-neutral-500">{NUTRITION_DAY_LABEL[d.type]}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <MacroRing label="Proteína" value={d.doneProtein} target={d.objectiveProtein} size={44} compact />
                <MacroRing label="Hidratos" value={d.doneCarbs} target={d.objectiveCarbs} size={44} compact />
              </span>
            </button>
            {open && (
              <div className="border-t border-white/5 px-3.5 pb-3 pt-2">
                <ul className="flex flex-col gap-2.5">
                  {d.plan.meals.map((m, i) => {
                    const done = d.doneIdx.includes(i);
                    return (
                      <li key={m.key} className="flex items-start gap-2 text-xs">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                            done ? 'border-emerald-400 bg-emerald-400' : 'border-white/20'
                          }`}
                          aria-hidden="true"
                        >
                          {done && <Check size={9} strokeWidth={4} className="text-black" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <p className="flex items-baseline gap-2">
                            <span className="font-semibold text-neutral-200">{m.label}</span>
                            <span className="num text-neutral-600">{m.time}</span>
                            {m.tag && <span className="text-[11px] text-neutral-400">{m.tag}</span>}
                          </p>
                          <p className="text-neutral-400">{m.items.filter((i2) => i2.kind !== 'fat').map((i2) => `${i2.name} ${i2.quantity}`).join(' · ')}</p>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <button onClick={() => onOpenDay(d.iso)} className="mt-3 text-xs font-semibold text-neutral-300 underline decoration-dotted hover:text-white">
                  Abrir el día para marcar o cambiar alimentos
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
