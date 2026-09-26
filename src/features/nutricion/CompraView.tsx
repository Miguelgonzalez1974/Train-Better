import { useMemo, useState } from 'react';
import { Check, Copy, Square, CheckSquare } from 'lucide-react';
import { buildShoppingList, shoppingListText } from '../../engine/mealPlan';
import { SHOPPING_CATEGORY_LABEL, STAPLES } from '../../data/nutrition/foods';
import { getWeekdayIndex } from '../../engine/periodization';
import { addDays, mondayOf, parseIso, planFor, WEEKDAY_SHORT } from './nutritionData';
import type { NutritionShared } from './shared';

type Range = 'resto' | 'proxima';

const storageKey = (firstIso: string, lastIso: string) => `train-better:compra:${firstIso}:${lastIso}`;

function readChecked(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Lista de la compra de los días elegidos, sumada y agrupada por sección del súper. Sale de los mismos menús que
 * ven las otras pestañas (incluidos los cambios de alimento). Lo tachado se guarda en este dispositivo.
 */
export function CompraView({ shared }: { shared: NutritionShared }) {
  const { prefs, weightKg, todayIso, getWeek } = shared;
  const [range, setRange] = useState<Range>('resto');
  const [copied, setCopied] = useState(false);

  const { isos, label } = useMemo(() => {
    const thisWeek = getWeek(todayIso).map((d) => d.iso);
    if (range === 'resto') return { isos: thisWeek.filter((iso) => iso >= todayIso), label: 'Lo que queda de esta semana' };
    return { isos: getWeek(addDays(mondayOf(todayIso), 7)).map((d) => d.iso), label: 'Próxima semana' };
  }, [getWeek, todayIso, range]);

  const groups = useMemo(() => {
    const week = new Map([...getWeek(todayIso), ...getWeek(addDays(mondayOf(todayIso), 7))].map((d) => [d.iso, d]));
    const plans = isos.flatMap((iso) => {
      const d = week.get(iso);
      return d ? [planFor(prefs, iso, d.type, weightKg)] : [];
    });
    const list = buildShoppingList(plans);
    // Básicos de despensa que el atleta activó en Ajustes: van siempre, dentro de Despensa.
    const staples = STAPLES.filter((s) => prefs.staples?.includes(s.id)).map((s) => ({ foodId: `staple:${s.id}`, name: s.name, grams: 0, text: s.text }));
    if (staples.length === 0) return list;
    const pantry = list.find((g) => g.category === 'despensa');
    if (pantry) return list.map((g) => (g === pantry ? { ...g, lines: [...g.lines, ...staples] } : g));
    return [...list, { category: 'despensa' as const, label: SHOPPING_CATEGORY_LABEL.despensa, lines: staples }];
  }, [getWeek, todayIso, isos, prefs, weightKg]);

  const key = storageKey(isos[0] ?? todayIso, isos[isos.length - 1] ?? todayIso);
  const [checkedByKey, setCheckedByKey] = useState<Record<string, string[]>>({});
  const checked = new Set(checkedByKey[key] ?? readChecked(key));

  function toggle(foodId: string) {
    const next = new Set(checked);
    if (next.has(foodId)) next.delete(foodId);
    else next.add(foodId);
    const list = [...next];
    setCheckedByKey((prev) => ({ ...prev, [key]: list }));
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // sin almacenamiento: la lista sigue funcionando, solo no recuerda lo tachado
    }
  }

  async function copy() {
    const text = shoppingListText(groups, `Compra · ${label}`);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copia la lista:', text);
    }
  }

  const total = groups.reduce((s, g) => s + g.lines.length, 0);
  const weekday = (iso: string) => WEEKDAY_SHORT[getWeekdayIndex(parseIso(iso))];
  const rangeText = isos.length > 0 ? `${weekday(isos[0])} → ${weekday(isos[isos.length - 1])} · ${isos.length} ${isos.length === 1 ? 'día' : 'días'}` : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Días de la compra">
        {([['resto', 'Lo que queda'], ['proxima', 'Próxima semana']] as const).map(([value, text]) => (
          <button
            key={value}
            role="tab"
            aria-selected={range === value}
            onClick={() => setRange(value)}
            className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition-colors ${range === value ? 'bg-brand-gold text-black' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            {text}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        {rangeText} · {checked.size} de {total} tachados
      </p>

      {groups.length === 0 ? (
        <p className="card p-4 text-sm text-neutral-400">No hay menús para esos días.</p>
      ) : (
        groups.map((g) => (
          <section key={g.category} className="card p-3.5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{g.label}</p>
            <ul className="flex flex-col divide-y divide-white/5">
              {g.lines.map((l) => {
                const isChecked = checked.has(l.foodId);
                const Box = isChecked ? CheckSquare : Square;
                return (
                  <li key={l.foodId}>
                    <button onClick={() => toggle(l.foodId)} aria-pressed={isChecked} className="flex w-full items-center gap-2.5 py-2 text-left">
                      <Box size={18} className={isChecked ? 'text-emerald-400' : 'text-neutral-600'} aria-hidden="true" />
                      <span className={`flex-1 text-sm ${isChecked ? 'text-neutral-600 line-through' : 'text-neutral-100'}`}>{l.name}</span>
                      <span className={`num text-sm font-semibold ${isChecked ? 'text-neutral-600' : 'text-white'}`}>{l.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <button onClick={copy} className="flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black hover:bg-brand-orange-dark">
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copied ? 'Lista copiada' : 'Copiar la lista'}
      </button>
      <p className="text-[11px] leading-relaxed text-neutral-600">
        Cantidades aproximadas y redondeadas hacia arriba. Carne, pescado, arroz, pasta, patata, cuscús y avena, en crudo; las legumbres, en bote. Cambiar un alimento
        en un día cambia también esta lista.
      </p>
    </div>
  );
}
