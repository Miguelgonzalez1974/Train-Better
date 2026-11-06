import { useEffect, useMemo, useState } from 'react';
import { Send, X } from 'lucide-react';
import { FOODS } from '../../data/nutrition/foods';
import type { ExtraFoodEntry } from '../../data/athlete/types';
import { customFoodToCatalogFood } from '../../engine/customFoods';
import { chooseFood, dropIssue, dropItem, mealTotals, parseMeal, setIssueGrams, setItemGrams, type MealIssue, type MealParse } from '../../engine/mealText';
import { takeMealDraft } from '../../lib/mealDraft';
import { RexMascot, type RexMood } from '../objetivos/RexMascot';
import { QuantityStepper } from './QuantityStepper';
import { withExtra } from './nutritionData';
import type { NutritionShared } from './shared';

/**
 * «He comido…» con Rex: escribes lo que has tomado como lo dirías («dos huevos y 200 g de arroz»), Rex lo convierte en alimentos con su
 * cantidad y te lo enseña ANTES de apuntar nada: puedes cambiar cantidades, quitar cosas y resolver lo que no ha entendido. Solo al pulsar
 * «Apuntar» entra en el diario del día. La lectura de la frase vive en `engine/mealText.ts`.
 */
export function RexMeal({
  shared,
  iso,
  missing,
  onCreateFood,
}: {
  shared: NutritionShared;
  iso: string;
  /** Lo que le faltaba al día antes de apuntar esto, para decir cuánto queda. */
  missing: { protein: number; carbs: number };
  /** Abrir «Mis alimentos» para dar de alta algo que Rex no conoce (con el nombre ya puesto). */
  onCreateFood: (name: string) => void;
}) {
  const { prefs, updatePrefs, todayIso } = shared;
  const customFoods = useMemo(() => prefs.customFoods ?? [], [prefs.customFoods]);
  const foods = useMemo(() => (customFoods.length === 0 ? FOODS : [...FOODS, ...customFoods.map(customFoodToCatalogFood)]), [customFoods]);
  const customIds = useMemo(() => new Set(customFoods.map((f) => f.id)), [customFoods]);
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const resolve = (id: string) => foodMap.get(id);

  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const [parse, setParse] = useState<MealParse | null>(null);
  const [done, setDone] = useState<{ protein: number; carbs: number } | null>(null);
  const [gramsDraft, setGramsDraft] = useState<Record<number, string>>({});

  // Si das de alta un alimento propio mientras hay una frase a medias, se vuelve a leer con él incluido.
  useEffect(() => {
    if (sent) setParse(parseMeal(sent, foods, customIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFoods]);

  // Si vienes del lab de Rex con «he comido…» ya escrito, se lee aquí y se te enseña antes de apuntar nada.
  useEffect(() => {
    const draft = takeMealDraft(typeof window !== 'undefined' ? window.sessionStorage : null);
    if (!draft) return;
    setText(draft);
    setSent(draft);
    setParse(parseMeal(draft, foods, customIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const value = text.trim();
    if (!value) return;
    setSent(value);
    setParse(parseMeal(value, foods, customIds));
    setDone(null);
    setGramsDraft({});
  }

  function cancel() {
    setParse(null);
    setSent('');
    setGramsDraft({});
  }

  function apply() {
    if (!parse || parse.items.length === 0) return;
    const now = new Date();
    const entry: ExtraFoodEntry = {
      id: `extra${Date.now()}`,
      hour: iso === todayIso ? now.getHours() + now.getMinutes() / 60 : 12,
      items: parse.items.map((it) => ({ foodId: it.foodId, grams: it.grams })),
    };
    updatePrefs((p) => withExtra(p, iso, entry));
    setDone(mealTotals(parse.items, resolve));
    setParse(null);
    setSent('');
    setText('');
    setGramsDraft({});
  }

  const totals = parse ? mealTotals(parse.items, resolve) : null;
  const empty = parse !== null && parse.items.length === 0 && parse.issues.length === 0;
  const mood: RexMood = done ? 'happy' : parse ? 'think' : 'idle';
  const left = done ? { protein: Math.max(0, missing.protein - done.protein), carbs: Math.max(0, missing.carbs - done.carbs) } : null;

  let rexLine = 'Cuéntame lo que has comido y lo apunto: «dos huevos y 200 g de arroz».';
  if (done && left) {
    rexLine = left.protein === 0 && left.carbs === 0 ? 'Apuntado. Con esto, objetivo del día cubierto.' : `Apuntado. Te quedan ${left.protein} g de proteína y ${left.carbs} g de hidratos.`;
  } else if (empty) {
    rexLine = 'No he entendido nada de eso. Prueba con «dos huevos y arroz», o usa «Añadir alimento».';
  } else if (parse) {
    rexLine = parse.issues.length > 0 ? 'Esto he entendido. Con lo que no tengo claro, dime tú.' : 'Esto he entendido. Cámbialo si no es así y apunto.';
  }

  return (
    <section className="rounded-2xl bg-white/[0.03] p-3.5" aria-label="Dile a Rex lo que has comido">
      <div className="flex items-start gap-3">
        <RexMascot size={34} mood={mood} />
        <p className="min-w-0 flex-1 pt-1 text-[13px] leading-relaxed text-neutral-200" aria-live="polite">
          {rexLine}
        </p>
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="He comido…"
          aria-label="Qué has comido"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-xl border border-brand-border bg-brand-bg px-3 text-sm text-white placeholder:text-neutral-600 focus:border-brand-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={text.trim() === ''}
          aria-label="Enviar a Rex"
          className="flex h-10 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={16} strokeWidth={2.25} />
        </button>
      </form>

      {parse && !empty && (
        <div className="mt-3 flex flex-col gap-3">
          {parse.items.length > 0 && (
            <ul className="divide-y divide-white/5 rounded-xl bg-white/[0.03] px-3">
              {parse.items.map((it, index) => {
                const food = resolve(it.foodId);
                if (!food) return null;
                return (
                  <li key={`${it.foodId}-${index}`} className="flex items-center gap-2 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug text-neutral-100">{food.name}</span>
                      {it.note && <span className="block text-[11px] leading-snug text-neutral-500">{it.note}</span>}
                    </span>
                    <QuantityStepper size="sm" food={food} grams={it.grams} onChange={(g) => setParse((p) => (p ? setItemGrams(p, index, g) : p))} />
                    <button
                      onClick={() => setParse((p) => (p ? dropItem(p, index) : p))}
                      aria-label={`Quitar ${food.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-bad/10 hover:text-bad"
                    >
                      <X size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {parse.issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              draft={gramsDraft[issue.id]}
              onDraft={(v) => setGramsDraft((d) => ({ ...d, [issue.id]: v }))}
              onChoose={(foodId) => setParse((p) => (p ? chooseFood(p, issue.id, foodId, foods) : p))}
              onGrams={(g) => setParse((p) => (p ? setIssueGrams(p, issue.id, g) : p))}
              onDrop={() => setParse((p) => (p ? dropIssue(p, issue.id) : p))}
              onCreate={() => onCreateFood(issue.text)}
            />
          ))}

          {parse.items.length > 0 && totals && (
            <p className="num text-center text-xs text-neutral-500">
              ≈ {totals.protein} g proteína · {totals.carbs} g hidratos
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={cancel} className="flex-1 rounded-lg border border-brand-border px-4 py-2.5 text-sm font-semibold text-neutral-300 transition-colors hover:text-white">
              Cancelar
            </button>
            <button
              onClick={apply}
              disabled={parse.items.length === 0}
              className="flex-[2] rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {parse.issues.length > 0 ? 'Apuntar lo entendido' : 'Apuntar'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const chip = 'rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-brand-gold hover:text-white';

function IssueRow({
  issue,
  draft,
  onDraft,
  onChoose,
  onGrams,
  onDrop,
  onCreate,
}: {
  issue: MealIssue;
  draft: string | undefined;
  onDraft: (v: string) => void;
  onChoose: (foodId: string) => void;
  onGrams: (grams: number) => void;
  onDrop: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/[0.06] px-3 py-2.5">
      {issue.kind === 'desconocido' && (
        <>
          <p className="text-[13px] leading-snug text-neutral-200">
            No tengo «<strong className="font-semibold text-white">{issue.text}</strong>» en tus alimentos.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={onCreate} className={chip}>
              Crearlo en Mis alimentos
            </button>
            <button onClick={onDrop} className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              Quitar
            </button>
          </div>
        </>
      )}
      {issue.kind === 'elegir' && (
        <>
          <p className="text-[13px] leading-snug text-neutral-200">
            «<strong className="font-semibold text-white">{issue.text}</strong>»: ¿cuál de estos?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {issue.options.map((o) => (
              <button key={o.foodId} onClick={() => onChoose(o.foodId)} className={chip}>
                {o.name}
              </button>
            ))}
            <button onClick={onCreate} className={chip}>
              Ninguno: crearlo
            </button>
            <button onClick={onDrop} className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              Quitar
            </button>
          </div>
        </>
      )}
      {issue.kind === 'cantidad' && (
        <>
          <p className="text-[13px] leading-snug text-neutral-200">
            ¿Cuántos gramos de <strong className="font-semibold text-white">{issue.name.toLowerCase()}</strong>? Un puñado suele ser unos {issue.suggestedGrams} g.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={draft ?? String(issue.suggestedGrams)}
              onChange={(e) => onDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={`Gramos de ${issue.name}`}
              className="num h-9 w-16 rounded-lg border border-brand-border bg-transparent text-center text-sm font-semibold text-white outline-none focus:border-brand-gold"
            />
            <span className="text-xs text-neutral-500">g</span>
            <button onClick={() => onGrams(Number(draft ?? issue.suggestedGrams))} className={chip}>
              Poner
            </button>
            <button onClick={onDrop} className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300">
              Quitar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
