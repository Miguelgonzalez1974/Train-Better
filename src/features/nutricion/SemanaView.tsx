import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NUTRITION_DAY_LABEL } from '../../engine/nutritionPlan';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { addDays, mondayOf, parseIso, planFor, WEEKDAY_LONG } from './nutritionData';
import type { NutritionShared } from './shared';

interface SemanaViewProps {
  shared: NutritionShared;
  onOpenDay: (iso: string) => void;
}

/** Menú de la semana entera: un vistazo por día y, desplegado, qué se come en cada comida. */
export function SemanaView({ shared, onOpenDay }: SemanaViewProps) {
  const { prefs, weightKg, todayIso, getWeek } = shared;
  const [offset, setOffset] = useState<0 | 1>(0);
  const [openIso, setOpenIso] = useState<string | null>(todayIso);
  const anchor = offset === 0 ? todayIso : addDays(mondayOf(todayIso), 7);

  const days = useMemo(
    () => getWeek(anchor).map((d) => ({ ...d, plan: planFor(prefs, d.iso, d.type, weightKg) })),
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
            className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${offset === i ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'}`}
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
          <section key={d.iso} className={`card overflow-hidden ${d.iso === todayIso ? 'ring-1 ring-brand-gold/60' : ''} ${d.iso < todayIso ? 'opacity-60' : ''}`}>
            <button onClick={() => setOpenIso(open ? null : d.iso)} aria-expanded={open} className="flex w-full items-center gap-2 px-3.5 py-3 text-left">
              <Chevron size={16} className="shrink-0 text-neutral-500" aria-hidden="true" />
              <span className="flex-1">
                <span className="block text-sm font-semibold capitalize text-white">
                  {WEEKDAY_LONG[d.weekdayIndex]} {date.getDate()}
                </span>
                <span className="num block text-[11px] text-neutral-500">
                  {d.plan.totals.protein} g prot · {d.plan.totals.carbs} g hidratos
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DAY_TYPE_STYLE[d.type]}`}>{NUTRITION_DAY_LABEL[d.type].replace('Día ', '').replace('de ', '')}</span>
            </button>
            {open && (
              <div className="border-t border-white/5 px-3.5 pb-3 pt-2">
                <ul className="flex flex-col gap-2">
                  {d.plan.meals.map((m) => (
                    <li key={m.key} className="text-xs">
                      <p className="flex items-baseline gap-2">
                        <span className="font-semibold text-neutral-200">{m.label}</span>
                        <span className="num text-neutral-600">{m.time}</span>
                        {m.tag && <span className="text-[11px] text-brand-gold">{m.tag}</span>}
                      </p>
                      <p className="text-neutral-400">{m.items.filter((i) => i.kind !== 'fat').map((i) => `${i.name} ${i.quantity}`).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
                <button onClick={() => onOpenDay(d.iso)} className="mt-3 text-xs font-semibold text-brand-gold underline decoration-dotted">
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
