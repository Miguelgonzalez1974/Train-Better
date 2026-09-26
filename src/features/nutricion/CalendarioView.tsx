import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, PencilLine, RotateCcw, Undo2 } from 'lucide-react';
import type { NutritionPrefs } from '../../data/athlete/types';
import { copyMeals, materialize, mealStatus } from '../../engine/mealBuilder';
import { MEAL_LABEL, MEAL_ORDER, type MealKey } from '../../engine/mealPlan';
import { NUTRITION_DAY_LABEL, type NutritionDayType } from '../../engine/nutritionPlan';
import { getWeekdayIndex } from '../../engine/periodization';
import { Modal } from '../shell/Modal';
import { DAY_TYPE_STYLE } from '../planificacion/NutritionGlance';
import { MealBuilderPanel } from './MealBuilderPanel';
import { addDays, customMealCount, parseIso, planFor, WEEKDAY_LONG, weekIsos, withoutCustomMeal } from './nutritionData';
import type { NutritionShared } from './shared';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const DOT: Record<NutritionDayType, string> = {
  descanso: 'bg-neutral-500',
  ligero: 'bg-emerald-400',
  normal: 'bg-brand-gold',
  alto: 'bg-brand-orange',
};

const STATE_CHIP = {
  ok: { text: 'Cubierta', cls: 'bg-emerald-500/15 text-emerald-300' },
  low: { text: 'Falta', cls: 'bg-brand-gold/15 text-brand-gold' },
  over: { text: 'Te pasas', cls: 'bg-brand-orange/15 text-brand-orange' },
} as const;

type Scope = 'all' | MealKey;

interface UndoState {
  count: number;
  previous: Record<string, NonNullable<NutritionPrefs['customMeals']>[string] | undefined>;
}

/**
 * Calendario mensual de nutrición: cada día muestra su tipo (descanso, ligero, normal, fuerte) y cuántas comidas se
 * han hecho o si se ha editado. Al tocar un día se abre una ventana con sus cinco comidas y, desde ahí, se monta
 * cada una a mano. "Copiar días" pega las comidas de un día (o solo una) en otros, adaptando los hidratos al tipo
 * de día de cada destino.
 */
export function CalendarioView({ shared }: { shared: NutritionShared }) {
  const { prefs, weightKg, todayIso, getWeek, updatePrefs } = shared;
  const start = parseIso(todayIso);
  const [ym, setYm] = useState<[number, number]>([start.getFullYear(), start.getMonth()]);
  const [openIso, setOpenIso] = useState<string | null>(null);
  const [openMeal, setOpenMeal] = useState<MealKey | null>(null);

  const [copyMode, setCopyMode] = useState(false);
  const [copySrc, setCopySrc] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>('all');
  const [undo, setUndo] = useState<UndoState | null>(null);

  const [year, month] = ym;
  const firstOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = getWeekdayIndex(parseIso(firstOfMonth));

  // Tipo de día de cada fecha visible (se calcula por semanas y se guarda en la caché del módulo).
  const typeByIso = useMemo(() => {
    const map = new Map<string, NutritionDayType>();
    const weeks = new Set<string>();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const monday = weekIsos(iso)[0];
      if (weeks.has(monday)) continue;
      weeks.add(monday);
      for (const day of getWeek(iso)) map.set(day.iso, day.type);
    }
    return map;
  }, [year, month, daysInMonth, getWeek]);

  const typeOf = (iso: string): NutritionDayType => typeByIso.get(iso) ?? getWeek(iso).find((d) => d.iso === iso)?.type ?? 'normal';

  function changeMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYm([d.getFullYear(), d.getMonth()]);
  }

  function startCopy(fromIso?: string) {
    setCopyMode(true);
    setCopySrc(fromIso ?? null);
    setTargets([]);
    setScope('all');
    setUndo(null);
  }

  function stopCopy() {
    setCopyMode(false);
    setCopySrc(null);
    setTargets([]);
  }

  function onDayClick(iso: string) {
    if (!copyMode) {
      setOpenIso(iso);
      setOpenMeal(null);
      setUndo(null);
      return;
    }
    if (!copySrc) {
      setCopySrc(iso);
      return;
    }
    if (iso === copySrc) return;
    setTargets((t) => (t.includes(iso) ? t.filter((x) => x !== iso) : [...t, iso]));
  }

  function paste() {
    if (!copySrc || targets.length === 0) return;
    const previous: UndoState['previous'] = {};
    for (const t of targets) previous[t] = prefs.customMeals?.[t];
    updatePrefs((p) => {
      const src = planFor(p, copySrc, typeOf(copySrc), weightKg);
      const all = { ...(p.customMeals ?? {}) };
      for (const t of targets) {
        const dst = planFor({ ...p, customMeals: { ...all, [t]: {} } }, t, typeOf(t), weightKg);
        all[t] = { ...(all[t] ?? {}), ...copyMeals(src, dst, scope) };
      }
      return { ...p, customMeals: all };
    });
    setUndo({ count: targets.length, previous });
    stopCopy();
  }

  function undoPaste() {
    if (!undo) return;
    const { previous } = undo;
    updatePrefs((p) => {
      const all = { ...(p.customMeals ?? {}) };
      // Se restaura lo anterior; si no había nada, un objeto vacío (no se borra la fecha: la fusión entre dispositivos la revivirá).
      for (const [iso, before] of Object.entries(previous)) all[iso] = before ?? {};
      return { ...p, customMeals: all };
    });
    setUndo(null);
  }

  const openType = openIso ? typeOf(openIso) : 'normal';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <p className="text-base font-semibold capitalize text-white">
          {MONTHS[month]} {year}
        </p>
        <button onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white">
          <ChevronRight size={18} />
        </button>
      </div>

      <button
        onClick={() => (copyMode ? stopCopy() : startCopy())}
        aria-pressed={copyMode}
        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
          copyMode ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-300 hover:text-white'
        }`}
      >
        <Copy size={14} aria-hidden="true" /> {copyMode ? 'Cancelar copia' : 'Copiar días'}
      </button>

      {copyMode && (
        <p className="rounded-lg bg-brand-gold/10 px-3 py-2 text-xs text-brand-gold" role="status">
          {copySrc ? (
            <>
              Toca los días donde quieres pegar las comidas del <b>{WEEKDAY_LONG[getWeekdayIndex(parseIso(copySrc))]} {parseIso(copySrc).getDate()}</b>.
            </>
          ) : (
            'Toca el día que quieres copiar.'
          )}
        </p>
      )}

      <div className="card p-2.5">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {DOW.map((d) => (
            <span key={d} className="text-center text-[11px] font-semibold text-neutral-500">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leading }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const type = typeOf(iso);
            const doneCount = prefs.doneMeals?.[iso]?.length ?? 0;
            const edited = customMealCount(prefs, iso) > 0;
            const isToday = iso === todayIso;
            const isSrc = copySrc === iso;
            const isTarget = targets.includes(iso);
            return (
              <button
                key={iso}
                onClick={() => onDayClick(iso)}
                aria-label={`${d} de ${MONTHS[month]}, ${NUTRITION_DAY_LABEL[type]}${edited ? ', editado' : ''}${doneCount ? `, ${doneCount} de 5 comidas hechas` : ''}`}
                className={`flex aspect-[1/1.12] flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors ${
                  isSrc
                    ? 'border-brand-gold bg-brand-gold/20'
                    : isTarget
                      ? 'border-emerald-400/60 bg-emerald-500/15'
                      : isToday
                        ? 'border-brand-gold/70 bg-white/[0.04]'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.06]'
                }`}
              >
                <span className={`num font-semibold ${isToday ? 'text-brand-gold' : 'text-neutral-100'}`}>{d}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[type]}`} aria-hidden="true" />
                <span className="flex h-3 items-center text-[9px] leading-none text-neutral-500">
                  {edited ? <PencilLine size={9} className="text-brand-gold" aria-hidden="true" /> : doneCount > 0 ? `${doneCount}/5` : ''}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-neutral-500">
          {(['descanso', 'ligero', 'normal', 'alto'] as NutritionDayType[]).map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[t]}`} aria-hidden="true" />
              {t === 'alto' ? 'Fuerte' : t === 'descanso' ? 'Descanso' : t === 'ligero' ? 'Ligero' : 'Normal'}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <PencilLine size={10} className="text-brand-gold" aria-hidden="true" /> Editado
          </span>
        </div>
      </div>

      {copyMode && copySrc && (
        <div className="card flex flex-col gap-2.5 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Qué copiar</p>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Qué copiar">
            {([['all', 'Todo el día'], ...MEAL_ORDER.map((k) => [k, MEAL_LABEL[k]])] as [Scope, string][]).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={scope === value}
                onClick={() => setScope(value)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  scope === value ? 'border-brand-gold bg-brand-gold/15 text-brand-gold' : 'border-brand-border text-neutral-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={paste}
            disabled={targets.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {targets.length === 0 ? 'Elige al menos un día' : `Pegar en ${targets.length} ${targets.length === 1 ? 'día' : 'días'}`}
          </button>
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Cada día de destino conserva su objetivo: si su tipo de día es distinto, los hidratos se recalculan solos. Después puedes editarlo.
          </p>
        </div>
      )}

      {undo && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
          <span className="flex items-center gap-1.5">
            <Check size={15} aria-hidden="true" /> Copiado en {undo.count} {undo.count === 1 ? 'día' : 'días'}
          </span>
          <button onClick={undoPaste} className="flex items-center gap-1 text-xs font-semibold underline decoration-dotted">
            <Undo2 size={13} aria-hidden="true" /> Deshacer
          </button>
        </div>
      )}

      {openIso && (
        <Modal open onClose={() => setOpenIso(null)} title={dayTitle(openIso, todayIso)}>
          {openMeal ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setOpenMeal(null)} className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold">
                  <ArrowLeft size={14} aria-hidden="true" /> Las 5 comidas
                </button>
                <span className="text-sm font-semibold text-white">{MEAL_LABEL[openMeal]}</span>
              </div>
              <MealBuilderPanel shared={shared} iso={openIso} dayType={openType} mealKey={openMeal} />
            </div>
          ) : (
            <DayPanel
              shared={shared}
              iso={openIso}
              dayType={openType}
              onOpenMeal={setOpenMeal}
              onCopy={() => {
                startCopy(openIso);
                setOpenIso(null);
              }}
              onAutoDay={() => updatePrefs((p) => withoutCustomMeal(p, openIso))}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function dayTitle(iso: string, todayIso: string): string {
  const d = parseIso(iso);
  const name = `${WEEKDAY_LONG[getWeekdayIndex(d)]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  if (iso === todayIso) return `Hoy · ${name}`;
  if (iso === addDays(todayIso, 1)) return `Mañana · ${name}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface DayPanelProps {
  shared: NutritionShared;
  iso: string;
  dayType: NutritionDayType;
  onOpenMeal: (meal: MealKey) => void;
  onCopy: () => void;
  onAutoDay: () => void;
}

/** Las cinco comidas de un día con su estado frente al objetivo; tocar una la abre para montarla. */
function DayPanel({ shared, iso, dayType, onOpenMeal, onCopy, onAutoDay }: DayPanelProps) {
  const { prefs, weightKg } = shared;
  const plan = useMemo(() => planFor(prefs, iso, dayType, weightKg), [prefs, iso, dayType, weightKg]);
  const doneList = prefs.doneMeals?.[iso] ?? [];
  const edited = customMealCount(prefs, iso) > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DAY_TYPE_STYLE[dayType]}`}>{NUTRITION_DAY_LABEL[dayType]}</span>
        <span className="num text-[11px] text-neutral-500">
          {plan.totals.protein} g prot · {plan.totals.carbs} g hidratos
        </span>
      </div>

      {plan.meals.map((meal, index) => {
        const status = mealStatus(materialize(meal), meal.target);
        const chip = STATE_CHIP[status.state];
        const done = doneList.includes(index);
        return (
          <button
            key={meal.key}
            onClick={() => onOpenMeal(meal.key)}
            className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-surfaceMuted/60 px-3.5 py-3 text-left transition-colors hover:border-brand-gold/60"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-white">{meal.label}</span>
                <span className="num text-[11px] text-neutral-500">{meal.time}</span>
                {meal.custom && <PencilLine size={11} className="text-brand-gold" aria-label="Montada a mano" />}
              </span>
              <span className="mt-0.5 block truncate text-xs text-neutral-400">
                {meal.items.length === 0 ? 'Vacía' : meal.items.map((i) => i.name.split(' (')[0]).slice(0, 3).join(' · ') + (meal.items.length > 3 ? ' …' : '')}
              </span>
              <span className="num mt-0.5 block text-[11px] text-neutral-500">
                {meal.protein} / {meal.target.protein} g prot · {meal.carbs} / {meal.target.carbs} g hid.
              </span>
            </span>
            {/* La sugerencia automática se muestra neutra (sus cantidades tienen límites de ración razonables y a veces no clavan el objetivo); el estado real solo aparece en lo montado a mano. */}
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
                done ? 'bg-emerald-500/15 text-emerald-300' : meal.custom ? chip.cls : 'bg-white/5 text-neutral-400'
              }`}
            >
              {done ? 'Hecha' : meal.custom ? chip.text : 'Sugerida'}
            </span>
          </button>
        );
      })}

      <div className="mt-1 flex flex-col gap-2">
        <button onClick={onCopy} className="flex items-center justify-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:text-white">
          <Copy size={14} aria-hidden="true" /> Copiar este día a otros…
        </button>
        {edited && (
          <button onClick={onAutoDay} className="flex items-center justify-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:text-white">
            <RotateCcw size={13} aria-hidden="true" /> Volver al menú automático de este día
          </button>
        )}
      </div>
    </div>
  );
}
